import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { blogStore } from "@/lib/blog/store";
import { isAdminAuthorized } from "@/lib/blog/auth";
import {
  formatBlogPost,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/lib/telegram";
import { env } from "@/lib/env";
import type { BlogPostInput } from "@/lib/blog/types";

export const revalidate = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = clampNumber(url.searchParams.get("limit"), 20, 1, 100);
  const offset = clampNumber(url.searchParams.get("offset"), 0, 0, 10_000);
  const posts = await blogStore().list({ limit, offset });
  return NextResponse.json(
    { posts },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}

export async function POST(req: Request) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as BlogPostInput | null;
  if (!body || typeof body.title !== "string" || typeof body.body !== "string") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.title.trim() || !body.body.trim()) {
    return NextResponse.json({ error: "title and body are required" }, { status: 400 });
  }
  try {
    const post = await blogStore().create({
      title: body.title,
      body: body.body,
      excerpt: body.excerpt,
      coverImage: body.coverImage,
      tags: body.tags,
      author: body.author,
    });
    // Invalidate the list and the new post's detail page so the new post
    // is visible immediately, not after the ISR window expires.
    revalidatePath("/blog");
    revalidatePath(`/blog/${post.slug}`);
    revalidatePath("/sitemap.xml");

    // Auto-announce to the Telegram channel. Best-effort — we never let a
    // Telegram failure block post creation. Surface the result so the admin
    // UI can show "Announced ✓" / "Announce failed: ...".
    let telegram: { ok: boolean; error?: string } | undefined;
    if (isTelegramConfigured()) {
      telegram = await sendTelegramMessage({
        text: formatBlogPost(post, env.siteUrl),
      });
    }

    return NextResponse.json({ post, telegram }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

function clampNumber(v: string | null, fallback: number, min: number, max: number): number {
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createPost, listNews } from "@/lib/news";
import type { Competition } from "@/lib/types";
import { env } from "@/lib/env";

export const revalidate = 60;

function isCategory(v: string | null): v is Competition {
  return v === "barca" || v === "fifa" || v === "other";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cat = url.searchParams.get("category");
  const limit = Number(url.searchParams.get("limit") ?? 20);
  // ?lang=en or ?lang=en,es. Omit for all languages.
  const langParam = url.searchParams.get("lang");
  const langs = langParam ? langParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const posts = await listNews(
    isCategory(cat) ? cat : undefined,
    limit,
    langs ? { langs } : {},
  );
  return NextResponse.json(
    { posts },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}

function authorize(req: Request): boolean {
  if (!env.adminToken) return false;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  // Timing-safe compare requires equal-length buffers; bail out early on
  // length mismatch to avoid leaking the token length via response time.
  if (token.length !== env.adminToken.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(env.adminToken));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { title?: string; content?: string; category?: string }
    | null;
  if (!body || !body.title || !body.content || !isCategory(body.category ?? null)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const post = createPost({
    title: body.title,
    content: body.content,
    category: body.category as Competition,
  });
  return NextResponse.json({ post }, { status: 201 });
}

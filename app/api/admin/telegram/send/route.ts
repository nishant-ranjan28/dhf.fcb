import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/blog/auth";
import { blogStore } from "@/lib/blog/store";
import {
  formatBlogPost,
  formatNewsItem,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/lib/telegram";
import { env } from "@/lib/env";

interface BlogPayload {
  kind: "blog";
  slug: string;
}

interface NewsPayload {
  kind: "news";
  title: string;
  link: string;
  source?: string;
}

type Payload = BlogPayload | NewsPayload;

function isPayload(v: unknown): v is Payload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.kind === "blog") return typeof o.slug === "string" && o.slug.length > 0;
  if (o.kind === "news") {
    return (
      typeof o.title === "string" &&
      o.title.length > 0 &&
      typeof o.link === "string" &&
      /^https?:\/\//.test(o.link)
    );
  }
  return false;
}

export async function POST(req: Request) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isTelegramConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID." },
      { status: 503 },
    );
  }
  const body = (await req.json().catch(() => null)) as unknown;
  if (!isPayload(body)) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  let text: string;
  if (body.kind === "blog") {
    // Look the post up server-side — admin is trusted but we still want
    // canonical formatting from the stored record (title, excerpt, slug).
    const post = await blogStore().get(body.slug);
    if (!post) {
      return NextResponse.json({ error: "post not found" }, { status: 404 });
    }
    text = formatBlogPost(post, env.siteUrl);
  } else {
    text = formatNewsItem({
      title: body.title,
      link: body.link,
      source: body.source,
    });
  }

  const result = await sendTelegramMessage({ text });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

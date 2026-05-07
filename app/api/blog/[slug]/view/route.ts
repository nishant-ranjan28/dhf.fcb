import { NextResponse } from "next/server";
import { blogStore } from "@/lib/blog/store";
import { viewStore } from "@/lib/blog/views";

export const dynamic = "force-dynamic";

// Crawler skip: simple UA list. Not exhaustive; goal is to keep counter
// vaguely honest, not to defeat determined fraud. Anyone really wanting to
// inflate a counter can — this counter is vanity, not analytics.
const BOT_RE = /bot|crawl|slurp|spider|facebookexternalhit|whatsapp|telegrambot|preview|monitor|curl|wget|httpclient/i;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Validate the slug actually maps to a published post — prevents the
  // counter being filled with junk slugs from random POSTs.
  const post = await blogStore().get(slug);
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ua = req.headers.get("user-agent") ?? "";
  if (BOT_RE.test(ua)) {
    // Bot: report current count, don't increment.
    const count = await viewStore().get(slug);
    return NextResponse.json({ count, skipped: true });
  }

  const count = await viewStore().increment(slug);
  return NextResponse.json({ count });
}

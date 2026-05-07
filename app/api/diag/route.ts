import { NextResponse } from "next/server";
import { blogStore } from "@/lib/blog/store";

export const dynamic = "force-dynamic";

// Diagnostic — does NOT leak any secrets, just presence flags + a roundtrip
// to Upstash so we can see whether the page-side store is actually backed by
// Redis or is silently falling back to in-memory.
export async function GET() {
  const hasUrl = Boolean(
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL,
  );
  const hasToken = Boolean(
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN,
  );
  const which = {
    upstash_url: Boolean(process.env.UPSTASH_REDIS_REST_URL),
    upstash_token: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
    kv_url: Boolean(process.env.KV_REST_API_URL),
    kv_token: Boolean(process.env.KV_REST_API_TOKEN),
  };
  let listLen: number | string = "?";
  let listErr: string | null = null;
  try {
    const list = await blogStore().list({ limit: 100 });
    listLen = list.length;
  } catch (err) {
    listErr = err instanceof Error ? err.message : String(err);
  }
  return NextResponse.json({
    runtime: process.env.NEXT_RUNTIME ?? "nodejs",
    nodeEnv: process.env.NODE_ENV,
    upstash: { hasUrl, hasToken, which },
    store: { listLen, listErr },
    siteUrl: process.env.SITE_URL ?? null,
  });
}

// X (Twitter) posting via API v2 with OAuth 1.0a user-context signing.
// Free API tier allows ~500 posts/month — plenty for autopost cadence.
// Signed by hand with node:crypto to avoid a dependency; only the oauth_*
// params are signed (JSON bodies are excluded from the OAuth1 signature
// base string by spec).

import { createHmac, randomBytes } from "node:crypto";

const TWEETS_ENDPOINT = "https://api.x.com/2/tweets";
// X counts every URL as 23 chars (t.co wrapping), regardless of real length.
const TCO_URL_LENGTH = 23;
const TWEET_LIMIT = 280;

export interface XResult {
  ok: boolean;
  error?: string;
}

export function isXConfigured(): boolean {
  return Boolean(
    process.env.X_API_KEY?.trim() &&
      process.env.X_API_SECRET?.trim() &&
      process.env.X_ACCESS_TOKEN?.trim() &&
      process.env.X_ACCESS_SECRET?.trim(),
  );
}

export function formatTweet(title: string, url: string): string {
  const budget = TWEET_LIMIT - TCO_URL_LENGTH - 2; // 2 = "\n\n"
  const t = title.length > budget ? title.slice(0, budget - 1) + "…" : title;
  return `${t}\n\n${url}`;
}

// RFC 3986 percent-encoding — encodeURIComponent leaves !'()* unescaped.
function pct(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function oauth1Header(method: string, url: string): string {
  const consumerKey = process.env.X_API_KEY!.trim();
  const consumerSecret = process.env.X_API_SECRET!.trim();
  const token = process.env.X_ACCESS_TOKEN!.trim();
  const tokenSecret = process.env.X_ACCESS_SECRET!.trim();

  const params: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: "1.0",
  };

  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${pct(k)}=${pct(params[k])}`)
    .join("&");
  const base = [method.toUpperCase(), pct(url), pct(paramString)].join("&");
  const signingKey = `${pct(consumerSecret)}&${pct(tokenSecret)}`;
  params.oauth_signature = createHmac("sha1", signingKey).update(base).digest("base64");

  const header = Object.keys(params)
    .sort()
    .map((k) => `${pct(k)}="${pct(params[k])}"`)
    .join(", ");
  return `OAuth ${header}`;
}

export async function postToX(opts: { text: string }): Promise<XResult> {
  if (!isXConfigured()) return { ok: false, error: "X not configured" };
  try {
    const res = await fetch(TWEETS_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: oauth1Header("POST", TWEETS_ENDPOINT),
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: opts.text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `HTTP ${res.status}: ${body.replace(/\s+/g, " ").slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

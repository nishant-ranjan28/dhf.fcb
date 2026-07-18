// IndexNow ping — tells Bing/Yandex (and other IndexNow engines) about new or
// updated URLs immediately instead of waiting for a sitemap crawl. Google does
// not support IndexNow; the sitemap covers it. Best-effort: failures are
// reported, never thrown. The key must also be served at /indexnow.txt (see
// app/indexnow.txt/route.ts) — engines fetch it to verify site ownership.

const ENDPOINT = "https://api.indexnow.org/indexnow";

export interface IndexNowResult {
  ok: boolean;
  error?: string;
}

export function isIndexNowConfigured(): boolean {
  return Boolean(process.env.INDEXNOW_KEY?.trim());
}

export async function submitToIndexNow(
  urls: string[],
  siteUrl: string,
): Promise<IndexNowResult> {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) return { ok: false, error: "IndexNow not configured" };
  if (urls.length === 0) return { ok: true };
  try {
    const base = siteUrl.replace(/\/$/, "");
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(base).host,
        key,
        keyLocation: `${base}/indexnow.txt`,
        urlList: urls,
      }),
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

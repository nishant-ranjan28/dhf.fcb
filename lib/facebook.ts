// v21.0 expires 21 Jan 2027. v27.0 is the current version (released Nov 2026);
// bump again whenever Meta retires it. The /feed call itself is unchanged.
const GRAPH = "https://graph.facebook.com/v27.0";

export interface FacebookResult {
  ok: boolean;
  /** Post id (`{page-id}_{post-id}`) on success — handy for verification. */
  id?: string;
  error?: string;
}

export function isFacebookConfigured(): boolean {
  return Boolean(
    process.env.FACEBOOK_PAGE_ID?.trim() &&
      process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim(),
  );
}

export async function postToFacebookPage(opts: {
  message: string;
  link: string;
}): Promise<FacebookResult> {
  const pageId = process.env.FACEBOOK_PAGE_ID?.trim();
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!pageId || !token) return { ok: false, error: "Facebook not configured" };
  try {
    const body = new URLSearchParams({
      message: opts.message,
      link: opts.link,
      access_token: token,
    });
    const res = await fetch(`${GRAPH}/${pageId}/feed`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 300)}`,
      };
    }
    // Meta returns `{"id":"<page>_<post>"}`. Surface it so the cron ack shows a
    // post id we can look up, not just "ok".
    let id: string | undefined;
    try {
      id = (JSON.parse(text) as { id?: string }).id;
    } catch {
      id = undefined;
    }
    return { ok: true, ...(id ? { id } : {}) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

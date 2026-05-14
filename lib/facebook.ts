const GRAPH = "https://graph.facebook.com/v21.0";

export interface FacebookResult {
  ok: boolean;
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
    const res = await fetch(`${GRAPH}/${pageId}/feed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: opts.message,
        link: opts.link,
        access_token: token,
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

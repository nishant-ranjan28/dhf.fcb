// Mastodon posting via the public REST API. A personal access token with the
// `write:statuses` scope is enough — no app review or paid tier.

const DEFAULT_LIMIT = 500;

export interface MastodonResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export function isMastodonConfigured(): boolean {
  return Boolean(
    process.env.MASTODON_INSTANCE?.trim() && process.env.MASTODON_ACCESS_TOKEN?.trim(),
  );
}

/** Accept a bare hostname or a full URL, but never let a path into the API base. */
function instanceBase(): string | undefined {
  const raw = process.env.MASTODON_INSTANCE?.trim();
  if (!raw) return undefined;
  const host = raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return /^[a-z0-9.-]+(?::\d+)?$/i.test(host) ? `https://${host}` : undefined;
}

/** Keep the URL intact while fitting the status into the instance's limit. */
export function formatMastodonStatus(title: string, url: string, limit = DEFAULT_LIMIT): string {
  const budget = limit - url.length - 2; // 2 = "\n\n"
  if (budget <= 0) return url.slice(0, limit);
  const trimmed = title.length > budget ? `${title.slice(0, budget - 1)}…` : title;
  return `${trimmed}\n\n${url}`;
}

export async function postToMastodon(opts: {
  title: string;
  url: string;
}): Promise<MastodonResult> {
  const base = instanceBase();
  const token = process.env.MASTODON_ACCESS_TOKEN?.trim();
  if (!base || !token) return { ok: false, error: "Mastodon not configured" };
  try {
    const status = formatMastodonStatus(opts.title, opts.url);
    const res = await fetch(`${base}/api/v2/statuses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        status,
        visibility: "public",
        language: "en",
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 300)}` };
    }
    let id: string | undefined;
    try {
      id = ((await res.json()) as { id?: string }).id;
    } catch {
      id = undefined;
    }
    return { ok: true, ...(id ? { id } : {}) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

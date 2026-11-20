// Threads posting via the Threads API. Text-only posts are free and need no
// App Review when publishing to an account you own. The token is a long-lived
// (60-day) Threads user token with the `threads_content_publish` scope.

import { formatMastodonStatus } from "./mastodon";

const GRAPH = "https://graph.threads.net/v1.0";
// Threads' text-post limit.
const TEXT_LIMIT = 500;
// Meta's Threads API intermittently rejects a freshly created container with
// "Media Not Found" (error_subcode 4279009). Retrying the *same* publish call
// usually succeeds — see the Meta developer forum reports of this behavior.
const PUBLISH_RETRIES = 3;

export interface ThreadsResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export function isThreadsConfigured(): boolean {
  return Boolean(process.env.THREADS_ACCESS_TOKEN?.trim());
}

async function httpError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return `HTTP ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 300)}`;
}

/** Refresh a long-lived token so a single env var keeps working past 60 days.
 *  Meta only allows refresh once the token is 24h old; before then this returns
 *  the original token unchanged. */
async function refreshToken(token: string): Promise<string> {
  try {
    const res = await fetch(
      `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return token;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? token;
  } catch {
    return token;
  }
}

/** Resolve the user id from env, or from /me using a long-lived token. */
async function userId(token: string): Promise<string | undefined> {
  const configured = process.env.THREADS_USER_ID?.trim();
  if (configured) return configured;
  const res = await fetch(`${GRAPH}/me?fields=id&access_token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { id?: string };
  return data.id;
}

export async function postToThreads(opts: {
  title: string;
  url: string;
}): Promise<ThreadsResult> {
  const configuredToken = process.env.THREADS_ACCESS_TOKEN?.trim();
  if (!configuredToken) return { ok: false, error: "Threads not configured" };
  try {
    const token = await refreshToken(configuredToken);
    const uid = await userId(token);
    if (!uid) return { ok: false, error: "Threads user id could not be resolved" };

    const createBody = new URLSearchParams({
      media_type: "TEXT",
      text: formatMastodonStatus(opts.title, opts.url, TEXT_LIMIT),
      access_token: token,
    });
    const createRes = await fetch(`${GRAPH}/${uid}/threads`, {
      method: "POST",
      body: createBody,
      signal: AbortSignal.timeout(8000),
    });
    if (!createRes.ok) return { ok: false, error: await httpError(createRes) };
    const created = (await createRes.json()) as { id?: string; error?: { message?: string } };
    if (!created.id) {
      return { ok: false, error: created.error?.message ?? "Threads creation returned no id" };
    }

    let lastError = "unknown error";
    for (let attempt = 0; attempt < PUBLISH_RETRIES; attempt++) {
      if (attempt > 0) {
        // Brief backoff gives Meta's container a moment to become visible.
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
      const publishBody = new URLSearchParams({
        creation_id: created.id,
        access_token: token,
      });
      const publishRes = await fetch(`${GRAPH}/${uid}/threads_publish`, {
        method: "POST",
        body: publishBody,
        signal: AbortSignal.timeout(8000),
      });
      if (publishRes.ok) {
        const published = (await publishRes.json()) as { id?: string };
        return { ok: true, ...(published.id ? { id: published.id } : {}) };
      }
      lastError = await httpError(publishRes);
      // Only the transient "Media Not Found" race is worth retrying; other
      // errors (e.g. auth failures) will just fail again.
      if (!lastError.includes("4279009") && !lastError.includes("Media Not Found")) break;
    }
    return { ok: false, error: lastError };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

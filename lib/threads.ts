// Threads posting via the Threads API. Text-only posts are free and need no
// App Review when publishing to an account you own. The token is a long-lived
// (60-day) Threads user token with the `threads_content_publish` scope.

import { formatMastodonStatus } from "./mastodon";

const GRAPH = "https://graph.threads.net/v1.0";
// Threads' text-post limit.
const TEXT_LIMIT = 500;

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
  const token = process.env.THREADS_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, error: "Threads not configured" };
  try {
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

    const publishBody = new URLSearchParams({
      creation_id: created.id,
      access_token: token,
    });
    const publishRes = await fetch(`${GRAPH}/${uid}/threads_publish`, {
      method: "POST",
      body: publishBody,
      signal: AbortSignal.timeout(8000),
    });
    if (!publishRes.ok) return { ok: false, error: await httpError(publishRes) };
    const published = (await publishRes.json()) as { id?: string };
    return { ok: true, ...(published.id ? { id: published.id } : {}) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

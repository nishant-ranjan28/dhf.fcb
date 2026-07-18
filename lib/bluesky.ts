// Bluesky posting via the AT Protocol XRPC API. Auth is an app password
// (Settings → App Passwords on bsky.app) exchanged for a short-lived session
// JWT on every post — autopost cadence is low enough that caching the
// session isn't worth the staleness handling.

const SERVICE = "https://bsky.social";
// Bluesky post limit is 300 graphemes; URLs count at full length.
const POST_LIMIT = 300;

export interface BlueskyResult {
  ok: boolean;
  error?: string;
}

export function isBlueskyConfigured(): boolean {
  return Boolean(
    process.env.BLUESKY_IDENTIFIER?.trim() && process.env.BLUESKY_APP_PASSWORD?.trim(),
  );
}

async function xrpc(
  path: string,
  body: unknown,
  jwt?: string,
): Promise<Response> {
  return fetch(`${SERVICE}/xrpc/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
}

async function httpError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return `HTTP ${res.status}: ${body.replace(/\s+/g, " ").slice(0, 200)}`;
}

export async function postToBluesky(opts: {
  title: string;
  url: string;
}): Promise<BlueskyResult> {
  const identifier = process.env.BLUESKY_IDENTIFIER?.trim();
  const password = process.env.BLUESKY_APP_PASSWORD?.trim();
  if (!identifier || !password) return { ok: false, error: "Bluesky not configured" };
  try {
    const sessRes = await xrpc("com.atproto.server.createSession", {
      identifier,
      password,
    });
    if (!sessRes.ok) return { ok: false, error: await httpError(sessRes) };
    const sess = (await sessRes.json()) as { accessJwt: string; did: string };

    const budget = POST_LIMIT - opts.url.length - 2; // 2 = "\n\n"
    const title =
      opts.title.length > budget ? opts.title.slice(0, budget - 1) + "…" : opts.title;
    const text = `${title}\n\n${opts.url}`;

    // Link facet — byte offsets, not char offsets (AT Protocol spec).
    const byteStart = Buffer.byteLength(`${title}\n\n`, "utf8");
    const byteEnd = byteStart + Buffer.byteLength(opts.url, "utf8");

    const recRes = await xrpc(
      "com.atproto.repo.createRecord",
      {
        repo: sess.did,
        collection: "app.bsky.feed.post",
        record: {
          $type: "app.bsky.feed.post",
          text,
          facets: [
            {
              index: { byteStart, byteEnd },
              features: [{ $type: "app.bsky.richtext.facet#link", uri: opts.url }],
            },
          ],
          createdAt: new Date().toISOString(),
        },
      },
      sess.accessJwt,
    );
    if (!recRes.ok) return { ok: false, error: await httpError(recRes) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

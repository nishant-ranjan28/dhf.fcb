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

// Bluesky rejects blobs over ~1MB; oversized covers just skip the thumb.
const MAX_THUMB_BYTES = 1_000_000;

/** Fetch the cover image and upload it as a blob for the link-card thumb.
 *  Best-effort: any failure (fetch error, too large, upload rejected) means
 *  the card ships without a thumbnail, never a failed post. */
async function uploadThumb(imageUrl: string, jwt: string): Promise<unknown | undefined> {
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
    if (!imgRes.ok) return undefined;
    const buf = await imgRes.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_THUMB_BYTES) return undefined;
    const upRes = await fetch(`${SERVICE}/xrpc/com.atproto.repo.uploadBlob`, {
      method: "POST",
      headers: {
        "content-type": imgRes.headers.get("content-type") ?? "image/jpeg",
        authorization: `Bearer ${jwt}`,
      },
      body: buf,
      signal: AbortSignal.timeout(8000),
    });
    if (!upRes.ok) return undefined;
    const up = (await upRes.json()) as { blob?: unknown };
    return up.blob;
  } catch {
    return undefined;
  }
}

export async function postToBluesky(opts: {
  title: string;
  url: string;
  description?: string;
  imageUrl?: string;
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

    const thumb = opts.imageUrl ? await uploadThumb(opts.imageUrl, sess.accessJwt) : undefined;

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
          // External embed = the link-preview card. Bluesky never generates
          // cards from bare URLs; the client must attach one explicitly.
          embed: {
            $type: "app.bsky.embed.external",
            external: {
              uri: opts.url,
              title: opts.title,
              description: opts.description ?? "",
              ...(thumb ? { thumb } : {}),
            },
          },
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

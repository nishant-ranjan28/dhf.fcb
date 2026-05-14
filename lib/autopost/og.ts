/**
 * Fetch a URL and extract an OpenGraph or Twitter image URL from the HTML
 * head. Returns null on any failure (network error, no meta tag, malformed).
 *
 * Failures are non-fatal for the caller — the post just lacks a cover image.
 */

const TIMEOUT_MS = 5000;
const MAX_BYTES = 128 * 1024; // 128KB — og tags are in <head>, never need more.

const META_PATTERNS: RegExp[] = [
  /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
];

export async function fetchOgImage(articleUrl: string): Promise<string | null> {
  try {
    const res = await fetch(articleUrl, {
      headers: {
        "user-agent": "BarcaPulse/1.0 (+https://dhf-fcb.iamnishant.in)",
        accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok || !res.body) return null;
    // Read at most MAX_BYTES — og tags live in <head>.
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (bytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      bytes += value.length;
    }
    try { reader.cancel(); } catch { /* ignore */ }
    const html = new TextDecoder().decode(concat(chunks));
    for (const re of META_PATTERNS) {
      const m = re.exec(html);
      if (m) {
        const resolved = resolveUrl(m[1], articleUrl);
        if (resolved) return resolved;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const c of chunks) {
    out.set(c, i);
    i += c.length;
  }
  return out;
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

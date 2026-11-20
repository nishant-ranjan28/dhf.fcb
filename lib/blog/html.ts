/** Helpers for laying out trusted, server-rendered Markdown/HTML bodies. */

/**
 * Split a rendered Markdown body into readable blocks at each `<h2>`.
 *
 * The autopost prompt asks for short H2-led sections, so this gives us natural
 * places to interleave ads and social posts. Legacy posts without H2s come back
 * as a single block — they still render exactly as before.
 */
export function splitHtmlIntoSections(html: string): string[] {
  const trimmed = html.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/(?=<h2[\s>])/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [trimmed];
}

/** Rough reading time for the article header. HTML/markdown noise is stripped
 *  so the badge tracks prose rather than tags. */
export function estimateReadingMinutes(input: string): number {
  const words = input
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_`~#[\]()<>!-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

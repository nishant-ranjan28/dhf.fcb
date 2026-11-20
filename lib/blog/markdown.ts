import { Marked } from "marked";

// We allow raw HTML inside Markdown bodies because admin writes are trusted
// (POST /api/blog is gated by ADMIN_TOKEN). That means iframe embeds for
// YouTube/Twitter/etc. paste straight from the source's "Share > Embed" code.
const marked = new Marked({
  gfm: true,
  breaks: false,
});

// Match common YouTube URL shapes. Captures the 11-char video id.
const YT = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&][^\s]*)?$/;

/** Detect a bare YouTube URL on its own line and return the embed iframe.
 *  Returns the original markdown unchanged when nothing matches. */
export function autoEmbedYouTube(md: string): string {
  return md
    .split(/\n/)
    .map((line) => {
      const trimmed = line.trim();
      const m = YT.exec(trimmed);
      if (!m) return line;
      const id = m[1];
      // 16:9 responsive iframe via the standard YouTube embed URL.
      return `<div class="aspect-video"><iframe class="w-full h-full rounded-lg" src="https://www.youtube.com/embed/${id}" title="YouTube video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
    })
    .join("\n");
}

const SOCIAL_POSTS = [
  {
    re: /^https?:\/\/([a-z0-9.-]+)\/@([A-Za-z0-9_.-]+)\/(\d+)\/?$/i,
    card: (m: RegExpMatchArray) => {
      const [, host, account, id] = m;
      return `<div class="social-embed"><iframe src="https://${host}/@${account}/${id}/embed" title="Mastodon post" loading="lazy" frameborder="0" scrolling="no"></iframe></div>`;
    },
  },
  {
    re: /^https?:\/\/bsky\.app\/profile\/([^/\s]+)\/post\/([A-Za-z0-9_-]+)\/?$/i,
    card: (m: RegExpMatchArray) =>
      socialCard("Bluesky post", m[0], "Open on Bluesky"),
  },
  {
    re: /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/@([^/\s]+)\/post\/([A-Za-z0-9_-]+)\/?$/i,
    card: (m: RegExpMatchArray) =>
      socialCard("Threads post", m[0], "Open on Threads"),
  },
  {
    re: /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/\s]+)\/status\/(\d+)\/?$/i,
    card: (m: RegExpMatchArray) =>
      socialCard("Post on X", m[0], "Open on X"),
  },
] as const;

function socialCard(label: string, url: string, cta: string): string {
  return `<div class="social-card"><span class="social-card__label">${label}</span><a href="${url}" target="_blank" rel="noopener noreferrer">${cta} →</a></div>`;
}

/** Turn bare social post URLs on their own line into compact embeds/cards.
 *  Raw HTML embeds still pass through unchanged — this is for simple URLs. */
export function autoEmbedSocial(md: string): string {
  return md
    .split(/\n/)
    .map((line) => {
      const trimmed = line.trim();
      for (const { re, card } of SOCIAL_POSTS) {
        const m = trimmed.match(re);
        if (m) return card(m);
      }
      return line;
    })
    .join("\n");
}

/** Render a markdown body to HTML. Auto-embeds bare YouTube/social URLs. Raw
 *  HTML in the input is passed through (admin-only authoring). */
export function renderMarkdown(md: string): string {
  const withEmbeds = autoEmbedSocial(autoEmbedYouTube(md));
  return marked.parse(withEmbeds, { async: false }) as string;
}

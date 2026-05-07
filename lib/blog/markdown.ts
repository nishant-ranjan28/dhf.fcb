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

/** Render a markdown body to HTML. Auto-embeds bare YouTube URLs. Raw HTML
 *  in the input is passed through (admin-only authoring). */
export function renderMarkdown(md: string): string {
  const withEmbeds = autoEmbedYouTube(md);
  return marked.parse(withEmbeds, { async: false }) as string;
}

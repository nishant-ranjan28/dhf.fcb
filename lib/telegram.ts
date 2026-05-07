import type { BlogPost } from "./blog/types";
import type { NewsPost } from "./types";

// Telegram Bot API base. Free, generous rate limit (30 msgs/sec/channel).
const TELEGRAM_API = "https://api.telegram.org";

export interface SendOpts {
  text: string;
  parseMode?: "HTML" | "MarkdownV2";
  /** When true, no link-preview card. Default false (we want previews). */
  disableWebPagePreview?: boolean;
}

export interface SendResult {
  ok: boolean;
  /** Empty when ok=true. Short, suitable for displaying in admin UI. */
  error?: string;
}

export function isTelegramConfigured(): boolean {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHANNEL_ID?.trim(),
  );
}

/** Post a message to the configured channel. Returns ok=false on missing
 *  config or network/API errors — does NOT throw. Callers can choose to
 *  ignore the result (auto-announce) or surface it to the admin (manual). */
export async function sendTelegramMessage(opts: SendOpts): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHANNEL_ID?.trim();
  if (!token || !chatId) {
    return { ok: false, error: "Telegram not configured" };
  }
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: opts.text,
        parse_mode: opts.parseMode ?? "HTML",
        disable_web_page_preview: opts.disableWebPagePreview ?? false,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Telegram returns useful info; surface a short slice.
      return {
        ok: false,
        error: `HTTP ${res.status}: ${body.replace(/\s+/g, " ").slice(0, 160)}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Telegram's HTML mode supports a small whitelist of tags. We only use
// <b>, <i>, <a>. Everything else must be entity-encoded.
function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatBlogPost(post: BlogPost, siteUrl: string): string {
  const url = `${siteUrl}/blog/${post.slug}`;
  const lines = [`📝 <b>${escHtml(post.title)}</b>`];
  const excerpt = post.excerpt?.trim();
  if (excerpt) lines.push("", escHtml(excerpt));
  lines.push("", `<a href="${escHtml(url)}">Read on BarcaPulse →</a>`);
  return lines.join("\n");
}

export function formatNewsItem(item: {
  title: string;
  link: string;
  source?: string;
}): string {
  const lines = [`📰 <b>${escHtml(item.title)}</b>`];
  if (item.source) lines.push("", `<i>${escHtml(item.source)}</i>`);
  lines.push("", `<a href="${escHtml(item.link)}">Read more →</a>`);
  return lines.join("\n");
}

// Convenience for admin "send this exact NewsPost from the cache" path —
// derives source label from the slug prefix that lib/news/rss.ts assigns.
export function formatNewsPost(post: NewsPost): string {
  if (!post.link) {
    return formatNewsItem({ title: post.title, link: "", source: undefined });
  }
  // post.slug looks like "bbc-sport-barcelona-some-headline". The source
  // label is the prefix before the first headline word — but we don't have
  // a clean cut. Fall back to the human-readable category.
  return formatNewsItem({
    title: post.title,
    link: post.link,
    source: post.category === "barca" ? "FC Barcelona news" : "World Cup news",
  });
}

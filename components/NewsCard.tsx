import type { NewsPost } from "@/lib/types";

function timeAgo(iso: string): string {
  const diff = Date.now() - +new Date(iso);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const LANG_LABELS: Record<string, string> = {
  en: "EN",
  es: "ES",
  ca: "CA",
  pt: "PT",
};

function languageLabel(code?: string): string | null {
  if (!code || code === "en") return null;
  return LANG_LABELS[code] ?? code.toUpperCase();
}

function translateUrl(post: NewsPost): string | null {
  if (!post.lang || post.lang === "en") return null;
  if (!post.link) return null;
  // Google Translate's webpage proxy. Free, no API key, opens in new tab.
  return `https://translate.google.com/translate?sl=${post.lang}&tl=en&u=${encodeURIComponent(post.link)}`;
}

export function NewsCard({ post }: { post: NewsPost }) {
  const langLabel = languageLabel(post.lang);
  const translate = translateUrl(post);

  return (
    <article className="bg-ink-soft border border-ink-line rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <CategoryPill category={post.category} />
        {langLabel && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ink/60 text-ink-muted ring-1 ring-ink-line">
            {langLabel}
          </span>
        )}
        <span className="text-[11px] text-ink-muted">{timeAgo(post.createdAt)}</span>
      </div>
      <h3 className="text-sm font-semibold text-white leading-snug">{post.title}</h3>
      <p className="mt-1 text-[13px] text-ink-muted leading-relaxed line-clamp-3">{post.content}</p>
      {(post.link || translate) && (
        <div className="mt-2 flex items-center gap-3 text-[11px]">
          {post.link && (
            <a
              href={post.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-muted hover:text-white"
            >
              Read →
            </a>
          )}
          {translate && (
            <a
              href={translate}
              target="_blank"
              rel="noopener noreferrer"
              className="text-barca-gold hover:text-white"
            >
              Translate to English
            </a>
          )}
        </div>
      )}
    </article>
  );
}

function CategoryPill({ category }: { category: NewsPost["category"] }) {
  const styles =
    category === "barca"
      ? "bg-barca-blue/20 text-barca-blue ring-1 ring-barca-blue/40"
      : category === "fifa"
      ? "bg-fifa-purple/20 text-fifa-purple ring-1 ring-fifa-purple/40"
      : "bg-ink/60 text-ink-muted ring-1 ring-ink-line";
  const label = category === "barca" ? "BARCA" : category === "fifa" ? "FIFA" : "NEWS";
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${styles}`}>{label}</span>
  );
}

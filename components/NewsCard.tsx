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

export function NewsCard({ post }: { post: NewsPost }) {
  return (
    <article className="bg-ink-soft border border-ink-line rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <CategoryPill category={post.category} />
        <span className="text-[11px] text-ink-muted">{timeAgo(post.createdAt)}</span>
      </div>
      <h3 className="text-sm font-semibold text-white leading-snug">{post.title}</h3>
      <p className="mt-1 text-[13px] text-ink-muted leading-relaxed line-clamp-3">{post.content}</p>
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

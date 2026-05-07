import Link from "next/link";
import type { BlogPost } from "@/lib/blog/types";

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

export function BlogCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="block bg-ink-soft border border-ink-line rounded-xl overflow-hidden active:scale-[0.99] transition"
    >
      {post.coverImage && (
        <div className="aspect-video bg-ink-line">
          {/* Plain <img> here keeps next/image config simple — admin pastes
              any URL, we don't want to whitelist domains in next.config. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.coverImage}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-barca-gold/20 text-barca-gold ring-1 ring-barca-gold/40">
            BLOG
          </span>
          <span className="text-[11px] text-ink-muted">{timeAgo(post.createdAt)}</span>
        </div>
        <h3 className="text-sm font-semibold text-white leading-snug">{post.title}</h3>
        {post.excerpt && (
          <p className="mt-1 text-[13px] text-ink-muted leading-relaxed line-clamp-3">
            {post.excerpt}
          </p>
        )}
        {post.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {post.tags.slice(0, 4).map((t) => (
              <span key={t} className="text-[10px] text-ink-muted bg-ink/60 ring-1 ring-ink-line px-1.5 py-0.5 rounded">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

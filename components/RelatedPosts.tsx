import Link from "next/link";
import type { BlogPost } from "@/lib/blog/types";

function timeAgo(iso: string): string {
  const diff = Date.now() - +new Date(iso);
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function RelatedPosts({ posts }: { posts: BlogPost[] }) {
  if (posts.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white mb-2">
        Read next
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {posts.map((p) => (
          <Link
            key={p.slug}
            href={`/blog/${p.slug}`}
            className="block bg-ink-soft border border-ink-line rounded-xl overflow-hidden hover:border-ink-muted transition"
          >
            {p.coverImage && (
              <div className="aspect-video bg-ink-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.coverImage}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            <div className="p-2.5">
              <h3 className="text-[13px] font-semibold text-white leading-snug line-clamp-2">
                {p.title}
              </h3>
              <p className="mt-1 text-[10px] text-ink-muted">
                {timeAgo(p.createdAt)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

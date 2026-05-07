import Link from "next/link";
import type { BlogPost } from "@/lib/blog/types";

interface Props {
  newer?: BlogPost;
  older?: BlogPost;
}

export function PostNavigation({ newer, older }: Props) {
  if (!newer && !older) return null;
  return (
    <nav
      className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2"
      aria-label="Post navigation"
    >
      {older ? (
        <Link
          href={`/blog/${older.slug}`}
          className="block bg-ink-soft border border-ink-line rounded-xl px-3 py-2.5 hover:border-ink-muted transition"
        >
          <span className="block text-[11px] uppercase tracking-wide text-ink-muted">
            ← Older
          </span>
          <span className="block mt-0.5 text-sm font-semibold text-white truncate">
            {older.title}
          </span>
        </Link>
      ) : (
        <span aria-hidden />
      )}
      {newer ? (
        <Link
          href={`/blog/${newer.slug}`}
          className="block bg-ink-soft border border-ink-line rounded-xl px-3 py-2.5 hover:border-ink-muted transition text-right sm:text-right"
        >
          <span className="block text-[11px] uppercase tracking-wide text-ink-muted">
            Newer →
          </span>
          <span className="block mt-0.5 text-sm font-semibold text-white truncate">
            {newer.title}
          </span>
        </Link>
      ) : (
        <span aria-hidden />
      )}
    </nav>
  );
}

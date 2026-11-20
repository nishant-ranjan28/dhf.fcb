import type { SocialPlatform, SocialPostLink } from "@/lib/blog/types";

const PLATFORM: Record<SocialPlatform, { label: string; mark: string; color: string }> = {
  mastodon: { label: "Mastodon", mark: "M", color: "text-[#6364FF] ring-[#6364FF]/50" },
  threads: { label: "Threads", mark: "@", color: "text-white ring-white/40" },
  bluesky: { label: "Bluesky", mark: "B", color: "text-[#0085FF] ring-[#0085FF]/50" },
  facebook: { label: "Facebook", mark: "f", color: "text-[#1877F2] ring-[#1877F2]/50" },
};

/** Compact cards for the official posts announcing this exact story. Rendered
 *  between article sections so the feed break feels intentional, not bolted
 *  on at the end. Nothing is rendered for older posts without stored URLs. */
export function SocialPostStrip({ posts }: { posts: SocialPostLink[] }) {
  if (posts.length === 0) return null;
  return (
    <section className="my-4 rounded-xl border border-ink-line bg-ink-soft/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-barca-gold">
          From our feed
        </h2>
        <span className="text-[10px] text-ink-muted">Related to this story</span>
      </div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {posts.slice(0, 4).map((post) => {
          const meta = PLATFORM[post.platform];
          return (
            <a
              key={`${post.platform}-${post.url}`}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-ink/70 ring-1 ring-ink-line px-2.5 py-2 hover:ring-ink-muted transition"
            >
              <span
                aria-hidden
                className={`grid place-items-center w-6 h-6 shrink-0 rounded-full ring-1 text-[11px] font-bold ${meta.color}`}
              >
                {meta.mark}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-white">
                  {meta.label}
                </span>
                <span className="block text-[10px] text-ink-muted truncate">
                  Official BarcaPulse post
                </span>
              </span>
              <span aria-hidden className="text-ink-muted text-xs">↗</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

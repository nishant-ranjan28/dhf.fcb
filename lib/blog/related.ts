import type { BlogSummary } from "./types";

/** Pick `count` posts to suggest at the bottom of a blog post page.
 *  Strategy: any post sharing a tag with the current one ranks above
 *  date-only matches; ties broken by recency. Excludes the current post. */
export function relatedPosts(
  all: BlogSummary[],
  currentSlug: string,
  count = 3,
): BlogSummary[] {
  const current = all.find((p) => p.slug === currentSlug);
  if (!current) {
    return all
      .filter((p) => p.slug !== currentSlug)
      .slice(0, count);
  }
  const currentTags = new Set(current.tags);
  const others = all.filter((p) => p.slug !== currentSlug);

  const scored = others
    .map((p) => ({
      p,
      shared: p.tags.filter((t) => currentTags.has(t)).length,
      date: +new Date(p.createdAt),
    }))
    .sort((a, b) => {
      if (b.shared !== a.shared) return b.shared - a.shared;
      return b.date - a.date;
    });

  return scored.slice(0, count).map((s) => s.p);
}

/** Find the immediately-newer and immediately-older posts (chronological).
 *  Assumes `all` is sorted newest-first (the default from blogStore.list). */
export function adjacentPosts(
  all: BlogSummary[],
  currentSlug: string,
): { newer?: BlogSummary; older?: BlogSummary } {
  const i = all.findIndex((p) => p.slug === currentSlug);
  if (i === -1) return {};
  return {
    newer: i > 0 ? all[i - 1] : undefined,
    older: i < all.length - 1 ? all[i + 1] : undefined,
  };
}

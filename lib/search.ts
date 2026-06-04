import type { Match, NewsPost } from "./types";
import type { BlogPost } from "./blog/types";

export interface SearchHit {
  title: string;
  href: string;
  subtitle?: string;
  /** True when the link points off-site (news source). */
  external?: boolean;
}

export interface SearchResults {
  matches: SearchHit[];
  news: SearchHit[];
  blog: SearchHit[];
}

export interface SearchSources {
  matches: Match[];
  news: NewsPost[];
  blog: BlogPost[];
}

const MIN_QUERY = 2;
const EMPTY: SearchResults = { matches: [], news: [], blog: [] };

function includes(haystack: string | undefined, q: string): boolean {
  return !!haystack && haystack.toLowerCase().includes(q);
}

/**
 * Search matches, news and blog posts for a query. Case-insensitive substring
 * match across the most relevant fields; each group is capped at `limit`.
 * Queries shorter than 2 chars return nothing.
 */
export function searchAll(query: string, sources: SearchSources, limit = 8): SearchResults {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY) return { ...EMPTY };

  const matches: SearchHit[] = sources.matches
    .filter(
      (m) =>
        includes(m.home.name, q) ||
        includes(m.away.name, q) ||
        includes(m.competitionName, q) ||
        includes(m.group, q),
    )
    .slice(0, limit)
    .map((m) => ({
      title: `${m.home.name} vs ${m.away.name}`,
      href: `/match/${m.slug}`,
      subtitle:
        m.status === "SCHED"
          ? m.competitionName
          : `${m.scoreHome}–${m.scoreAway} · ${m.competitionName}`,
    }));

  const news: SearchHit[] = sources.news
    .filter((p) => includes(p.title, q))
    .slice(0, limit)
    .map((p) => ({
      title: p.title,
      href: p.link ?? "#",
      subtitle: p.category === "barca" ? "Barça news" : "World Cup news",
      external: Boolean(p.link),
    }));

  const blog: SearchHit[] = sources.blog
    .filter((p) => includes(p.title, q) || p.tags.some((t) => includes(t, q)))
    .slice(0, limit)
    .map((p) => ({ title: p.title, href: `/blog/${p.slug}`, subtitle: "Blog" }));

  return { matches, news, blog };
}

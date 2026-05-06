import type { Competition, NewsPost } from "./types";
import { toSlug } from "./slug";
import { cached } from "./cache";
import { env } from "./env";
import { fetchAllNews } from "./news/rss";

// In-process admin overrides. Lost on restart by design — admin overrides
// are rarely used, and a DB pulls in deploy/auth scope this app doesn't need.
// Posts here are merged on top of the RSS cache, NOT through it (so a fresh
// admin POST appears immediately even though the 10-min RSS cache is hot).
const adminPosts: NewsPost[] = [];

async function loadRss(): Promise<NewsPost[]> {
  return cached("news:rss", env.newsTtlSeconds, fetchAllNews);
}

export interface ListNewsOpts {
  /** Restrict to these ISO 639-1 codes. `undefined` = all languages.
   *  Admin posts (no `lang`) are always included since they're hand-curated. */
  langs?: string[];
}

export async function listNews(
  category?: Competition,
  limit = 20,
  opts: ListNewsOpts = {},
): Promise<NewsPost[]> {
  const rss = await loadRss();
  const merged = [...adminPosts, ...rss];
  let filtered = category ? merged.filter((p) => p.category === category) : merged;
  if (opts.langs) {
    const wanted = new Set(opts.langs);
    filtered = filtered.filter((p) => p.lang === undefined || wanted.has(p.lang));
  }
  return filtered
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, limit);
}

export async function getNewsBySlug(slug: string): Promise<NewsPost | null> {
  // Search the unsliced cache so a slug that has aged off the top-20 list
  // still resolves on its detail page.
  const rss = await loadRss();
  return adminPosts.find((p) => p.slug === slug) ?? rss.find((p) => p.slug === slug) ?? null;
}

export function createPost(input: {
  title: string;
  content: string;
  category: Competition;
}): NewsPost {
  const post: NewsPost = {
    id: `admin-${Date.now()}-${toSlug(input.title)}`,
    slug: toSlug(input.title),
    title: input.title,
    content: input.content,
    category: input.category,
    createdAt: new Date().toISOString(),
  };
  adminPosts.unshift(post);
  return post;
}

export function _resetAdminPosts(): void {
  adminPosts.length = 0;
}

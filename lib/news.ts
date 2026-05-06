import type { Competition, NewsPost } from "./types";
import { toSlug } from "./slug";
import { cached } from "./cache";
import { env } from "./env";
import { fetchAllNews } from "./news/rss";

const adminPosts: NewsPost[] = [];

export async function listNews(category?: Competition, limit = 20): Promise<NewsPost[]> {
  const rss = await cached("news:rss", env.newsTtlSeconds, fetchAllNews);
  const merged = [...adminPosts, ...rss];
  const filtered = category ? merged.filter((p) => p.category === category) : merged;
  return filtered
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, limit);
}

export async function getNewsBySlug(slug: string): Promise<NewsPost | null> {
  const all = await listNews();
  return all.find((p) => p.slug === slug) ?? null;
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

import { Redis } from "@upstash/redis";
import { toSlug } from "@/lib/slug";
import type { BlogPost, BlogPostInput } from "./types";

// Upstash Redis is enabled when both env vars are present (Vercel Marketplace
// auto-injects them). Locally they're absent and we fall back to an in-memory
// Map so the dev server works out of the box. Posts written locally are lost
// on restart — fine for development.
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const POSTS_INDEX_KEY = "blog:index"; // sorted set of slugs scored by createdAt
const POST_KEY_PREFIX = "blog:post:";

interface BlogStore {
  list(opts?: { limit?: number; offset?: number }): Promise<BlogPost[]>;
  get(slug: string): Promise<BlogPost | null>;
  create(input: BlogPostInput): Promise<BlogPost>;
  delete(slug: string): Promise<boolean>;
  /** Test-only: wipe everything. */
  _reset?(): Promise<void>;
}

// ---------- Upstash Redis-backed store ----------

function makeRedisStore(client: Redis): BlogStore {
  return {
    async list({ limit = 20, offset = 0 } = {}) {
      // Sorted-set membership ordered by createdAt desc.
      const slugs = (await client.zrange(POSTS_INDEX_KEY, offset, offset + limit - 1, {
        rev: true,
      })) as string[];
      if (slugs.length === 0) return [];
      const keys = slugs.map((s) => POST_KEY_PREFIX + s);
      const posts = await client.mget<BlogPost[]>(...keys);
      return posts.filter((p): p is BlogPost => p !== null);
    },
    async get(slug) {
      return (await client.get<BlogPost>(POST_KEY_PREFIX + slug)) ?? null;
    },
    async create(input) {
      const post = buildPost(input);
      await Promise.all([
        client.set(POST_KEY_PREFIX + post.slug, post),
        client.zadd(POSTS_INDEX_KEY, {
          score: +new Date(post.createdAt),
          member: post.slug,
        }),
      ]);
      return post;
    },
    async delete(slug) {
      const removed = (await client.del(POST_KEY_PREFIX + slug)) > 0;
      await client.zrem(POSTS_INDEX_KEY, slug);
      return removed;
    },
  };
}

// ---------- In-memory dev fallback ----------

function makeMemoryStore(): BlogStore {
  const posts = new Map<string, BlogPost>();
  return {
    async list({ limit = 20, offset = 0 } = {}) {
      return [...posts.values()]
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .slice(offset, offset + limit);
    },
    async get(slug) {
      return posts.get(slug) ?? null;
    },
    async create(input) {
      const post = buildPost(input);
      posts.set(post.slug, post);
      return post;
    },
    async delete(slug) {
      return posts.delete(slug);
    },
    async _reset() {
      posts.clear();
    },
  };
}

// ---------- Shared helpers ----------

function buildPost(input: BlogPostInput): BlogPost {
  const now = new Date().toISOString();
  const slug = toSlug(input.title);
  if (!slug) throw new Error("Title produces empty slug");
  return {
    slug,
    title: input.title.trim(),
    excerpt: (input.excerpt ?? deriveExcerpt(input.body)).trim(),
    body: input.body,
    coverImage: input.coverImage?.trim() || undefined,
    tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    createdAt: now,
    updatedAt: now,
    author: input.author?.trim() || "BarcaPulse",
  };
}

function deriveExcerpt(body: string): string {
  // Strip markdown markup naively for the excerpt — admin writes English
  // headlines, this is good enough for a list-page preview.
  return body
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → text
    .replace(/`{1,3}[^`]*`{1,3}/g, "") // code
    .replace(/[#>*_~-]+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

// ---------- Singleton ----------

let storeInstance: BlogStore | null = null;

export function blogStore(): BlogStore {
  if (storeInstance) return storeInstance;
  if (REDIS_URL && REDIS_TOKEN) {
    const client = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
    storeInstance = makeRedisStore(client);
  } else {
    storeInstance = makeMemoryStore();
  }
  return storeInstance;
}

export function _resetBlogStore(): void {
  storeInstance = null;
}

export { deriveExcerpt };

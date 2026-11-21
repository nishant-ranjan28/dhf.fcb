import { Redis } from "@upstash/redis";
import { toSlug } from "@/lib/slug";
import type { BlogPost, BlogPostInput, BlogSummary, SocialPostLink } from "./types";

// Upstash Redis is enabled when both env vars are present.
//
// We accept either variable-name pair:
//   - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
//       What @upstash/redis docs use; what you'd set manually.
//   - KV_REST_API_URL / KV_REST_API_TOKEN
//       What the Vercel Marketplace "Upstash for Redis" integration injects
//       (it preserves the legacy @vercel/kv names for backward compatibility).
//
// Locally none of these are set and we fall back to an in-memory Map so the
// dev server works out of the box. Posts written locally are lost on restart
// — fine for development.
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const POSTS_INDEX_KEY = "blog:index"; // sorted set of slugs scored by createdAt
const POST_KEY_PREFIX = "blog:post:";
const POST_META_KEY_PREFIX = "blog:meta:";

interface BlogStore {
  /** Metadata only — never loads post bodies. */
  list(opts?: { limit?: number; offset?: number }): Promise<BlogSummary[]>;
  get(slug: string): Promise<BlogPost | null>;
  /** Cheap existence check for the view beacon; avoids fetching the body. */
  exists(slug: string): Promise<boolean>;
  create(input: BlogPostInput): Promise<BlogPost>;
  /** Attach social announcement permalinks after the post has been announced. */
  updateSocialPosts(slug: string, socialPosts: SocialPostLink[]): Promise<BlogPost | null>;
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

      // Metadata records keep the hot list path small. Older posts created
      // before this record existed fall back to a one-time full-post read and
      // lazily backfill their metadata, so no admin action is required.
      const metaKeys = slugs.map((s) => POST_META_KEY_PREFIX + s);
      const metas = (await client.mget<BlogSummary[]>(...metaKeys)) as (
        | BlogSummary
        | null
      )[];
      const missing = slugs.filter((_, i) => metas[i] == null);
      if (missing.length === 0) {
        return metas.filter((p): p is BlogSummary => p !== null);
      }

      const fullKeys = missing.map((s) => POST_KEY_PREFIX + s);
      const fullPosts = (await client.mget<BlogPost[]>(...fullKeys)) as (
        | BlogPost
        | null
      )[];
      const backfilled = new Map<string, BlogSummary>();
      await Promise.all(
        fullPosts.map(async (p) => {
          if (!p) return;
          const summary = toSummary(p);
          backfilled.set(p.slug, summary);
          await client.set(POST_META_KEY_PREFIX + p.slug, summary).catch(() => {});
        }),
      );

      return slugs
        .map((s, i) => metas[i] ?? backfilled.get(s))
        .filter((p): p is BlogSummary => p !== undefined);
    },
    async get(slug) {
      return (await client.get<BlogPost>(POST_KEY_PREFIX + slug)) ?? null;
    },
    async exists(slug) {
      return (await client.zscore(POSTS_INDEX_KEY, slug)) !== null;
    },
    async create(input) {
      const post = buildPost(input);
      await Promise.all([
        client.set(POST_KEY_PREFIX + post.slug, post),
        client.set(POST_META_KEY_PREFIX + post.slug, toSummary(post)),
        client.zadd(POSTS_INDEX_KEY, {
          score: +new Date(post.createdAt),
          member: post.slug,
        }),
      ]);
      return post;
    },
    async updateSocialPosts(slug, socialPosts) {
      const key = POST_KEY_PREFIX + slug;
      const current = await client.get<BlogPost>(key);
      if (!current) return null;
      const updated = {
        ...current,
        socialPosts,
        updatedAt: new Date().toISOString(),
      };
      await Promise.all([
        client.set(key, updated),
        client.set(POST_META_KEY_PREFIX + slug, toSummary(updated)),
      ]);
      return updated;
    },
    async delete(slug) {
      const removed = (await client.del(POST_KEY_PREFIX + slug)) > 0;
      await Promise.all([
        client.del(POST_META_KEY_PREFIX + slug),
        client.zrem(POSTS_INDEX_KEY, slug),
      ]);
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
        .slice(offset, offset + limit)
        .map(toSummary);
    },
    async get(slug) {
      return posts.get(slug) ?? null;
    },
    async exists(slug) {
      return posts.has(slug);
    },
    async create(input) {
      const post = buildPost(input);
      posts.set(post.slug, post);
      return post;
    },
    async updateSocialPosts(slug, socialPosts) {
      const current = posts.get(slug);
      if (!current) return null;
      const updated = {
        ...current,
        socialPosts,
        updatedAt: new Date().toISOString(),
      };
      posts.set(slug, updated);
      return updated;
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

/** Strip the one field list pages never need. */
function toSummary(post: BlogPost): BlogSummary {
  const { body: _body, ...summary } = post;
  return summary;
}

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
    socialPosts: input.socialPosts?.filter((p) => p.url.trim()).length
      ? input.socialPosts.filter((p) => p.url.trim())
      : undefined,
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

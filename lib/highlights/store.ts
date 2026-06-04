import { Redis } from "@upstash/redis";

// Same dual env-var detection as lib/blog/store.ts — see the comment there.
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const INDEX_KEY = "highlights:index"; // sorted set of youtubeIds scored by seq
const ITEM_PREFIX = "highlights:item:";
const SEQ_KEY = "highlights:seq"; // monotonic counter → stable newest-first order

export interface Highlight {
  youtubeId: string;
  title: string;
  addedAt: string; // ISO
}

export interface HighlightInput {
  /** A YouTube URL or bare 11-char video id. */
  url: string;
  title: string;
}

/**
 * Extract an 11-char YouTube video id from a URL or bare id. Handles
 * watch?v=, youtu.be/, /embed/ and /shorts/ forms. Returns null if none found.
 */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

interface HighlightsStore {
  list(): Promise<Highlight[]>;
  add(input: HighlightInput): Promise<Highlight>;
  remove(youtubeId: string): Promise<boolean>;
  _reset?(): Promise<void>;
}

function buildHighlight(input: HighlightInput): Highlight {
  const youtubeId = parseYouTubeId(input.url);
  if (!youtubeId) throw new Error("Could not parse a YouTube video id from the input");
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  return { youtubeId, title, addedAt: new Date().toISOString() };
}

// ---------- Upstash Redis-backed store ----------

function makeRedisStore(client: Redis): HighlightsStore {
  return {
    async list() {
      const ids = (await client.zrange(INDEX_KEY, 0, -1, { rev: true })) as string[];
      if (ids.length === 0) return [];
      const items = await client.mget<Highlight[]>(...ids.map((id) => ITEM_PREFIX + id));
      return items.filter((h): h is Highlight => h !== null);
    },
    async add(input) {
      const h = buildHighlight(input);
      const seq = await client.incr(SEQ_KEY);
      await Promise.all([
        client.set(ITEM_PREFIX + h.youtubeId, h),
        client.zadd(INDEX_KEY, { score: seq, member: h.youtubeId }),
      ]);
      return h;
    },
    async remove(youtubeId) {
      const removed = (await client.del(ITEM_PREFIX + youtubeId)) > 0;
      await client.zrem(INDEX_KEY, youtubeId);
      return removed;
    },
  };
}

// ---------- In-memory dev fallback ----------

function makeMemoryStore(): HighlightsStore {
  const items = new Map<string, Highlight>();
  const order = new Map<string, number>();
  let seq = 0;
  return {
    async list() {
      return [...items.values()].sort(
        (a, b) => (order.get(b.youtubeId) ?? 0) - (order.get(a.youtubeId) ?? 0),
      );
    },
    async add(input) {
      const h = buildHighlight(input);
      items.set(h.youtubeId, h);
      order.set(h.youtubeId, ++seq);
      return h;
    },
    async remove(youtubeId) {
      order.delete(youtubeId);
      return items.delete(youtubeId);
    },
    async _reset() {
      items.clear();
      order.clear();
      seq = 0;
    },
  };
}

// ---------- Singleton ----------

let storeInstance: HighlightsStore | null = null;

export function highlightsStore(): HighlightsStore {
  if (storeInstance) return storeInstance;
  if (REDIS_URL && REDIS_TOKEN) {
    storeInstance = makeRedisStore(new Redis({ url: REDIS_URL, token: REDIS_TOKEN }));
  } else {
    storeInstance = makeMemoryStore();
  }
  return storeInstance;
}

export function _resetHighlightsStore(): void {
  storeInstance = null;
}

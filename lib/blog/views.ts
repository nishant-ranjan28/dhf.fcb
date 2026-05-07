import { Redis } from "@upstash/redis";

// Same env-var detection as lib/blog/store.ts — see comment there for why
// both name pairs are accepted.
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const KEY_PREFIX = "blog:views:";

interface ViewStore {
  increment(slug: string): Promise<number>;
  get(slug: string): Promise<number>;
  getBatch(slugs: string[]): Promise<Record<string, number>>;
  _reset?(): Promise<void>;
}

function makeRedisStore(client: Redis): ViewStore {
  return {
    async increment(slug) {
      const v = await client.incr(KEY_PREFIX + slug);
      return Number(v);
    },
    async get(slug) {
      const v = await client.get<number | string>(KEY_PREFIX + slug);
      return Number(v) || 0;
    },
    async getBatch(slugs) {
      if (slugs.length === 0) return {};
      const keys = slugs.map((s) => KEY_PREFIX + s);
      const vals = await client.mget<(number | string | null)[]>(...keys);
      const out: Record<string, number> = {};
      slugs.forEach((s, i) => {
        out[s] = Number(vals[i]) || 0;
      });
      return out;
    },
  };
}

function makeMemoryStore(): ViewStore {
  const map = new Map<string, number>();
  return {
    async increment(slug) {
      const v = (map.get(slug) ?? 0) + 1;
      map.set(slug, v);
      return v;
    },
    async get(slug) {
      return map.get(slug) ?? 0;
    },
    async getBatch(slugs) {
      const out: Record<string, number> = {};
      for (const s of slugs) out[s] = map.get(s) ?? 0;
      return out;
    },
    async _reset() {
      map.clear();
    },
  };
}

let storeInstance: ViewStore | null = null;

export function viewStore(): ViewStore {
  if (storeInstance) return storeInstance;
  if (REDIS_URL && REDIS_TOKEN) {
    storeInstance = makeRedisStore(new Redis({ url: REDIS_URL, token: REDIS_TOKEN }));
  } else {
    storeInstance = makeMemoryStore();
  }
  return storeInstance;
}

export function _resetViewStore(): void {
  storeInstance = null;
}

/** Format a count like "1.2k" / "3.4M" / "527". Used in lists. */
export function formatViews(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`.replace(".0", "");
  return `${(n / 1_000_000).toFixed(1)}M`.replace(".0", "");
}

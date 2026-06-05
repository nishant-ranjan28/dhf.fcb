import { Redis } from "@upstash/redis";

// Same dual env-var detection as the other stores (see lib/blog/store.ts).
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const DONE_KEY = "recap:done"; // set of recapped match slugs
const COUNT_KEY = (ymd: string) => `recap:count:${ymd}`;

function ymd(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export interface RecapState {
  isRecapped(slug: string): Promise<boolean>;
  markRecapped(slug: string): Promise<void>;
  publishedToday(): Promise<number>;
  dayCapReached(cap: number): Promise<boolean>;
  recordPublish(): Promise<void>;
  /** Total matches ever recapped (size of the dedup set). */
  totalRecapped(): Promise<number>;
  _reset?(): Promise<void>;
}

function makeRedisState(client: Redis): RecapState {
  return {
    async isRecapped(slug) {
      return (await client.sismember(DONE_KEY, slug)) === 1;
    },
    async markRecapped(slug) {
      await client.sadd(DONE_KEY, slug);
    },
    async publishedToday() {
      return Number(await client.get<number>(COUNT_KEY(ymd()))) || 0;
    },
    async dayCapReached(cap) {
      return (Number(await client.get<number>(COUNT_KEY(ymd()))) || 0) >= cap;
    },
    async recordPublish() {
      const key = COUNT_KEY(ymd());
      const n = await client.incr(key);
      // First write of the day: expire after 2 days so old counters self-clean.
      if (n === 1) await client.expire(key, 60 * 60 * 48);
    },
    async totalRecapped() {
      return await client.scard(DONE_KEY);
    },
  };
}

function makeMemoryState(): RecapState {
  const done = new Set<string>();
  const counts = new Map<string, number>();
  return {
    async isRecapped(slug) {
      return done.has(slug);
    },
    async markRecapped(slug) {
      done.add(slug);
    },
    async publishedToday() {
      return counts.get(ymd()) ?? 0;
    },
    async dayCapReached(cap) {
      return (counts.get(ymd()) ?? 0) >= cap;
    },
    async recordPublish() {
      counts.set(ymd(), (counts.get(ymd()) ?? 0) + 1);
    },
    async totalRecapped() {
      return done.size;
    },
    async _reset() {
      done.clear();
      counts.clear();
    },
  };
}

let instance: RecapState | null = null;

export function recapState(): RecapState {
  if (instance) return instance;
  if (REDIS_URL && REDIS_TOKEN) {
    instance = makeRedisState(new Redis({ url: REDIS_URL, token: REDIS_TOKEN }));
  } else {
    instance = makeMemoryState();
  }
  return instance;
}

export function _resetRecapState(): void {
  instance = null;
}

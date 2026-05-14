import { Redis } from "@upstash/redis";

const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const TOPICS_KEY = "autopost:recent_topics";
const STATS_KEY_PREFIX = "autopost:stats:";

export interface DayStats {
  date: string;
  generated: number;
  published: number;
  errors: number;
  by_gemini: number;
  by_groq: number;
  skipped_by_reason: Record<string, number>;
}

export interface AutopostState {
  publishedToday(): Promise<number>;
  todayStats(): Promise<DayStats>;
  /** Walks back `days` from today inclusive. Days older than the 30d stats
   *  TTL (Redis) appear as empty `DayStats`, so callers should request <= 30. */
  recentStats(days: number): Promise<DayStats[]>;
  dayCapReached(cap: number): Promise<boolean>;
  recordPublish(opts: { provider: "gemini" | "groq" }): Promise<void>;
  recordSkip(reason: string): Promise<void>;
  recordError(): Promise<void>;
  recordGenerated(): Promise<void>;
  recordEntities(entities: string[], at?: number): Promise<void>;
  recentEntities(days: number): Promise<string[]>;
  _reset?(): Promise<void>;
}

function ymd(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function emptyStats(date: string): DayStats {
  return {
    date,
    generated: 0,
    published: 0,
    errors: 0,
    by_gemini: 0,
    by_groq: 0,
    skipped_by_reason: {},
  };
}

function makeRedisState(client: Redis): AutopostState {
  async function readDay(date: string): Promise<DayStats> {
    const raw = await client.get<DayStats>(STATS_KEY_PREFIX + date);
    return raw ?? emptyStats(date);
  }
  async function writeDay(stats: DayStats): Promise<void> {
    // 30 day TTL — keeps the admin dashboard's 7-day window plus headroom.
    await client.set(STATS_KEY_PREFIX + stats.date, stats, { ex: 60 * 60 * 24 * 30 });
  }
  return {
    async publishedToday() {
      return (await readDay(ymd())).published;
    },
    async todayStats() {
      return readDay(ymd());
    },
    async recentStats(days) {
      const out: DayStats[] = [];
      const now = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - i);
        out.push(await readDay(ymd(d)));
      }
      return out;
    },
    async dayCapReached(cap) {
      return (await readDay(ymd())).published >= cap;
    },
    async recordPublish({ provider }) {
      const s = await readDay(ymd());
      s.published += 1;
      if (provider === "gemini") s.by_gemini += 1;
      else s.by_groq += 1;
      await writeDay(s);
    },
    async recordSkip(reason) {
      const s = await readDay(ymd());
      s.skipped_by_reason[reason] = (s.skipped_by_reason[reason] ?? 0) + 1;
      await writeDay(s);
    },
    async recordError() {
      const s = await readDay(ymd());
      s.errors += 1;
      await writeDay(s);
    },
    async recordGenerated() {
      const s = await readDay(ymd());
      s.generated += 1;
      await writeDay(s);
    },
    async recordEntities(entities, at = Date.now()) {
      // Filter empties + destructure so TS can prove the variadic overload.
      const items = entities
        .filter((e) => e.trim().length > 0)
        .map((e) => ({ score: at, member: e.toLowerCase() }));
      if (items.length === 0) return;
      const [first, ...rest] = items;
      await client.zadd(TOPICS_KEY, first, ...rest);
    },
    async recentEntities(days) {
      const min = Date.now() - days * 24 * 3600 * 1000;
      // Prune older entries to keep the set bounded.
      await client.zremrangebyscore(TOPICS_KEY, 0, min);
      return (await client.zrange(TOPICS_KEY, min, "+inf", { byScore: true })) as string[];
    },
  };
}

function makeMemoryState(): AutopostState {
  const daily = new Map<string, DayStats>();
  const entities = new Map<string, number>();
  function dayOf(date: string): DayStats {
    let d = daily.get(date);
    if (!d) {
      d = emptyStats(date);
      daily.set(date, d);
    }
    return d;
  }
  return {
    async publishedToday() {
      return dayOf(ymd()).published;
    },
    async todayStats() {
      return dayOf(ymd());
    },
    async recentStats(days) {
      const out: DayStats[] = [];
      const now = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - i);
        const date = ymd(d);
        out.push(daily.get(date) ?? emptyStats(date));
      }
      return out;
    },
    async dayCapReached(cap) {
      return dayOf(ymd()).published >= cap;
    },
    async recordPublish({ provider }) {
      const s = dayOf(ymd());
      s.published += 1;
      if (provider === "gemini") s.by_gemini += 1;
      else s.by_groq += 1;
    },
    async recordSkip(reason) {
      const s = dayOf(ymd());
      s.skipped_by_reason[reason] = (s.skipped_by_reason[reason] ?? 0) + 1;
    },
    async recordError() {
      dayOf(ymd()).errors += 1;
    },
    async recordGenerated() {
      dayOf(ymd()).generated += 1;
    },
    async recordEntities(es, at = Date.now()) {
      for (const e of es) {
        const lower = e.trim().toLowerCase();
        if (lower) entities.set(lower, at);
      }
    },
    async recentEntities(days) {
      const min = Date.now() - days * 24 * 3600 * 1000;
      const out: string[] = [];
      for (const [k, v] of entities) {
        if (v >= min) out.push(k);
        else entities.delete(k);
      }
      return out;
    },
    async _reset() {
      daily.clear();
      entities.clear();
    },
  };
}

let instance: AutopostState | null = null;

export function autopostState(): AutopostState {
  if (instance) return instance;
  if (REDIS_URL && REDIS_TOKEN) {
    instance = makeRedisState(new Redis({ url: REDIS_URL, token: REDIS_TOKEN }));
  } else {
    instance = makeMemoryState();
  }
  return instance;
}

export function _resetAutopostState(): void {
  instance = null;
}

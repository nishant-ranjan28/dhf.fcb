// A small Redis-compatible client backed by GitHub JSON documents.
//
// It implements exactly the commands BarcaPulse uses, so the existing store
// modules keep their current interfaces. Values are stored as plain JSON and
// TTLs are recorded alongside them; reads through githubDocStore() drop
// expired documents.

import type { GithubDocStore, StoredDoc } from "./github";

type ZMember = { score: number; member: string };

type RedisDoc =
  | { t: "string"; v: unknown; exp?: number }
  | { t: "zset"; v: Record<string, number>; exp?: number }
  | { t: "set"; v: string[]; exp?: number }
  | { t: "hash"; v: Record<string, unknown>; exp?: number };

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ttl(ex?: number): number | undefined {
  return ex ? Date.now() + ex * 1000 : undefined;
}

async function read<T extends RedisDoc["t"]>(
  store: GithubDocStore,
  key: string,
  type: T,
): Promise<Extract<RedisDoc, { t: T }> | null> {
  const doc = await store.get<RedisDoc>(key);
  return doc && doc.value.t === type
    ? (doc.value as Extract<RedisDoc, { t: T }>)
    : null;
}

async function write(
  store: GithubDocStore,
  key: string,
  value: RedisDoc,
  exp?: number,
): Promise<void> {
  await store.set<RedisDoc>(key, { value, expiresAt: exp });
}

/** Redis-like client over an arbitrary document store. Exported for tests. */
export function makeRedisShim(store: GithubDocStore) {
  async function get<T>(key: string): Promise<T | null> {
    const doc = await read(store, key, "string");
    return (doc?.v ?? null) as T | null;
  }

  return {
    get,

    async set(
      key: string,
      value: unknown,
      opts?: { ex?: number },
    ): Promise<"OK"> {
      await write(store, key, { t: "string", v: value }, ttl(opts?.ex));
      return "OK";
    },

    async mget<T>(...keys: string[]): Promise<(T | null)[]> {
      return Promise.all(keys.map((k) => get<T>(k)));
    },

    async del(...keys: string[]): Promise<number> {
      let removed = 0;
      for (const key of keys) {
        const doc = await store.get<RedisDoc>(key);
        if (doc) removed++;
        await store.del(key);
      }
      return removed;
    },

    async incr(key: string): Promise<number> {
      const doc = await read(store, key, "string");
      const next = (num(doc?.v) || 0) + 1;
      await write(store, key, { t: "string", v: next }, doc?.exp);
      return next;
    },

    async expire(key: string, seconds: number): Promise<0 | 1> {
      const doc = await store.get<RedisDoc>(key);
      if (!doc) return 0;
      await store.set<RedisDoc>(key, {
        ...doc,
        expiresAt: Date.now() + seconds * 1000,
      });
      return 1;
    },

    async zadd(
      key: string,
      first: ZMember | ZMember[],
      ...rest: ZMember[]
    ): Promise<number> {
      const doc = await read(store, key, "zset");
      const scores: Record<string, number> = { ...(doc?.v ?? {}) };
      const items = Array.isArray(first) ? first : [first, ...rest];
      let added = 0;
      for (const item of items) {
        if (!(item.member in scores)) added++;
        scores[item.member] = num(item.score);
      }
      await write(store, key, { t: "zset", v: scores }, doc?.exp);
      return added;
    },

    async zscore(key: string, member: string): Promise<number | null> {
      const doc = await read(store, key, "zset");
      return doc && member in doc.v ? doc.v[member] : null;
    },

    async zrem(key: string, ...members: string[]): Promise<number> {
      const doc = await read(store, key, "zset");
      if (!doc) return 0;
      let removed = 0;
      for (const member of members) {
        if (member in doc.v) {
          delete doc.v[member];
          removed++;
        }
      }
      if (removed) await write(store, key, doc, doc.exp);
      return removed;
    },

    async zincrby(key: string, increment: number, member: string): Promise<number> {
      const doc = await read(store, key, "zset");
      const next = (doc?.v[member] ?? 0) + num(increment);
      await write(
        store,
        key,
        { t: "zset", v: { ...(doc?.v ?? {}), [member]: next } },
        doc?.exp,
      );
      return next;
    },

    async zcard(key: string): Promise<number> {
      return Object.keys((await read(store, key, "zset"))?.v ?? {}).length;
    },

    async zrevrank(key: string, member: string): Promise<number | null> {
      const doc = await read(store, key, "zset");
      if (!doc || !(member in doc.v)) return null;
      const sorted = Object.entries(doc.v).sort((a, b) => b[1] - a[1]);
      return sorted.findIndex(([m]) => m === member);
    },

    async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
      const doc = await read(store, key, "zset");
      if (!doc) return 0;
      let removed = 0;
      for (const [member, score] of Object.entries(doc.v)) {
        if (score >= num(min) && score <= num(max)) {
          delete doc.v[member];
          removed++;
        }
      }
      if (removed) await write(store, key, doc, doc.exp);
      return removed;
    },

    async zrange(
      key: string,
      start: number | string,
      stop: number | string,
      opts?: { rev?: boolean; byScore?: boolean; withScores?: boolean },
    ): Promise<(string | number)[]> {
      const doc = await read(store, key, "zset");
      if (!doc) return [];
      const entries = Object.entries(doc.v);
      let selected: [string, number][];
      if (opts?.byScore) {
        const low = num(start);
        const high = stop === "+inf" ? Infinity : num(stop);
        selected = entries.filter(([, s]) => s >= low && s <= high);
        selected.sort((a, b) => a[1] - b[1]);
      } else {
        selected = entries.sort((a, b) => a[1] - b[1]);
        const fromRaw = typeof start === "number" ? start : 0;
        const toRaw = typeof stop === "number" ? stop : selected.length - 1;
        const from = fromRaw < 0 ? Math.max(0, selected.length + fromRaw) : fromRaw;
        const to = toRaw < 0 ? selected.length + toRaw : toRaw;
        selected = selected.slice(from, to + 1);
      }
      if (opts?.rev) selected.reverse();
      if (!opts?.withScores) return selected.map(([member]) => member);
      return selected.flatMap(([member, score]) => [member, score]);
    },

    async sadd(key: string, ...members: string[]): Promise<number> {
      const doc = await read(store, key, "set");
      const values = new Set(doc?.v ?? []);
      let added = 0;
      for (const member of members) {
        if (!values.has(member)) {
          values.add(member);
          added++;
        }
      }
      await write(store, key, { t: "set", v: [...values] }, doc?.exp);
      return added;
    },

    async srem(key: string, ...members: string[]): Promise<number> {
      const doc = await read(store, key, "set");
      if (!doc) return 0;
      let removed = 0;
      for (const member of members) {
        const i = doc.v.indexOf(member);
        if (i >= 0) {
          doc.v.splice(i, 1);
          removed++;
        }
      }
      if (removed) await write(store, key, doc, doc.exp);
      return removed;
    },

    async smembers(key: string): Promise<string[]> {
      return (await read(store, key, "set"))?.v ?? [];
    },

    async sismember(key: string, member: string): Promise<0 | 1> {
      return (await read(store, key, "set"))?.v.includes(member) ? 1 : 0;
    },

    async scard(key: string): Promise<number> {
      return (await read(store, key, "set"))?.v.length ?? 0;
    },

    async hset(
      key: string,
      fieldOrValues: string | Record<string, unknown>,
      value?: unknown,
    ): Promise<number> {
      const doc = await read(store, key, "hash");
      const values: Record<string, unknown> = { ...(doc?.v ?? {}) };
      const pairs =
        typeof fieldOrValues === "string"
          ? { [fieldOrValues]: value }
          : fieldOrValues;
      let added = 0;
      for (const [field, v] of Object.entries(pairs)) {
        if (!(field in values)) added++;
        values[field] = v;
      }
      await write(store, key, { t: "hash", v: values }, doc?.exp);
      return added;
    },

    async hget<T>(key: string, field: string): Promise<T | null> {
      const doc = await read(store, key, "hash");
      return doc && field in doc.v ? (doc.v[field] as T) : null;
    },

    async hgetall<T extends Record<string, unknown>>(key: string): Promise<T> {
      return ((await read(store, key, "hash"))?.v ?? {}) as T;
    },

    async hmget<T extends Record<string, unknown>>(
      key: string,
      ...fields: string[]
    ): Promise<T> {
      const doc = await read(store, key, "hash");
      const out: Record<string, unknown> = {};
      for (const field of fields) {
        if (doc && field in doc.v) out[field] = doc.v[field];
      }
      return out as T;
    },

    async hincrby(key: string, field: string, increment: number): Promise<number> {
      const doc = await read(store, key, "hash");
      const next = num(doc?.v[field]) + num(increment);
      await write(
        store,
        key,
        { t: "hash", v: { ...(doc?.v ?? {}), [field]: next } },
        doc?.exp,
      );
      return next;
    },

    async hdel(key: string, ...fields: string[]): Promise<number> {
      const doc = await read(store, key, "hash");
      if (!doc) return 0;
      let removed = 0;
      for (const field of fields) {
        if (field in doc.v) {
          delete doc.v[field];
          removed++;
        }
      }
      if (removed) await write(store, key, doc, doc.exp);
      return removed;
    },

    async hlen(key: string): Promise<number> {
      return Object.keys((await read(store, key, "hash"))?.v ?? {}).length;
    },
  };
}

export type RedisShim = ReturnType<typeof makeRedisShim>;

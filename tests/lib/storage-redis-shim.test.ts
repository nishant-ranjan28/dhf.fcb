import { describe, it, expect } from "vitest";
import type { GithubDocStore, StoredDoc } from "@/lib/storage/github";
import { makeRedisShim } from "@/lib/storage/redis-shim";
import { resilient, type Redis } from "@/lib/storage/redis";

function fakeStore(): GithubDocStore {
  const docs = new Map<string, StoredDoc>();
  return {
    async get<T>(key: string) {
      const doc = docs.get(key);
      if (!doc) return null;
      if (doc.expiresAt && doc.expiresAt <= Date.now()) {
        docs.delete(key);
        return null;
      }
      return doc as StoredDoc<T>;
    },
    async set<T>(key: string, doc: StoredDoc<T>) {
      docs.set(key, doc as StoredDoc);
    },
    async del(key: string) {
      docs.delete(key);
    },
    async keys() {
      return [...docs.keys()];
    },
  };
}

describe("GitHub-backed Redis shim", () => {
  it("handles the string commands used by views, state and caches", async () => {
    const shim = makeRedisShim(fakeStore());
    expect(await shim.get("missing")).toBeNull();
    expect(await shim.set("views", 3)).toBe("OK");
    expect(await shim.get<number>("views")).toBe(3);
    expect(await shim.incr("views")).toBe(4);
    expect(await shim.mget<number>("views", "missing")).toEqual([4, null]);
    expect(await shim.del("views")).toBe(1);
    expect(await shim.get("views")).toBeNull();
  });

  it("handles sorted sets, ranges and scores", async () => {
    const shim = makeRedisShim(fakeStore());
    await shim.zadd("index", { member: "old", score: 100 }, { member: "new", score: 200 });
    expect(await shim.zrange("index", 0, -1)).toEqual(["old", "new"]);
    expect(await shim.zrange("index", 0, -1, { rev: true })).toEqual(["new", "old"]);
    expect(await shim.zscore("index", "new")).toBe(200);
    expect(await shim.zcard("index")).toBe(2);
    expect(await shim.zrevrank("index", "old")).toBe(1);
    expect(await shim.zincrby("index", 5, "old")).toBe(105);
    expect(
      await shim.zrange("index", 100, 300, { byScore: true, withScores: true }),
    ).toEqual(["old", 105, "new", 200]);
    await shim.zremrangebyscore("index", 0, 150);
    expect(await shim.zrange("index", 0, -1)).toEqual(["new"]);
    await shim.zrem("index", "new");
    expect(await shim.zcard("index")).toBe(0);
  });

  it("handles sets and hashes", async () => {
    const shim = makeRedisShim(fakeStore());
    expect(await shim.sadd("settled", "m1", "m2")).toBe(2);
    expect(await shim.sismember("settled", "m1")).toBe(1);
    expect(await shim.smembers("settled")).toEqual(["m1", "m2"]);
    expect(await shim.scard("settled")).toBe(2);
    expect(await shim.srem("settled", "m1")).toBe(1);

    await shim.hset("counts", { yes: 1, no: 0 });
    expect(await shim.hget<number>("counts", "yes")).toBe(1);
    expect(await shim.hgetall("counts")).toEqual({ yes: 1, no: 0 });
    expect(await shim.hmget("counts", "yes", "missing")).toEqual({ yes: 1 });
    expect(await shim.hincrby("counts", "yes", 2)).toBe(3);
    expect(await shim.hlen("counts")).toBe(2);
    expect(await shim.hdel("counts", "no")).toBe(1);
  });

  it("stores TTLs with values", async () => {
    const store = fakeStore();
    const shim = makeRedisShim(store);
    await shim.set("last-run", { status: "ok" }, { ex: 60 });
    const doc = await store.get("last-run");
    expect(doc?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("fails over to GitHub after the first Redis error", async () => {
    let calls = 0;
    const broken = {
      get: async () => {
        calls++;
        throw new Error("ERR bandwidth limit exceeded");
      },
      set: async () => {
        calls++;
        throw new Error("ERR bandwidth limit exceeded");
      },
    } as unknown as Redis;
    const shim = makeRedisShim(fakeStore());
    const client = resilient(broken, shim);
    expect(await client.set("post", { slug: "x" })).toBe("OK");
    expect(await client.get("post")).toEqual({ slug: "x" });
    expect(calls).toBe(1);
  });
});

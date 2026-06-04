import { describe, it, expect, beforeEach } from "vitest";
import { pollStore, _resetPollStore } from "@/lib/poll/store";

const OPTS = ["brazil", "france", "argentina"];

describe("pollStore (in-memory fallback)", () => {
  beforeEach(async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    _resetPollStore();
    await pollStore()._reset?.();
  });

  it("starts with zero counts for every option", async () => {
    expect(await pollStore().results("wc", OPTS)).toEqual({
      brazil: 0,
      france: 0,
      argentina: 0,
    });
  });

  it("records a vote and returns updated counts", async () => {
    const res = await pollStore().vote("wc", "brazil", "voter-1");
    expect(res.alreadyVoted).toBe(false);
    expect(res.counts.brazil).toBe(1);
  });

  it("dedupes a repeat vote from the same voter id", async () => {
    await pollStore().vote("wc", "brazil", "voter-1");
    const second = await pollStore().vote("wc", "france", "voter-1");
    expect(second.alreadyVoted).toBe(true);
    // The second vote must not move any count.
    const r = await pollStore().results("wc", OPTS);
    expect(r.brazil).toBe(1);
    expect(r.france).toBe(0);
  });

  it("counts distinct voters independently", async () => {
    await pollStore().vote("wc", "brazil", "a");
    await pollStore().vote("wc", "brazil", "b");
    await pollStore().vote("wc", "france", "c");
    const r = await pollStore().results("wc", OPTS);
    expect(r).toEqual({ brazil: 2, france: 1, argentina: 0 });
  });

  it("keeps separate tallies per poll id", async () => {
    await pollStore().vote("wc", "brazil", "a");
    await pollStore().vote("golden-boot", "brazil", "a");
    expect((await pollStore().results("wc", OPTS)).brazil).toBe(1);
    expect((await pollStore().results("golden-boot", OPTS)).brazil).toBe(1);
  });
});

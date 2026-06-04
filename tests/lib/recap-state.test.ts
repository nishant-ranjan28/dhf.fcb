import { describe, it, expect, beforeEach } from "vitest";
import { recapState, _resetRecapState } from "@/lib/recap/state";

describe("recapState (in-memory fallback)", () => {
  beforeEach(async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    _resetRecapState();
    await recapState()._reset?.();
  });

  it("reports a slug as not recapped until marked", async () => {
    const s = recapState();
    expect(await s.isRecapped("a-vs-b")).toBe(false);
    await s.markRecapped("a-vs-b");
    expect(await s.isRecapped("a-vs-b")).toBe(true);
  });

  it("tracks the published-today count and day cap", async () => {
    const s = recapState();
    expect(await s.publishedToday()).toBe(0);
    expect(await s.dayCapReached(2)).toBe(false);
    await s.recordPublish();
    await s.recordPublish();
    expect(await s.publishedToday()).toBe(2);
    expect(await s.dayCapReached(2)).toBe(true);
  });

  it("keeps recap marks independent per slug", async () => {
    const s = recapState();
    await s.markRecapped("a-vs-b");
    expect(await s.isRecapped("c-vs-d")).toBe(false);
  });
});

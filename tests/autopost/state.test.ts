import { describe, it, expect, beforeEach } from "vitest";
import {
  autopostState,
  _resetAutopostState,
} from "@/lib/autopost/state";

beforeEach(async () => {
  _resetAutopostState();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  const s = autopostState();
  await s._reset?.();
});

describe("autopostState (in-memory)", () => {
  it("starts with zero published today", async () => {
    const s = autopostState();
    expect(await s.publishedToday()).toBe(0);
  });

  it("increments published count", async () => {
    const s = autopostState();
    await s.recordPublish({ provider: "gemini" });
    await s.recordPublish({ provider: "groq" });
    expect(await s.publishedToday()).toBe(2);
  });

  it("tracks per-provider counters", async () => {
    const s = autopostState();
    await s.recordPublish({ provider: "gemini" });
    await s.recordPublish({ provider: "gemini" });
    await s.recordPublish({ provider: "groq" });
    const stats = await s.todayStats();
    expect(stats.by_gemini).toBe(2);
    expect(stats.by_groq).toBe(1);
  });

  it("tracks skip reasons per day", async () => {
    const s = autopostState();
    await s.recordSkip("gate_word_count");
    await s.recordSkip("gate_word_count");
    await s.recordSkip("no_eligible_news");
    const stats = await s.todayStats();
    expect(stats.skipped_by_reason.gate_word_count).toBe(2);
    expect(stats.skipped_by_reason.no_eligible_news).toBe(1);
  });

  it("returns recent entities, dropping expired", async () => {
    const s = autopostState();
    const now = Date.now();
    const eightDaysAgo = now - 8 * 24 * 3600 * 1000;
    await s.recordEntities(["yamal"], now);
    await s.recordEntities(["pedri"], eightDaysAgo);
    const recent = await s.recentEntities(7);
    expect(recent).toContain("yamal");
    expect(recent).not.toContain("pedri");
  });

  it("dayCapReached reflects publishedToday vs cap", async () => {
    const s = autopostState();
    for (let i = 0; i < 24; i++) await s.recordPublish({ provider: "gemini" });
    expect(await s.dayCapReached(24)).toBe(true);
    expect(await s.dayCapReached(25)).toBe(false);
  });

  it("returns last 7 days of stats", async () => {
    const s = autopostState();
    await s.recordPublish({ provider: "gemini" });
    const days = await s.recentStats(7);
    expect(days).toHaveLength(7);
    // The latest day should reflect the publish we just recorded.
    const latest = days[days.length - 1];
    expect(latest.published).toBe(1);
  });
});

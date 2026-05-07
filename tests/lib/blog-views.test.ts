import { describe, it, expect, beforeEach } from "vitest";
import { viewStore, formatViews, _resetViewStore } from "@/lib/blog/views";

describe("viewStore (in-memory fallback)", () => {
  beforeEach(async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    _resetViewStore();
    await viewStore()._reset?.();
  });

  it("increments and returns the new count", async () => {
    const s = viewStore();
    expect(await s.increment("hello")).toBe(1);
    expect(await s.increment("hello")).toBe(2);
    expect(await s.increment("hello")).toBe(3);
  });

  it("get returns 0 for unknown slug", async () => {
    expect(await viewStore().get("nope")).toBe(0);
  });

  it("get reflects the current count", async () => {
    const s = viewStore();
    await s.increment("x");
    await s.increment("x");
    expect(await s.get("x")).toBe(2);
  });

  it("getBatch returns counts for many slugs at once", async () => {
    const s = viewStore();
    await s.increment("a");
    await s.increment("a");
    await s.increment("b");
    const out = await s.getBatch(["a", "b", "c"]);
    expect(out).toEqual({ a: 2, b: 1, c: 0 });
  });

  it("getBatch on empty input returns empty object", async () => {
    expect(await viewStore().getBatch([])).toEqual({});
  });
});

describe("formatViews", () => {
  it("returns the raw number under 1000", () => {
    expect(formatViews(0)).toBe("0");
    expect(formatViews(7)).toBe("7");
    expect(formatViews(999)).toBe("999");
  });
  it("uses k for thousands", () => {
    expect(formatViews(1000)).toBe("1k");
    expect(formatViews(1234)).toBe("1.2k");
    expect(formatViews(9999)).toBe("10k");
    expect(formatViews(12_345)).toBe("12k");
    expect(formatViews(999_999)).toBe("1000k");
  });
  it("uses M for millions", () => {
    expect(formatViews(1_000_000)).toBe("1M");
    expect(formatViews(2_500_000)).toBe("2.5M");
  });
});

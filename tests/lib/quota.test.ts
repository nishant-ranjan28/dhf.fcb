import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Quota } from "@/lib/football/quota";

describe("Quota", () => {
  let q: Quota;
  beforeEach(() => {
    q = new Quota({ limit: 3, windowMs: 24 * 3600 * 1000 });
  });

  it("allows up to limit", () => {
    expect(q.tryConsume()).toBe(true);
    expect(q.tryConsume()).toBe(true);
    expect(q.tryConsume()).toBe(true);
    expect(q.tryConsume()).toBe(false);
  });

  it("reports remaining", () => {
    q.tryConsume();
    q.tryConsume();
    expect(q.remaining()).toBe(1);
  });

  describe("sliding window", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("restores capacity after the window elapses", () => {
      const w = new Quota({ limit: 2, windowMs: 60_000 });
      vi.setSystemTime(0);
      expect(w.tryConsume()).toBe(true);
      expect(w.tryConsume()).toBe(true);
      expect(w.tryConsume()).toBe(false);

      // Just past the window — both old hits should drop out.
      vi.setSystemTime(60_001);
      expect(w.remaining()).toBe(2);
      expect(w.tryConsume()).toBe(true);
    });

    it("keeps a hit at exactly windowMs old (closed-left interval)", () => {
      const w = new Quota({ limit: 1, windowMs: 60_000 });
      vi.setSystemTime(0);
      expect(w.tryConsume()).toBe(true);
      vi.setSystemTime(60_000);
      // hit is exactly at the boundary — pruned only when STRICTLY older.
      expect(w.remaining()).toBe(0);
      vi.setSystemTime(60_001);
      expect(w.remaining()).toBe(1);
    });
  });
});

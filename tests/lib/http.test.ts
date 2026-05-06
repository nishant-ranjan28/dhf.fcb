import { describe, it, expect, vi } from "vitest";
import { rateLimited } from "@/lib/http";

describe("rateLimited", () => {
  it("queues calls beyond the per-window limit", async () => {
    const limiter = rateLimited({ maxPerWindow: 2, windowMs: 100 });
    const start = Date.now();
    await Promise.all([
      limiter(() => Promise.resolve(1)),
      limiter(() => Promise.resolve(2)),
      limiter(() => Promise.resolve(3)),
    ]);
    expect(Date.now() - start).toBeGreaterThanOrEqual(100);
  });

  it("returns the underlying value", async () => {
    const limiter = rateLimited({ maxPerWindow: 5, windowMs: 1000 });
    expect(await limiter(() => Promise.resolve("ok"))).toBe("ok");
  });
});

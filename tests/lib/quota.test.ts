import { describe, it, expect, beforeEach } from "vitest";
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
});

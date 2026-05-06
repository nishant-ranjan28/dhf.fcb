import { describe, it, expect, vi } from "vitest";
import { ProviderChain } from "@/lib/football/chain";
import { HttpError } from "@/lib/http";
import type { Match } from "@/lib/types";

describe("ProviderChain", () => {
  it("uses primary when it works", async () => {
    const primary = vi.fn(async () => [{ slug: "a-vs-b" } as unknown as Match]);
    const fallback = vi.fn(async () => [{ slug: "x-vs-y" } as unknown as Match]);
    const chain = new ProviderChain([
      { name: "primary", fn: primary },
      { name: "fallback", fn: fallback },
    ]);
    expect(await chain.getAll()).toEqual([{ slug: "a-vs-b" }]);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back when primary throws", async () => {
    const chain = new ProviderChain([
      {
        name: "primary",
        fn: async () => {
          throw new Error("network");
        },
      },
      { name: "fallback", fn: async () => [{ slug: "x-vs-y" } as unknown as Match] },
    ]);
    expect(await chain.getAll()).toEqual([{ slug: "x-vs-y" }]);
  });

  it("returns empty when all providers fail", async () => {
    const chain = new ProviderChain([
      {
        name: "a",
        fn: async () => {
          throw new Error("a");
        },
      },
      {
        name: "b",
        fn: async () => {
          throw new Error("b");
        },
      },
    ]);
    expect(await chain.getAll()).toEqual([]);
  });

  it("falls through when provider returns empty array", async () => {
    const chain = new ProviderChain([
      { name: "primary", fn: async () => [] },
      { name: "fallback", fn: async () => [{ slug: "x-vs-y" } as unknown as Match] },
    ]);
    expect(await chain.getAll()).toEqual([{ slug: "x-vs-y" }]);
  });

  it("puts a 429 provider on 60s cooldown", async () => {
    const primary = vi.fn(async () => {
      throw new HttpError(429, "https://x");
    });
    const fallback = vi.fn(async () => [{ slug: "fallback" } as unknown as Match]);
    const chain = new ProviderChain([
      { name: "primary", fn: primary },
      { name: "fallback", fn: fallback },
    ]);
    await chain.getAll();
    expect(primary).toHaveBeenCalledTimes(1);
    // Second call should skip primary entirely.
    await chain.getAll();
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(2);
  });
});

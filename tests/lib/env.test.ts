import { describe, it, expect, beforeEach } from "vitest";
import { env, resetEnvCache } from "@/lib/env";

describe("env", () => {
  beforeEach(() => {
    for (const k of [
      "FOOTBALL_DATA_API_KEY",
      "API_FOOTBALL_KEY",
      "ADMIN_TOKEN",
      "NEXT_PUBLIC_TELEGRAM_URL",
      "SCORES_TTL_SECONDS",
      "LIST_TTL_SECONDS",
      "NEWS_TTL_SECONDS",
    ]) {
      delete process.env[k];
    }
    resetEnvCache();
  });

  it("returns mock provider when no keys set", () => {
    expect(env.provider).toBe("mock");
    expect(env.enrichmentEnabled).toBe(false);
  });

  it("returns football-data when only FD key set", () => {
    process.env.FOOTBALL_DATA_API_KEY = "abc";
    resetEnvCache();
    expect(env.provider).toBe("football-data");
    expect(env.footballDataKey).toBe("abc");
    expect(env.enrichmentEnabled).toBe(false);
  });

  it("flags api-football enrichment when key present", () => {
    process.env.FOOTBALL_DATA_API_KEY = "abc";
    process.env.API_FOOTBALL_KEY = "xyz";
    resetEnvCache();
    expect(env.apiFootballKey).toBe("xyz");
    expect(env.enrichmentEnabled).toBe(true);
  });

  it("treats whitespace-only keys as unset", () => {
    process.env.FOOTBALL_DATA_API_KEY = "   ";
    process.env.API_FOOTBALL_KEY = "\t\n";
    resetEnvCache();
    expect(env.footballDataKey).toBeUndefined();
    expect(env.apiFootballKey).toBeUndefined();
    expect(env.provider).toBe("mock");
  });

  it("falls back to default Telegram URL when unset or empty", () => {
    expect(env.telegramUrl).toBe("https://t.me/");
    process.env.NEXT_PUBLIC_TELEGRAM_URL = "";
    resetEnvCache();
    expect(env.telegramUrl).toBe("https://t.me/");
    process.env.NEXT_PUBLIC_TELEGRAM_URL = "https://t.me/myband";
    resetEnvCache();
    expect(env.telegramUrl).toBe("https://t.me/myband");
  });

  it("parses TTLs with defaults and rejects garbage", () => {
    expect(env.scoresTtlSeconds).toBe(30);
    expect(env.listTtlSeconds).toBe(60);
    expect(env.newsTtlSeconds).toBe(600);

    process.env.SCORES_TTL_SECONDS = "5";
    process.env.LIST_TTL_SECONDS = "not-a-number";
    process.env.NEWS_TTL_SECONDS = "-10";
    resetEnvCache();
    expect(env.scoresTtlSeconds).toBe(5);
    expect(env.listTtlSeconds).toBe(60);
    expect(env.newsTtlSeconds).toBe(600);
  });
});

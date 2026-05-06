import { describe, it, expect, beforeEach } from "vitest";
import { env, resetEnvCache } from "@/lib/env";

describe("env", () => {
  beforeEach(() => {
    for (const k of [
      "FOOTBALL_DATA_API_KEY",
      "API_FOOTBALL_KEY",
      "ADMIN_TOKEN",
      "NEXT_PUBLIC_TELEGRAM_URL",
    ]) {
      delete process.env[k];
    }
    resetEnvCache();
  });

  it("returns mock provider when no keys set", () => {
    expect(env.provider).toBe("mock");
  });

  it("returns football-data when only FD key set", () => {
    process.env.FOOTBALL_DATA_API_KEY = "abc";
    resetEnvCache();
    expect(env.provider).toBe("football-data");
    expect(env.footballDataKey).toBe("abc");
  });

  it("flags api-football enrichment when key present", () => {
    process.env.FOOTBALL_DATA_API_KEY = "abc";
    process.env.API_FOOTBALL_KEY = "xyz";
    resetEnvCache();
    expect(env.apiFootballKey).toBe("xyz");
    expect(env.enrichmentEnabled).toBe(true);
  });
});

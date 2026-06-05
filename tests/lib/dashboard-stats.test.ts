import { describe, it, expect, beforeEach } from "vitest";
import { recapState, _resetRecapState } from "@/lib/recap/state";
import { predictionsStore, _resetPredictionsStore } from "@/lib/predictions/store";

beforeEach(async () => {
  for (const k of [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ]) {
    delete process.env[k];
  }
  _resetRecapState();
  _resetPredictionsStore();
  await recapState()._reset?.();
  await predictionsStore()._reset?.();
});

describe("recapState.totalRecapped", () => {
  it("counts distinct recapped matches", async () => {
    const s = recapState();
    expect(await s.totalRecapped()).toBe(0);
    await s.markRecapped("a-vs-b");
    await s.markRecapped("c-vs-d");
    await s.markRecapped("a-vs-b"); // dup
    expect(await s.totalRecapped()).toBe(2);
  });
});

describe("predictionsStore.stats", () => {
  it("reports players, predictions and settled matches", async () => {
    const s = predictionsStore();
    expect(await s.stats()).toEqual({ players: 0, predictions: 0, settledMatches: 0 });

    await s.predict("a-vs-b", "dev1", "Ana", 2, 1);
    await s.predict("a-vs-b", "dev2", "Bo", 0, 0);
    await s.predict("c-vs-d", "dev1", "Ana", 1, 1);
    // 3 predictions across 2 matches, before any settlement.
    expect(await s.stats()).toMatchObject({ predictions: 3, settledMatches: 0 });

    await s.settleMatch("a-vs-b", { home: 2, away: 1 });
    const st = await s.stats();
    expect(st.settledMatches).toBe(1);
    expect(st.players).toBe(2); // dev1 + dev2 now on the board
  });
});

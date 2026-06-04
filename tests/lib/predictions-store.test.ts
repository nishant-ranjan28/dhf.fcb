import { describe, it, expect, beforeEach } from "vitest";
import { predictionsStore, _resetPredictionsStore } from "@/lib/predictions/store";

beforeEach(async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  _resetPredictionsStore();
  await predictionsStore()._reset?.();
});

describe("predictionsStore — predicting", () => {
  it("stores and reads back a prediction", async () => {
    const s = predictionsStore();
    await s.predict("a-vs-b", "dev1", "Ana", 2, 1);
    const p = await s.getPrediction("a-vs-b", "dev1");
    expect(p).toMatchObject({ home: 2, away: 1, name: "Ana" });
  });

  it("overwrites a prior prediction for the same device+match", async () => {
    const s = predictionsStore();
    await s.predict("a-vs-b", "dev1", "Ana", 2, 1);
    await s.predict("a-vs-b", "dev1", "Ana", 0, 0);
    expect(await s.getPrediction("a-vs-b", "dev1")).toMatchObject({ home: 0, away: 0 });
  });

  it("tracks predicted match slugs", async () => {
    const s = predictionsStore();
    await s.predict("a-vs-b", "dev1", "Ana", 1, 0);
    await s.predict("c-vs-d", "dev2", "Bo", 2, 2);
    expect((await s.predictedMatchSlugs()).sort()).toEqual(["a-vs-b", "c-vs-d"]);
  });
});

describe("predictionsStore — settlement", () => {
  it("scores predictions and updates the leaderboard", async () => {
    const s = predictionsStore();
    await s.predict("a-vs-b", "dev1", "Ana", 2, 1); // exact → 5
    await s.predict("a-vs-b", "dev2", "Bo", 3, 0); // right result → 2
    await s.predict("a-vs-b", "dev3", "Cy", 0, 1); // wrong → 0

    const res = await s.settleMatch("a-vs-b", { home: 2, away: 1 });
    expect(res.settled).toBe(true);
    expect(res.scored).toBe(3);

    const board = await s.leaderboard(10);
    const byName = Object.fromEntries(board.map((e) => [e.name, e.points]));
    expect(byName["Ana"]).toBe(5);
    expect(byName["Bo"]).toBe(2);
    expect(byName["Cy"]).toBe(0);
    // Leader is first with rank 1.
    expect(board[0]).toMatchObject({ name: "Ana", points: 5, rank: 1 });
  });

  it("is idempotent — settling twice does not double-count", async () => {
    const s = predictionsStore();
    await s.predict("a-vs-b", "dev1", "Ana", 2, 1);
    await s.settleMatch("a-vs-b", { home: 2, away: 1 });
    const second = await s.settleMatch("a-vs-b", { home: 2, away: 1 });
    expect(second.settled).toBe(false);
    expect((await s.userStats("dev1")).points).toBe(5);
  });

  it("records points + outcome back onto the prediction after settlement", async () => {
    const s = predictionsStore();
    await s.predict("a-vs-b", "dev1", "Ana", 2, 1);
    await s.settleMatch("a-vs-b", { home: 2, away: 1 });
    const p = await s.getPrediction("a-vs-b", "dev1");
    expect(p).toMatchObject({ points: 5, outcome: "exact" });
  });

  it("accumulates points across multiple settled matches", async () => {
    const s = predictionsStore();
    await s.predict("a-vs-b", "dev1", "Ana", 2, 1);
    await s.predict("c-vs-d", "dev1", "Ana", 1, 1);
    await s.settleMatch("a-vs-b", { home: 2, away: 1 }); // exact 5
    await s.settleMatch("c-vs-d", { home: 3, away: 3 }); // result 2
    expect((await s.userStats("dev1")).points).toBe(7);
  });
});

describe("predictionsStore — stats", () => {
  it("reports rank and points for a device", async () => {
    const s = predictionsStore();
    await s.predict("a-vs-b", "dev1", "Ana", 2, 1);
    await s.predict("a-vs-b", "dev2", "Bo", 3, 0);
    await s.settleMatch("a-vs-b", { home: 2, away: 1 });
    const ana = await s.userStats("dev1");
    expect(ana).toMatchObject({ points: 5, rank: 1, name: "Ana" });
    const bo = await s.userStats("dev2");
    expect(bo.rank).toBe(2);
  });

  it("returns null rank for an unknown device", async () => {
    expect(await predictionsStore().userStats("ghost")).toMatchObject({ points: 0, rank: null });
  });
});

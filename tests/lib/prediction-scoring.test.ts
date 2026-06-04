import { describe, it, expect } from "vitest";
import { scorePrediction, POINTS } from "@/lib/predictions/scoring";

describe("scorePrediction", () => {
  it("awards exact-score points for a perfect prediction", () => {
    expect(scorePrediction({ home: 2, away: 1 }, { home: 2, away: 1 })).toEqual({
      points: POINTS.exact,
      outcome: "exact",
    });
  });

  it("awards exact points for a correctly predicted draw", () => {
    expect(scorePrediction({ home: 0, away: 0 }, { home: 0, away: 0 }).outcome).toBe("exact");
  });

  it("awards result points for the right winner but wrong score", () => {
    expect(scorePrediction({ home: 3, away: 0 }, { home: 2, away: 1 })).toEqual({
      points: POINTS.result,
      outcome: "result",
    });
  });

  it("awards result points for a draw predicted with the wrong scoreline", () => {
    expect(scorePrediction({ home: 1, away: 1 }, { home: 2, away: 2 }).outcome).toBe("result");
  });

  it("awards nothing when the result is wrong", () => {
    expect(scorePrediction({ home: 2, away: 0 }, { home: 0, away: 1 })).toEqual({
      points: 0,
      outcome: "miss",
    });
  });

  it("treats a predicted home win that ends in a draw as a miss", () => {
    expect(scorePrediction({ home: 2, away: 1 }, { home: 1, away: 1 }).outcome).toBe("miss");
  });
});

export interface Scoreline {
  home: number;
  away: number;
}

export type PredictionOutcome = "exact" | "result" | "miss";

export interface PredictionScore {
  points: number;
  outcome: PredictionOutcome;
}

/** Points awarded for an exact scoreline vs. just the right result (W/D/L). */
export const POINTS = { exact: 5, result: 2 } as const;

function sign(diff: number): -1 | 0 | 1 {
  return diff > 0 ? 1 : diff < 0 ? -1 : 0;
}

/**
 * Score a scoreline prediction against the final result.
 * - exact scoreline → 5 pts
 * - correct result (home win / draw / away win) but wrong score → 2 pts
 * - wrong result → 0 pts
 */
export function scorePrediction(pred: Scoreline, final: Scoreline): PredictionScore {
  if (pred.home === final.home && pred.away === final.away) {
    return { points: POINTS.exact, outcome: "exact" };
  }
  if (sign(pred.home - pred.away) === sign(final.home - final.away)) {
    return { points: POINTS.result, outcome: "result" };
  }
  return { points: 0, outcome: "miss" };
}

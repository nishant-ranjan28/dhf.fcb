import { describe, it, expect } from "vitest";
import {
  involvesBarca,
  isCurrentMatch,
  selectRecent,
  selectTrending,
  selectUpcoming,
} from "@/lib/football";
import type { Match } from "@/lib/types";

const NOW = Date.parse("2026-11-23T12:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function match(
  slug: string,
  home: string,
  away: string,
  opts: { status?: Match["status"]; hoursFromNow?: number; competition?: Match["competition"] } = {},
): Match {
  return {
    slug,
    competition: opts.competition ?? "barca",
    competitionName: opts.competition === "fifa" ? "World Cup 2026" : "Primera Division",
    home: { name: home, short: home.slice(0, 3).toUpperCase() },
    away: { name: away, short: away.slice(0, 3).toUpperCase() },
    kickoff: new Date(NOW + (opts.hoursFromNow ?? 0) * HOUR).toISOString(),
    status: opts.status ?? "SCHED",
    scoreHome: 0,
    scoreAway: 0,
    minute: 0,
    events: [],
    stats: {
      possession: { home: 50, away: 50 },
      shots: { home: 0, away: 0 },
      shotsOnTarget: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
    },
    lineupHome: { formation: "4-3-3", starting: [] },
    lineupAway: { formation: "4-3-3", starting: [] },
  };
}

describe("home-page match selection", () => {
  it("matches FC Barcelona across provider spellings", () => {
    expect(involvesBarca(match("a", "FC Barcelona", "Real Madrid"))).toBe(true);
    expect(involvesBarca(match("b", "Levante UD", "Barcelona"))).toBe(true);
    expect(involvesBarca(match("c", "Atlético Madrid", "Sevilla FC"))).toBe(false);
  });

  it("drops an archived tournament from current results and trending", () => {
    const archivedFinal = match("archive", "Spain", "Argentina", {
      status: "FT",
      hoursFromNow: -120 * 24,
      competition: "fifa",
    });
    const thisWeek = match("fresh", "FC Barcelona", "Real Madrid", {
      status: "FT",
      hoursFromNow: -30,
    });

    expect(isCurrentMatch(archivedFinal, NOW)).toBe(false);
    expect(selectRecent([archivedFinal, thisWeek], 4, NOW).map((m) => m.slug)).toEqual([
      "fresh",
    ]);
    expect(selectTrending([archivedFinal, thisWeek], 4, NOW).map((m) => m.slug)).toEqual([
      "fresh",
    ]);
  });

  it("never treats a stale schedule row as upcoming", () => {
    const stale = match("stale", "Mexico", "South Africa", {
      hoursFromNow: -160 * 24,
      competition: "fifa",
    });
    const next = match("next", "FC Barcelona", "Sevilla", { hoursFromNow: 5 });
    expect(selectUpcoming([stale, next], 3, NOW).map((m) => m.slug)).toEqual(["next"]);
    expect(isCurrentMatch(stale, NOW)).toBe(false);
  });

  it("puts Barça fixtures first, then the soonest kick-off", () => {
    const barca = match("barca", "Barcelona", "Sevilla", { hoursFromNow: 40 });
    const sooner = match("sooner", "Levante UD", "Elche CF", { hoursFromNow: 3 });
    expect(selectUpcoming([sooner, barca], 3, NOW).map((m) => m.slug)).toEqual([
      "barca",
      "sooner",
    ]);
  });

  it("ranks a live match above a scheduled Barça fixture", () => {
    const liveOther = match("live", "Levante UD", "Elche CF", {
      status: "LIVE",
      hoursFromNow: -1,
    });
    const barcaSoon = match("barca", "FC Barcelona", "Real Madrid", { hoursFromNow: 4 });
    expect(selectTrending([barcaSoon, liveOther], 4, NOW).map((m) => m.slug)).toEqual([
      "live",
      "barca",
    ]);
  });

  it("keeps a genuinely current World Cup match eligible", () => {
    const worldCup = match("wc", "Argentina", "Brazil", {
      status: "FT",
      hoursFromNow: -48,
      competition: "fifa",
    });
    expect(isCurrentMatch(worldCup, NOW)).toBe(true);
    expect(selectRecent([worldCup], 4, NOW).map((m) => m.slug)).toEqual(["wc"]);
  });
});

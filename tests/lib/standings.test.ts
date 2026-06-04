import { describe, it, expect } from "vitest";
import { computeStandings } from "@/lib/standings";
import type { Match } from "@/lib/types";

function m(partial: Partial<Match> & Pick<Match, "home" | "away" | "status">): Match {
  return {
    slug: `${partial.home.name}-${partial.away.name}`.toLowerCase().replace(/\s+/g, "-"),
    competition: "fifa",
    competitionName: "World Cup 2026",
    scoreHome: 0,
    scoreAway: 0,
    minute: 0,
    kickoff: "2026-06-11T18:00:00.000Z",
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
    ...partial,
  };
}

const team = (name: string) => ({ name, short: name.slice(0, 3).toUpperCase() });

describe("computeStandings", () => {
  it("ignores matches with no group", () => {
    const out = computeStandings([
      m({ home: team("France"), away: team("Spain"), status: "FT" }),
    ]);
    expect(out).toEqual([]);
  });

  it("lists every team in a group even before any match is played", () => {
    const out = computeStandings([
      m({ group: "Group A", home: team("Mexico"), away: team("South Africa"), status: "SCHED" }),
      m({ group: "Group A", home: team("South Korea"), away: team("Czechia"), status: "SCHED" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].group).toBe("Group A");
    expect(out[0].rows.map((r) => r.team).sort()).toEqual([
      "Czechia",
      "Mexico",
      "South Africa",
      "South Korea",
    ]);
    expect(out[0].rows.every((r) => r.played === 0 && r.points === 0)).toBe(true);
  });

  it("awards 3 points for a win, 1 for a draw, and tallies goals", () => {
    const out = computeStandings([
      m({ group: "Group A", home: team("Mexico"), away: team("South Africa"), status: "FT", scoreHome: 2, scoreAway: 0 }),
      m({ group: "Group A", home: team("South Korea"), away: team("Czechia"), status: "FT", scoreHome: 1, scoreAway: 1 }),
    ]);
    const rows = Object.fromEntries(out[0].rows.map((r) => [r.team, r]));
    expect(rows["Mexico"]).toMatchObject({ played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 0, goalDiff: 2, points: 3 });
    expect(rows["South Africa"]).toMatchObject({ played: 1, won: 0, lost: 1, goalsFor: 0, goalsAgainst: 2, goalDiff: -2, points: 0 });
    expect(rows["South Korea"]).toMatchObject({ played: 1, drawn: 1, points: 1 });
    expect(rows["Czechia"]).toMatchObject({ played: 1, drawn: 1, points: 1 });
  });

  it("does not count LIVE/HT/SCHED matches toward results", () => {
    const out = computeStandings([
      m({ group: "Group A", home: team("Mexico"), away: team("South Africa"), status: "LIVE", scoreHome: 3, scoreAway: 0 }),
    ]);
    const mex = out[0].rows.find((r) => r.team === "Mexico")!;
    expect(mex.played).toBe(0);
    expect(mex.points).toBe(0);
  });

  it("orders rows by points, then goal difference, then goals for", () => {
    const out = computeStandings([
      m({ group: "Group A", home: team("A"), away: team("B"), status: "FT", scoreHome: 1, scoreAway: 0 }),
      m({ group: "Group A", home: team("C"), away: team("D"), status: "FT", scoreHome: 5, scoreAway: 0 }),
      m({ group: "Group A", home: team("A"), away: team("C"), status: "FT", scoreHome: 0, scoreAway: 0 }),
    ]);
    // A: W + D = 4pts, GD +1. C: W + D = 4pts, GD +5. C ahead on GD.
    const order = out[0].rows.map((r) => r.team);
    expect(order.slice(0, 2)).toEqual(["C", "A"]);
  });

  it("sorts groups alphabetically", () => {
    const out = computeStandings([
      m({ group: "Group C", home: team("X"), away: team("Y"), status: "SCHED" }),
      m({ group: "Group A", home: team("P"), away: team("Q"), status: "SCHED" }),
    ]);
    expect(out.map((g) => g.group)).toEqual(["Group A", "Group C"]);
  });
});

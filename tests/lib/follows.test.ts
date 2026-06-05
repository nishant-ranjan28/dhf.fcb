import { describe, it, expect } from "vitest";
import { followableTeams, isPlaceholderTeam, matchesForTeams } from "@/lib/follows";
import { CLUBS } from "@/data/clubs";
import type { Match } from "@/lib/types";

const HOUR = 3600_000;

function m(home: string, away: string, over: Partial<Match> = {}): Match {
  return {
    slug: `${home}-vs-${away}`.toLowerCase().replace(/\s+/g, "-"),
    competition: "fifa",
    competitionName: "World Cup",
    home: { name: home, short: home.slice(0, 3).toUpperCase() },
    away: { name: away, short: away.slice(0, 3).toUpperCase() },
    scoreHome: 0,
    scoreAway: 0,
    status: "SCHED",
    minute: 0,
    kickoff: new Date(Date.now() + 24 * HOUR).toISOString(),
    events: [],
    stats: {
      possession: { home: 50, away: 50 },
      shots: { home: 0, away: 0 },
      shotsOnTarget: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
    },
    lineupHome: { formation: "", starting: [] },
    lineupAway: { formation: "", starting: [] },
    ...over,
  };
}

describe("isPlaceholderTeam", () => {
  it("flags bracket placeholders", () => {
    for (const n of ["1A", "2B", "3A/B/C/D/F", "W73", "W101", "L101", "A1"]) {
      expect(isPlaceholderTeam(n)).toBe(true);
    }
  });
  it("keeps real team names", () => {
    for (const n of ["Mexico", "USA", "DR Congo", "South Korea", "FC Barcelona", "Iran"]) {
      expect(isPlaceholderTeam(n)).toBe(false);
    }
  });
});

describe("followableTeams", () => {
  it("returns unique team names sorted alphabetically", () => {
    const teams = followableTeams([m("Mexico", "Brazil"), m("Brazil", "Spain")], []);
    expect(teams.map((t) => t.name)).toEqual(["Brazil", "Mexico", "Spain"]);
  });

  it("carries each team's competition", () => {
    const teams = followableTeams([m("FC Barcelona", "Real Madrid", { competition: "barca" })], []);
    expect(teams.find((t) => t.name === "FC Barcelona")?.competition).toBe("barca");
  });

  it("filters out bracket placeholders, keeping only real teams", () => {
    const all = [m("Mexico", "1A"), m("W73", "W74"), m("Brazil", "3A/B/C/D/F")];
    expect(followableTeams(all, []).map((t) => t.name)).toEqual(["Brazil", "Mexico"]);
  });

  it("merges curated clubs by default", () => {
    const teams = followableTeams([m("Mexico", "Brazil")]);
    const names = teams.map((t) => t.name);
    expect(names).toContain("FC Barcelona");
    expect(names).toContain("Manchester City");
    expect(names).toContain("Mexico");
  });

  it("prefers a real fixture team over the curated club of the same name", () => {
    // FC Barcelona from a real LaLiga fixture should win over the curated entry.
    const teams = followableTeams([m("FC Barcelona", "Real Madrid", { competition: "barca", competitionName: "LaLiga" })]);
    const barca = teams.find((t) => t.name === "FC Barcelona");
    expect(barca?.label).toBe("LaLiga");
    // Curated-only club still present.
    expect(teams.some((t) => t.name === "Ajax")).toBe(true);
  });

  it("ships a non-trivial curated club list", () => {
    expect(CLUBS.length).toBeGreaterThan(20);
  });
});

describe("matchesForTeams", () => {
  it("returns only matches involving a followed team", () => {
    const all = [m("Mexico", "Brazil"), m("Spain", "Germany")];
    const out = matchesForTeams(all, ["Brazil"]);
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe("mexico-vs-brazil");
  });

  it("matches whether the team is home or away", () => {
    const all = [m("Mexico", "Brazil"), m("Brazil", "Spain")];
    expect(matchesForTeams(all, ["Brazil"])).toHaveLength(2);
  });

  it("returns nothing when no teams are followed", () => {
    expect(matchesForTeams([m("Mexico", "Brazil")], [])).toEqual([]);
  });

  it("orders live first, then upcoming (soonest), then recent results", () => {
    const live = m("Brazil", "A", { status: "LIVE", minute: 30 });
    const soon = m("Brazil", "B", { status: "SCHED", kickoff: new Date(Date.now() + 2 * HOUR).toISOString() });
    const later = m("Brazil", "C", { status: "SCHED", kickoff: new Date(Date.now() + 48 * HOUR).toISOString() });
    const done = m("Brazil", "D", { status: "FT", kickoff: new Date(Date.now() - 5 * HOUR).toISOString() });
    const out = matchesForTeams([later, done, live, soon], ["Brazil"]);
    expect(out.map((x) => x.away.name)).toEqual(["A", "B", "C", "D"]);
  });

  it("caps the result count", () => {
    const all = Array.from({ length: 30 }, (_, i) => m("Brazil", `Op${i}`));
    expect(matchesForTeams(all, ["Brazil"], 10)).toHaveLength(10);
  });
});

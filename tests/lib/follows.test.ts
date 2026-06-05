import { describe, it, expect } from "vitest";
import { followableTeams, matchesForTeams } from "@/lib/follows";
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

describe("followableTeams", () => {
  it("returns unique team names sorted alphabetically", () => {
    const teams = followableTeams([m("Mexico", "Brazil"), m("Brazil", "Spain")]);
    expect(teams.map((t) => t.name)).toEqual(["Brazil", "Mexico", "Spain"]);
  });

  it("carries each team's competition", () => {
    const teams = followableTeams([m("FC Barcelona", "Real Madrid", { competition: "barca" })]);
    expect(teams.find((t) => t.name === "FC Barcelona")?.competition).toBe("barca");
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

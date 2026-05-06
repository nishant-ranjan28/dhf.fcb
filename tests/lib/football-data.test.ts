import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { mapFootballDataMatches } from "@/lib/football/providers/footballData";

describe("mapFootballDataMatches", () => {
  it("maps live La Liga match into Match shape", async () => {
    const raw = JSON.parse(
      await readFile("tests/fixtures/football-data-matches.json", "utf8"),
    );
    const out = mapFootballDataMatches(raw);
    expect(out).toHaveLength(1);
    const m = out[0];
    expect(m.slug).toBe("fc-barcelona-vs-real-madrid");
    expect(m.competition).toBe("barca");
    expect(m.status).toBe("LIVE");
    expect(m.minute).toBe(67);
    expect(m.scoreHome).toBe(2);
    expect(m.scoreAway).toBe(1);
    expect(m.home.crest).toContain("crests.football-data.org/81");
  });

  it("classifies World Cup competitions as 'fifa'", () => {
    const raw = {
      matches: [
        {
          id: 2,
          competition: { code: "WC", name: "FIFA World Cup" },
          utcDate: "2026-06-12T18:00:00Z",
          status: "SCHEDULED" as const,
          homeTeam: { id: 9, name: "Argentina", tla: "ARG" },
          awayTeam: { id: 10, name: "Brazil", tla: "BRA" },
          score: { fullTime: { home: null, away: null } },
        },
      ],
    };
    const out = mapFootballDataMatches(raw);
    expect(out[0].competition).toBe("fifa");
    expect(out[0].status).toBe("SCHED");
  });

  it("maps PAUSED → HT and FINISHED → FT", () => {
    const raw = {
      matches: [
        {
          id: 3,
          competition: { code: "PD", name: "LaLiga" },
          utcDate: "2026-05-06T18:00:00Z",
          status: "PAUSED" as const,
          homeTeam: { id: 81, name: "FC Barcelona", tla: "BAR" },
          awayTeam: { id: 78, name: "Atlético Madrid", tla: "ATM" },
          score: { fullTime: { home: 1, away: 0 } },
        },
        {
          id: 4,
          competition: { code: "CL", name: "Champions League" },
          utcDate: "2026-05-04T20:00:00Z",
          status: "FINISHED" as const,
          homeTeam: { id: 5, name: "Bayern Munich", tla: "BAY" },
          awayTeam: { id: 81, name: "FC Barcelona", tla: "BAR" },
          score: { fullTime: { home: 1, away: 2 } },
        },
      ],
    };
    const out = mapFootballDataMatches(raw);
    expect(out.map((m) => m.status)).toEqual(["HT", "FT"]);
  });

  it("normalizes lowercase competition codes", () => {
    const raw = {
      matches: [
        {
          id: 5,
          competition: { code: "pd", name: "LaLiga" },
          utcDate: "2026-05-06T18:00:00Z",
          status: "TIMED" as const,
          homeTeam: { id: 81, name: "FC Barcelona", tla: "BAR" },
          awayTeam: { id: 86, name: "Real Madrid", tla: "RMA" },
          score: { fullTime: { home: null, away: null } },
        },
      ],
    };
    expect(mapFootballDataMatches(raw)[0].competition).toBe("barca");
  });

  it("classifies non-listed leagues as 'other'", () => {
    const raw = {
      matches: [
        {
          id: 6,
          competition: { code: "BL1", name: "Bundesliga" },
          utcDate: "2026-05-06T18:00:00Z",
          status: "TIMED" as const,
          homeTeam: { id: 5, name: "Bayern Munich", tla: "BAY" },
          awayTeam: { id: 4, name: "Borussia Dortmund", tla: "BVB" },
          score: { fullTime: { home: null, away: null } },
        },
      ],
    };
    expect(mapFootballDataMatches(raw)[0].competition).toBe("other");
  });

  it("filters out POSTPONED / CANCELLED / SUSPENDED / AWARDED", () => {
    const raw = {
      matches: [
        { id: 7, competition: { code: "PD", name: "LaLiga" }, utcDate: "2026-05-06T18:00:00Z", status: "POSTPONED" as const, homeTeam: { id: 81, name: "FC Barcelona", tla: "BAR" }, awayTeam: { id: 86, name: "Real Madrid", tla: "RMA" }, score: { fullTime: { home: null, away: null } } },
        { id: 8, competition: { code: "PD", name: "LaLiga" }, utcDate: "2026-05-06T18:00:00Z", status: "CANCELLED" as const, homeTeam: { id: 81, name: "FC Barcelona", tla: "BAR" }, awayTeam: { id: 86, name: "Real Madrid", tla: "RMA" }, score: { fullTime: { home: null, away: null } } },
        { id: 9, competition: { code: "PD", name: "LaLiga" }, utcDate: "2026-05-06T18:00:00Z", status: "SUSPENDED" as const, homeTeam: { id: 81, name: "FC Barcelona", tla: "BAR" }, awayTeam: { id: 86, name: "Real Madrid", tla: "RMA" }, score: { fullTime: { home: null, away: null } } },
        { id: 10, competition: { code: "PD", name: "LaLiga" }, utcDate: "2026-05-06T18:00:00Z", status: "AWARDED" as const, homeTeam: { id: 81, name: "FC Barcelona", tla: "BAR" }, awayTeam: { id: 86, name: "Real Madrid", tla: "RMA" }, score: { fullTime: { home: 3, away: 0 } } },
        { id: 11, competition: { code: "PD", name: "LaLiga" }, utcDate: "2026-05-06T18:00:00Z", status: "TIMED" as const, homeTeam: { id: 81, name: "FC Barcelona", tla: "BAR" }, awayTeam: { id: 86, name: "Real Madrid", tla: "RMA" }, score: { fullTime: { home: null, away: null } } },
      ],
    };
    const out = mapFootballDataMatches(raw);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("SCHED");
  });

  it("tolerates null matches array", () => {
    expect(mapFootballDataMatches({ matches: null })).toEqual([]);
  });
});

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
});

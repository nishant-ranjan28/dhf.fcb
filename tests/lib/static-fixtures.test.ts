import { describe, it, expect } from "vitest";
import { mapOpenFootballSchedule } from "@/lib/football/providers/staticFixtures";

describe("mapOpenFootballSchedule", () => {
  it("maps a basic openfootball schedule (string team form)", () => {
    const raw = {
      name: "FIFA World Cup 2026",
      matches: [
        {
          date: "2026-06-12",
          time: "18:00",
          team1: "Argentina",
          team2: "Brazil",
          group: "B",
        },
      ],
    };
    const out = mapOpenFootballSchedule(raw);
    expect(out).toHaveLength(1);
    expect(out[0].competition).toBe("fifa");
    expect(out[0].status).toBe("SCHED");
    expect(out[0].slug).toBe("argentina-vs-brazil");
    expect(out[0].competitionName).toBe("FIFA World Cup 2026");
    expect(out[0].home.name).toBe("Argentina");
    expect(out[0].away.name).toBe("Brazil");
    expect(out[0].scoreHome).toBe(0);
    expect(out[0].scoreAway).toBe(0);
  });

  it("supports object form for team1/team2", () => {
    const raw = {
      name: "FIFA World Cup 2026",
      matches: [
        {
          date: "2026-06-13",
          time: "20:00",
          team1: { name: "Spain", code: "ESP" },
          team2: { name: "Portugal", code: "POR" },
          group: "C",
        },
      ],
    };
    const out = mapOpenFootballSchedule(raw);
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe("spain-vs-portugal");
    expect(out[0].home.name).toBe("Spain");
    expect(out[0].away.name).toBe("Portugal");
  });

  it("marks finished matches with FT status and final score", () => {
    const raw = {
      name: "FIFA World Cup 2026",
      matches: [
        {
          date: "2026-06-14",
          time: "21:00",
          team1: "France",
          team2: "Germany",
          score: { ft: [2, 1] as [number, number] },
        },
      ],
    };
    const out = mapOpenFootballSchedule(raw);
    expect(out[0].status).toBe("FT");
    expect(out[0].scoreHome).toBe(2);
    expect(out[0].scoreAway).toBe(1);
  });
});

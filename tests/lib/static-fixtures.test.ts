import { describe, it, expect } from "vitest";
import {
  mapOpenFootballSchedule,
  parseKickoff,
  teamShort,
} from "@/lib/football/providers/staticFixtures";

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

  it("treats penalty-shootout decided matches as FT with shootout score", () => {
    const raw = {
      name: "FIFA World Cup 2026",
      matches: [
        {
          date: "2026-07-12",
          time: "20:00",
          team1: "Argentina",
          team2: "France",
          score: { ft: [1, 1] as [number, number], p: [4, 2] as [number, number] },
        },
      ],
    };
    const out = mapOpenFootballSchedule(raw);
    expect(out[0].status).toBe("FT");
    // ft takes precedence as the displayable score; shootout retained in source.
    expect(out[0].scoreHome).toBe(1);
    expect(out[0].scoreAway).toBe(1);
  });
});

describe("parseKickoff", () => {
  it("handles bare HH:MM as UTC", () => {
    expect(parseKickoff("2026-06-12", "18:00")).toBe("2026-06-12T18:00:00.000Z");
  });
  it("applies UTC-6 offset", () => {
    expect(parseKickoff("2026-06-12", "13:00 UTC-6")).toBe("2026-06-12T19:00:00.000Z");
  });
  it("applies UTC+5:30 (India) offset", () => {
    expect(parseKickoff("2026-06-12", "21:30 UTC+5:30")).toBe("2026-06-12T16:00:00.000Z");
  });
  it("falls back to 18:00Z when time missing", () => {
    expect(parseKickoff("2026-06-12")).toBe("2026-06-12T18:00:00.000Z");
  });
  it("coerces UTC-0 / -00:00 to Z (RFC 3339 §4.3)", () => {
    expect(parseKickoff("2026-06-12", "12:00 UTC-0")).toBe("2026-06-12T12:00:00.000Z");
  });
  it("falls back gracefully on garbage time", () => {
    const out = parseKickoff("2026-06-12", "tea-time");
    expect(out).toBe("2026-06-12T18:00:00.000Z");
  });
});

describe("teamShort", () => {
  it("uses provided FIFA code on object form", () => {
    expect(teamShort({ name: "Côte d'Ivoire", code: "civ" })).toBe("CIV");
  });
  it("ASCII-folds and truncates string form", () => {
    expect(teamShort("Côte d'Ivoire")).toBe("COT");
    expect(teamShort("Argentina")).toBe("ARG");
    expect(teamShort("Türkiye")).toBe("TUR");
  });
});

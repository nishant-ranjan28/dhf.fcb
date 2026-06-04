import { describe, it, expect } from "vitest";
import { buildCommentary, computeMomentum } from "@/lib/match/commentary";
import type { Match, MatchEvent } from "@/lib/types";

function match(events: MatchEvent[], overrides: Partial<Match> = {}): Match {
  return {
    slug: "a-vs-b",
    competition: "fifa",
    competitionName: "World Cup",
    home: { name: "Argentina", short: "ARG" },
    away: { name: "Brazil", short: "BRA" },
    scoreHome: 0,
    scoreAway: 0,
    status: "LIVE",
    minute: 60,
    kickoff: "2026-06-12T18:00:00.000Z",
    events,
    stats: {
      possession: { home: 50, away: 50 },
      shots: { home: 0, away: 0 },
      shotsOnTarget: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
    },
    lineupHome: { formation: "4-3-3", starting: [] },
    lineupAway: { formation: "4-3-3", starting: [] },
    ...overrides,
  };
}

describe("buildCommentary", () => {
  it("returns lines newest-first with a running score", () => {
    const lines = buildCommentary(
      match([
        { minute: 18, type: "goal", team: "home", player: "Messi" },
        { minute: 40, type: "goal", team: "away", player: "Vinícius" },
        { minute: 70, type: "goal", team: "home", player: "Álvarez" },
      ]),
    );
    expect(lines.map((l) => l.minute)).toEqual([70, 40, 18]); // newest first
    const last = lines[0]; // 70' — Argentina lead 2-1
    expect(last.scoreHome).toBe(2);
    expect(last.scoreAway).toBe(1);
    expect(last.text).toContain("Álvarez");
    expect(last.text).toContain("2-1");
  });

  it("describes cards and subs", () => {
    const lines = buildCommentary(
      match([
        { minute: 30, type: "yellow", team: "away", player: "Casemiro" },
        { minute: 55, type: "red", team: "away", player: "Casemiro" },
        { minute: 60, type: "sub", team: "home", player: "Gavi", detail: "→ De Paul" },
      ]),
    );
    const byMinute = Object.fromEntries(lines.map((l) => [l.minute, l.text]));
    expect(byMinute[55]).toMatch(/red/i);
    expect(byMinute[30]).toMatch(/yellow/i);
    expect(byMinute[60]).toMatch(/sub/i);
  });

  it("returns an empty list when there are no events", () => {
    expect(buildCommentary(match([]))).toEqual([]);
  });
});

describe("computeMomentum", () => {
  it("is balanced with no events", () => {
    expect(computeMomentum(match([]))).toEqual({ home: 50, away: 50 });
  });

  it("is balanced before kickoff", () => {
    expect(computeMomentum(match([], { status: "SCHED", minute: 0 }))).toEqual({
      home: 50,
      away: 50,
    });
  });

  it("tilts toward the team that just scored", () => {
    const m = computeMomentum(
      match([{ minute: 58, type: "goal", team: "home", player: "Messi" }], { minute: 60 }),
    );
    expect(m.home).toBeGreaterThan(m.away);
    expect(m.home + m.away).toBe(100);
  });

  it("a red card shifts momentum to the opponent", () => {
    const m = computeMomentum(
      match([{ minute: 58, type: "red", team: "away", player: "Casemiro" }], { minute: 60 }),
    );
    expect(m.home).toBeGreaterThan(m.away);
  });

  it("fades the impact of old events", () => {
    const recent = computeMomentum(
      match([{ minute: 59, type: "goal", team: "home", player: "X" }], { minute: 60 }),
    );
    const old = computeMomentum(
      match([{ minute: 5, type: "goal", team: "home", player: "X" }], { minute: 60 }),
    );
    expect(recent.home).toBeGreaterThan(old.home);
  });
});

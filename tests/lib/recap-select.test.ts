import { describe, it, expect } from "vitest";
import { selectRecapMatch } from "@/lib/recap/select";
import type { Match } from "@/lib/types";

const HOUR = 3600_000;

function m(slug: string, over: Partial<Match> = {}): Match {
  return {
    slug,
    competition: "fifa",
    competitionName: "World Cup",
    home: { name: "A", short: "A" },
    away: { name: "B", short: "B" },
    scoreHome: 1,
    scoreAway: 0,
    status: "FT",
    minute: 90,
    kickoff: new Date(Date.now() - 2 * HOUR).toISOString(),
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

const now = Date.now();
const opts = (recapped: string[] = []) => ({
  recapped: new Set(recapped),
  now,
  maxAgeMs: 48 * HOUR,
});

describe("selectRecapMatch", () => {
  it("returns null when there are no finished matches", () => {
    expect(selectRecapMatch([m("x", { status: "SCHED" })], opts())).toBeNull();
  });

  it("picks a finished match not yet recapped", () => {
    const picked = selectRecapMatch([m("a-vs-b")], opts());
    expect(picked?.slug).toBe("a-vs-b");
  });

  it("skips matches already recapped", () => {
    expect(selectRecapMatch([m("a-vs-b")], opts(["a-vs-b"]))).toBeNull();
  });

  it("ignores LIVE / HT / SCHED matches", () => {
    const matches = [
      m("live", { status: "LIVE" }),
      m("ht", { status: "HT" }),
      m("sched", { status: "SCHED" }),
    ];
    expect(selectRecapMatch(matches, opts())).toBeNull();
  });

  it("skips matches older than the freshness window", () => {
    const stale = m("old", { kickoff: new Date(now - 72 * HOUR).toISOString() });
    expect(selectRecapMatch([stale], opts())).toBeNull();
  });

  it("prefers the most recently finished match", () => {
    const older = m("older", { kickoff: new Date(now - 30 * HOUR).toISOString() });
    const newer = m("newer", { kickoff: new Date(now - 1 * HOUR).toISOString() });
    expect(selectRecapMatch([older, newer], opts())?.slug).toBe("newer");
  });

  it("only recaps barca/fifa competitions", () => {
    const other = m("other", { competition: "other" });
    expect(selectRecapMatch([other], opts())).toBeNull();
  });
});

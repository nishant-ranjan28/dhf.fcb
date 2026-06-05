import type { Competition, Match } from "./types";

export interface FollowableTeam {
  name: string;
  short: string;
  competition: Competition;
}

/** Unique, alphabetically-sorted list of teams that appear in the fixtures. */
export function followableTeams(matches: Match[]): FollowableTeam[] {
  const byName = new Map<string, FollowableTeam>();
  for (const m of matches) {
    if (!byName.has(m.home.name)) {
      byName.set(m.home.name, { name: m.home.name, short: m.home.short, competition: m.competition });
    }
    if (!byName.has(m.away.name)) {
      byName.set(m.away.name, { name: m.away.name, short: m.away.short, competition: m.competition });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function statusRank(s: Match["status"]): number {
  if (s === "LIVE" || s === "HT") return 0;
  if (s === "SCHED") return 1;
  return 2; // FT
}

/**
 * Matches involving any followed team, ordered for a personalised feed:
 * live first, then upcoming (soonest kickoff first), then recent results
 * (most recent first). Capped at `limit`.
 */
export function matchesForTeams(matches: Match[], teams: string[], limit = 12): Match[] {
  if (teams.length === 0) return [];
  const wanted = new Set(teams);
  return matches
    .filter((m) => wanted.has(m.home.name) || wanted.has(m.away.name))
    .sort((a, b) => {
      const ra = statusRank(a.status);
      const rb = statusRank(b.status);
      if (ra !== rb) return ra - rb;
      const ta = +new Date(a.kickoff);
      const tb = +new Date(b.kickoff);
      // Finished matches: most recent first. Live/upcoming: soonest first.
      return ra === 2 ? tb - ta : ta - tb;
    })
    .slice(0, limit);
}

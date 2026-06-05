import type { Competition, Match } from "./types";
import { CLUBS } from "@/data/clubs";

export interface FollowableTeam {
  name: string;
  short: string;
  competition: Competition;
  /** Display subtitle, e.g. "World Cup" or a league name. */
  label: string;
}

/**
 * Knockout-bracket placeholders in the openfootball data — "1A" (winner of
 * Group A), "3B/E/F/I/J" (best-third combos), "W73"/"L101" (winner/loser of
 * match N). These aren't real teams, so they must never be followable.
 */
export function isPlaceholderTeam(name: string): boolean {
  const n = name.trim();
  return /^\d/.test(n) || /^[WL]\d+$/i.test(n) || /^[A-L][1-3]$/.test(n);
}

function labelFor(m: Match): string {
  return m.competition === "fifa" ? "World Cup" : m.competitionName;
}

/**
 * Unique, alphabetically-sorted list of followable teams: real teams from the
 * fixtures (bracket placeholders filtered out) merged with a curated club list
 * so fans can follow clubs even before those clubs have fixtures loaded.
 * A team already present from real fixtures wins over the curated entry.
 */
export function followableTeams(matches: Match[], extra: FollowableTeam[] = CLUBS): FollowableTeam[] {
  const byName = new Map<string, FollowableTeam>();
  for (const m of matches) {
    for (const side of [m.home, m.away]) {
      if (isPlaceholderTeam(side.name) || byName.has(side.name)) continue;
      byName.set(side.name, {
        name: side.name,
        short: side.short,
        competition: m.competition,
        label: labelFor(m),
      });
    }
  }
  for (const t of extra) {
    if (!byName.has(t.name)) byName.set(t.name, t);
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

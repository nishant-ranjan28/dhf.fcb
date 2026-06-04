import type { Match } from "./types";

export interface StandingRow {
  team: string;
  short: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

export interface GroupStanding {
  group: string;
  rows: StandingRow[];
}

function emptyRow(team: string, short: string): StandingRow {
  return {
    team,
    short,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
  };
}

/**
 * Build group-stage standings from a list of matches.
 *
 * Every team that appears in a grouped match shows up in its group's table —
 * even before kickoff — so the structure is visible from day one. Only
 * full-time (FT) results contribute points and goals; LIVE/HT/SCHED matches
 * register the teams but don't move the table. Rows are ordered by points,
 * then goal difference, then goals for, then name. Groups are alphabetical.
 */
export function computeStandings(matches: Match[]): GroupStanding[] {
  const groups = new Map<string, Map<string, StandingRow>>();

  const rowFor = (group: string, name: string, short: string): StandingRow => {
    let table = groups.get(group);
    if (!table) {
      table = new Map();
      groups.set(group, table);
    }
    let row = table.get(name);
    if (!row) {
      row = emptyRow(name, short);
      table.set(name, row);
    }
    return row;
  };

  for (const match of matches) {
    if (!match.group) continue;
    const home = rowFor(match.group, match.home.name, match.home.short);
    const away = rowFor(match.group, match.away.name, match.away.short);
    if (match.status !== "FT") continue;

    const { scoreHome: hg, scoreAway: ag } = match;
    home.played++;
    away.played++;
    home.goalsFor += hg;
    home.goalsAgainst += ag;
    away.goalsFor += ag;
    away.goalsAgainst += hg;
    if (hg > ag) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (hg < ag) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points++;
      away.points++;
    }
  }

  return [...groups.entries()]
    .map(([group, table]) => ({
      group,
      rows: [...table.values()]
        .map((r) => ({ ...r, goalDiff: r.goalsFor - r.goalsAgainst }))
        .sort(
          (a, b) =>
            b.points - a.points ||
            b.goalDiff - a.goalDiff ||
            b.goalsFor - a.goalsFor ||
            a.team.localeCompare(b.team),
        ),
    }))
    .sort((a, b) => a.group.localeCompare(b.group));
}

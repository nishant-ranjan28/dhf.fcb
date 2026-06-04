import type { Match, MatchEvent } from "@/lib/types";

export interface CommentaryLine {
  minute: number;
  type: MatchEvent["type"];
  team: "home" | "away";
  text: string;
  /** Running score immediately after this event. */
  scoreHome: number;
  scoreAway: number;
}

function describe(
  e: MatchEvent,
  match: Match,
  scoreHome: number,
  scoreAway: number,
): string {
  const teamName = e.team === "home" ? match.home.name : match.away.name;
  switch (e.type) {
    case "goal":
      return `GOAL! ${e.player} — ${match.home.name} ${scoreHome}-${scoreAway} ${match.away.name}`;
    case "yellow":
      return `Yellow card for ${e.player} (${teamName})`;
    case "red":
      return `Red card! ${e.player} (${teamName}) is sent off`;
    case "sub":
      return `Substitution (${teamName})${e.detail ? `: ${e.detail}` : ` — ${e.player}`}`;
  }
}

/**
 * Turn the raw event list into a narrative commentary feed, newest event
 * first, carrying the running score after each goal.
 */
export function buildCommentary(match: Match): CommentaryLine[] {
  const ordered = [...match.events].sort((a, b) => a.minute - b.minute);
  let h = 0;
  let a = 0;
  const lines: CommentaryLine[] = ordered.map((e) => {
    if (e.type === "goal") {
      if (e.team === "home") h++;
      else a++;
    }
    return {
      minute: e.minute,
      type: e.type,
      team: e.team,
      text: describe(e, match, h, a),
      scoreHome: h,
      scoreAway: a,
    };
  });
  return lines.reverse();
}

export interface Momentum {
  home: number;
  away: number;
}

// A light, honest heuristic: recent, high-impact events tilt the bar. It is a
// vibe indicator built from the events we have — not a modelled xG/win prob.
const IMPACT: Record<MatchEvent["type"], number> = {
  goal: 3,
  red: 2.5, // counts for the OPPONENT (man advantage)
  yellow: 0.4, // mild edge to the opponent
  sub: 0.2, // fresh legs for the subbing side
};

function currentMinute(match: Match): number {
  if (match.status === "SCHED") return 0;
  if (match.status === "FT") return 90;
  return Math.max(match.minute, ...match.events.map((e) => e.minute), 0);
}

/**
 * Live momentum split (percentages summing to 100). A base weight on each side
 * keeps a single event from pinning the bar to 100/0, and older events fade.
 */
export function computeMomentum(match: Match): Momentum {
  if (match.status === "SCHED" || match.events.length === 0) {
    return { home: 50, away: 50 };
  }
  const now = currentMinute(match);
  let home = 1;
  let away = 1;
  for (const e of match.events) {
    const age = now - e.minute;
    const recency = Math.max(0.15, 1 - age / 30);
    const weight = IMPACT[e.type] * recency;
    // Red/yellow benefit the opposing side; goals/subs benefit the actor.
    const beneficiary =
      e.type === "red" || e.type === "yellow" ? (e.team === "home" ? "away" : "home") : e.team;
    if (beneficiary === "home") home += weight;
    else away += weight;
  }
  const total = home + away;
  const homePct = Math.round((home / total) * 100);
  return { home: homePct, away: 100 - homePct };
}

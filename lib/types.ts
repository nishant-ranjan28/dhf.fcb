export type MatchStatus = "SCHED" | "LIVE" | "HT" | "FT";

export type Competition = "barca" | "fifa" | "other";

export interface Team {
  name: string;
  short: string;
  crest?: string;
}

export interface MatchEvent {
  minute: number;
  type: "goal" | "yellow" | "red" | "sub";
  team: "home" | "away";
  player: string;
  detail?: string;
}

export interface MatchStats {
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  corners: { home: number; away: number };
  fouls: { home: number; away: number };
}

export interface Lineup {
  formation: string;
  starting: string[];
}

export interface Match {
  slug: string;
  competition: Competition;
  competitionName: string;
  /** Group-stage label, e.g. "Group A". Undefined for knockout / non-group matches. */
  group?: string;
  /** Round / matchday label, e.g. "Matchday 1", "Round of 16". Undefined when unknown. */
  round?: string;
  home: Team;
  away: Team;
  scoreHome: number;
  scoreAway: number;
  status: MatchStatus;
  minute: number;
  kickoff: string; // ISO
  venue?: string;
  events: MatchEvent[];
  stats: MatchStats;
  lineupHome: Lineup;
  lineupAway: Lineup;
}

export interface NewsPost {
  id: string;
  slug: string;
  title: string;
  content: string;
  category: Competition;
  createdAt: string; // ISO
  /** ISO 639-1 language code; "en", "es", etc. Undefined for admin posts. */
  lang?: string;
  /** Original article URL (RSS only). Used for the Translate link. */
  link?: string;
}

import type { Competition, Match, MatchStatus } from "@/lib/types";
import { matchSlug } from "@/lib/slug";

interface FdTeam {
  id: number;
  name: string;
  tla: string;
  crest?: string;
}

interface FdMatch {
  id: number;
  competition: { code: string; name: string };
  utcDate: string;
  status:
    | "SCHEDULED"
    | "TIMED"
    | "IN_PLAY"
    | "PAUSED"
    | "FINISHED"
    | "POSTPONED";
  minute?: number;
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime?: { home: number | null; away: number | null };
  };
  venue?: string;
}

interface FdResponse {
  matches: FdMatch[];
}

// LaLiga + UCL — Barca-relevant; everything else falls to 'other'
const BARCA_COMPS = new Set(["PD", "CL"]);
const FIFA_COMPS = new Set(["WC"]);

function classify(code: string): Competition {
  if (FIFA_COMPS.has(code)) return "fifa";
  if (BARCA_COMPS.has(code)) return "barca";
  return "other";
}

function toStatus(s: FdMatch["status"]): MatchStatus {
  switch (s) {
    case "IN_PLAY":
      return "LIVE";
    case "PAUSED":
      return "HT";
    case "FINISHED":
      return "FT";
    default:
      return "SCHED";
  }
}

export function mapFootballDataMatches(raw: FdResponse): Match[] {
  return raw.matches.map((m) => ({
    slug: matchSlug(m.homeTeam.name, m.awayTeam.name),
    competition: classify(m.competition.code),
    competitionName: m.competition.name,
    home: {
      name: m.homeTeam.name,
      short: m.homeTeam.tla,
      crest: m.homeTeam.crest,
    },
    away: {
      name: m.awayTeam.name,
      short: m.awayTeam.tla,
      crest: m.awayTeam.crest,
    },
    scoreHome: m.score.fullTime.home ?? 0,
    scoreAway: m.score.fullTime.away ?? 0,
    status: toStatus(m.status),
    minute: m.minute ?? 0,
    kickoff: m.utcDate,
    venue: m.venue,
    events: [],
    stats: {
      possession: { home: 50, away: 50 },
      shots: { home: 0, away: 0 },
      shotsOnTarget: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
    },
    lineupHome: { formation: "4-3-3", starting: [] },
    lineupAway: { formation: "4-3-3", starting: [] },
  }));
}

import type { Competition, Match, MatchStatus } from "@/lib/types";
import { matchSlug } from "@/lib/slug";
import { fetchJson, rateLimited } from "@/lib/http";

interface FdTeam {
  id: number;
  name: string;
  tla: string;
  crest?: string;
}

type FdStatus =
  | "SCHEDULED"
  | "TIMED"
  | "IN_PLAY"
  | "PAUSED"
  | "FINISHED"
  | "POSTPONED"
  | "SUSPENDED"
  | "CANCELLED"
  | "AWARDED";

interface FdMatch {
  id: number;
  competition: { code: string; name: string };
  utcDate: string;
  status: FdStatus;
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
  matches: FdMatch[] | null;
}

// LaLiga + UCL — Barca-relevant; everything else falls to 'other'
const BARCA_COMPS = new Set(["PD", "CL"]);
const FIFA_COMPS = new Set(["WC"]);

// Statuses we drop entirely — UI has no representation for them yet, and
// surfacing them as SCHED would mislead users into thinking the match is on.
const SKIP_STATUSES = new Set<FdStatus>([
  "POSTPONED",
  "SUSPENDED",
  "CANCELLED",
  "AWARDED",
]);

function classify(code: string): Competition {
  const c = code?.trim().toUpperCase() ?? "";
  if (FIFA_COMPS.has(c)) return "fifa";
  if (BARCA_COMPS.has(c)) return "barca";
  return "other";
}

function toStatus(s: FdStatus): MatchStatus {
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
  return (raw.matches ?? [])
    .filter((m) => !SKIP_STATUSES.has(m.status))
    .map((m) => ({
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

// stats and lineups stub out as zeros / empty here; real values come from
// API-Football enrichment in lib/football/providers/apiFootball.ts (Task 7).
// Score 0–0 for SCHED is hidden by MatchCard, which renders "vs" instead —
// see components/MatchCard.tsx Score().

const FD_BASE = "https://api.football-data.org/v4";
// 10 req/min on free tier per docs.
const limiter = rateLimited({ maxPerWindow: 10, windowMs: 60_000 });

export interface FdOpts {
  apiKey: string;
  competitions?: string[];
  status?: string;
}

export async function fetchFootballDataMatches({
  apiKey,
  competitions = ["PD", "CL", "WC"],
  status,
}: FdOpts): Promise<Match[]> {
  const params = new URLSearchParams();
  params.set("competitions", competitions.join(","));
  if (status) params.set("status", status);
  const url = `${FD_BASE}/matches?${params}`;
  const json = await limiter(() =>
    fetchJson<FdResponse>(url, { headers: { "X-Auth-Token": apiKey } }),
  );
  return mapFootballDataMatches(json);
}

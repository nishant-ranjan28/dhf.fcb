import type {
  Competition,
  Lineup,
  Match,
  MatchEvent,
  MatchStats,
  MatchStatus,
  Team,
} from "./types";
import { cached } from "./cache";
import { matchSlug } from "./slug";
import { env } from "./env";
import { fetchFootballDataMatches } from "./football/providers/footballData";
import { loadStaticFixtures } from "./football/providers/staticFixtures";
import { ProviderChain } from "./football/chain";

// ---------- Mock data seeds ----------

const T = (name: string, short: string): Team => ({ name, short });

interface Seed {
  comp: Competition;
  compName: string;
  home: Team;
  away: Team;
  // Offset from "now" in minutes. Negative = already kicked off.
  kickoffOffset: number;
  // Final/current score. For LIVE matches this is the score so far.
  scoreHome: number;
  scoreAway: number;
  // Force a status (otherwise inferred from offset).
  forceStatus?: MatchStatus;
  venue?: string;
  events: MatchEvent[];
  formationHome?: string;
  formationAway?: string;
  startingHome?: string[];
  startingAway?: string[];
  possessionHome?: number;
  shotsHome?: number;
  shotsAway?: number;
  shotsOnHome?: number;
  shotsOnAway?: number;
  cornersHome?: number;
  cornersAway?: number;
}

const SEEDS: Seed[] = [
  {
    comp: "barca",
    compName: "LaLiga",
    home: T("FC Barcelona", "BAR"),
    away: T("Real Madrid", "RMA"),
    kickoffOffset: -67,
    scoreHome: 2,
    scoreAway: 1,
    venue: "Spotify Camp Nou",
    events: [
      { minute: 12, type: "goal", team: "home", player: "Lewandowski" },
      { minute: 28, type: "yellow", team: "away", player: "Vinícius Jr." },
      { minute: 41, type: "goal", team: "away", player: "Bellingham" },
      { minute: 58, type: "goal", team: "home", player: "Yamal", detail: "assist Pedri" },
      { minute: 64, type: "sub", team: "home", player: "Gavi", detail: "→ De Jong" },
    ],
    formationHome: "4-3-3",
    formationAway: "4-3-1-2",
    startingHome: [
      "Ter Stegen",
      "Koundé",
      "Araújo",
      "Cubarsí",
      "Balde",
      "De Jong",
      "Pedri",
      "Yamal",
      "Olmo",
      "Raphinha",
      "Lewandowski",
    ],
    startingAway: [
      "Courtois",
      "Carvajal",
      "Rüdiger",
      "Tchouaméni",
      "Mendy",
      "Valverde",
      "Camavinga",
      "Modrić",
      "Bellingham",
      "Vinícius Jr.",
      "Mbappé",
    ],
    possessionHome: 58,
    shotsHome: 14,
    shotsAway: 9,
    shotsOnHome: 6,
    shotsOnAway: 3,
    cornersHome: 5,
    cornersAway: 2,
  },
  {
    comp: "fifa",
    compName: "World Cup — Group B",
    home: T("Argentina", "ARG"),
    away: T("Brazil", "BRA"),
    kickoffOffset: -38,
    scoreHome: 1,
    scoreAway: 1,
    venue: "Estadio Azteca",
    events: [
      { minute: 18, type: "goal", team: "home", player: "Messi" },
      { minute: 33, type: "goal", team: "away", player: "Vinícius Jr." },
    ],
    formationHome: "4-4-2",
    formationAway: "4-2-3-1",
    startingHome: [],
    startingAway: [],
    possessionHome: 51,
    shotsHome: 7,
    shotsAway: 8,
    shotsOnHome: 3,
    shotsOnAway: 2,
    cornersHome: 3,
    cornersAway: 4,
  },
  {
    comp: "barca",
    compName: "Champions League",
    home: T("Bayern Munich", "BAY"),
    away: T("FC Barcelona", "BAR"),
    kickoffOffset: -52,
    scoreHome: 1,
    scoreAway: 2,
    venue: "Allianz Arena",
    events: [
      { minute: 9, type: "goal", team: "away", player: "Raphinha" },
      { minute: 22, type: "goal", team: "home", player: "Kane" },
      { minute: 47, type: "goal", team: "away", player: "Lewandowski" },
    ],
    formationHome: "4-2-3-1",
    formationAway: "4-3-3",
    possessionHome: 47,
    shotsHome: 11,
    shotsAway: 13,
    shotsOnHome: 4,
    shotsOnAway: 5,
    cornersHome: 6,
    cornersAway: 4,
    startingHome: [],
    startingAway: [],
  },
  {
    comp: "fifa",
    compName: "World Cup — Group A",
    home: T("France", "FRA"),
    away: T("Germany", "GER"),
    kickoffOffset: 90,
    scoreHome: 0,
    scoreAway: 0,
    forceStatus: "SCHED",
    venue: "Wembley",
    events: [],
    formationHome: "4-3-3",
    formationAway: "4-2-3-1",
    startingHome: [],
    startingAway: [],
  },
  {
    comp: "fifa",
    compName: "World Cup — Group C",
    home: T("England", "ENG"),
    away: T("Portugal", "POR"),
    kickoffOffset: 240,
    scoreHome: 0,
    scoreAway: 0,
    forceStatus: "SCHED",
    venue: "Maracanã",
    events: [],
    formationHome: "4-2-3-1",
    formationAway: "4-3-3",
    startingHome: [],
    startingAway: [],
  },
  {
    comp: "barca",
    compName: "LaLiga",
    home: T("Atlético Madrid", "ATM"),
    away: T("FC Barcelona", "BAR"),
    kickoffOffset: -130,
    scoreHome: 0,
    scoreAway: 3,
    forceStatus: "FT",
    venue: "Riyadh Air Metropolitano",
    events: [
      { minute: 15, type: "goal", team: "away", player: "Yamal" },
      { minute: 49, type: "goal", team: "away", player: "Lewandowski" },
      { minute: 78, type: "goal", team: "away", player: "Olmo" },
    ],
    formationHome: "4-4-2",
    formationAway: "4-3-3",
    startingHome: [],
    startingAway: [],
  },
];

function inferStatus(offsetMin: number, forced?: MatchStatus): { status: MatchStatus; minute: number } {
  if (forced) return { status: forced, minute: forced === "FT" ? 90 : 0 };
  if (offsetMin > 0) return { status: "SCHED", minute: 0 };
  const elapsed = -offsetMin;
  if (elapsed < 45) return { status: "LIVE", minute: elapsed };
  if (elapsed < 60) return { status: "HT", minute: 45 };
  if (elapsed < 105) return { status: "LIVE", minute: elapsed - 15 };
  return { status: "FT", minute: 90 };
}

function buildStats(s: Seed): MatchStats {
  const ph = s.possessionHome ?? 50;
  return {
    possession: { home: ph, away: 100 - ph },
    shots: { home: s.shotsHome ?? 0, away: s.shotsAway ?? 0 },
    shotsOnTarget: { home: s.shotsOnHome ?? 0, away: s.shotsOnAway ?? 0 },
    corners: { home: s.cornersHome ?? 0, away: s.cornersAway ?? 0 },
    fouls: { home: 0, away: 0 },
  };
}

function buildLineup(formation: string | undefined, starting: string[] | undefined): Lineup {
  return { formation: formation ?? "4-3-3", starting: starting ?? [] };
}

function buildMatch(s: Seed): Match {
  const { status, minute } = inferStatus(s.kickoffOffset, s.forceStatus);
  const kickoff = new Date(Date.now() + s.kickoffOffset * 60_000).toISOString();
  return {
    slug: matchSlug(s.home.name, s.away.name),
    competition: s.comp,
    competitionName: s.compName,
    home: s.home,
    away: s.away,
    scoreHome: s.scoreHome,
    scoreAway: s.scoreAway,
    status,
    minute,
    kickoff,
    venue: s.venue,
    events: s.events,
    stats: buildStats(s),
    lineupHome: buildLineup(s.formationHome, s.startingHome),
    lineupAway: buildLineup(s.formationAway, s.startingAway),
  };
}

function allMockMatches(): Match[] {
  return SEEDS.map(buildMatch);
}

// ---------- Public data API ----------

function buildChain(): ProviderChain {
  const providers: Array<{ name: string; fn: () => Promise<Match[]> }> = [];
  if (env.footballDataKey) {
    providers.push({
      name: "football-data.org",
      fn: () => fetchFootballDataMatches({ apiKey: env.footballDataKey! }),
    });
  }
  providers.push({ name: "openfootball-static", fn: () => loadStaticFixtures() });
  providers.push({ name: "mock", fn: async () => allMockMatches() });
  return new ProviderChain(providers);
}

const chain = buildChain();

export async function getAllMatches(): Promise<Match[]> {
  return cached("matches:all", env.listTtlSeconds, () => chain.getAll());
}

export async function getLiveMatches(): Promise<Match[]> {
  const all = await getAllMatches();
  return all.filter((m) => m.status === "LIVE" || m.status === "HT").slice(0, 5);
}

export async function getUpcomingMatches(limit = 5): Promise<Match[]> {
  const all = await getAllMatches();
  return all
    .filter((m) => m.status === "SCHED")
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff))
    .slice(0, limit);
}

export async function getMatchesByCompetition(comp: Competition): Promise<Match[]> {
  const all = await getAllMatches();
  return all.filter((m) => m.competition === comp);
}

export async function getTrendingMatches(limit = 4): Promise<Match[]> {
  const all = await getAllMatches();
  // Trending heuristic: live > recent FT > scheduled, capped.
  const ranked = [...all].sort((a, b) => weight(b) - weight(a));
  return ranked.slice(0, limit);
}

function weight(m: Match): number {
  if (m.status === "LIVE") return 100;
  if (m.status === "HT") return 90;
  if (m.status === "FT") return 50 - Math.abs(Date.now() - +new Date(m.kickoff)) / 60_000 / 60;
  return 30 - (+new Date(m.kickoff) - Date.now()) / 60_000 / 60;
}

export async function getMatchBySlug(slug: string): Promise<Match | null> {
  const all = await getAllMatches();
  return all.find((m) => m.slug === slug) ?? null;
}


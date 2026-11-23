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
import {
  _resetFixtureIdCache,
  fetchApiFootballEvents,
  hasMappedLeague,
  normalizeTeamName,
  resolveAfFixtureId,
} from "./football/providers/apiFootball";
import { loadStaticFixtures } from "./football/providers/staticFixtures";
import { ProviderChain } from "./football/chain";
import { Quota } from "./football/quota";

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
  const group = s.compName.match(/Group\s+[A-Z]/i)?.[0];
  return {
    slug: matchSlug(s.home.name, s.away.name),
    competition: s.comp,
    competitionName: s.compName,
    group,
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
  // The matches endpoint defaults to *today only*. On a quiet day that leaves
  // no fixtures at all and the chain falls back to the archived World Cup
  // file. Ask for a rolling window: last week's results + three weeks ahead.
  const utcDate = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  if (env.footballDataKey) {
    providers.push({
      name: "football-data.org",
      fn: () =>
        fetchFootballDataMatches({
          apiKey: env.footballDataKey!,
          dateFrom: utcDate(-7),
          dateTo: utcDate(21),
        }),
    });
  }
  providers.push({ name: "openfootball-static", fn: () => loadStaticFixtures() });
  providers.push({ name: "mock", fn: async () => allMockMatches() });
  return new ProviderChain(providers);
}

// Lazy: built on first access so `resetEnvCache()` + `resetChain()` in tests
// can flip provider configuration without reloading the module.
let chain: ProviderChain | null = null;
function getChain(): ProviderChain {
  if (!chain) chain = buildChain();
  return chain;
}

export function resetChain(): void {
  chain = null;
}

export async function getAllMatches(): Promise<Match[]> {
  return cached("matches:all", env.listTtlSeconds, () => getChain().getAll());
}

export async function getLiveMatches(): Promise<Match[]> {
  const all = await getAllMatches();
  return all.filter((m) => m.status === "LIVE" || m.status === "HT").slice(0, 5);
}

export async function getUpcomingMatches(limit = 5): Promise<Match[]> {
  return selectUpcoming(await getAllMatches(), limit);
}

export async function getMatchesByCompetition(comp: Competition): Promise<Match[]> {
  const all = await getAllMatches();
  return all.filter((m) => m.competition === comp);
}

/** How far either side of "now" a match still counts as current coverage.
 *  A tournament that finished months ago must never resurface as news. */
export const CURRENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Providers spell the club differently ("FC Barcelona" vs "Barcelona"), so
 *  compare the normalised name rather than the raw one. */
export function involvesBarca(m: Match): boolean {
  return (
    normalizeTeamName(m.home.name) === "barcelona" ||
    normalizeTeamName(m.away.name) === "barcelona"
  );
}

/** True when a match is live, recently finished, or about to start. Past
 *  schedule rows (no score, kick-off gone) are stale, not current. */
export function isCurrentMatch(m: Match, now = Date.now()): boolean {
  const kickoff = +new Date(m.kickoff);
  if (kickoff < now - CURRENT_WINDOW_MS || kickoff > now + CURRENT_WINDOW_MS) {
    return false;
  }
  return !(m.status === "SCHED" && kickoff <= now);
}

/** Barça's own fixtures outrank everything else on this site's home page. */
function barcaFirst(a: Match, b: Match): number {
  return Number(involvesBarca(b)) - Number(involvesBarca(a));
}

export function selectUpcoming(all: Match[], limit: number, now = Date.now()): Match[] {
  return all
    // A schedule without scores is still SCHED, so only a future kick-off is
    // genuinely upcoming.
    .filter((m) => m.status === "SCHED" && +new Date(m.kickoff) > now)
    .sort((a, b) => barcaFirst(a, b) || +new Date(a.kickoff) - +new Date(b.kickoff))
    .slice(0, limit);
}

export function selectRecent(all: Match[], limit: number, now = Date.now()): Match[] {
  return all
    .filter((m) => m.status === "FT" && isCurrentMatch(m, now))
    .sort((a, b) => barcaFirst(a, b) || +new Date(b.kickoff) - +new Date(a.kickoff))
    .slice(0, limit);
}

export function selectTrending(all: Match[], limit: number, now = Date.now()): Match[] {
  return all
    .filter((m) => isCurrentMatch(m, now))
    // Trending heuristic: live > recently finished > scheduled, Barça first.
    .sort((a, b) => weight(b, now) - weight(a, now))
    .slice(0, limit);
}

export async function getTrendingMatches(limit = 4): Promise<Match[]> {
  return selectTrending(await getAllMatches(), limit);
}

function weight(m: Match, now: number): number {
  let base: number;
  if (m.status === "LIVE") base = 100;
  else if (m.status === "HT") base = 90;
  else if (m.status === "FT") base = 50 - Math.abs(now - +new Date(m.kickoff)) / 3_600_000;
  // Future scheduled match: sooner ranks higher, and never above a result.
  else base = 30 - Math.max(0, +new Date(m.kickoff) - now) / 3_600_000;
  return base + (involvesBarca(m) ? 25 : 0);
}

// ---------- Per-match enrichment (API-Football) ----------

// 100 req/day on API-Football's free tier; cap at 90 to leave headroom for
// ad-hoc lookups (fixture-id resolution + events = 2 calls per cold match).
// Single shared instance per process — `new Quota()` per call would silently
// disable the limiter.
const apiFootballQuota = new Quota({
  limit: 90,
  windowMs: 24 * 60 * 60 * 1000,
});

const PRE_KICKOFF_HORIZON_MS = 60 * 60 * 1000; // 60 min before kickoff
const POST_KICKOFF_STALE_MS = 6 * 60 * 60 * 1000; // 6 h after kickoff

export function _resetEnrichmentState(): void {
  _resetFixtureIdCache();
}

/** Reset the API-Football daily quota — for tests only. */
export function _resetQuota(): void {
  apiFootballQuota.reset();
}

async function maybeEnrich(base: Match): Promise<Match> {
  if (!env.enrichmentEnabled || !env.apiFootballKey) return base;
  // Budget: only enrich Barca matches. World Cup/other comps stay on
  // football-data.org's data alone — they're not the value-add for this app.
  if (base.competition !== "barca") return base;
  // No mapped API-Football league for this competition (Copa del Rey,
  // friendlies, etc.) — fail fast before consuming quota.
  if (!hasMappedLeague(base.competitionName)) return base;
  // Skip far-future scheduled matches; nothing to enrich and quota is scarce.
  if (
    base.status === "SCHED" &&
    +new Date(base.kickoff) - Date.now() > PRE_KICKOFF_HORIZON_MS
  ) {
    return base;
  }
  // Skip stale FT matches — events won't change, no need to refresh after a
  // few hours. Also keeps idle bots off the quota.
  if (
    base.status === "FT" &&
    Date.now() - +new Date(base.kickoff) > POST_KICKOFF_STALE_MS
  ) {
    return base;
  }
  if (!apiFootballQuota.tryConsume()) return base;
  try {
    const fixtureId = await resolveAfFixtureId({
      apiKey: env.apiFootballKey,
      match: base,
    });
    if (!fixtureId) return base;
    const events = await fetchApiFootballEvents({
      apiKey: env.apiFootballKey,
      fixtureId,
      homeName: base.home.name,
    });
    return { ...base, events: events.length > 0 ? events : base.events };
  } catch (err) {
    console.warn(
      `[apiFootball] enrich failed for ${base.slug}:`,
      err instanceof Error ? err.message : err,
    );
    return base;
  }
}

export async function getMatchBySlug(slug: string): Promise<Match | null> {
  const all = await getAllMatches();
  const base = all.find((m) => m.slug === slug);
  if (!base) return null;
  return maybeEnrich(base);
}


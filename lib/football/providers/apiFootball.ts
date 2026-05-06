import type { Match, MatchEvent } from "@/lib/types";
import { fetchJson } from "@/lib/http";

interface AfEvent {
  time: { elapsed: number };
  team: { name: string };
  player: { name: string };
  type: string;
  detail?: string;
  comments?: string;
}
interface AfEventsResp { response: AfEvent[] }

function classifyType(e: AfEvent): MatchEvent["type"] | null {
  const detail = e.detail ?? "";
  if (e.type === "Goal") return "goal";
  if (e.type === "Card") {
    // Check red / second-yellow BEFORE yellow — "Second Yellow card" must
    // map to red (player sent off), not yellow.
    if (/red/i.test(detail) || /second\s*yellow/i.test(detail)) return "red";
    if (/yellow/i.test(detail)) return "yellow";
    return null;
  }
  if (e.type === "subst" || /substitut/i.test(e.type)) return "sub";
  return null;
}

// Normalize team names so events match across providers. API-Football may
// return "Barcelona" while football-data.org returns "FC Barcelona"; with
// strict equality every event would mis-classify as "away". Strip common
// prefixes, diacritics, and case differences.
export function normalizeTeamName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(fc|cf|sc|ac|afc|cd|club\s+de\s+f[uú]tbol)\b/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isHomeTeam(eventTeam: string, homeName: string): boolean {
  const a = normalizeTeamName(eventTeam);
  const b = normalizeTeamName(homeName);
  if (a === b) return true;
  // Last-resort substring check ("Barcelona" vs "Barcelona Atlètic" still
  // ambiguous, but this is better than strict equality for the common case).
  return a.includes(b) || b.includes(a);
}

export function mapApiFootballEvents(raw: AfEventsResp, homeName: string): MatchEvent[] {
  return raw.response
    .map((e): MatchEvent | null => {
      const type = classifyType(e);
      if (!type) return null;
      const detail = e.comments?.trim() || undefined;
      return {
        minute: e.time.elapsed,
        type,
        team: isHomeTeam(e.team.name, homeName) ? "home" : "away",
        player: e.player.name,
        detail,
      };
    })
    .filter((x): x is MatchEvent => x !== null);
}

export async function fetchApiFootballEvents(opts: {
  apiKey: string;
  fixtureId: number;
  homeName: string;
}): Promise<MatchEvent[]> {
  const json = await fetchJson<AfEventsResp>(
    `https://v3.football.api-sports.io/fixtures/events?fixture=${opts.fixtureId}`,
    { headers: { "x-apisports-key": opts.apiKey } },
  );
  return mapApiFootballEvents(json, opts.homeName);
}

// ---------- Fixture-id resolution ----------

interface AfFixture {
  fixture: { id: number; date: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  league: { id: number; season: number };
}
interface AfFixturesResp {
  response: AfFixture[];
}

interface FixtureIdCacheEntry {
  id: number | null;
  expires: number;
}

const fixtureIdCache = new Map<string, FixtureIdCacheEntry>();
const FIXTURE_TTL_MS = 24 * 60 * 60 * 1000;

// football-data.org uses "Primera Division", common docs/UI use "LaLiga".
// Map both to the same API-Football league id (140 = Spanish Primera, 2 = UCL).
const LEAGUE_BY_COMP_NAME: Record<string, number> = {
  "Primera Division": 140,
  "Primera División": 140,
  LaLiga: 140,
  "La Liga": 140,
  "Champions League": 2,
  "UEFA Champions League": 2,
};

/**
 * Resolve the API-Football fixture id for a given Match. We do NOT have a
 * stable cross-provider team-id mapping, so we look up by date + league and
 * match team names with `normalizeTeamName`. Result (including null misses)
 * is cached by `match.slug` for 24h to avoid burning quota on repeated
 * lookups for the same match.
 */
export async function resolveAfFixtureId(opts: {
  apiKey: string;
  match: Match;
}): Promise<number | null> {
  const cached = fixtureIdCache.get(opts.match.slug);
  if (cached && cached.expires > Date.now()) return cached.id;

  const date = opts.match.kickoff.slice(0, 10); // YYYY-MM-DD
  const leagueId = LEAGUE_BY_COMP_NAME[opts.match.competitionName];
  if (!leagueId) {
    fixtureIdCache.set(opts.match.slug, {
      id: null,
      expires: Date.now() + FIXTURE_TTL_MS,
    });
    return null;
  }

  let id: number | null = null;
  try {
    const json = await fetchJson<AfFixturesResp>(
      `https://v3.football.api-sports.io/fixtures?date=${date}&league=${leagueId}`,
      { headers: { "x-apisports-key": opts.apiKey } },
    );
    const homeKey = normalizeTeamName(opts.match.home.name);
    const awayKey = normalizeTeamName(opts.match.away.name);
    const found = json.response.find(
      (f) =>
        normalizeTeamName(f.teams.home.name) === homeKey &&
        normalizeTeamName(f.teams.away.name) === awayKey,
    );
    id = found?.fixture.id ?? null;
  } catch {
    id = null;
  }
  fixtureIdCache.set(opts.match.slug, {
    id,
    expires: Date.now() + FIXTURE_TTL_MS,
  });
  return id;
}

export function _resetFixtureIdCache(): void {
  fixtureIdCache.clear();
}

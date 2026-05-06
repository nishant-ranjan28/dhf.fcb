import type { MatchEvent } from "@/lib/types";
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

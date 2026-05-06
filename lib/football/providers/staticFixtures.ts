import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Match } from "@/lib/types";
import { matchSlug, toSlug } from "@/lib/slug";

interface OfTeamObj {
  name: string;
  code?: string;
}

type OfTeam = string | OfTeamObj;

interface OfMatch {
  date: string;
  time?: string;
  team1: OfTeam;
  team2: OfTeam;
  group?: string;
  score?: {
    ft?: [number, number];
    p?: [number, number]; // penalty shootout result
  };
}

interface OfSchedule {
  name: string;
  matches: OfMatch[];
}

function teamName(t: OfTeam): string {
  return typeof t === "string" ? t : t.name;
}

function teamShort(t: OfTeam): string {
  if (typeof t === "object" && t.code) return t.code.toUpperCase();
  // ASCII-fold via toSlug, take first 3 chars, uppercase. "Côte d'Ivoire" → "COT".
  return toSlug(teamName(t)).replace(/-/g, "").slice(0, 3).toUpperCase();
}

function parseKickoff(date: string, time?: string): string {
  // Accepts "HH:MM" or "HH:MM UTC-6" / "HH:MM UTC+2" / undefined.
  // Falls back to 18:00 UTC. Returns ISO string; if parsing fails, returns date at 00:00Z.
  const t = (time ?? "18:00").trim();
  const match = t.match(/^(\d{1,2}):(\d{2})(?:\s*UTC\s*([+-]\d{1,2})(?::?(\d{2}))?)?/i);
  if (!match) {
    const fallback = new Date(`${date}T18:00:00Z`);
    return Number.isNaN(fallback.getTime())
      ? new Date(`${date}T00:00:00Z`).toISOString()
      : fallback.toISOString();
  }
  const [, hh, mm, offHour, offMin] = match;
  const hPad = hh.padStart(2, "0");
  let offset = "Z";
  if (offHour) {
    const sign = offHour.startsWith("-") ? "-" : "+";
    const hours = offHour.replace(/[+-]/, "").padStart(2, "0");
    const mins = (offMin ?? "00").padStart(2, "0");
    // Avoid -00:00 (RFC 3339 §4.3 reserves it). Coerce to Z.
    offset = sign === "-" && hours === "00" && mins === "00" ? "Z" : `${sign}${hours}:${mins}`;
  }
  const iso = `${date}T${hPad}:${mm}:00${offset}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? new Date(`${date}T00:00:00Z`).toISOString()
    : d.toISOString();
}

export function mapOpenFootballSchedule(raw: OfSchedule): Match[] {
  return raw.matches.map((m) => {
    const home = teamName(m.team1);
    const away = teamName(m.team2);
    const kickoff = parseKickoff(m.date, m.time);
    // FT or shootout-decided counts as full-time. Pure SCHED has neither.
    const isFinished = Boolean(m.score?.ft || m.score?.p);
    const score = m.score?.ft ?? m.score?.p ?? [0, 0];
    return {
      slug: matchSlug(home, away),
      competition: "fifa" as const,
      competitionName: raw.name,
      home: { name: home, short: teamShort(m.team1) },
      away: { name: away, short: teamShort(m.team2) },
      scoreHome: score[0],
      scoreAway: score[1],
      status: isFinished ? ("FT" as const) : ("SCHED" as const),
      minute: 0,
      kickoff,
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
    };
  });
}

// Memoize a single load per process — the JSON is ~20KB and never changes
// at runtime (refreshed by the prebuild script). Reset on module reload.
let cachedLoad: Promise<Match[]> | null = null;

export async function loadStaticFixtures(): Promise<Match[]> {
  if (cachedLoad) return cachedLoad;
  cachedLoad = (async () => {
    const file = path.join(process.cwd(), "data", "worldcup-2026.json");
    try {
      const raw = JSON.parse(await readFile(file, "utf8")) as OfSchedule;
      return mapOpenFootballSchedule(raw);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        // First-run / no prebuild yet — fall through silently.
        return [];
      }
      console.warn(`[staticFixtures] failed to load ${file}:`, err);
      return [];
    }
  })();
  return cachedLoad;
}

export function _resetStaticCache(): void {
  cachedLoad = null;
}

// Export internals for testing.
export { parseKickoff, teamShort };

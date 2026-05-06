import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Match } from "@/lib/types";
import { matchSlug } from "@/lib/slug";

interface OfMatch {
  date: string;
  time?: string;
  team1: string | { name: string };
  team2: string | { name: string };
  group?: string;
  score?: { ft?: [number, number] };
}

interface OfSchedule {
  name: string;
  matches: OfMatch[];
}

function teamName(t: string | { name: string }): string {
  return typeof t === "string" ? t : t.name;
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
  const offset = offHour
    ? `${offHour.startsWith("-") ? "-" : "+"}${offHour.replace(/[+-]/, "").padStart(2, "0")}:${(offMin ?? "00").padStart(2, "0")}`
    : "Z";
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
    return {
      slug: matchSlug(home, away),
      competition: "fifa" as const,
      competitionName: raw.name,
      home: { name: home, short: home.slice(0, 3).toUpperCase() },
      away: { name: away, short: away.slice(0, 3).toUpperCase() },
      scoreHome: m.score?.ft?.[0] ?? 0,
      scoreAway: m.score?.ft?.[1] ?? 0,
      status: m.score?.ft ? ("FT" as const) : ("SCHED" as const),
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

export async function loadStaticFixtures(): Promise<Match[]> {
  try {
    const file = path.join(process.cwd(), "data", "worldcup-2026.json");
    const raw = JSON.parse(await readFile(file, "utf8")) as OfSchedule;
    return mapOpenFootballSchedule(raw);
  } catch {
    return [];
  }
}

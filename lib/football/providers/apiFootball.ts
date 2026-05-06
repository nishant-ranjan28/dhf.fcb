import type { MatchEvent } from "@/lib/types";

interface AfEvent {
  time: { elapsed: number };
  team: { name: string };
  player: { name: string };
  type: string;
  detail: string;
  comments?: string;
}
interface AfEventsResp { response: AfEvent[] }

function classifyType(e: AfEvent): MatchEvent["type"] | null {
  if (e.type === "Goal") return "goal";
  if (e.type === "Card" && /yellow/i.test(e.detail)) return "yellow";
  if (e.type === "Card" && /red/i.test(e.detail)) return "red";
  if (e.type === "subst" || /substitut/i.test(e.type)) return "sub";
  return null;
}

export function mapApiFootballEvents(raw: AfEventsResp, homeName: string): MatchEvent[] {
  return raw.response
    .map((e): MatchEvent | null => {
      const type = classifyType(e);
      if (!type) return null;
      return {
        minute: e.time.elapsed,
        type,
        team: e.team.name === homeName ? "home" : "away",
        player: e.player.name,
        detail: e.comments,
      };
    })
    .filter((x): x is MatchEvent => x !== null);
}

export async function fetchApiFootballEvents(opts: {
  apiKey: string;
  fixtureId: number;
  homeName: string;
}): Promise<MatchEvent[]> {
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures/events?fixture=${opts.fixtureId}`,
    { headers: { "x-apisports-key": opts.apiKey }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`api-football ${res.status}`);
  const json = (await res.json()) as AfEventsResp;
  return mapApiFootballEvents(json, opts.homeName);
}

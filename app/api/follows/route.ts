import { NextResponse } from "next/server";
import { getAllMatches } from "@/lib/football";
import { matchesForTeams } from "@/lib/follows";

export const revalidate = 30;

// GET /api/follows?teams=Brazil,FC%20Barcelona  → { matches }
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("teams") ?? "";
  const teams = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (teams.length === 0) {
    return NextResponse.json({ matches: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const all = await getAllMatches();
  const matches = matchesForTeams(all, teams);
  return NextResponse.json(
    { matches },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
  );
}

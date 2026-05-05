import { NextResponse } from "next/server";
import { getAllMatches, getLiveMatches } from "@/lib/football";

export const revalidate = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const live = url.searchParams.get("live");
  const matches = live === "1" ? await getLiveMatches() : await getAllMatches();
  return NextResponse.json(
    { matches },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}

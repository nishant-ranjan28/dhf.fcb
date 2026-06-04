import { NextResponse } from "next/server";
import { getMatchBySlug } from "@/lib/football";
import { getMatchInsights } from "@/lib/ai/insights";

export const dynamic = "force-dynamic";

// GET /api/match/<slug>/insights → { insights } | { insights: null }
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const match = await getMatchBySlug(slug);
  if (!match) {
    return NextResponse.json({ error: "match not found" }, { status: 404 });
  }
  const insights = await getMatchInsights(match);
  return NextResponse.json(
    { insights },
    {
      // Insights are state-cached server-side; let the CDN hold the response
      // briefly too. Live matches bust the cache via the state hash.
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    },
  );
}

import { NextResponse } from "next/server";
import { getAllMatches } from "@/lib/football";
import { listNews } from "@/lib/news";
import { blogStore } from "@/lib/blog/store";
import { searchAll, type SearchResults } from "@/lib/search";

export const revalidate = 60;

const EMPTY: SearchResults = { matches: [], news: [], blog: [] };

// GET /api/search?q=  → { matches, news, blog }
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json(EMPTY, { headers: { "Cache-Control": "no-store" } });
  }

  const [matches, news, blog] = await Promise.all([
    getAllMatches(),
    listNews(undefined, 100),
    blogStore().list({ limit: 100 }),
  ]);

  const results = searchAll(q, { matches, news, blog });
  return NextResponse.json(results, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}

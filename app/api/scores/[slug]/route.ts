import { NextResponse } from "next/server";
import { getMatchBySlug } from "@/lib/football";

export const revalidate = 30;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const match = await getMatchBySlug(slug);
  if (!match) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(
    { match },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}

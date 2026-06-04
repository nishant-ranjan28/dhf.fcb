import { NextResponse } from "next/server";
import { getMatchBySlug } from "@/lib/football";
import { predictionsStore } from "@/lib/predictions/store";
import { settleIfFinished } from "@/lib/predictions/settle";

export const dynamic = "force-dynamic";

function validScore(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 30;
}

// GET /api/predictions?slug=&deviceId=  → { prediction, summary }
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  const deviceId = url.searchParams.get("deviceId") ?? "";
  if (!slug) return NextResponse.json({ error: "missing slug" }, { status: 400 });

  // Make sure points are reflected once the match is over.
  await settleIfFinished(slug);

  const store = predictionsStore();
  const [prediction, all] = await Promise.all([
    deviceId ? store.getPrediction(slug, deviceId) : Promise.resolve(null),
    store.getMatchPredictions(slug),
  ]);

  // Community summary: total count + the most-predicted scoreline.
  const tally = new Map<string, number>();
  for (const p of all) {
    const key = `${p.home}-${p.away}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  const summary = { count: all.length, topScore: top?.[0] ?? null, topCount: top?.[1] ?? 0 };

  return NextResponse.json({ prediction, summary }, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/predictions  body { slug, deviceId, name, home, away }
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    slug?: string;
    deviceId?: string;
    name?: string;
    home?: number;
    away?: number;
  } | null;

  if (!body || typeof body.slug !== "string" || typeof body.deviceId !== "string") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.deviceId.trim() || body.deviceId.length > 64) {
    return NextResponse.json({ error: "invalid deviceId" }, { status: 400 });
  }
  if (!validScore(body.home) || !validScore(body.away)) {
    return NextResponse.json({ error: "scores must be integers 0-30" }, { status: 400 });
  }

  const match = await getMatchBySlug(body.slug);
  if (!match) return NextResponse.json({ error: "match not found" }, { status: 404 });
  // Lock predictions at kickoff — only scheduled matches accept them.
  if (match.status !== "SCHED") {
    return NextResponse.json({ error: "predictions are closed for this match" }, { status: 409 });
  }

  const prediction = await predictionsStore().predict(
    body.slug,
    body.deviceId,
    typeof body.name === "string" ? body.name : "Anon",
    body.home,
    body.away,
  );
  return NextResponse.json({ prediction }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

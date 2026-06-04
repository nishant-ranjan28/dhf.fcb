import { NextResponse } from "next/server";
import { predictionsStore } from "@/lib/predictions/store";
import { settleAllPending } from "@/lib/predictions/settle";

export const dynamic = "force-dynamic";

// GET /api/predictions/leaderboard?deviceId=&limit=  → { leaderboard, me }
export async function GET(req: Request) {
  const url = new URL(req.url);
  const deviceId = url.searchParams.get("deviceId") ?? "";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));

  // Settle any finished-but-unsettled matches so the board is current.
  await settleAllPending();

  const store = predictionsStore();
  const [leaderboard, me] = await Promise.all([
    store.leaderboard(limit),
    deviceId ? store.userStats(deviceId) : Promise.resolve(null),
  ]);

  return NextResponse.json({ leaderboard, me }, { headers: { "Cache-Control": "no-store" } });
}

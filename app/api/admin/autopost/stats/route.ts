import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/blog/auth";
import { autopostState } from "@/lib/autopost/state";

export async function GET(req: Request) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [days, lastRun] = await Promise.all([
    autopostState().recentStats(7),
    autopostState().getLastRun(),
  ]);
  return NextResponse.json({ days, lastRun });
}

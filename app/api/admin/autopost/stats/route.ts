import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/blog/auth";
import { autopostState } from "@/lib/autopost/state";

export async function GET(req: Request) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const days = await autopostState().recentStats(7);
  return NextResponse.json({ days });
}

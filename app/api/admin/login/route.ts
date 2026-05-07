import { NextResponse } from "next/server";
import { buildAdminCookie, isValidAdminToken } from "@/lib/blog/auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  if (!isValidAdminToken(body.token)) {
    // Brief delay to discourage rapid guessing on top of the timing-safe compare.
    await new Promise((r) => setTimeout(r, 250));
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.headers.set("set-cookie", buildAdminCookie(body.token));
  return res;
}

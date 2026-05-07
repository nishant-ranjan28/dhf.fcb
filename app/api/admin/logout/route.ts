import { NextResponse } from "next/server";
import { buildLogoutCookie } from "@/lib/blog/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("set-cookie", buildLogoutCookie());
  return res;
}

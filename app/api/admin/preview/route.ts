import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/blog/auth";
import { renderMarkdown } from "@/lib/blog/markdown";

export async function POST(req: Request) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { body?: string } | null;
  if (typeof body?.body !== "string") {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }
  return NextResponse.json({ html: renderMarkdown(body.body) });
}

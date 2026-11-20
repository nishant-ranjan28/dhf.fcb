import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { generateReelScripts, publishReel, reelMatches } from "@/lib/reels";

// Called by the Reels workflows in .github/workflows/reels-*.yml with the same
// CRON_TOKEN the auto-post trigger uses. See reels/README.md.
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");

  switch (body.action) {
    case "scripts": {
      if (!str("system") || !str("prompt")) {
        return NextResponse.json({ error: "system and prompt are required" }, { status: 400 });
      }
      const r = await generateReelScripts({
        system: str("system"),
        prompt: str("prompt"),
        model: str("model") || undefined,
      });
      return NextResponse.json(r, { status: r.ok ? 200 : 502 });
    }
    case "matches": {
      try {
        return NextResponse.json({ ok: true, ...(await reelMatches()) });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ ok: false, error }, { status: 502 });
      }
    }
    case "publish": {
      if (!str("videoUrl") || !str("description")) {
        return NextResponse.json({ error: "videoUrl and description are required" }, { status: 400 });
      }
      const r = await publishReel({
        videoUrl: str("videoUrl"),
        description: str("description").slice(0, 2000),
        comment: str("comment").slice(0, 500) || undefined,
      });
      console.log(JSON.stringify({ kind: "reels", action: "publish", ...r }));
      return NextResponse.json(r, { status: r.ok ? 200 : 502 });
    }
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}

function isAuthed(req: Request): boolean {
  const expected = env.cronToken;
  if (!expected) return false;
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  const got = m?.[1];
  if (!got || got.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}

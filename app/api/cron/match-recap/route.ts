import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { getAllMatches } from "@/lib/football";
import { runRecapPipeline } from "@/lib/recap/pipeline";
import { generateRecap } from "@/lib/recap/generate";
import { announce } from "@/lib/autopost/announce";

export const maxDuration = 90;

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const result = await runRecapPipeline({
      getMatches: getAllMatches,
      generate: generateRecap,
      announceFn: announce,
      siteUrl: env.siteUrl,
      now: Date.now(),
    });

    if (result.status === "published") {
      revalidatePath("/blog");
      revalidatePath(`/blog/${result.postSlug}`);
      revalidatePath("/sitemap.xml");
    }

    console.log(JSON.stringify({ kind: "match-recap", durationMs: Date.now() - started, ...result }));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({ kind: "match-recap", error: message, durationMs: Date.now() - started }),
    );
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}

// Same Bearer-token scheme as /api/cron/auto-post.
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

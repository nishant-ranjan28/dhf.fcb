import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { fetchAllNews } from "@/lib/news/rss";
import { runPipeline } from "@/lib/autopost/pipeline";
import { generateDraft } from "@/lib/autopost/generate";
import { announce } from "@/lib/autopost/announce";
import { autopostState } from "@/lib/autopost/state";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const result = await runPipeline({
      fetchNews: fetchAllNews,
      generate: generateDraft,
      announceFn: announce,
      siteUrl: env.siteUrl,
    });

    if (result.status === "published") {
      revalidatePath("/blog");
      revalidatePath(`/blog/${result.slug}`);
      revalidatePath("/sitemap.xml");
    }

    // One-line structured log for grepping.
    console.log(
      JSON.stringify({
        kind: "autopost",
        durationMs: Date.now() - started,
        ...result,
      }),
    );

    return NextResponse.json(result);
  } catch (err) {
    await autopostState().recordError();
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ kind: "autopost", error: message, durationMs: Date.now() - started }));
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
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

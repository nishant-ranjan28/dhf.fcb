import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { fetchAllNews } from "@/lib/news/rss";
import { runPipeline } from "@/lib/autopost/pipeline";
import { generateDraft } from "@/lib/autopost/generate";
import { announce } from "@/lib/autopost/announce";
import { autopostState, type LastRunRecord } from "@/lib/autopost/state";
import type { PipelineResult } from "@/lib/autopost/types";

export const maxDuration = 90;

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // cron-job.org kills the request after 30s, but a real generation can take
  // ~60s (Groq, then the OpenRouter fallback). Ack straight away and let
  // Next's `after()` keep the serverless function alive until the work ends.
  // The outcome is persisted in Redis and shown at /admin/autopost.
  // The cron service only sees this ack, so include the previous run's outcome
  // (published / skipped + reason) to make silent skips diagnosable without
  // needing an admin login or digging through Vercel logs.
  const lastRun = await autopostState().getLastRun().catch(() => null);
  after(() => runAutopost());
  return NextResponse.json({ status: "accepted", lastRun });
}

/** The actual pipeline. Kept separate from POST so unit tests can await it
 *  directly without a Next request scope (where `after()` is unavailable). */
export async function runAutopost(): Promise<PipelineResult> {
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

    console.log(
      JSON.stringify({
        kind: "autopost",
        durationMs: Date.now() - started,
        ...result,
      }),
    );

    await recordLastRunSafely({
      at: new Date(started).toISOString(),
      durationMs: Date.now() - started,
      status: result.status,
      ...(result.status === "published"
        ? { slug: result.slug, provider: result.provider, announces: result.announces }
        : {}),
      ...(result.status === "skipped"
        ? { reason: result.reason, ...(result.detail ? { detail: result.detail } : {}), ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}) }
        : {}),
      ...(result.status === "error" ? { error: result.error } : {}),
    });

    return result;
  } catch (err) {
    await autopostState().recordError();
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({ kind: "autopost", error: message, durationMs: Date.now() - started }),
    );
    await recordLastRunSafely({
      at: new Date(started).toISOString(),
      durationMs: Date.now() - started,
      status: "error",
      error: message,
    });
    return { status: "error", error: message };
  }
}

/** Never let a Redis hiccup turn a successful publish into a failed task. */
async function recordLastRunSafely(record: LastRunRecord): Promise<void> {
  try {
    await autopostState().recordLastRun(record);
  } catch (err) {
    console.warn(
      "[autopost] could not record last run:",
      err instanceof Error ? err.message : String(err),
    );
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

import { env } from "@/lib/env";
import { getAllMatches } from "@/lib/football";

// Server side of the Reels autopilot (reels/ in this repo). The GitHub Actions
// job renders the videos; it calls these helpers through /api/cron/reels so the
// Groq key and the Facebook Page token never have to leave Vercel.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Keep in step with lib/facebook.ts.
const GRAPH = "https://graph.facebook.com/v27.0";
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

export type ReelsResult<T> = ({ ok: true } & T) | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Only this repo's release assets may be published, so the endpoint cannot be
 *  pointed at an arbitrary file. Override with REELS_VIDEO_URL_PREFIX. */
export function allowedVideoPrefix(): string {
  return (
    process.env.REELS_VIDEO_URL_PREFIX?.trim() ||
    "https://github.com/nishant-ranjan28/dhf.fcb/releases/download/"
  );
}

/** Ask Groq for a JSON object. Returns the model's text; the caller extracts the JSON. */
export async function generateReelScripts(opts: {
  system: string;
  prompt: string;
}): Promise<ReelsResult<{ content: string }>> {
  const apiKey = env.groqApiKey;
  if (!apiKey) return fail("GROQ_API_KEY is not configured");
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: env.groqModel,
        temperature: 0.7,
        // Same lesson as lib/autopost/generate.ts: gpt-oss spends reasoning
        // tokens first, and Groq's strict JSON mode rejects the reply with
        // json_validate_failed. Ask for JSON in the prompt and let the caller
        // extract the object from the text.
        max_tokens: 4096,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.prompt },
        ],
      }),
      signal: AbortSignal.timeout(75_000),
    });
    const text = await res.text();
    if (!res.ok) return fail(`Groq HTTP ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 300)}`);
    const json = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return fail("Groq returned no content");
    return { ok: true, content };
  } catch (err) {
    return fail(message(err));
  }
}

export interface ReelMatch {
  competition: string;
  date: string;
  home: string;
  away: string;
  status: string;
  score?: string;
}

/** Barça matches from the last and next 7 days, in the shape reels/ expects. */
export async function reelMatches(now = Date.now()): Promise<{ results: ReelMatch[]; fixtures: ReelMatch[] }> {
  const week = 7 * 24 * 3600 * 1000;
  const results: ReelMatch[] = [];
  const fixtures: ReelMatch[] = [];
  for (const m of await getAllMatches()) {
    const t = +new Date(m.kickoff);
    if (m.competition !== "barca" || Number.isNaN(t) || Math.abs(t - now) > week) continue;
    const row: ReelMatch = {
      competition: m.competitionName,
      date: m.kickoff,
      home: m.home.name,
      away: m.away.name,
      status: m.status,
    };
    if (m.status === "FT") results.push({ ...row, score: `${m.scoreHome}-${m.scoreAway}` });
    else if (m.status === "SCHED") fixtures.push(row);
  }
  return { results, fixtures };
}

async function graph(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* fall through to the status check */
  }
  if (!res.ok || json.error) {
    throw new Error(`Graph ${path} HTTP ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 300)}`);
  }
  return json;
}

/** Download a rendered video from this repo's releases and publish it as a Reel. */
export async function publishReel(opts: {
  videoUrl: string;
  description: string;
  comment?: string;
}): Promise<ReelsResult<{ id: string; commented: boolean }>> {
  const pageId = process.env.FACEBOOK_PAGE_ID?.trim();
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!pageId || !token) return fail("Facebook not configured");
  if (!opts.videoUrl.startsWith(allowedVideoPrefix())) return fail("videoUrl is not an allowed release asset");
  try {
    const dl = await fetch(opts.videoUrl, { signal: AbortSignal.timeout(30_000) });
    if (!dl.ok) return fail(`video download HTTP ${dl.status}`);
    const video = Buffer.from(await dl.arrayBuffer());
    if (video.length === 0 || video.length > MAX_VIDEO_BYTES) return fail(`video size ${video.length} not accepted`);

    const start = await graph(`${pageId}/video_reels`, { upload_phase: "start", access_token: token });
    const videoId = String(start.video_id ?? "");
    if (!videoId) return fail("Graph did not return a video_id");
    const uploadUrl =
      typeof start.upload_url === "string" && start.upload_url
        ? start.upload_url
        : `https://rupload.facebook.com/video-upload/v27.0/${videoId}`;
    const up = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: `OAuth ${token}`, offset: "0", file_size: String(video.length) },
      body: video,
      signal: AbortSignal.timeout(60_000),
    });
    if (!up.ok) {
      const t = await up.text().catch(() => "");
      return fail(`upload HTTP ${up.status}: ${t.replace(/\s+/g, " ").slice(0, 300)}`);
    }
    await graph(`${pageId}/video_reels`, {
      upload_phase: "finish",
      video_id: videoId,
      video_state: "PUBLISHED",
      description: opts.description,
      access_token: token,
    });

    // Best-effort: needs pages_manage_engagement, and the Reel may still be
    // processing. A missing comment must never fail a published Reel.
    let commented = false;
    if (opts.comment) {
      try {
        await graph(`${videoId}/comments`, { message: opts.comment, access_token: token });
        commented = true;
      } catch (err) {
        console.warn("[reels] link comment skipped:", message(err));
      }
    }
    return { ok: true, id: videoId, commented };
  } catch (err) {
    return fail(message(err));
  }
}

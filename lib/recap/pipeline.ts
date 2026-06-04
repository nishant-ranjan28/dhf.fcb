import type { Match } from "@/lib/types";
import type { AnnounceResults } from "@/lib/autopost/types";
import type { BlogPost } from "@/lib/blog/types";
import { env } from "@/lib/env";
import { blogStore } from "@/lib/blog/store";
import { explainWordCount, explainBannedPhrases } from "@/lib/autopost/gates";
import { recapState } from "./state";
import { selectRecapMatch } from "./select";
import type { RecapResult } from "./generate";

const DAY_CAP = 12;
const MAX_AGE_MS = 48 * 3600_000;
// Recaps are tighter than news posts; the AI is told 350-600 words. Floor low
// enough to pass score-only World Cup recaps but high enough to reject stubs.
const RECAP_WORD_MIN = 120;

export type RecapPipelineResult =
  | { status: "published"; slug: string; postSlug: string; announces: AnnounceResults }
  | {
      status: "skipped";
      reason:
        | "disabled"
        | "day_cap_reached"
        | "no_eligible_match"
        | "quota"
        | "all_providers_failed"
        | "gate_word_count"
        | "gate_banned_phrases";
    }
  | { status: "error"; error: string };

export interface RecapPipelineDeps {
  getMatches: () => Promise<Match[]>;
  generate: (match: Match) => Promise<RecapResult>;
  announceFn: (post: BlogPost, siteUrl: string) => Promise<AnnounceResults>;
  siteUrl: string;
  now: number;
}

export async function runRecapPipeline(deps: RecapPipelineDeps): Promise<RecapPipelineResult> {
  if (!env.recapEnabled) return { status: "skipped", reason: "disabled" };

  const state = recapState();
  if (await state.dayCapReached(DAY_CAP)) {
    return { status: "skipped", reason: "day_cap_reached" };
  }

  // 1. Select a finished match we haven't recapped yet.
  const matches = await deps.getMatches();
  const recapped = new Set<string>();
  for (const m of matches) {
    if (await state.isRecapped(m.slug)) recapped.add(m.slug);
  }
  const match = selectRecapMatch(matches, { recapped, now: deps.now, maxAgeMs: MAX_AGE_MS });
  if (!match) return { status: "skipped", reason: "no_eligible_match" };

  // 2. Generate.
  const gen = await deps.generate(match);
  if (!gen.ok) return { status: "skipped", reason: gen.reason };
  const draft = gen.draft;

  // 3. Quality gates (lighter than news — recaps are short by design).
  const wc = explainWordCount(draft.body, RECAP_WORD_MIN);
  if (!wc.ok) {
    // Mark recapped so a persistently-bad fixture isn't retried forever.
    await state.markRecapped(match.slug);
    return { status: "skipped", reason: "gate_word_count" };
  }
  if (explainBannedPhrases(draft.body) !== null) {
    await state.markRecapped(match.slug);
    return { status: "skipped", reason: "gate_banned_phrases" };
  }

  // 4. Persist + mark done (mark before announce so a flaky announce can't
  //    cause a duplicate recap on the next run).
  const post = await blogStore().create({
    title: draft.title,
    body: draft.body,
    excerpt: draft.excerpt,
    tags: draft.tags,
    author: "BarcaPulse Recap",
  });
  await state.markRecapped(match.slug);
  await state.recordPublish();

  // 5. Announce (best-effort).
  const announces = await deps.announceFn(post, deps.siteUrl);

  return { status: "published", slug: match.slug, postSlug: post.slug, announces };
}

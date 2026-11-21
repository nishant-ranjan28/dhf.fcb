import type { NewsPost } from "@/lib/types";
import { env } from "@/lib/env";
import { blogStore } from "@/lib/blog/store";
import { autopostState } from "./state";
import { selectNewsItem, extractEntities } from "./select";
import { fetchOgImage } from "./og";
import {
  explainWordCount,
  explainDuplicateTopic,
  explainBannedPhrases,
  explainEntityCoverage,
} from "./gates";
import type { GateDiagnostics } from "./gates";
import type {
  DraftPost,
  PipelineResult,
  AnnounceResults,
  SelectedNewsItem,
} from "./types";

type GateSkipReason =
  | "gate_word_count"
  | "gate_duplicate_topic"
  | "gate_banned_phrases"
  | "gate_entity_coverage";

// Entity coverage is a soft signal: the headline extractor is heuristic, and
// an LLM omitting one name does not make an otherwise good post wrong. We try
// one repair, then publish with a logged warning instead of dropping the hour.
type GateResult =
  | { ok: true; missingEntities?: string[] }
  | { ok: false; reason: GateSkipReason; diag: GateDiagnostics };
import type { GenerateResult } from "./generate";
import type { BlogPost, BlogSummary, SocialPostLink } from "@/lib/blog/types";

const DAY_CAP = 24;
const MANUAL_COOLDOWN_MS = 55 * 60 * 1000;
// Two independent triggers may fire close together (the external hourly cron
// plus the GitHub Actions schedule kept as a fallback). A short guard is enough
// to absorb a double-fire (seconds apart). Keeping it at 50 minutes used to
// suppress the *next* hourly run whenever someone did a manual test post, which
// looked exactly like "cron didn't create a blog".
const MIN_AUTOPOST_INTERVAL_MS = 10 * 60 * 1000;

export interface PipelineDeps {
  fetchNews: () => Promise<NewsPost[]>;
  generate: (
    item: SelectedNewsItem,
    opts?: { missingEntities?: string[] },
  ) => Promise<GenerateResult>;
  announceFn: (post: BlogPost, siteUrl: string) => Promise<AnnounceResults>;
  siteUrl: string;
}

export async function runPipeline(deps: PipelineDeps): Promise<PipelineResult> {
  if (!env.autopostEnabled) {
    return { status: "skipped", reason: "disabled" };
  }

  const state = autopostState();

  if (await state.dayCapReached(DAY_CAP)) {
    await state.recordSkip("day_cap_reached");
    return { status: "skipped", reason: "day_cap_reached" };
  }

  // Cooldowns:
  //   - a human post within 55 min blocks autoposts (manual_cooldown);
  //   - an autopost within 10 min blocks the next one (min_interval). This is
  //     what lets the external cron and the GitHub schedule coexist without
  //     double-publishing, without suppressing the next hourly run.
  const recentNewest = await blogStore().list({ limit: 1 });
  if (recentNewest.length > 0) {
    const newest = recentNewest[0];
    const age = Date.now() - +new Date(newest.createdAt);
    const isAutopost = newest.author === "BarcaPulse Auto";
    if (!isAutopost && age < MANUAL_COOLDOWN_MS) {
      await state.recordSkip("manual_cooldown");
      return { status: "skipped", reason: "manual_cooldown" };
    }
    if (isAutopost && age < MIN_AUTOPOST_INTERVAL_MS) {
      await state.recordSkip("min_interval");
      return { status: "skipped", reason: "min_interval" };
    }
  }

  // 1. Select
  const items = await deps.fetchNews();
  const recentEntities = await state.recentEntities(7);
  const selected = selectNewsItem(items, { recentEntities, excludeSources: [] });
  if (!selected) {
    await state.recordSkip("no_eligible_news");
    return { status: "skipped", reason: "no_eligible_news" };
  }

  // 2. Generate
  await state.recordGenerated();
  const gen = await deps.generate(selected);
  if (!gen.ok) {
    await state.recordSkip(gen.reason);
    return { status: "skipped", reason: gen.reason };
  }
  let draft: DraftPost = gen.draft;

  // 3. Quality gates
  // Fetch a wider window for the duplicate-topic Jaccard check than the
  // single-post cooldown query. Filter to the last 7 days.
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const recentForDupe = (await blogStore().list({ limit: 50 })).filter(
    (p) => +new Date(p.createdAt) >= sevenDaysAgo,
  );
  let gateResult = runGates({ draft, item: selected, recent: recentForDupe });
  if (gateResult.ok && gateResult.missingEntities?.length) {
    // The LLM occasionally leaves one headline name out of an otherwise good
    // post. Ask it once more with the missing names called out explicitly.
    // This costs one extra generation only on the rare failing draft.
    const missing = gateResult.missingEntities;
    const repaired = await deps.generate(selected, { missingEntities: missing });
    console.warn(
      JSON.stringify({ kind: "autopost", repairOk: repaired.ok, missing, reason: repaired.ok ? undefined : repaired.reason }),
    );
    if (repaired.ok) {
      const repairedGates = runGates({
        draft: repaired.draft,
        item: selected,
        recent: recentForDupe,
      });
      if (!repairedGates.ok) {
        // A real gate (word count / banned phrase / duplicate) failed on the
        // repair — keep the original draft and its soft warning instead.
        console.warn(
          JSON.stringify({ kind: "autopost", repairRejected: repairedGates.reason }),
        );
      } else if ((repairedGates.missingEntities?.length ?? 0) < missing.length) {
        draft = repaired.draft;
        gateResult = repairedGates;
        console.log(
          JSON.stringify({ kind: "autopost", repairedEntities: missing, slugCandidate: draft.title }),
        );
      }
    }
  }
  if (gateResult.ok && gateResult.missingEntities?.length) {
    // Never skip the hour over a soft entity mismatch. Log it so the dashboard
    // / Vercel logs still show the quality signal without losing a publish.
    console.warn(
      JSON.stringify({
        kind: "autopost",
        entityCoverageWarning: gateResult.missingEntities,
        slugCandidate: draft.title,
      }),
    );
    gateResult = { ok: true };
  }
  if (!gateResult.ok) {
    await state.recordSkip(gateResult.reason);
    return { status: "skipped", reason: gateResult.reason, diagnostics: gateResult.diag };
  }

  // 4. Persist
  // Attribution. We don't carry the publisher name on NewsPost, so we use the
  // article headline as the link text — reads naturally as "Source: <headline>".
  const attribution = selected.source.link
    ? `\n\n*Source: [${selected.source.title}](${selected.source.link})*`
    : "";
  // Best-effort OG image lookup. Failures (timeout, no meta) mean no cover,
  // not a publish failure.
  const coverImage = selected.source.link
    ? (await fetchOgImage(selected.source.link)) ?? undefined
    : undefined;
  const post = await blogStore().create({
    title: draft.title,
    body: draft.body + attribution,
    excerpt: draft.excerpt,
    tags: draft.tags,
    coverImage,
    author: "BarcaPulse Auto",
  });
  await state.recordPublish({ provider: draft.provider });
  await state.recordEntities(selected.entities);

  // 5. Announce (best-effort)
  const announces = await deps.announceFn(post, deps.siteUrl);

  // Store the successful announcement permalinks so the article can show
  // real, story-specific social cards. This is cosmetic: a store failure must
  // never turn an already-published post into a failed run.
  const socialPosts = socialPostsFromAnnounces(announces.postUrls);
  if (socialPosts.length > 0) {
    try {
      await blogStore().updateSocialPosts(post.slug, socialPosts);
    } catch (err) {
      console.warn(
        JSON.stringify({
          kind: "autopost",
          socialPostsSaveFailed: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return { status: "published", slug: post.slug, provider: draft.provider, announces };
}

/** Platform permalinks we can render as a social card on the article page. */
function socialPostsFromAnnounces(
  urls: AnnounceResults["postUrls"],
): SocialPostLink[] {
  if (!urls) return [];
  const platforms = {
    facebook: "facebook",
    bluesky: "bluesky",
    mastodon: "mastodon",
    threads: "threads",
  } as const;
  const posts: SocialPostLink[] = [];
  for (const [channel, platform] of Object.entries(platforms)) {
    const url = urls[channel as keyof typeof platforms];
    if (url) posts.push({ platform, url });
  }
  return posts;
}

function runGates(args: {
  draft: DraftPost;
  item: SelectedNewsItem;
  recent: BlogSummary[];
}): GateResult {
  const wc = explainWordCount(args.draft.body);
  if (!wc.ok) {
    return { ok: false, reason: "gate_word_count", diag: { wordCount: wc.count } };
  }
  const banned = explainBannedPhrases(args.draft.body);
  if (banned !== null) {
    return { ok: false, reason: "gate_banned_phrases", diag: { bannedPhrase: banned } };
  }
  // Soft signal only — surfaced to the caller as a warning, never a skip.
  const cov = explainEntityCoverage({ entities: args.item.entities, body: args.draft.body });
  const missingEntities = cov.ok ? undefined : cov.missing;
  const titleEntities = extractEntities(args.draft.title).map((s) => s.toLowerCase());
  // recentEntities=[] is intentional: selectNewsItem already rejects items
  // whose entities overlap with state.recentEntities(7d), so by this point the
  // entity-overlap check would be a no-op. We're only using the Jaccard
  // title-similarity check from this gate.
  const dupe = explainDuplicateTopic({
    newTitle: args.draft.title,
    recentTitles: args.recent.map((p) => p.title),
    newEntities: titleEntities,
    recentEntities: [],
  });
  if (!dupe.ok) {
    return {
      ok: false,
      reason: "gate_duplicate_topic",
      diag: dupe.duplicateOf ? { duplicateOf: dupe.duplicateOf } : {},
    };
  }
  return { ok: true, missingEntities };
}

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

type GateResult = { ok: true } | { ok: false; reason: GateSkipReason; diag: GateDiagnostics };
import type { GenerateResult } from "./generate";
import type { BlogPost } from "@/lib/blog/types";

const DAY_CAP = 24;
const MANUAL_COOLDOWN_MS = 55 * 60 * 1000;

export interface PipelineDeps {
  fetchNews: () => Promise<NewsPost[]>;
  generate: (item: SelectedNewsItem) => Promise<GenerateResult>;
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

  // Manual cooldown: don't auto-post if a human posted within the last 55 min.
  // Prior autoposts (author === "BarcaPulse Auto") are excluded so consecutive
  // autoposts don't trip each other's cooldown when cron drifts.
  const recentNewest = await blogStore().list({ limit: 1 });
  if (recentNewest.length > 0 && recentNewest[0].author !== "BarcaPulse Auto") {
    const age = Date.now() - +new Date(recentNewest[0].createdAt);
    if (age < MANUAL_COOLDOWN_MS) {
      await state.recordSkip("manual_cooldown");
      return { status: "skipped", reason: "manual_cooldown" };
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
  const draft: DraftPost = gen.draft;

  // 3. Quality gates
  // Fetch a wider window for the duplicate-topic Jaccard check than the
  // single-post cooldown query. Filter to the last 7 days.
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const recentForDupe = (await blogStore().list({ limit: 50 })).filter(
    (p) => +new Date(p.createdAt) >= sevenDaysAgo,
  );
  const gateResult = runGates({ draft, item: selected, recent: recentForDupe });
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

  return { status: "published", slug: post.slug, provider: draft.provider, announces };
}

function runGates(args: {
  draft: DraftPost;
  item: SelectedNewsItem;
  recent: BlogPost[];
}): GateResult {
  const wc = explainWordCount(args.draft.body);
  if (!wc.ok) {
    return { ok: false, reason: "gate_word_count", diag: { wordCount: wc.count } };
  }
  const banned = explainBannedPhrases(args.draft.body);
  if (banned !== null) {
    return { ok: false, reason: "gate_banned_phrases", diag: { bannedPhrase: banned } };
  }
  const cov = explainEntityCoverage({ entities: args.item.entities, body: args.draft.body });
  if (!cov.ok) {
    return { ok: false, reason: "gate_entity_coverage", diag: { missingEntities: cov.missing } };
  }
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
  return { ok: true };
}

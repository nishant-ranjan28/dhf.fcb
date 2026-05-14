import type { NewsPost } from "@/lib/types";
import { env } from "@/lib/env";
import { blogStore } from "@/lib/blog/store";
import { autopostState } from "./state";
import { selectNewsItem, extractEntities } from "./select";
import {
  wordCountGate,
  duplicateTopicGate,
  bannedPhrasesGate,
  entityCoverageGate,
} from "./gates";
import type {
  DraftPost,
  PipelineResult,
  AnnounceResults,
  SelectedNewsItem,
} from "./types";
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
  const recent = await blogStore().list({ limit: 1 });
  if (recent.length > 0 && recent[0].author !== "BarcaPulse Auto") {
    const age = Date.now() - +new Date(recent[0].createdAt);
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
  const gateResult = runGates({ draft, item: selected, recent });
  if (gateResult !== "ok") {
    await state.recordSkip(gateResult);
    return { status: "skipped", reason: gateResult };
  }

  // 4. Persist
  // Attribution. We don't carry the publisher name on NewsPost, so we use the
  // article headline as the link text — reads naturally as "Source: <headline>".
  const attribution = selected.source.link
    ? `\n\n*Source: [${selected.source.title}](${selected.source.link})*`
    : "";
  const post = await blogStore().create({
    title: draft.title,
    body: draft.body + attribution,
    excerpt: draft.excerpt,
    tags: draft.tags,
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
}): "ok" | "gate_word_count" | "gate_duplicate_topic" | "gate_banned_phrases" | "gate_entity_coverage" {
  if (!wordCountGate(args.draft.body)) return "gate_word_count";
  if (!bannedPhrasesGate(args.draft.body)) return "gate_banned_phrases";
  if (!entityCoverageGate({ entities: args.item.entities, body: args.draft.body }))
    return "gate_entity_coverage";
  const titleEntities = extractEntities(args.draft.title).map((s) => s.toLowerCase());
  // recentEntities=[] is intentional: selectNewsItem already rejects items
  // whose entities overlap with state.recentEntities(7d), so by this point the
  // entity-overlap check would be a no-op. We're only using the Jaccard
  // title-similarity check from this gate.
  const dupe = duplicateTopicGate({
    newTitle: args.draft.title,
    recentTitles: args.recent.map((p) => p.title),
    newEntities: titleEntities,
    recentEntities: [],
  });
  if (!dupe) return "gate_duplicate_topic";
  return "ok";
}

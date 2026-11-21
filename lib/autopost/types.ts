import type { NewsPost } from "@/lib/types";
import type { BlogPostInput } from "@/lib/blog/types";
import type { GateDiagnostics } from "./gates";

/** A news item the pipeline has chosen to write about, plus the entities
 *  we extracted from it for duplicate-detection. */
export interface SelectedNewsItem {
  source: NewsPost;
  /** Lower-case named entities extracted from the headline (player names,
   *  club names). Used by the duplicate-topic gate and recent-topics state. */
  entities: string[];
}

/** Output of the LLM step. Not yet persisted; gates may still reject it. */
export interface DraftPost extends BlogPostInput {
  title: string;
  body: string;
  excerpt: string;
  tags: string[];
  /** Which provider produced this draft. Recorded in stats. */
  provider: "groq" | "openrouter";
}

/** Reasons a stage can short-circuit the pipeline. Stable strings — they
 *  appear in logs and the admin dashboard. */
export type SkipReason =
  | "disabled"
  | "no_eligible_news"
  | "day_cap_reached"
  | "manual_cooldown"
  | "min_interval"
  | "all_providers_failed"
  | "quota"
  | "gate_word_count"
  | "gate_duplicate_topic"
  | "gate_banned_phrases"
  | "gate_entity_coverage";

export type PipelineResult =
  | { status: "published"; slug: string; provider: "groq" | "openrouter"; announces: AnnounceResults }
  | { status: "skipped"; reason: SkipReason; diagnostics?: GateDiagnostics; detail?: string }
  | { status: "error"; error: string };

export type AnnounceChannel =
  | "telegram"
  | "facebook"
  | "indexnow"
  | "x"
  | "bluesky"
  | "mastodon"
  | "threads"
  | "reddit";

export interface AnnounceResults {
  telegram: "ok" | "err" | "skipped";
  facebook: "ok" | "err" | "skipped";
  indexnow: "ok" | "err" | "skipped";
  x: "ok" | "err" | "skipped";
  bluesky: "ok" | "err" | "skipped";
  mastodon: "ok" | "err" | "skipped";
  threads: "ok" | "err" | "skipped";
  reddit: "ok" | "err" | "skipped";
  /** Provider error text for any channel that returned "err". Kept inline so
   *  the cron ack / lastRun shows *why* a platform failed (e.g. an expired
   *  Facebook token) without digging through Vercel logs. */
  errors?: Partial<Record<AnnounceChannel, string>>;
  /** Public permalinks from successful announcements. The pipeline stores
   *  these on the post so the article can show related social cards. */
  postUrls?: Partial<Record<AnnounceChannel, string>>;
}

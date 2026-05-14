import type { NewsPost } from "@/lib/types";
import type { BlogPostInput } from "@/lib/blog/types";

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
  provider: "gemini" | "groq";
}

/** Reasons a stage can short-circuit the pipeline. Stable strings — they
 *  appear in logs and the admin dashboard. */
export type SkipReason =
  | "disabled"
  | "no_eligible_news"
  | "day_cap_reached"
  | "manual_cooldown"
  | "all_providers_failed"
  | "quota"
  | "gate_word_count"
  | "gate_duplicate_topic"
  | "gate_banned_phrases"
  | "gate_entity_coverage";

export type PipelineResult =
  | { status: "published"; slug: string; provider: "gemini" | "groq"; announces: AnnounceResults }
  | { status: "skipped"; reason: SkipReason }
  | { status: "error"; error: string };

export interface AnnounceResults {
  telegram: "ok" | "err" | "skipped";
  facebook: "ok" | "err" | "skipped";
}

import { getMatchBySlug } from "@/lib/football";
import { predictionsStore } from "./store";

/** Settle one match's predictions if it has finished and isn't settled yet. */
export async function settleIfFinished(slug: string): Promise<void> {
  const store = predictionsStore();
  if (await store.isSettled(slug)) return;
  const match = await getMatchBySlug(slug);
  if (match && match.status === "FT") {
    await store.settleMatch(slug, { home: match.scoreHome, away: match.scoreAway });
  }
}

/** Settle every predicted match that has finished. Cheap: only walks slugs
 *  that actually received predictions. Idempotent via the store's settled set. */
export async function settleAllPending(): Promise<void> {
  const store = predictionsStore();
  const slugs = await store.predictedMatchSlugs();
  for (const slug of slugs) {
    await settleIfFinished(slug);
  }
}

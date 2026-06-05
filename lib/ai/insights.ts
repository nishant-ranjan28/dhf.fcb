import { Redis } from "@upstash/redis";
import type { Match } from "@/lib/types";
import { generateMatchInsights, type MatchInsights } from "./groq";

// Same dual env-var detection as the other stores (see lib/blog/store.ts).
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

// AI generation is slow + metered, so we cache aggressively. The cache key
// includes a "state hash" so a live match regenerates when the score or the
// set of events changes — but NOT every minute (the clock is excluded).
const TTL_SECONDS = 60 * 60; // 1h; state changes bust the key sooner anyway.

// Daily counter of fresh (uncached) AI generations — surfaced on the admin
// dashboard so the AI spend/volume is visible.
const COUNT_KEY = (ymd: string) => `ai:insights:count:${ymd}`;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const memoryCounts = new Map<string, number>();

/** Fingerprint of the match facts that should trigger a fresh generation. */
export function insightsStateHash(match: Match): string {
  return `${match.status}:${match.scoreHome}-${match.scoreAway}:${match.events.length}`;
}

function cacheKey(match: Match): string {
  return `ai:insights:${match.slug}:${insightsStateHash(match)}`;
}

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis === undefined) {
    redis = REDIS_URL && REDIS_TOKEN ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN }) : null;
  }
  return redis;
}

// Per-instance fallback when Redis isn't configured (local dev).
const memory = new Map<string, { value: MatchInsights; expires: number }>();

/**
 * Return cached AI insights for a match, generating + caching on a miss.
 * Returns null when AI is unconfigured or generation fails — callers treat
 * insights as optional enhancement.
 */
export async function getMatchInsights(match: Match): Promise<MatchInsights | null> {
  const key = cacheKey(match);
  const client = getRedis();

  if (client) {
    const hit = await client.get<MatchInsights>(key).catch(() => null);
    if (hit) return hit;
  } else {
    const hit = memory.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
  }

  const fresh = await generateMatchInsights(match);
  if (!fresh) return null;

  if (client) {
    await client.set(key, fresh, { ex: TTL_SECONDS }).catch(() => {});
    const ck = COUNT_KEY(ymd(new Date()));
    const n = await client.incr(ck).catch(() => 0);
    if (n === 1) await client.expire(ck, 60 * 60 * 24 * 30).catch(() => {});
  } else {
    memory.set(key, { value: fresh, expires: Date.now() + TTL_SECONDS * 1000 });
    const k = ymd(new Date());
    memoryCounts.set(k, (memoryCounts.get(k) ?? 0) + 1);
  }
  return fresh;
}

/** Number of fresh AI insight generations recorded today. */
export async function insightsCountToday(): Promise<number> {
  const client = getRedis();
  const k = ymd(new Date());
  if (client) return Number(await client.get<number>(COUNT_KEY(k)).catch(() => 0)) || 0;
  return memoryCounts.get(k) ?? 0;
}

export function _resetInsightsCache(): void {
  redis = undefined;
  memory.clear();
  memoryCounts.clear();
}

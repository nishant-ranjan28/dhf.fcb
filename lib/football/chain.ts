import { HttpError } from "@/lib/http";
import type { Match } from "@/lib/types";

export type Provider = () => Promise<Match[]>;

export interface ProviderInput {
  name: string;
  fn: Provider;
}

export interface ChainOpts {
  /** Cooldown after an HTTP 429 response. Default 90s — football-data.org's
   *  free tier has a 60s rolling window, so 90s gives margin for clock drift. */
  cooldownMs?: number;
}

interface ProviderEntry extends ProviderInput {
  cooldownUntil: number;
}

const DEFAULT_COOLDOWN_MS = 90_000;

/**
 * Walks a list of match providers in order. The first provider that returns a
 * non-empty array wins. Providers that throw are logged and skipped; if a
 * provider throws an HttpError with status 429, it is parked for `cooldownMs`
 * so we don't keep hammering a rate-limited upstream during the same window.
 *
 * Cooldown state is per-process. On multi-instance deploys (Vercel etc.)
 * each instance tracks its own cooldown — the upstream cache layer
 * (`lib/cache.ts`) absorbs most of this, but a thundering-herd cache miss
 * across N lambdas can still trip 429 N times before each one cools down.
 * HMR in dev resets the chain and its cooldowns on file save.
 */
export class ProviderChain {
  private entries: ProviderEntry[];
  private cooldownMs: number;

  constructor(providers: ProviderInput[], opts: ChainOpts = {}) {
    this.entries = providers.map((p) => ({ ...p, cooldownUntil: 0 }));
    this.cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  async getAll(): Promise<Match[]> {
    const now = Date.now();
    for (const entry of this.entries) {
      if (entry.cooldownUntil > now) continue;
      try {
        const out = await entry.fn();
        if (out.length > 0) return out;
      } catch (err) {
        if (err instanceof HttpError && err.status === 429) {
          entry.cooldownUntil = now + this.cooldownMs;
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[provider:${entry.name}] ${msg}`);
      }
    }
    return [];
  }
}

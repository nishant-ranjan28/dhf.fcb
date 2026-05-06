import { HttpError } from "@/lib/http";
import type { Match } from "@/lib/types";

export type Provider = () => Promise<Match[]>;

interface ProviderEntry {
  name: string;
  fn: Provider;
  cooldownUntil: number; // epoch ms; 0 means available
}

const COOLDOWN_MS = 60_000;

/**
 * Walks a list of match providers in order. The first provider that returns a
 * non-empty array wins. Providers that throw are logged and skipped; if a
 * provider throws an HttpError with status 429, it is parked for 60s so we
 * don't keep hammering a rate-limited upstream during the same window.
 */
export class ProviderChain {
  private entries: ProviderEntry[];

  constructor(providers: Array<{ name: string; fn: Provider }>) {
    this.entries = providers.map((p) => ({ ...p, cooldownUntil: 0 }));
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
          entry.cooldownUntil = now + COOLDOWN_MS;
        }
        console.warn(`[provider:${entry.name}] ${(err as Error).message}`);
      }
    }
    return [];
  }
}

export interface QuotaOpts {
  limit: number;
  windowMs: number;
}

/**
 * Sliding-window quota counter. Instantiate ONCE per process and share —
 * each `new Quota()` has independent state, so per-request instantiation
 * silently disables the limit.
 *
 * In-memory only. On multi-instance deploys (Vercel, etc.) each instance
 * holds its own counter, so the effective cap is `limit × instances`. Set
 * `limit` conservatively or back this with Redis/KV in front of upstream
 * APIs that bill per-key (e.g. API-Football's 100 req/day).
 */
export class Quota {
  private hits: number[] = [];
  constructor(private opts: QuotaOpts) {}

  private prune() {
    const cutoff = Date.now() - this.opts.windowMs;
    while (this.hits.length && this.hits[0] < cutoff) this.hits.shift();
  }

  tryConsume(): boolean {
    this.prune();
    if (this.hits.length >= this.opts.limit) return false;
    this.hits.push(Date.now());
    return true;
  }

  remaining(): number {
    this.prune();
    return Math.max(0, this.opts.limit - this.hits.length);
  }

  /** Clear all recorded hits — primarily for tests. */
  reset(): void {
    this.hits.length = 0;
  }
}

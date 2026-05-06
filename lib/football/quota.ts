export interface QuotaOpts {
  limit: number;
  windowMs: number;
}

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
}

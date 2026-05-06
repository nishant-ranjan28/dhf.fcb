export interface RateLimitOpts {
  maxPerWindow: number;
  windowMs: number;
}

export function rateLimited({ maxPerWindow, windowMs }: RateLimitOpts) {
  const timestamps: number[] = [];
  const queue: Array<() => void> = [];

  function tryDrain() {
    const now = Date.now();
    while (timestamps.length && now - timestamps[0] > windowMs) timestamps.shift();
    while (timestamps.length < maxPerWindow && queue.length) {
      const job = queue.shift()!;
      timestamps.push(Date.now());
      job();
    }
    if (queue.length) {
      const wait = windowMs - (now - timestamps[0]);
      setTimeout(tryDrain, Math.max(wait, 5));
    }
  }

  return async function <T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => fn().then(resolve, reject));
      tryDrain();
    });
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    public body?: string,
  ) {
    super(`HTTP ${status} from ${url}`);
    this.name = "HttpError";
  }
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpError(res.status, url, body);
  }
  return (await res.json()) as T;
}

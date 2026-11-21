// Single Redis client factory for every Upstash-backed module.
//
// Normally this returns the real @upstash/redis client. If a command fails
// (quota throttle, auth error, network outage) the client permanently fails
// over to GitHub-backed JSON storage so publishing and page renders keep
// working. Set STORAGE_BACKEND=github to skip the failing attempt entirely.

import { Redis } from "@upstash/redis";
import { githubDocStore } from "./github";
import { makeRedisShim } from "./redis-shim";

export type { Redis };

let githubClient: ReturnType<typeof makeRedisShim> | null = null;

function github(): ReturnType<typeof makeRedisShim> {
  if (!githubClient) githubClient = makeRedisShim(githubDocStore());
  return githubClient;
}

/** Wrap the real client so the first Redis failure switches all calls to GitHub. */
export function resilient(
  real: Redis,
  fallbackClient: ReturnType<typeof makeRedisShim> = github(),
): Redis {
  let failedOver = false;
  return new Proxy(real, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        if (!failedOver) {
          try {
            return await (value as (...a: unknown[]) => unknown).apply(target, args);
          } catch (error) {
            failedOver = true;
            console.warn(
              JSON.stringify({
                kind: "storage-failover",
                reason: error instanceof Error ? error.message : String(error),
                backend: "github",
              }),
            );
          }
        }
        const fallback = (fallbackClient as unknown as Record<string, unknown>)[
          String(prop)
        ];
        if (typeof fallback !== "function") {
          throw new Error(`GitHub storage does not implement Redis.${String(prop)}`);
        }
        return (fallback as (...a: unknown[]) => unknown).apply(fallbackClient, args);
      };
    },
  }) as Redis;
}

export function createRedis(opts: {
  url?: string;
  token?: string;
  /** High-frequency callers (view counters) must not create a commit per view. */
  noFallback?: boolean;
}): Redis {
  if (opts.noFallback && opts.url && opts.token) {
    return new Redis({ url: opts.url, token: opts.token });
  }
  if (process.env.STORAGE_BACKEND?.trim() === "github") {
    return github() as unknown as Redis;
  }
  if (!opts.url || !opts.token) {
    throw new Error("Redis URL and token are required");
  }
  return resilient(new Redis({ url: opts.url, token: opts.token }));
}

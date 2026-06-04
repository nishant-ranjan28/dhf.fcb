import { Redis } from "@upstash/redis";

// Same dual env-var detection as lib/blog/store.ts — see the comment there.
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const COUNTS_KEY = (pollId: string) => `poll:${pollId}:counts`;
const VOTERS_KEY = (pollId: string) => `poll:${pollId}:voters`;

export interface VoteResult {
  /** True when this voter id had already voted; no count was changed. */
  alreadyVoted: boolean;
  counts: Record<string, number>;
}

interface PollStore {
  /** Current counts for the given option ids (missing options report 0). */
  results(pollId: string, optionIds: string[]): Promise<Record<string, number>>;
  /** Record a vote, deduped by voterId. Returns whether it was a repeat. */
  vote(pollId: string, optionId: string, voterId: string): Promise<VoteResult>;
  _reset?(): Promise<void>;
}

function zeroed(optionIds: string[]): Record<string, number> {
  return Object.fromEntries(optionIds.map((id) => [id, 0]));
}

// ---------- Upstash Redis-backed store ----------

function makeRedisStore(client: Redis): PollStore {
  async function readCounts(pollId: string, optionIds: string[]) {
    const raw = (await client.hgetall<Record<string, number | string>>(
      COUNTS_KEY(pollId),
    )) ?? {};
    const out = zeroed(optionIds);
    for (const id of optionIds) out[id] = Number(raw[id]) || 0;
    return out;
  }
  return {
    results: readCounts,
    async vote(pollId, optionId, voterId) {
      // SADD returns 1 for a new member, 0 if it was already present — our
      // atomic "has this device voted?" guard.
      const added = await client.sadd(VOTERS_KEY(pollId), voterId);
      if (added === 0) {
        return { alreadyVoted: true, counts: await readCounts(pollId, [optionId]) };
      }
      await client.hincrby(COUNTS_KEY(pollId), optionId, 1);
      return { alreadyVoted: false, counts: await readCounts(pollId, [optionId]) };
    },
  };
}

// ---------- In-memory dev fallback ----------

function makeMemoryStore(): PollStore {
  const counts = new Map<string, Map<string, number>>();
  const voters = new Map<string, Set<string>>();

  const countsFor = (pollId: string) => {
    let c = counts.get(pollId);
    if (!c) counts.set(pollId, (c = new Map()));
    return c;
  };
  const votersFor = (pollId: string) => {
    let v = voters.get(pollId);
    if (!v) voters.set(pollId, (v = new Set()));
    return v;
  };
  const read = (pollId: string, optionIds: string[]) => {
    const c = countsFor(pollId);
    const out = zeroed(optionIds);
    for (const id of optionIds) out[id] = c.get(id) ?? 0;
    return out;
  };

  return {
    async results(pollId, optionIds) {
      return read(pollId, optionIds);
    },
    async vote(pollId, optionId, voterId) {
      const v = votersFor(pollId);
      if (v.has(voterId)) {
        return { alreadyVoted: true, counts: read(pollId, [optionId]) };
      }
      v.add(voterId);
      const c = countsFor(pollId);
      c.set(optionId, (c.get(optionId) ?? 0) + 1);
      return { alreadyVoted: false, counts: read(pollId, [optionId]) };
    },
    async _reset() {
      counts.clear();
      voters.clear();
    },
  };
}

// ---------- Singleton ----------

let storeInstance: PollStore | null = null;

export function pollStore(): PollStore {
  if (storeInstance) return storeInstance;
  if (REDIS_URL && REDIS_TOKEN) {
    storeInstance = makeRedisStore(new Redis({ url: REDIS_URL, token: REDIS_TOKEN }));
  } else {
    storeInstance = makeMemoryStore();
  }
  return storeInstance;
}

export function _resetPollStore(): void {
  storeInstance = null;
}

import { Redis } from "@upstash/redis";
import { scorePrediction, type PredictionOutcome, type Scoreline } from "./scoring";

// Same dual env-var detection as lib/blog/store.ts.
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const MATCH_KEY = (slug: string) => `pred:match:${slug}`; // hash deviceId -> Prediction JSON
const MATCHES_KEY = "pred:matches"; // set of slugs that have predictions
const SETTLED_KEY = "pred:settled"; // set of settled slugs
const BOARD_KEY = "pred:leaderboard"; // sorted set deviceId -> points
const NAMES_KEY = "pred:names"; // hash deviceId -> display name

export interface Prediction {
  home: number;
  away: number;
  name: string;
  ts: number;
  /** Set once the match is settled. */
  points?: number;
  outcome?: PredictionOutcome;
}

export interface LeaderboardEntry {
  deviceId: string;
  name: string;
  points: number;
  rank: number;
}

export interface UserStats {
  points: number;
  rank: number | null;
  name: string | null;
}

export interface PredictionsStats {
  /** Distinct players on the leaderboard. */
  players: number;
  /** Total predictions cast across all matches. */
  predictions: number;
  /** Matches that have been settled. */
  settledMatches: number;
}

export interface SettleResult {
  settled: boolean;
  scored: number;
}

export interface PredictionsStore {
  predict(slug: string, deviceId: string, name: string, home: number, away: number): Promise<Prediction>;
  getPrediction(slug: string, deviceId: string): Promise<Prediction | null>;
  getMatchPredictions(slug: string): Promise<Prediction[]>;
  isSettled(slug: string): Promise<boolean>;
  settleMatch(slug: string, final: Scoreline): Promise<SettleResult>;
  predictedMatchSlugs(): Promise<string[]>;
  leaderboard(limit: number): Promise<LeaderboardEntry[]>;
  userStats(deviceId: string): Promise<UserStats>;
  stats(): Promise<PredictionsStats>;
  _reset?(): Promise<void>;
}

function buildPrediction(name: string, home: number, away: number): Prediction {
  return { home, away, name: name.trim().slice(0, 24) || "Anon", ts: Date.now() };
}

// ---------- Upstash Redis-backed store ----------

function makeRedisStore(client: Redis): PredictionsStore {
  async function readAll(slug: string): Promise<Record<string, Prediction>> {
    const raw = (await client.hgetall<Record<string, string>>(MATCH_KEY(slug))) ?? {};
    const out: Record<string, Prediction> = {};
    for (const [dev, val] of Object.entries(raw)) {
      out[dev] = typeof val === "string" ? (JSON.parse(val) as Prediction) : (val as Prediction);
    }
    return out;
  }
  return {
    async predict(slug, deviceId, name, home, away) {
      const pred = buildPrediction(name, home, away);
      await Promise.all([
        client.hset(MATCH_KEY(slug), { [deviceId]: JSON.stringify(pred) }),
        client.sadd(MATCHES_KEY, slug),
        client.hset(NAMES_KEY, { [deviceId]: pred.name }),
      ]);
      return pred;
    },
    async getPrediction(slug, deviceId) {
      const val = await client.hget<string>(MATCH_KEY(slug), deviceId);
      if (!val) return null;
      return typeof val === "string" ? (JSON.parse(val) as Prediction) : (val as Prediction);
    },
    async getMatchPredictions(slug) {
      return Object.values(await readAll(slug));
    },
    async isSettled(slug) {
      return (await client.sismember(SETTLED_KEY, slug)) === 1;
    },
    async settleMatch(slug, final) {
      // Atomic claim: SADD returns 1 only for the first settler.
      const claimed = await client.sadd(SETTLED_KEY, slug);
      if (claimed === 0) return { settled: false, scored: 0 };
      const preds = await readAll(slug);
      const entries = Object.entries(preds);
      for (const [deviceId, pred] of entries) {
        const { points, outcome } = scorePrediction(pred, final);
        await client.hset(MATCH_KEY(slug), {
          [deviceId]: JSON.stringify({ ...pred, points, outcome }),
        });
        // zincrby by 0 still creates the member, so every player is ranked.
        await client.zincrby(BOARD_KEY, points, deviceId);
      }
      return { settled: true, scored: entries.length };
    },
    async predictedMatchSlugs() {
      return (await client.smembers(MATCHES_KEY)) as string[];
    },
    async leaderboard(limit) {
      const raw = (await client.zrange(BOARD_KEY, 0, limit - 1, {
        rev: true,
        withScores: true,
      })) as (string | number)[];
      const out: LeaderboardEntry[] = [];
      const ids: string[] = [];
      for (let i = 0; i < raw.length; i += 2) ids.push(String(raw[i]));
      const names = ids.length
        ? ((await client.hmget<Record<string, string>>(NAMES_KEY, ...ids)) ?? {})
        : {};
      for (let i = 0; i < raw.length; i += 2) {
        const deviceId = String(raw[i]);
        out.push({
          deviceId,
          name: names[deviceId] ?? "Anon",
          points: Number(raw[i + 1]) || 0,
          rank: i / 2 + 1,
        });
      }
      return out;
    },
    async userStats(deviceId) {
      const [score, rank, name] = await Promise.all([
        client.zscore(BOARD_KEY, deviceId),
        client.zrevrank(BOARD_KEY, deviceId),
        client.hget<string>(NAMES_KEY, deviceId),
      ]);
      return {
        points: Number(score) || 0,
        rank: rank === null || rank === undefined ? null : Number(rank) + 1,
        name: name ?? null,
      };
    },
    async stats() {
      const slugs = (await client.smembers(MATCHES_KEY)) as string[];
      const lens = await Promise.all(slugs.map((s) => client.hlen(MATCH_KEY(s))));
      const [players, settledMatches] = await Promise.all([
        client.zcard(BOARD_KEY),
        client.scard(SETTLED_KEY),
      ]);
      return {
        players: Number(players) || 0,
        predictions: lens.reduce((a, b) => a + (Number(b) || 0), 0),
        settledMatches: Number(settledMatches) || 0,
      };
    },
  };
}

// ---------- In-memory dev fallback ----------

function makeMemoryStore(): PredictionsStore {
  const matches = new Map<string, Map<string, Prediction>>();
  const names = new Map<string, string>();
  const settled = new Set<string>();
  const board = new Map<string, number>();

  const matchMap = (slug: string) => {
    let m = matches.get(slug);
    if (!m) matches.set(slug, (m = new Map()));
    return m;
  };
  const sortedBoard = () =>
    [...board.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return {
    async predict(slug, deviceId, name, home, away) {
      const pred = buildPrediction(name, home, away);
      matchMap(slug).set(deviceId, pred);
      names.set(deviceId, pred.name);
      return pred;
    },
    async getPrediction(slug, deviceId) {
      return matchMap(slug).get(deviceId) ?? null;
    },
    async getMatchPredictions(slug) {
      return [...matchMap(slug).values()];
    },
    async isSettled(slug) {
      return settled.has(slug);
    },
    async settleMatch(slug, final) {
      if (settled.has(slug)) return { settled: false, scored: 0 };
      settled.add(slug);
      const m = matchMap(slug);
      for (const [deviceId, pred] of m) {
        const { points, outcome } = scorePrediction(pred, final);
        m.set(deviceId, { ...pred, points, outcome });
        board.set(deviceId, (board.get(deviceId) ?? 0) + points);
      }
      return { settled: true, scored: m.size };
    },
    async predictedMatchSlugs() {
      return [...matches.keys()];
    },
    async leaderboard(limit) {
      return sortedBoard()
        .slice(0, limit)
        .map(([deviceId, points], i) => ({
          deviceId,
          name: names.get(deviceId) ?? "Anon",
          points,
          rank: i + 1,
        }));
    },
    async userStats(deviceId) {
      if (!board.has(deviceId)) {
        return { points: 0, rank: null, name: names.get(deviceId) ?? null };
      }
      const rank = sortedBoard().findIndex(([d]) => d === deviceId) + 1;
      return { points: board.get(deviceId) ?? 0, rank, name: names.get(deviceId) ?? null };
    },
    async stats() {
      let predictions = 0;
      for (const m of matches.values()) predictions += m.size;
      return { players: board.size, predictions, settledMatches: settled.size };
    },
    async _reset() {
      matches.clear();
      names.clear();
      settled.clear();
      board.clear();
    },
  };
}

// ---------- Singleton ----------

let instance: PredictionsStore | null = null;

export function predictionsStore(): PredictionsStore {
  if (instance) return instance;
  if (REDIS_URL && REDIS_TOKEN) {
    instance = makeRedisStore(new Redis({ url: REDIS_URL, token: REDIS_TOKEN }));
  } else {
    instance = makeMemoryStore();
  }
  return instance;
}

export function _resetPredictionsStore(): void {
  instance = null;
}

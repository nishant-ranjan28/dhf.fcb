# Data Integration & Launch Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace mock data with a real, multi-source provider chain (football-data.org primary → API-Football enrichment → openfootball static fallback → mock dev fallback), swap the in-memory news store for a server-side RSS aggregator, add Server-Sent Events for live updates, and finish the production wiring (env, SEO, analytics, ads scaffolding, deploy) so the app is launch-ready.

**Architecture:**
- **Provider chain** in `lib/football/` — each provider implements the same interface (`getAllMatches`, `getMatchBySlug`). An orchestrator picks the best available provider per request, gracefully degrading when quotas are exhausted or upstream is down. Match objects are *merged* — football-data.org gives the canonical fixture/score, API-Football enriches with detailed events/stats for Barca matches only.
- **News** moves from in-memory to a **server-side RSS aggregator** with 10-min cache. Four feeds: BBC Sport, ESPN FC, Marca Barca, Mundo Deportivo. POST endpoint becomes admin-gated.
- **Real-time** uses SSE from a single server-side polling loop (one upstream fetch fans out to all connected clients), keeping us well under upstream quotas.
- **Build-time static** pre-fetches WC 2026 fixtures from `openfootball/worldcup.json` so the app still has a fixture list even if every API is down.
- **Tests:** Vitest with **fixture-based** unit tests for the mappers (no live calls in CI). One smoke test hits `/api/scores` against the dev server.

**Tech Stack:**
- Existing: Next.js 16, React 19, Tailwind 3, TypeScript strict
- Add: `vitest`, `@vitest/coverage-v8`, `fast-xml-parser`, `@vercel/analytics`
- No DB. No Redis (cache stays in-memory; interface unchanged so swap is one file).

**Out of scope (separate plan):**
- AdSense approval flow / ad network revenue ops
- Telegram bot building (we only wire the channel link in this plan)
- Push notifications
- Admin UI for news (POST endpoint stays API-only with an admin token)

---

## Setup conventions

**File paths** are relative to `/Users/nishant.ranjan/projects/barca-fifa/`.
**Commands** assume `pwd` is the project root unless stated.
**Commit message style:** `<type>: <subject>` where type ∈ {feat, fix, refactor, test, docs, chore}. Author footer is set globally per user preference — do NOT add `Co-Authored-By: Claude` lines.

---

### Task 0: Initialize git, baseline commit

**Files:**
- Modify: `.gitignore` (already exists, verify)
- Create: nothing new

**Step 1: Initialize repo**

```bash
git init
git add -A
git status   # confirm node_modules and .next are excluded by .gitignore
```

Expected: working tree shows app/, components/, lib/, package.json, etc. — but NOT node_modules/ or .next/.

**Step 2: First commit**

```bash
git commit -m "$(cat <<'EOF'
chore: initial scaffold — Next.js 16, App Router, mock data

Author: Nishant Ranjan
EOF
)"
```

Expected: commit succeeds.

---

### Task 1: Add Vitest + first smoke test

**Files:**
- Modify: `package.json` (add `vitest`, `@vitest/coverage-v8`, scripts)
- Create: `vitest.config.ts`
- Create: `tests/lib/slug.test.ts`

**Step 1: Install Vitest**

```bash
npm install -D vitest @vitest/coverage-v8
```

**Step 2: Add scripts to `package.json`**

Modify the `scripts` block:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

**Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

**Step 4: Write the failing test — `tests/lib/slug.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { matchSlug, toSlug } from "@/lib/slug";

describe("toSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(toSlug("FC Barcelona")).toBe("fc-barcelona");
  });
  it("strips diacritics", () => {
    expect(toSlug("Atlético Madrid")).toBe("atletico-madrid");
  });
});

describe("matchSlug", () => {
  it("joins teams with -vs-", () => {
    expect(matchSlug("FC Barcelona", "Real Madrid")).toBe(
      "fc-barcelona-vs-real-madrid",
    );
  });
});
```

**Step 5: Run tests**

```bash
npm test
```

> **Note added 2026-05-06 after Task 1 execution:** The plan originally expected the diacritic test to fail because the regex `/[̀-ͯ]/g` *looked* malformed in source. It isn't — byte inspection (`xxd`) shows the character class spans `cc 80` (U+0300) to `cd af` (U+036F), which is exactly the combining-diacritical-marks block. So the existing `lib/slug.ts` is correct as-is and no fix is required. The test still earns its keep as a regression guard.

**Step 6: Tests should pass (3/3)**

```bash
npm test
```

Expected: 3 passing.

**Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
test: add vitest, fix diacritic stripping in toSlug

Author: Nishant Ranjan
EOF
)"
```

---

### Task 2: Env config & validation

**Files:**
- Create: `lib/env.ts`
- Create: `tests/lib/env.test.ts`
- Modify: `.env.example` (add new keys)

**Step 1: Write the failing test — `tests/lib/env.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";

function loadEnv() {
  // Import fresh per test by clearing the module cache.
  delete (globalThis as unknown as Record<string, unknown>).__envCache;
  return import("@/lib/env").then((m) => m.env);
}

describe("env", () => {
  beforeEach(() => {
    for (const k of [
      "FOOTBALL_DATA_API_KEY",
      "API_FOOTBALL_KEY",
      "ADMIN_TOKEN",
      "NEXT_PUBLIC_TELEGRAM_URL",
    ]) {
      delete process.env[k];
    }
  });

  it("returns mock provider when no keys set", async () => {
    const env = await loadEnv();
    expect(env.provider).toBe("mock");
  });

  it("returns football-data when only FD key set", async () => {
    process.env.FOOTBALL_DATA_API_KEY = "abc";
    const env = await loadEnv();
    expect(env.provider).toBe("football-data");
    expect(env.footballDataKey).toBe("abc");
  });

  it("flags api-football enrichment when key present", async () => {
    process.env.FOOTBALL_DATA_API_KEY = "abc";
    process.env.API_FOOTBALL_KEY = "xyz";
    const env = await loadEnv();
    expect(env.apiFootballKey).toBe("xyz");
    expect(env.enrichmentEnabled).toBe(true);
  });
});
```

**Step 2: Run, confirm fail (`lib/env.ts` doesn't exist)**

```bash
npm test -- tests/lib/env.test.ts
```

**Step 3: Create `lib/env.ts`**

```ts
type ProviderName = "mock" | "football-data" | "api-football";

export interface AppEnv {
  provider: ProviderName;
  footballDataKey?: string;
  apiFootballKey?: string;
  enrichmentEnabled: boolean;
  adminToken?: string;
  telegramUrl: string;
  scoresTtlSeconds: number;
  listTtlSeconds: number;
  newsTtlSeconds: number;
}

let cached: AppEnv | null = null;

export const env: AppEnv = new Proxy({} as AppEnv, {
  get(_t, prop: keyof AppEnv) {
    if (!cached) cached = build();
    return cached[prop];
  },
});

function build(): AppEnv {
  const fd = process.env.FOOTBALL_DATA_API_KEY?.trim() || undefined;
  const af = process.env.API_FOOTBALL_KEY?.trim() || undefined;
  const provider: ProviderName = fd ? "football-data" : "mock";
  return {
    provider,
    footballDataKey: fd,
    apiFootballKey: af,
    enrichmentEnabled: Boolean(af),
    adminToken: process.env.ADMIN_TOKEN?.trim() || undefined,
    telegramUrl: process.env.NEXT_PUBLIC_TELEGRAM_URL ?? "https://t.me/",
    scoresTtlSeconds: Number(process.env.SCORES_TTL_SECONDS ?? 30),
    listTtlSeconds: Number(process.env.LIST_TTL_SECONDS ?? 60),
    newsTtlSeconds: Number(process.env.NEWS_TTL_SECONDS ?? 600),
  };
}

export function resetEnvCache(): void {
  cached = null;
}
```

**Step 4: Update env tests** — replace the dynamic-import shim with `resetEnvCache()`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env, resetEnvCache } from "@/lib/env";

beforeEach(() => {
  for (const k of ["FOOTBALL_DATA_API_KEY", "API_FOOTBALL_KEY", "ADMIN_TOKEN"]) {
    delete process.env[k];
  }
  resetEnvCache();
});

// ... assertions stay the same, but reference `env.provider` directly after setting process.env
```

**Step 5: Run tests, all pass**

```bash
npm test -- tests/lib/env.test.ts
```

**Step 6: Update `.env.example`**

Append:

```
# football-data.org — required for live data (free key)
# Sign up: https://www.football-data.org/client/register
FOOTBALL_DATA_API_KEY=

# API-Football — optional enrichment for Barca matches (free 100 req/day)
# Sign up: https://dashboard.api-football.com/register
API_FOOTBALL_KEY=

# Bearer token required for POST /api/news (any random string)
ADMIN_TOKEN=

# Cache TTLs
NEWS_TTL_SECONDS=600
```

**Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add env config layer with provider auto-detection

Author: Nishant Ranjan
EOF
)"
```

---

### Task 3: HTTP client helper with rate limiting

**Files:**
- Create: `lib/http.ts`
- Create: `tests/lib/http.test.ts`

**Step 1: Failing test — `tests/lib/http.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { rateLimited } from "@/lib/http";

describe("rateLimited", () => {
  it("queues calls beyond the per-window limit", async () => {
    const limiter = rateLimited({ maxPerWindow: 2, windowMs: 100 });
    const start = Date.now();
    await Promise.all([
      limiter(() => Promise.resolve(1)),
      limiter(() => Promise.resolve(2)),
      limiter(() => Promise.resolve(3)),
    ]);
    expect(Date.now() - start).toBeGreaterThanOrEqual(100);
  });

  it("returns the underlying value", async () => {
    const limiter = rateLimited({ maxPerWindow: 5, windowMs: 1000 });
    expect(await limiter(() => Promise.resolve("ok"))).toBe("ok");
  });
});
```

**Step 2: Run, confirm fail**

**Step 3: Create `lib/http.ts`**

```ts
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
```

**Step 4: Tests pass**

```bash
npm test -- tests/lib/http.test.ts
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add rate-limited http helper

Author: Nishant Ranjan"
```

---

### Task 4: football-data.org provider — types & mapper

**Files:**
- Create: `lib/football/providers/footballData.ts`
- Create: `tests/fixtures/football-data-matches.json` (record once)
- Create: `tests/lib/football-data.test.ts`

**Step 1: Record a fixture JSON**

Manually save a real response to `tests/fixtures/football-data-matches.json`. Until you have an API key, copy this trimmed sample:

```json
{
  "matches": [
    {
      "id": 1,
      "competition": { "code": "PD", "name": "Primera Division" },
      "utcDate": "2026-05-06T20:00:00Z",
      "status": "IN_PLAY",
      "minute": 67,
      "homeTeam": { "id": 81, "name": "FC Barcelona", "tla": "BAR", "crest": "https://crests.football-data.org/81.svg" },
      "awayTeam": { "id": 86, "name": "Real Madrid", "tla": "RMA", "crest": "https://crests.football-data.org/86.svg" },
      "score": { "fullTime": { "home": 2, "away": 1 }, "halfTime": { "home": 1, "away": 0 } },
      "venue": "Spotify Camp Nou"
    }
  ]
}
```

**Step 2: Failing test — `tests/lib/football-data.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { mapFootballDataMatches } from "@/lib/football/providers/footballData";

describe("mapFootballDataMatches", () => {
  it("maps live La Liga match into Match shape", async () => {
    const raw = JSON.parse(
      await readFile("tests/fixtures/football-data-matches.json", "utf8"),
    );
    const out = mapFootballDataMatches(raw);
    expect(out).toHaveLength(1);
    const m = out[0];
    expect(m.slug).toBe("fc-barcelona-vs-real-madrid");
    expect(m.competition).toBe("barca");
    expect(m.status).toBe("LIVE");
    expect(m.minute).toBe(67);
    expect(m.scoreHome).toBe(2);
    expect(m.scoreAway).toBe(1);
    expect(m.home.crest).toContain("crests.football-data.org/81");
  });

  it("classifies World Cup competitions as 'fifa'", () => {
    const raw = {
      matches: [
        {
          id: 2,
          competition: { code: "WC", name: "FIFA World Cup" },
          utcDate: "2026-06-12T18:00:00Z",
          status: "SCHEDULED",
          homeTeam: { id: 9, name: "Argentina", tla: "ARG" },
          awayTeam: { id: 10, name: "Brazil", tla: "BRA" },
          score: { fullTime: { home: null, away: null } },
        },
      ],
    };
    const out = mapFootballDataMatches(raw);
    expect(out[0].competition).toBe("fifa");
    expect(out[0].status).toBe("SCHED");
  });
});
```

**Step 3: Run, confirm fail**

**Step 4: Implement mapper — `lib/football/providers/footballData.ts`**

```ts
import type { Competition, Match, MatchStatus } from "@/lib/types";
import { matchSlug } from "@/lib/slug";

interface FdTeam { id: number; name: string; tla: string; crest?: string }
interface FdMatch {
  id: number;
  competition: { code: string; name: string };
  utcDate: string;
  status: "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED" | "FINISHED" | "POSTPONED";
  minute?: number;
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score: { fullTime: { home: number | null; away: number | null }; halfTime?: { home: number | null; away: number | null } };
  venue?: string;
}
interface FdResponse { matches: FdMatch[] }

const BARCA_COMPS = new Set(["PD", "CL", "SA", "BL1"]); // Liga, UCL — Barca-relevant. Treat others below.
const FIFA_COMPS = new Set(["WC"]);

function classify(code: string): Competition {
  if (FIFA_COMPS.has(code)) return "fifa";
  if (BARCA_COMPS.has(code)) return "barca";
  return "other";
}

function toStatus(s: FdMatch["status"]): MatchStatus {
  switch (s) {
    case "IN_PLAY": return "LIVE";
    case "PAUSED": return "HT";
    case "FINISHED": return "FT";
    default: return "SCHED";
  }
}

export function mapFootballDataMatches(raw: FdResponse): Match[] {
  return raw.matches.map((m) => ({
    slug: matchSlug(m.homeTeam.name, m.awayTeam.name),
    competition: classify(m.competition.code),
    competitionName: m.competition.name,
    home: { name: m.homeTeam.name, short: m.homeTeam.tla, crest: m.homeTeam.crest },
    away: { name: m.awayTeam.name, short: m.awayTeam.tla, crest: m.awayTeam.crest },
    scoreHome: m.score.fullTime.home ?? 0,
    scoreAway: m.score.fullTime.away ?? 0,
    status: toStatus(m.status),
    minute: m.minute ?? 0,
    kickoff: m.utcDate,
    venue: m.venue,
    events: [],
    stats: {
      possession: { home: 50, away: 50 },
      shots: { home: 0, away: 0 },
      shotsOnTarget: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
    },
    lineupHome: { formation: "4-3-3", starting: [] },
    lineupAway: { formation: "4-3-3", starting: [] },
  }));
}
```

**Step 5: Tests pass; commit**

```bash
npm test -- tests/lib/football-data.test.ts
git add -A
git commit -m "feat: add football-data.org match mapper

Author: Nishant Ranjan"
```

---

### Task 5: football-data.org fetcher (network layer)

**Files:**
- Modify: `lib/football/providers/footballData.ts` (add fetcher)
- Create: `tests/lib/football-data-fetch.test.ts`

**Step 1: Failing test (uses `vi.fn()` to intercept fetch)**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFootballDataMatches } from "@/lib/football/providers/footballData";

describe("fetchFootballDataMatches", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sends X-Auth-Token header and returns mapped matches", async () => {
    const json = {
      matches: [{
        id: 1, competition: { code: "PD", name: "LaLiga" },
        utcDate: "2026-05-06T20:00:00Z", status: "FINISHED",
        homeTeam: { id: 81, name: "FC Barcelona", tla: "BAR" },
        awayTeam: { id: 86, name: "Real Madrid", tla: "RMA" },
        score: { fullTime: { home: 2, away: 1 } },
      }],
    };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchFootballDataMatches({ apiKey: "test-key" });
    expect(fetchMock).toHaveBeenCalled();
    const call = fetchMock.mock.calls[0];
    expect(call[1]?.headers).toMatchObject({ "X-Auth-Token": "test-key" });
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe("fc-barcelona-vs-real-madrid");
  });

  it("throws on non-200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 429 })));
    await expect(fetchFootballDataMatches({ apiKey: "k" })).rejects.toThrow();
  });
});
```

**Step 2: Confirm fail**

**Step 3: Add fetcher (append to `lib/football/providers/footballData.ts`)**

```ts
import { fetchJson, rateLimited } from "@/lib/http";

const FD_BASE = "https://api.football-data.org/v4";
// 10 req/min on free tier per docs.
const limiter = rateLimited({ maxPerWindow: 10, windowMs: 60_000 });

export interface FdOpts { apiKey: string; competitions?: string[]; status?: string }

export async function fetchFootballDataMatches({
  apiKey,
  competitions = ["PD", "CL", "WC"],
  status,
}: FdOpts): Promise<Match[]> {
  const params = new URLSearchParams();
  params.set("competitions", competitions.join(","));
  if (status) params.set("status", status);
  const url = `${FD_BASE}/matches?${params}`;
  const json = await limiter(() =>
    fetchJson<FdResponse>(url, { headers: { "X-Auth-Token": apiKey } }),
  );
  return mapFootballDataMatches(json);
}
```

**Step 4: Pass; commit**

```bash
npm test
git add -A
git commit -m "feat: football-data.org fetcher with rate limiter

Author: Nishant Ranjan"
```

---

### Task 6: API-Football enrichment — quota tracker

**Files:**
- Create: `lib/football/quota.ts`
- Create: `tests/lib/quota.test.ts`

**Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { Quota } from "@/lib/football/quota";

describe("Quota", () => {
  let q: Quota;
  beforeEach(() => { q = new Quota({ limit: 3, windowMs: 24 * 3600 * 1000 }); });

  it("allows up to limit", () => {
    expect(q.tryConsume()).toBe(true);
    expect(q.tryConsume()).toBe(true);
    expect(q.tryConsume()).toBe(true);
    expect(q.tryConsume()).toBe(false);
  });

  it("reports remaining", () => {
    q.tryConsume(); q.tryConsume();
    expect(q.remaining()).toBe(1);
  });
});
```

**Step 2: Implement `lib/football/quota.ts`**

```ts
export interface QuotaOpts { limit: number; windowMs: number }

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
```

**Step 3: Pass; commit**

```bash
git add -A && git commit -m "feat: add daily quota tracker

Author: Nishant Ranjan"
```

---

### Task 7: API-Football enrichment adapter

**Files:**
- Create: `lib/football/providers/apiFootball.ts`
- Create: `tests/fixtures/api-football-events.json` (sample)
- Create: `tests/lib/api-football.test.ts`

**Step 1: Sample fixture for events** — `tests/fixtures/api-football-events.json`:

```json
{
  "response": [
    { "time": { "elapsed": 12 }, "team": { "name": "FC Barcelona" }, "player": { "name": "Lewandowski" }, "type": "Goal", "detail": "Normal Goal" },
    { "time": { "elapsed": 28 }, "team": { "name": "Real Madrid" }, "player": { "name": "Vinícius" }, "type": "Card", "detail": "Yellow Card" }
  ]
}
```

**Step 2: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { mapApiFootballEvents } from "@/lib/football/providers/apiFootball";

describe("mapApiFootballEvents", () => {
  it("maps goals and cards", async () => {
    const raw = JSON.parse(
      await readFile("tests/fixtures/api-football-events.json", "utf8"),
    );
    const homeName = "FC Barcelona";
    const out = mapApiFootballEvents(raw, homeName);
    expect(out).toEqual([
      { minute: 12, type: "goal", team: "home", player: "Lewandowski", detail: undefined },
      { minute: 28, type: "yellow", team: "away", player: "Vinícius", detail: undefined },
    ]);
  });
});
```

**Step 3: Implement `lib/football/providers/apiFootball.ts`**

```ts
import type { MatchEvent } from "@/lib/types";

interface AfEvent {
  time: { elapsed: number };
  team: { name: string };
  player: { name: string };
  type: string;
  detail: string;
  comments?: string;
}
interface AfEventsResp { response: AfEvent[] }

function classifyType(e: AfEvent): MatchEvent["type"] | null {
  if (e.type === "Goal") return "goal";
  if (e.type === "Card" && /yellow/i.test(e.detail)) return "yellow";
  if (e.type === "Card" && /red/i.test(e.detail)) return "red";
  if (e.type === "subst" || /substitut/i.test(e.type)) return "sub";
  return null;
}

export function mapApiFootballEvents(raw: AfEventsResp, homeName: string): MatchEvent[] {
  return raw.response
    .map((e) => {
      const type = classifyType(e);
      if (!type) return null;
      return {
        minute: e.time.elapsed,
        type,
        team: e.team.name === homeName ? "home" as const : "away" as const,
        player: e.player.name,
        detail: e.comments,
      };
    })
    .filter((x): x is MatchEvent => x !== null);
}

export async function fetchApiFootballEvents(opts: {
  apiKey: string;
  fixtureId: number;
  homeName: string;
}): Promise<MatchEvent[]> {
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures/events?fixture=${opts.fixtureId}`,
    { headers: { "x-apisports-key": opts.apiKey }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`api-football ${res.status}`);
  const json = (await res.json()) as AfEventsResp;
  return mapApiFootballEvents(json, opts.homeName);
}
```

**Step 4: Pass; commit**

---

### Task 8: openfootball static fallback

**Files:**
- Create: `scripts/fetch-static-fixtures.mjs`
- Create: `data/fixtures-2026.json` (output of script)
- Modify: `package.json` (add `prebuild` hook)
- Create: `lib/football/providers/staticFixtures.ts`
- Create: `tests/lib/static-fixtures.test.ts`

**Step 1: Build-time fetcher script — `scripts/fetch-static-fixtures.mjs`**

```js
#!/usr/bin/env node
// Pre-fetch openfootball/worldcup.json at build time so the app has a fixture
// list even if every API is down. Run by `prebuild`.
import { writeFile, mkdir } from "node:fs/promises";

const SOURCES = [
  { url: "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.schedule.json", out: "data/worldcup-2026.json" },
];

await mkdir("data", { recursive: true });
for (const s of SOURCES) {
  try {
    const res = await fetch(s.url);
    if (!res.ok) throw new Error(`${res.status}`);
    const body = await res.text();
    await writeFile(s.out, body);
    console.log(`✓ ${s.out} (${body.length} bytes)`);
  } catch (e) {
    console.warn(`! could not fetch ${s.url}: ${(e as Error).message}. Keeping previous file if any.`);
  }
}
```

**Step 2: Add to `package.json`**

```json
"scripts": {
  "prebuild": "node scripts/fetch-static-fixtures.mjs",
  ...
}
```

**Step 3: Failing test for static mapper — `tests/lib/static-fixtures.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { mapOpenFootballSchedule } from "@/lib/football/providers/staticFixtures";

describe("mapOpenFootballSchedule", () => {
  it("maps a basic openfootball schedule", () => {
    const raw = {
      name: "FIFA World Cup 2026",
      matches: [
        { date: "2026-06-12", time: "18:00", team1: "Argentina", team2: "Brazil", group: "B" }
      ],
    };
    const out = mapOpenFootballSchedule(raw);
    expect(out).toHaveLength(1);
    expect(out[0].competition).toBe("fifa");
    expect(out[0].status).toBe("SCHED");
    expect(out[0].slug).toBe("argentina-vs-brazil");
  });
});
```

**Step 4: Implement `lib/football/providers/staticFixtures.ts`**

```ts
import type { Match } from "@/lib/types";
import { matchSlug } from "@/lib/slug";

interface OfMatch {
  date: string;
  time?: string;
  team1: string;
  team2: string;
  group?: string;
  score?: { ft?: [number, number] };
}
interface OfSchedule { name: string; matches: OfMatch[] }

export function mapOpenFootballSchedule(raw: OfSchedule): Match[] {
  return raw.matches.map((m) => {
    const kickoff = new Date(`${m.date}T${m.time ?? "18:00"}:00Z`).toISOString();
    return {
      slug: matchSlug(m.team1, m.team2),
      competition: "fifa",
      competitionName: raw.name,
      home: { name: m.team1, short: m.team1.slice(0, 3).toUpperCase() },
      away: { name: m.team2, short: m.team2.slice(0, 3).toUpperCase() },
      scoreHome: m.score?.ft?.[0] ?? 0,
      scoreAway: m.score?.ft?.[1] ?? 0,
      status: m.score?.ft ? "FT" : "SCHED",
      minute: 0,
      kickoff,
      events: [],
      stats: { possession: { home: 50, away: 50 }, shots: { home: 0, away: 0 }, shotsOnTarget: { home: 0, away: 0 }, corners: { home: 0, away: 0 }, fouls: { home: 0, away: 0 } },
      lineupHome: { formation: "4-3-3", starting: [] },
      lineupAway: { formation: "4-3-3", starting: [] },
    };
  });
}

export async function loadStaticFixtures(): Promise<Match[]> {
  try {
    const { default: data } = await import("@/data/worldcup-2026.json", { with: { type: "json" } });
    return mapOpenFootballSchedule(data as OfSchedule);
  } catch {
    return [];
  }
}
```

**Step 5: Add `data/.gitkeep`**, ignore `data/*.json` in `.gitignore` so the script runs fresh per deploy.

**Step 6: Run prebuild manually once to populate**

```bash
node scripts/fetch-static-fixtures.mjs
ls -la data/
```

**Step 7: Pass; commit (DON'T commit `data/*.json` — they're build-time)**

---

### Task 9: Provider chain orchestrator

**Files:**
- Create: `lib/football/chain.ts`
- Create: `tests/lib/chain.test.ts`
- Modify: `lib/football.ts` (delegate to chain)

**Step 1: Failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { ProviderChain } from "@/lib/football/chain";

describe("ProviderChain", () => {
  it("uses primary when it works", async () => {
    const primary = vi.fn(async () => [{ slug: "a-vs-b" } as any]);
    const fallback = vi.fn(async () => [{ slug: "x-vs-y" } as any]);
    const chain = new ProviderChain([primary, fallback]);
    const out = await chain.getAll();
    expect(out).toEqual([{ slug: "a-vs-b" }]);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back when primary throws", async () => {
    const primary = vi.fn(async () => { throw new Error("429"); });
    const fallback = vi.fn(async () => [{ slug: "x-vs-y" } as any]);
    const chain = new ProviderChain([primary, fallback]);
    const out = await chain.getAll();
    expect(out).toEqual([{ slug: "x-vs-y" }]);
  });

  it("returns empty if all fail", async () => {
    const chain = new ProviderChain([
      async () => { throw new Error("a"); },
      async () => { throw new Error("b"); },
    ]);
    expect(await chain.getAll()).toEqual([]);
  });
});
```

**Step 2: Implement**

```ts
import type { Match } from "@/lib/types";

export type Provider = () => Promise<Match[]>;

export class ProviderChain {
  constructor(private providers: Provider[]) {}
  async getAll(): Promise<Match[]> {
    for (const p of this.providers) {
      try {
        const out = await p();
        if (out.length > 0) return out;
      } catch (e) {
        console.warn(`[provider] ${(e as Error).message}`);
      }
    }
    return [];
  }
}
```

**Step 3: Wire into `lib/football.ts`** — replace `getAllMatches` body:

```ts
import { env } from "@/lib/env";
import { fetchFootballDataMatches } from "@/lib/football/providers/footballData";
import { loadStaticFixtures } from "@/lib/football/providers/staticFixtures";
import { ProviderChain } from "@/lib/football/chain";

function buildChain(): ProviderChain {
  const ps: (() => Promise<Match[]>)[] = [];
  if (env.footballDataKey) {
    ps.push(() => fetchFootballDataMatches({ apiKey: env.footballDataKey! }));
  }
  ps.push(() => loadStaticFixtures());
  ps.push(() => Promise.resolve(allMockMatches()));
  return new ProviderChain(ps);
}

const chain = buildChain();

export async function getAllMatches(): Promise<Match[]> {
  return cached("matches:all", env.listTtlSeconds, () => chain.getAll());
}
```

**Step 4: Run full suite, app dev server**

```bash
npm test
npm run dev    # browse http://localhost:3000
```

Expected: with no `FOOTBALL_DATA_API_KEY`, app still serves mock data. With one set, real data flows.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: provider chain — football-data primary with static and mock fallbacks

Author: Nishant Ranjan"
```

---

### Task 10: Per-match enrichment with API-Football

**Files:**
- Modify: `lib/football.ts` (`getMatchBySlug` enriches when key + quota allow)

**Step 1: Failing test — `tests/lib/match-enrichment.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => vi.resetModules());

describe("getMatchBySlug enrichment", () => {
  it("does not call api-football when key missing", async () => {
    process.env.API_FOOTBALL_KEY = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // ... see plan: import getMatchBySlug, call with a known slug, assert
    // fetchMock not called for v3.football.api-sports.io
  });
});
```

**Step 2: Implementation sketch**

```ts
export async function getMatchBySlug(slug: string): Promise<Match | null> {
  const all = await getAllMatches();
  const base = all.find((m) => m.slug === slug);
  if (!base) return null;
  if (!env.enrichmentEnabled) return base;
  if (base.competition !== "barca") return base; // budget Barca only
  if (base.status === "SCHED" && new Date(base.kickoff).getTime() - Date.now() > 60*60_000) {
    return base; // skip if more than 60 min away
  }
  if (!quota.tryConsume()) return base;
  try {
    // Need fixture id mapping — store in adapter; for now:
    const fixtureId = await resolveAfFixtureId(base);
    if (!fixtureId) return base;
    const events = await fetchApiFootballEvents({ apiKey: env.apiFootballKey!, fixtureId, homeName: base.home.name });
    return { ...base, events };
  } catch {
    return base;
  }
}
```

> **Note on `resolveAfFixtureId`:** API-Football has its own fixture IDs which don't match football-data.org. Resolve once per match by querying `/fixtures?date=...&team=...` and caching the ID by slug for 24h. Implementation goes in `lib/football/providers/apiFootball.ts`.

**Step 3: Add fixture-id resolver + test, commit**

---

### Task 11: News RSS aggregator

**Files:**
- Create: `lib/news/rss.ts`
- Create: `tests/fixtures/bbc-football.xml`
- Create: `tests/lib/rss.test.ts`
- Modify: `lib/news.ts` (delegate to rss when available; keep in-memory `createPost` for admin)

**Step 1: Install `fast-xml-parser`**

```bash
npm install fast-xml-parser
```

**Step 2: Save a real BBC RSS sample to `tests/fixtures/bbc-football.xml`** (curl once and trim to 2 items).

**Step 3: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { parseRss } from "@/lib/news/rss";

describe("parseRss", () => {
  it("extracts title, link, pubDate, description", async () => {
    const xml = await readFile("tests/fixtures/bbc-football.xml", "utf8");
    const items = parseRss(xml, "bbc", "fifa");
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title).toBeTruthy();
    expect(items[0].slug).toMatch(/^[a-z0-9-]+$/);
  });
});
```

**Step 4: Implement `lib/news/rss.ts`**

```ts
import { XMLParser } from "fast-xml-parser";
import type { Competition, NewsPost } from "@/lib/types";
import { toSlug } from "@/lib/slug";

const parser = new XMLParser({ ignoreAttributes: false });

export interface RssSource { name: string; url: string; category: Competition }

export const SOURCES: RssSource[] = [
  { name: "BBC Sport — Football", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", category: "fifa" },
  { name: "ESPN FC", url: "https://www.espn.com/espn/rss/soccer/news", category: "fifa" },
  { name: "Marca — Barca", url: "https://e00-marca.uecdn.es/rss/futbol/barcelona.xml", category: "barca" },
  { name: "Mundo Deportivo — Barca", url: "https://www.mundodeportivo.com/feed/rss/fc-barcelona", category: "barca" },
];

interface RssItem { title: string; link: string; pubDate?: string; description?: string }
interface RssDoc { rss?: { channel?: { item?: RssItem[] | RssItem } } }

export function parseRss(xml: string, source: string, category: Competition): NewsPost[] {
  const doc = parser.parse(xml) as RssDoc;
  const raw = doc.rss?.channel?.item;
  const items = !raw ? [] : Array.isArray(raw) ? raw : [raw];
  return items.map((it, i) => ({
    id: `${source}-${i}-${toSlug(it.title)}`,
    slug: toSlug(it.title),
    title: stripHtml(it.title),
    content: stripHtml(it.description ?? "").slice(0, 600),
    category,
    createdAt: it.pubDate ? new Date(it.pubDate).toISOString() : new Date().toISOString(),
  }));
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").trim();
}

export async function fetchAllNews(): Promise<NewsPost[]> {
  const fetched = await Promise.allSettled(
    SOURCES.map(async (s) => {
      const res = await fetch(s.url, { signal: AbortSignal.timeout(6000), headers: { "user-agent": "BarcaPulse/1.0" } });
      if (!res.ok) throw new Error(`${s.name}: ${res.status}`);
      return parseRss(await res.text(), s.name, s.category);
    }),
  );
  return fetched
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}
```

**Step 5: Modify `lib/news.ts`** so `listNews` delegates to RSS with cache; keep `createPost` for admin overrides:

```ts
import { cached } from "./cache";
import { env } from "./env";
import { fetchAllNews } from "./news/rss";

const adminPosts: NewsPost[] = []; // admin-pushed via POST take precedence

export async function listNews(category?: Competition, limit = 20): Promise<NewsPost[]> {
  const rss = await cached("news:rss", env.newsTtlSeconds, fetchAllNews);
  const merged = [...adminPosts, ...rss];
  const filtered = category ? merged.filter((p) => p.category === category) : merged;
  return filtered.slice(0, limit);
}
// createPost pushes into adminPosts (unchanged signature)
```

**Step 6: Update `app/api/news/route.ts` POST handler to require admin token**

```ts
const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
if (!env.adminToken || token !== env.adminToken) {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
```

**Step 7: Tests + manual smoke; commit**

---

### Task 12: SSE live stream endpoint

**Files:**
- Create: `app/api/live/stream/route.ts`
- Modify: `components/LiveScoreClient.tsx` (prefer SSE, fallback to polling)

**Step 1: Implement SSE route — `app/api/live/stream/route.ts`**

```ts
import { getMatchBySlug } from "@/lib/football";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) return new Response("missing slug", { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (m: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(m)}\n\n`));
      let cancelled = false;

      const tick = async () => {
        if (cancelled) return;
        const match = await getMatchBySlug(slug);
        if (match) send({ match });
        if (!cancelled && match?.status !== "FT") setTimeout(tick, 30_000);
      };
      tick();

      req.signal.addEventListener("abort", () => {
        cancelled = true;
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
    },
  });
}
```

**Step 2: Update `LiveScoreClient.tsx`** — prefer EventSource, fall back to fetch polling if `EventSource` is unavailable or errors twice in a row.

**Step 3: Manual smoke test** — open match page, watch network tab → one `event-stream` request, no fetch polling.

**Step 4: Commit**

---

### Task 13: Telegram CTA verification

**Files:**
- Modify: `components/TelegramCTA.tsx` (already reads `NEXT_PUBLIC_TELEGRAM_URL` — verify warning if unset)
- Modify: `app/layout.tsx` (optional: render a dev-only banner if URL is `https://t.me/`)

**Step 1: Add visible dev warning** (skip in production)

```tsx
{process.env.NODE_ENV !== "production" && env.telegramUrl === "https://t.me/" && (
  <div className="bg-amber-500/20 text-amber-300 text-[11px] py-1 px-3 text-center">
    Set NEXT_PUBLIC_TELEGRAM_URL in .env.local
  </div>
)}
```

**Step 2: Commit**

---

### Task 14: Analytics — Vercel Web Analytics

**Files:**
- Modify: `package.json` (add `@vercel/analytics`)
- Modify: `app/layout.tsx` (mount `<Analytics />`)

**Step 1: Install**

```bash
npm install @vercel/analytics
```

**Step 2: Add to layout**

```tsx
import { Analytics } from "@vercel/analytics/next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink text-white antialiased min-h-screen">
        <Header />
        <main className="mx-auto max-w-screen pb-20">{children}</main>
        <BottomNav />
        <Analytics />
      </body>
    </html>
  );
}
```

**Step 3: Commit**

---

### Task 15: SEO — sitemap, robots, JSON-LD, OG image

**Files:**
- Create: `app/robots.ts`
- Create: `app/sitemap.ts`
- Create: `app/opengraph-image.tsx` (route generates a 1200×630 OG image)
- Modify: `app/match/[slug]/page.tsx` (add `SportsEvent` JSON-LD)

**Step 1: `app/robots.ts`**

```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${process.env.SITE_URL ?? "https://example.com"}/sitemap.xml`,
  };
}
```

**Step 2: `app/sitemap.ts`**

```ts
import type { MetadataRoute } from "next";
import { getAllMatches } from "@/lib/football";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL ?? "https://example.com";
  const matches = await getAllMatches();
  return [
    { url: `${base}/`, priority: 1.0 },
    { url: `${base}/barca`, priority: 0.9 },
    { url: `${base}/fifa`, priority: 0.9 },
    { url: `${base}/live`, priority: 0.8 },
    ...matches.map((m) => ({ url: `${base}/match/${m.slug}`, priority: 0.7 })),
  ];
}
```

**Step 3: OG image route** (`app/opengraph-image.tsx`) — basic gradient with title text. Use `ImageResponse` from `next/og`.

**Step 4: JSON-LD on match page**

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${match.home.name} vs ${match.away.name}`,
    startDate: match.kickoff,
    location: match.venue,
    homeTeam: { "@type": "SportsTeam", name: match.home.name },
    awayTeam: { "@type": "SportsTeam", name: match.away.name },
  }) }}
/>
```

**Step 5: Commit**

---

### Task 16: Error boundaries + 500 page

**Files:**
- Create: `app/error.tsx`
- Create: `app/global-error.tsx`

**Step 1: Both files render minimal "something went wrong" UI with a back-home link**

**Step 2: Commit**

---

### Task 17: Ad scaffolding (AdSense placeholder, env-flagged)

**Files:**
- Modify: `components/AdSlot.tsx` (when `NEXT_PUBLIC_ADSENSE_CLIENT` set, render real `<ins>` block; else placeholder)
- Modify: `app/layout.tsx` (mount AdSense script when env present)
- Modify: `.env.example` (`NEXT_PUBLIC_ADSENSE_CLIENT=`, `NEXT_PUBLIC_ADSENSE_SLOT_300x250=`, etc.)

**Step 1: Conditional `<ins>` block** — typical AdSense markup

**Step 2: Document in README** — "App is ready for AdSense; until your account is approved, slots render as placeholders. Set the four env vars to switch."

**Step 3: Commit**

---

### Task 18: Vercel deploy config

**Files:**
- Create: `vercel.json` (empty `{}` is fine for Next; declare regions if desired)
- Modify: `README.md` — add a "Deploy" section with exact env vars
- Create: `docs/deploy.md` — step-by-step Vercel deploy + DNS

**Step 1: Document required envs**

```
FOOTBALL_DATA_API_KEY        (required for live data)
API_FOOTBALL_KEY             (optional; enrichment)
ADMIN_TOKEN                  (required for POST /api/news)
NEXT_PUBLIC_TELEGRAM_URL     (required)
NEXT_PUBLIC_ADSENSE_CLIENT   (optional; ads off until set)
SITE_URL                     (e.g. https://barcapulse.com)
```

**Step 2: Commit**

---

### Task 19: Smoke test script & final verification

**Files:**
- Create: `scripts/smoke.sh`

**Step 1: Script**

```bash
#!/usr/bin/env bash
set -euo pipefail
URL=${1:-http://localhost:3000}
for path in / /barca /fifa /live /api/scores "/api/scores?live=1" "/api/news?category=barca" /robots.txt /sitemap.xml; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$URL$path")
  printf "%-40s %s\n" "$path" "$code"
  [[ "$code" == "200" ]] || { echo "FAIL"; exit 1; }
done
echo "OK"
```

**Step 2: Run against dev server, verify all 200s**

```bash
chmod +x scripts/smoke.sh
npm run build
npm run start &   # serve production build
sleep 3
./scripts/smoke.sh
kill %1
```

**Step 3: Run `npm test` and `npm run typecheck` once more, all green.**

**Step 4: Final commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: smoke test + verification scripts

Author: Nishant Ranjan
EOF
)"
```

---

## Verification checklist (post-execution)

- [ ] `npm test` — green
- [ ] `npm run typecheck` — green
- [ ] `npm run build` — green; sitemap and robots in output
- [ ] `./scripts/smoke.sh` — all routes 200
- [ ] With `FOOTBALL_DATA_API_KEY` set, `/api/scores?live=1` returns real fixtures
- [ ] With key unset, app still serves static + mock fixtures (no 5xx)
- [ ] Match page network tab: one `event-stream`, no fetch poll
- [ ] `/api/news?category=barca` returns RSS-merged items, not in-memory seeds
- [ ] `POST /api/news` without bearer → 401
- [ ] `/sitemap.xml` lists all match slugs
- [ ] OG image renders for `/match/<slug>`

## Risks & rollback

- **API quotas exhausted on day 1** → chain falls back to static + mock; observable as missing live scores. Mitigation: ISR caches widely, SSE shares one upstream poll across all clients.
- **RSS source goes down** → other 3 sources still work (Promise.allSettled).
- **API-Football fixture-id resolution drift** → cached by slug for 24h; if mapping fails, base match still served without enrichment.
- **AdSense rejection** → ad slots stay as placeholders; revenue path unblocked when approved (no code change).

Each task is one commit; revert with `git revert <sha>` if a layer misbehaves.

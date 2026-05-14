# Hourly Auto-Posting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement an hourly autonomous blog-post generator that picks an uncovered news headline, asks Gemini (with Groq fallback) to write a 600+ word original post, runs four quality gates, and publishes + announces to Telegram + Facebook.

**Architecture:** Pure-function pipeline driven from a token-protected Next.js route, scheduled by GitHub Actions. All logic in `lib/autopost/*` so it's unit-testable without HTTP/network mocking beyond `fetch`. Reuses existing `blogStore`, `lib/news/rss`, and `lib/telegram`. New `lib/facebook.ts` for the Page Graph API.

**Tech Stack:** Next.js 16 (App Router), TypeScript 5, Vitest 4, Upstash Redis (with in-memory fallback), fetch mocking via `vi.stubGlobal`, GitHub Actions cron.

**Source design:** [`docs/plans/2026-05-14-hourly-autopost-design.md`](./2026-05-14-hourly-autopost-design.md). Read it before starting — it explains every decision below.

---

## Conventions used in this plan (read once)

These match existing codebase patterns. Don't deviate without asking.

1. **Env access:** Public/typed app env goes through `lib/env.ts`. Vendor secrets (API tokens) read `process.env` directly in their own module — see `lib/telegram.ts` for the pattern.
2. **Error style:** Return `{ ok: false, error: "..." }` for *expected* failures (quota, malformed input). Throw only on bugs/unrecoverable errors. Pipeline-level expected failures use `{ status: "skipped", reason: "..." }`.
3. **Tests:** Vitest with explicit imports — no globals. `vi.stubGlobal("fetch", ...)` for HTTP mocking. Tests live under `tests/autopost/<module>.test.ts`. The vitest include pattern `tests/**/*.test.ts` picks them up.
4. **Comments:** Sparse. Only "why" comments for non-obvious decisions. Never narrate "what".
5. **Path alias:** `@/...` resolves to project root.
6. **Cron auth:** `CRON_TOKEN` (not the admin token — different security domain). Check Bearer header.
7. **Commits:** One per task, conventional-commit style (`feat(autopost):`, `test(autopost):`, etc.), each ending with `Author: Nishant Ranjan` line per repo norm (see recent commits).

---

## Task 0: Prep — verify clean state and create worktree

**Files:** none changed; this is a setup step.

**Step 1: Verify clean state**

Run:
```
git status
git log --oneline -3
```
Expected: working tree clean; HEAD at `524001f docs(autopost): hourly auto-blog generation design`.

**Step 2 (optional but recommended): Create a worktree for this feature**

Per `superpowers:using-git-worktrees`, isolate this work:
```bash
git worktree add ../barca-fifa-autopost -b feat/autopost
cd ../barca-fifa-autopost
npm install
```
Expected: new directory `../barca-fifa-autopost` checked out on `feat/autopost`.

**Step 3: Verify tests run baseline-green**

Run: `npm test`
Expected: all existing tests pass. Note current count — we'll add ~30 more tests across this plan.

**Step 4: Verify typecheck baseline-clean**

Run: `npm run typecheck`
Expected: no errors.

**No commit for Task 0.**

---

## Task 1: Add autopost types

**Files:**
- Create: `lib/autopost/types.ts`
- Test: none (pure types)

**Step 1: Write the file**

Create `lib/autopost/types.ts`:

```typescript
import type { NewsPost } from "@/lib/types";
import type { BlogPostInput } from "@/lib/blog/types";

/** A news item the pipeline has chosen to write about, plus the entities
 *  we extracted from it for duplicate-detection. */
export interface SelectedNewsItem {
  source: NewsPost;
  /** Lower-case named entities extracted from the headline (player names,
   *  club names). Used by the duplicate-topic gate and recent-topics state. */
  entities: string[];
}

/** Output of the LLM step. Not yet persisted; gates may still reject it. */
export interface DraftPost extends BlogPostInput {
  title: string;
  body: string;
  excerpt: string;
  tags: string[];
  /** Which provider produced this draft. Recorded in stats. */
  provider: "gemini" | "groq";
}

/** Reasons a stage can short-circuit the pipeline. Stable strings — they
 *  appear in logs and the admin dashboard. */
export type SkipReason =
  | "disabled"
  | "no_eligible_news"
  | "day_cap_reached"
  | "manual_cooldown"
  | "all_providers_failed"
  | "quota"
  | "gate_word_count"
  | "gate_duplicate_topic"
  | "gate_banned_phrases"
  | "gate_entity_coverage";

export type PipelineResult =
  | { status: "published"; slug: string; provider: "gemini" | "groq"; announces: AnnounceResults }
  | { status: "skipped"; reason: SkipReason }
  | { status: "error"; error: string };

export interface AnnounceResults {
  telegram: "ok" | "err" | "skipped";
  facebook: "ok" | "err" | "skipped";
}
```

**Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: no errors.

**Step 3: Commit**

```bash
git add lib/autopost/types.ts
git commit -m "$(cat <<'EOF'
feat(autopost): add pipeline types

Author: Nishant Ranjan
EOF
)"
```

---

## Task 2: Quality gates (pure functions, TDD)

**Files:**
- Create: `lib/autopost/gates.ts`
- Test: `tests/autopost/gates.test.ts`

The four gates are pure, so they're the easiest TDD candidates.

**Step 1: Write the failing test**

Create `tests/autopost/gates.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  wordCountGate,
  duplicateTopicGate,
  bannedPhrasesGate,
  entityCoverageGate,
} from "@/lib/autopost/gates";

describe("wordCountGate", () => {
  it("passes when body has at least 600 words", () => {
    const body = "word ".repeat(600).trim();
    expect(wordCountGate(body)).toBe(true);
  });
  it("fails under 600 words", () => {
    expect(wordCountGate("word ".repeat(599).trim())).toBe(false);
  });
  it("ignores markdown when counting", () => {
    // 600 'word' tokens wrapped in markdown noise should still pass.
    const body = "# Title\n\n" + "**word** ".repeat(600);
    expect(wordCountGate(body)).toBe(true);
  });
});

describe("duplicateTopicGate", () => {
  it("passes when no recent title overlaps significantly", () => {
    const ok = duplicateTopicGate({
      newTitle: "Yamal extends his Barcelona contract",
      recentTitles: ["Pedri injury update", "Champions League draw revealed"],
      newEntities: ["yamal"],
      recentEntities: ["pedri"],
    });
    expect(ok).toBe(true);
  });
  it("fails when title Jaccard similarity >= 0.5", () => {
    const ok = duplicateTopicGate({
      newTitle: "Yamal extends his Barcelona contract",
      recentTitles: ["Yamal extends Barcelona contract through 2030"],
      newEntities: ["yamal"],
      recentEntities: ["yamal"],
    });
    expect(ok).toBe(false);
  });
  it("fails when a new entity is in recentEntities (overlap)", () => {
    const ok = duplicateTopicGate({
      newTitle: "Totally different headline about football tactics",
      recentTitles: ["Some unrelated headline about transfers"],
      newEntities: ["lewandowski"],
      recentEntities: ["lewandowski"],
    });
    expect(ok).toBe(false);
  });
});

describe("bannedPhrasesGate", () => {
  it("passes a clean post", () => {
    expect(bannedPhrasesGate("Barcelona played a strong first half.")).toBe(true);
  });
  it.each([
    "As an AI, I cannot comment on tactics.",
    "As a language model, I would say…",
    "I cannot provide opinions.",
    "I'm sorry, but I can't help with that.",
  ])("fails on AI-leak phrase: %s", (body) => {
    expect(bannedPhrasesGate(body)).toBe(false);
  });
  it("fails when a paragraph repeats verbatim", () => {
    const para = "Barcelona dominated possession throughout the second half. Their press disrupted the visiting midfield. The crowd lifted the team across the closing minutes of the game.";
    const body = `${para}\n\n${para}`;
    expect(bannedPhrasesGate(body)).toBe(false);
  });
});

describe("entityCoverageGate", () => {
  it("passes when every headline entity appears in body", () => {
    const ok = entityCoverageGate({
      entities: ["yamal", "barcelona"],
      body: "Lamine Yamal signed for Barcelona last week.",
    });
    expect(ok).toBe(true);
  });
  it("fails when a headline entity is missing from body", () => {
    const ok = entityCoverageGate({
      entities: ["yamal", "pedri"],
      body: "Lamine Yamal trained with the squad today.",
    });
    expect(ok).toBe(false);
  });
  it("matches case-insensitively", () => {
    const ok = entityCoverageGate({
      entities: ["yamal"],
      body: "YAMAL was named in the starting eleven.",
    });
    expect(ok).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/autopost/gates.test.ts`
Expected: FAIL — module `@/lib/autopost/gates` not found.

**Step 3: Write minimal implementation**

Create `lib/autopost/gates.ts`:

```typescript
const BANNED_PHRASES: RegExp[] = [
  /\bas an ai\b/i,
  /\bas a language model\b/i,
  /\bi cannot\b/i,
  /\bi can't\b/i,
  /\bi'm sorry,? but\b/i,
];

export function wordCountGate(body: string, min = 600): boolean {
  const cleaned = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`~\[\]()!-]/g, " ");
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length >= min;
}

export interface DuplicateTopicInput {
  newTitle: string;
  recentTitles: string[];
  newEntities: string[];
  recentEntities: string[];
}

export function duplicateTopicGate(input: DuplicateTopicInput): boolean {
  const overlap = input.newEntities.some((e) =>
    input.recentEntities.includes(e.toLowerCase()),
  );
  if (overlap) return false;
  const newTokens = tokenize(input.newTitle);
  for (const t of input.recentTitles) {
    if (jaccard(newTokens, tokenize(t)) >= 0.5) return false;
  }
  return true;
}

export function bannedPhrasesGate(body: string): boolean {
  if (BANNED_PHRASES.some((re) => re.test(body))) return false;
  return !hasRepeatedParagraph(body);
}

export function entityCoverageGate(input: { entities: string[]; body: string }): boolean {
  const lowerBody = input.body.toLowerCase();
  return input.entities.every((e) => lowerBody.includes(e.toLowerCase()));
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function hasRepeatedParagraph(body: string): boolean {
  const paras = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.split(/\s+/).length >= 20);
  const seen = new Set<string>();
  for (const p of paras) {
    const key = p.replace(/\s+/g, " ");
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/autopost/gates.test.ts`
Expected: all 12 tests pass.

**Step 5: Commit**

```bash
git add lib/autopost/gates.ts tests/autopost/gates.test.ts
git commit -m "$(cat <<'EOF'
feat(autopost): quality gates (word count, dupe topic, banned phrases, entity coverage)

Author: Nishant Ranjan
EOF
)"
```

---

## Task 3: State helpers (Redis + in-memory fallback)

**Files:**
- Create: `lib/autopost/state.ts`
- Test: `tests/autopost/state.test.ts`

We need: today's stats counters, recent-topic entities (with 7d expiry), day cap check.

**Step 1: Write the failing test**

Create `tests/autopost/state.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  autopostState,
  _resetAutopostState,
} from "@/lib/autopost/state";

beforeEach(async () => {
  _resetAutopostState();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  const s = autopostState();
  await s._reset?.();
});

describe("autopostState (in-memory)", () => {
  it("starts with zero published today", async () => {
    const s = autopostState();
    expect(await s.publishedToday()).toBe(0);
  });

  it("increments published count", async () => {
    const s = autopostState();
    await s.recordPublish({ provider: "gemini" });
    await s.recordPublish({ provider: "groq" });
    expect(await s.publishedToday()).toBe(2);
  });

  it("tracks per-provider counters", async () => {
    const s = autopostState();
    await s.recordPublish({ provider: "gemini" });
    await s.recordPublish({ provider: "gemini" });
    await s.recordPublish({ provider: "groq" });
    const stats = await s.todayStats();
    expect(stats.by_gemini).toBe(2);
    expect(stats.by_groq).toBe(1);
  });

  it("tracks skip reasons per day", async () => {
    const s = autopostState();
    await s.recordSkip("gate_word_count");
    await s.recordSkip("gate_word_count");
    await s.recordSkip("no_eligible_news");
    const stats = await s.todayStats();
    expect(stats.skipped_by_reason.gate_word_count).toBe(2);
    expect(stats.skipped_by_reason.no_eligible_news).toBe(1);
  });

  it("returns recent entities, dropping expired", async () => {
    const s = autopostState();
    const now = Date.now();
    const eightDaysAgo = now - 8 * 24 * 3600 * 1000;
    await s.recordEntities(["yamal"], now);
    await s.recordEntities(["pedri"], eightDaysAgo);
    const recent = await s.recentEntities(7);
    expect(recent).toContain("yamal");
    expect(recent).not.toContain("pedri");
  });

  it("dayCapReached reflects publishedToday vs cap", async () => {
    const s = autopostState();
    for (let i = 0; i < 24; i++) await s.recordPublish({ provider: "gemini" });
    expect(await s.dayCapReached(24)).toBe(true);
    expect(await s.dayCapReached(25)).toBe(false);
  });

  it("returns last 7 days of stats", async () => {
    const s = autopostState();
    await s.recordPublish({ provider: "gemini" });
    const days = await s.recentStats(7);
    expect(days).toHaveLength(7);
    // The latest day should reflect the publish we just recorded.
    const latest = days[days.length - 1];
    expect(latest.published).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/autopost/state.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `lib/autopost/state.ts`:

```typescript
import { Redis } from "@upstash/redis";

const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const TOPICS_KEY = "autopost:recent_topics";
const STATS_KEY_PREFIX = "autopost:stats:";

export interface DayStats {
  date: string;
  generated: number;
  published: number;
  errors: number;
  by_gemini: number;
  by_groq: number;
  skipped_by_reason: Record<string, number>;
}

export interface AutopostState {
  publishedToday(): Promise<number>;
  todayStats(): Promise<DayStats>;
  recentStats(days: number): Promise<DayStats[]>;
  dayCapReached(cap: number): Promise<boolean>;
  recordPublish(opts: { provider: "gemini" | "groq" }): Promise<void>;
  recordSkip(reason: string): Promise<void>;
  recordError(): Promise<void>;
  recordGenerated(): Promise<void>;
  recordEntities(entities: string[], at?: number): Promise<void>;
  recentEntities(days: number): Promise<string[]>;
  _reset?(): Promise<void>;
}

function ymd(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function emptyStats(date: string): DayStats {
  return {
    date,
    generated: 0,
    published: 0,
    errors: 0,
    by_gemini: 0,
    by_groq: 0,
    skipped_by_reason: {},
  };
}

function makeRedisState(client: Redis): AutopostState {
  async function readDay(date: string): Promise<DayStats> {
    const raw = await client.get<DayStats>(STATS_KEY_PREFIX + date);
    return raw ?? emptyStats(date);
  }
  async function writeDay(stats: DayStats): Promise<void> {
    // 30 day TTL — keeps the admin dashboard's 7-day window plus headroom.
    await client.set(STATS_KEY_PREFIX + stats.date, stats, { ex: 60 * 60 * 24 * 30 });
  }
  return {
    async publishedToday() {
      return (await readDay(ymd())).published;
    },
    async todayStats() {
      return readDay(ymd());
    },
    async recentStats(days) {
      const out: DayStats[] = [];
      const now = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - i);
        out.push(await readDay(ymd(d)));
      }
      return out;
    },
    async dayCapReached(cap) {
      return (await readDay(ymd())).published >= cap;
    },
    async recordPublish({ provider }) {
      const s = await readDay(ymd());
      s.published += 1;
      if (provider === "gemini") s.by_gemini += 1;
      else s.by_groq += 1;
      await writeDay(s);
    },
    async recordSkip(reason) {
      const s = await readDay(ymd());
      s.skipped_by_reason[reason] = (s.skipped_by_reason[reason] ?? 0) + 1;
      await writeDay(s);
    },
    async recordError() {
      const s = await readDay(ymd());
      s.errors += 1;
      await writeDay(s);
    },
    async recordGenerated() {
      const s = await readDay(ymd());
      s.generated += 1;
      await writeDay(s);
    },
    async recordEntities(entities, at = Date.now()) {
      if (entities.length === 0) return;
      const items = entities.map((e) => ({ score: at, member: e.toLowerCase() }));
      await client.zadd(TOPICS_KEY, ...items);
    },
    async recentEntities(days) {
      const min = Date.now() - days * 24 * 3600 * 1000;
      // Prune older entries to keep the set bounded.
      await client.zremrangebyscore(TOPICS_KEY, 0, min);
      return (await client.zrange(TOPICS_KEY, min, "+inf", { byScore: true })) as string[];
    },
  };
}

function makeMemoryState(): AutopostState {
  const daily = new Map<string, DayStats>();
  const entities = new Map<string, number>();
  function dayOf(date: string): DayStats {
    let d = daily.get(date);
    if (!d) {
      d = emptyStats(date);
      daily.set(date, d);
    }
    return d;
  }
  return {
    async publishedToday() {
      return dayOf(ymd()).published;
    },
    async todayStats() {
      return dayOf(ymd());
    },
    async recentStats(days) {
      const out: DayStats[] = [];
      const now = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - i);
        const date = ymd(d);
        out.push(daily.get(date) ?? emptyStats(date));
      }
      return out;
    },
    async dayCapReached(cap) {
      return dayOf(ymd()).published >= cap;
    },
    async recordPublish({ provider }) {
      const s = dayOf(ymd());
      s.published += 1;
      if (provider === "gemini") s.by_gemini += 1;
      else s.by_groq += 1;
    },
    async recordSkip(reason) {
      const s = dayOf(ymd());
      s.skipped_by_reason[reason] = (s.skipped_by_reason[reason] ?? 0) + 1;
    },
    async recordError() {
      dayOf(ymd()).errors += 1;
    },
    async recordGenerated() {
      dayOf(ymd()).generated += 1;
    },
    async recordEntities(es, at = Date.now()) {
      for (const e of es) entities.set(e.toLowerCase(), at);
    },
    async recentEntities(days) {
      const min = Date.now() - days * 24 * 3600 * 1000;
      const out: string[] = [];
      for (const [k, v] of entities) {
        if (v >= min) out.push(k);
        else entities.delete(k);
      }
      return out;
    },
    async _reset() {
      daily.clear();
      entities.clear();
    },
  };
}

let instance: AutopostState | null = null;

export function autopostState(): AutopostState {
  if (instance) return instance;
  if (REDIS_URL && REDIS_TOKEN) {
    instance = makeRedisState(new Redis({ url: REDIS_URL, token: REDIS_TOKEN }));
  } else {
    instance = makeMemoryState();
  }
  return instance;
}

export function _resetAutopostState(): void {
  instance = null;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/autopost/state.test.ts`
Expected: all 7 tests pass.

**Step 5: Commit**

```bash
git add lib/autopost/state.ts tests/autopost/state.test.ts
git commit -m "$(cat <<'EOF'
feat(autopost): redis + in-memory state for stats and recent topics

Author: Nishant Ranjan
EOF
)"
```

---

## Task 4: News selection

**Files:**
- Create: `lib/autopost/select.ts`
- Test: `tests/autopost/select.test.ts`

Selects one news item from `fetchAllNews()` results, dropping items whose entities are already in recent-topics.

**Step 1: Write the failing test**

Create `tests/autopost/select.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { selectNewsItem, extractEntities } from "@/lib/autopost/select";
import type { NewsPost } from "@/lib/types";

function n(over: Partial<NewsPost> = {}): NewsPost {
  return {
    id: "x",
    slug: "x",
    title: "Untitled",
    content: "",
    category: "barca",
    createdAt: new Date().toISOString(),
    lang: "en",
    ...over,
  };
}

describe("extractEntities", () => {
  it("extracts capitalized multi-word names", () => {
    expect(extractEntities("Lamine Yamal extends Barcelona contract")).toContain("lamine yamal");
    expect(extractEntities("Lamine Yamal extends Barcelona contract")).toContain("barcelona");
  });
  it("ignores stop-words at sentence start", () => {
    const ents = extractEntities("Barcelona win against Real Madrid in El Clasico");
    expect(ents).toContain("barcelona");
    expect(ents).toContain("real madrid");
  });
});

describe("selectNewsItem", () => {
  it("returns the most-recent English item with non-empty entities", () => {
    const items: NewsPost[] = [
      n({ id: "1", slug: "old", title: "Pedri scores", lang: "en", createdAt: "2026-05-13T10:00Z" }),
      n({ id: "2", slug: "new", title: "Yamal signs deal", lang: "en", createdAt: "2026-05-14T10:00Z" }),
    ];
    const got = selectNewsItem(items, { recentEntities: [], excludeSources: [] });
    expect(got?.source.id).toBe("2");
    expect(got?.entities).toContain("yamal");
  });

  it("skips items in non-English languages", () => {
    const items = [
      n({ id: "es", lang: "es", title: "Yamal firma contrato", createdAt: "2026-05-14T11:00Z" }),
      n({ id: "en", lang: "en", title: "Yamal signs deal", createdAt: "2026-05-14T10:00Z" }),
    ];
    const got = selectNewsItem(items, { recentEntities: [], excludeSources: [] });
    expect(got?.source.id).toBe("en");
  });

  it("skips items whose entities overlap recentEntities", () => {
    const items = [
      n({ id: "skip", lang: "en", title: "Yamal signs deal", createdAt: "2026-05-14T11:00Z" }),
      n({ id: "ok", lang: "en", title: "Pedri returns to training", createdAt: "2026-05-14T10:00Z" }),
    ];
    const got = selectNewsItem(items, { recentEntities: ["yamal"], excludeSources: [] });
    expect(got?.source.id).toBe("ok");
  });

  it("returns null when no eligible items remain", () => {
    const got = selectNewsItem([], { recentEntities: [], excludeSources: [] });
    expect(got).toBeNull();
  });

  it("respects excludeSources (per source-slug prefix)", () => {
    const items = [
      n({ id: "1", slug: "bbc-x-yamal", lang: "en", title: "Yamal signs", createdAt: "2026-05-14T11:00Z" }),
      n({ id: "2", slug: "guardian-x-pedri", lang: "en", title: "Pedri returns", createdAt: "2026-05-14T10:00Z" }),
    ];
    const got = selectNewsItem(items, { recentEntities: [], excludeSources: ["bbc-x"] });
    expect(got?.source.id).toBe("2");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/autopost/select.test.ts`
Expected: FAIL — module not found.

**Step 3: Implementation**

Create `lib/autopost/select.ts`:

```typescript
import type { NewsPost } from "@/lib/types";
import type { SelectedNewsItem } from "./types";

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","for","to","in","on","at","of","by","with",
  "from","as","is","are","was","were","be","been","being","this","that",
  "these","those","it","its","i","you","he","she","we","they",
]);

/** Naive named-entity extraction: capitalized runs of 1–3 words, with stop
 *  words filtered out. Plenty good for sports headlines where club and player
 *  names are usually proper-cased. */
export function extractEntities(title: string): string[] {
  const out = new Set<string>();
  const re = /([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(title)) !== null) {
    const phrase = m[1].toLowerCase();
    if (STOP_WORDS.has(phrase)) continue;
    if (phrase.length < 3) continue;
    out.add(phrase);
  }
  return [...out];
}

export interface SelectOpts {
  /** Entities (lower-case) seen in posts published over the lookback window. */
  recentEntities: string[];
  /** Source-slug prefixes to skip (e.g. ["bbc-sport-barcelona"]). */
  excludeSources: string[];
}

export function selectNewsItem(
  items: NewsPost[],
  opts: SelectOpts,
): SelectedNewsItem | null {
  const recentSet = new Set(opts.recentEntities.map((e) => e.toLowerCase()));
  const excludeSet = new Set(opts.excludeSources);

  const candidates = items
    .filter((it) => (it.lang ?? "en") === "en")
    .filter((it) => it.title.trim().length > 0)
    .filter((it) => !excludeSet.has(sourcePrefix(it.slug)))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  for (const it of candidates) {
    const entities = extractEntities(it.title);
    if (entities.length === 0) continue;
    if (entities.some((e) => recentSet.has(e))) continue;
    return { source: it, entities };
  }
  return null;
}

function sourcePrefix(slug: string): string {
  // slug shape: "<source-slug>-<headline-slug>" per lib/news/rss.ts buildPost.
  // We don't have a clean delimiter, so take everything up to the first dash
  // sequence followed by a lowercase letter that doesn't look like a source word.
  // Simpler approach: first 3 dash segments form the source prefix in practice
  // ("bbc-sport-barcelona-yamal-extends" → "bbc-sport-barcelona").
  const parts = slug.split("-");
  return parts.slice(0, 3).join("-");
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/autopost/select.test.ts`
Expected: all 7 tests pass.

**Step 5: Commit**

```bash
git add lib/autopost/select.ts tests/autopost/select.test.ts
git commit -m "$(cat <<'EOF'
feat(autopost): news selection with entity extraction and recent-topic filter

Author: Nishant Ranjan
EOF
)"
```

---

## Task 5: LLM generation (Gemini + Groq fallback)

**Files:**
- Create: `lib/autopost/generate.ts`
- Test: `tests/autopost/generate.test.ts`

**Step 1: Write the failing test**

Create `tests/autopost/generate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateDraft } from "@/lib/autopost/generate";
import type { SelectedNewsItem } from "@/lib/autopost/types";

const ITEM: SelectedNewsItem = {
  entities: ["yamal", "barcelona"],
  source: {
    id: "1",
    slug: "bbc-yamal",
    title: "Yamal signs new Barcelona deal",
    content: "Lamine Yamal signed a new contract with Barcelona today.",
    category: "barca",
    createdAt: "2026-05-14T10:00:00Z",
    lang: "en",
    link: "https://bbc.co.uk/x",
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.GEMINI_API_KEY = "test-gemini";
  delete process.env.GROQ_API_KEY;
});

function mockGemini(payload: object, status = 200) {
  return vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes("generativelanguage.googleapis.com")) {
      return new Response(JSON.stringify(payload), { status });
    }
    return new Response("not-mocked", { status: 599 });
  });
}

function mockGroq(payload: object, status = 200) {
  return vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes("api.groq.com")) {
      return new Response(JSON.stringify(payload), { status });
    }
    return new Response("not-mocked", { status: 599 });
  });
}

function geminiJsonPayload(json: object): object {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] };
}

function groqJsonPayload(json: object): object {
  return { choices: [{ message: { content: JSON.stringify(json) } }] };
}

const VALID = {
  title: "Yamal commits future to Barcelona",
  body: "Lamine Yamal has signed... " + "word ".repeat(700),
  excerpt: "Yamal extends his Barcelona contract.",
  tags: ["barcelona", "yamal", "transfers", "la-liga", "contract"],
};

describe("generateDraft — Gemini primary", () => {
  it("returns a draft tagged provider=gemini on success", async () => {
    vi.stubGlobal("fetch", mockGemini(geminiJsonPayload(VALID)));
    const r = await generateDraft(ITEM);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.draft.provider).toBe("gemini");
      expect(r.draft.title).toBe("Yamal commits future to Barcelona");
      expect(r.draft.tags).toContain("yamal");
    }
  });

  it("returns { ok: false, reason: 'quota' } when Gemini 429 and no Groq key", async () => {
    vi.stubGlobal("fetch", mockGemini({ error: "rate_limit" }, 429));
    const r = await generateDraft(ITEM);
    expect(r).toEqual({ ok: false, reason: "quota" });
  });
});

describe("generateDraft — Groq fallback", () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-groq";
  });

  it("falls back to Groq on Gemini 429 and succeeds", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ error: "rate_limit" }), { status: 429 });
      }
      if (u.includes("api.groq.com")) {
        return new Response(JSON.stringify(groqJsonPayload(VALID)), { status: 200 });
      }
      return new Response("not-mocked", { status: 599 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateDraft(ITEM);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.draft.provider).toBe("groq");
  });

  it("returns all_providers_failed when both fail", async () => {
    const fetchMock = vi.fn(async () => new Response("err", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateDraft(ITEM);
    expect(r).toEqual({ ok: false, reason: "all_providers_failed" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/autopost/generate.test.ts`
Expected: FAIL — module not found.

**Step 3: Implementation**

Create `lib/autopost/generate.ts`:

```typescript
import type { SelectedNewsItem, DraftPost } from "./types";

const GEMINI_MODEL = "gemini-2.0-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type GenerateResult =
  | { ok: true; draft: DraftPost }
  | { ok: false; reason: "quota" | "all_providers_failed" };

export async function generateDraft(item: SelectedNewsItem): Promise<GenerateResult> {
  const prompt = buildPrompt(item);

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    const r = await tryGemini(prompt, geminiKey);
    if (r.ok) return { ok: true, draft: { ...r.draft, provider: "gemini" } };
    // Fall through to Groq on quota or transient.
  }

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    const r = await tryGroq(prompt, groqKey);
    if (r.ok) return { ok: true, draft: { ...r.draft, provider: "groq" } };
  }

  // Neither succeeded. If we never tried Groq because no key, AND Gemini
  // failed specifically on quota, surface that — callers may want to log it
  // separately from a true outage.
  return { ok: false, reason: geminiKey && !groqKey ? "quota" : "all_providers_failed" };
}

function buildPrompt(item: SelectedNewsItem): string {
  return `You are a sports blogger for BarcaPulse, an FC Barcelona and FIFA-focused fan blog.

A news story has just broken. Source title: "${item.source.title}".
Source summary: "${item.source.content.slice(0, 600)}".
Source URL: ${item.source.link ?? "(no link)"}

Write an ORIGINAL blog post about this story. Rules:
- 700-1000 words.
- Markdown body.
- Add ANALYSIS and CONTEXT — what this means for Barcelona / the player / the season. Do NOT just summarize the source.
- End the post with a single line: *Original reporting by [source]*.
- Confident, opinionated voice. No "as an AI" disclaimers.
- Use the entities ${JSON.stringify(item.entities)} naturally in the body.

Return ONLY a JSON object (no markdown fences, no prose around it) with this shape:
{
  "title": "string — your own headline, not the source's",
  "body": "string — markdown body, 700-1000 words",
  "excerpt": "string — 1-line summary, under 200 chars",
  "tags": ["array", "of", "5", "lowercase", "tags"]
}`;
}

interface ParsedDraft {
  title: string;
  body: string;
  excerpt: string;
  tags: string[];
}

async function tryGemini(prompt: string, key: string): Promise<{ ok: true; draft: ParsedDraft } | { ok: false }> {
  try {
    const res = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: false };
    const draft = parseJsonDraft(text);
    return draft ? { ok: true, draft } : { ok: false };
  } catch {
    return { ok: false };
  }
}

async function tryGroq(prompt: string, key: string): Promise<{ ok: true; draft: ParsedDraft } | { ok: false }> {
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) return { ok: false };
    const draft = parseJsonDraft(text);
    return draft ? { ok: true, draft } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function parseJsonDraft(text: string): ParsedDraft | null {
  // Models occasionally wrap JSON in ```json fences. Strip them.
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/g, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Partial<ParsedDraft>;
    if (
      typeof parsed.title !== "string" ||
      typeof parsed.body !== "string" ||
      typeof parsed.excerpt !== "string" ||
      !Array.isArray(parsed.tags)
    ) {
      return null;
    }
    return {
      title: parsed.title.trim(),
      body: parsed.body.trim(),
      excerpt: parsed.excerpt.trim(),
      tags: parsed.tags.filter((t): t is string => typeof t === "string").slice(0, 5),
    };
  } catch {
    return null;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/autopost/generate.test.ts`
Expected: 4 tests pass.

**Step 5: Commit**

```bash
git add lib/autopost/generate.ts tests/autopost/generate.test.ts
git commit -m "$(cat <<'EOF'
feat(autopost): LLM generation with Gemini primary and Groq fallback

Author: Nishant Ranjan
EOF
)"
```

---

## Task 6: Facebook Page client

**Files:**
- Create: `lib/facebook.ts`
- Test: `tests/lib/facebook.test.ts`

**Step 1: Write the failing test**

Create `tests/lib/facebook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isFacebookConfigured, postToFacebookPage } from "@/lib/facebook";

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.FACEBOOK_PAGE_ID;
  delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
});

describe("isFacebookConfigured", () => {
  it("false when either var missing", () => {
    expect(isFacebookConfigured()).toBe(false);
    process.env.FACEBOOK_PAGE_ID = "123";
    expect(isFacebookConfigured()).toBe(false);
  });
  it("true when both set", () => {
    process.env.FACEBOOK_PAGE_ID = "123";
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "tok";
    expect(isFacebookConfigured()).toBe(true);
  });
});

describe("postToFacebookPage", () => {
  it("returns ok=false when not configured", async () => {
    const r = await postToFacebookPage({ message: "hi", link: "https://x.com" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not configured/i);
  });

  it("POSTs to /{page_id}/feed with message + link", async () => {
    process.env.FACEBOOK_PAGE_ID = "555";
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "tok";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "555_999" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await postToFacebookPage({ message: "Hello", link: "https://barcapulse.com/blog/x" });
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/555/feed");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      message: "Hello",
      link: "https://barcapulse.com/blog/x",
      access_token: "tok",
    });
  });

  it("returns ok=false on non-2xx", async () => {
    process.env.FACEBOOK_PAGE_ID = "555";
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "tok";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "Invalid OAuth" } }), { status: 400 }),
      ),
    );
    const r = await postToFacebookPage({ message: "Hi", link: "https://x.com" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Invalid OAuth/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/facebook.test.ts`
Expected: FAIL.

**Step 3: Implementation**

Create `lib/facebook.ts`:

```typescript
const GRAPH = "https://graph.facebook.com/v21.0";

export interface FacebookResult {
  ok: boolean;
  error?: string;
}

export function isFacebookConfigured(): boolean {
  return Boolean(
    process.env.FACEBOOK_PAGE_ID?.trim() &&
      process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim(),
  );
}

export async function postToFacebookPage(opts: {
  message: string;
  link: string;
}): Promise<FacebookResult> {
  const pageId = process.env.FACEBOOK_PAGE_ID?.trim();
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!pageId || !token) return { ok: false, error: "Facebook not configured" };
  try {
    const res = await fetch(`${GRAPH}/${pageId}/feed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: opts.message,
        link: opts.link,
        access_token: token,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `HTTP ${res.status}: ${body.replace(/\s+/g, " ").slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/lib/facebook.test.ts`
Expected: 5 tests pass.

**Step 5: Commit**

```bash
git add lib/facebook.ts tests/lib/facebook.test.ts
git commit -m "$(cat <<'EOF'
feat(facebook): Page Graph API client for /feed posts

Author: Nishant Ranjan
EOF
)"
```

---

## Task 7: Announce module (parallel Telegram + Facebook)

**Files:**
- Create: `lib/autopost/announce.ts`
- Test: `tests/autopost/announce.test.ts`

**Step 1: Write the failing test**

Create `tests/autopost/announce.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { announce } from "@/lib/autopost/announce";
import type { BlogPost } from "@/lib/blog/types";

const POST: BlogPost = {
  slug: "yamal-deal",
  title: "Yamal commits future",
  excerpt: "x",
  body: "y",
  tags: [],
  createdAt: "2026-05-14T10:00Z",
  updatedAt: "2026-05-14T10:00Z",
  author: "BarcaPulse",
};

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHANNEL_ID;
  delete process.env.FACEBOOK_PAGE_ID;
  delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
});

describe("announce", () => {
  it("returns 'skipped' for both when nothing is configured", async () => {
    const r = await announce(POST, "https://site.com");
    expect(r).toEqual({ telegram: "skipped", facebook: "skipped" });
  });

  it("returns 'ok' for both when both succeed", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "tg";
    process.env.TELEGRAM_CHANNEL_ID = "@x";
    process.env.FACEBOOK_PAGE_ID = "1";
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "fb";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    const r = await announce(POST, "https://site.com");
    expect(r).toEqual({ telegram: "ok", facebook: "ok" });
  });

  it("returns 'err' for the failing platform without affecting the other", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "tg";
    process.env.TELEGRAM_CHANNEL_ID = "@x";
    process.env.FACEBOOK_PAGE_ID = "1";
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "fb";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("graph.facebook.com")) {
          return new Response("err", { status: 500 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    const r = await announce(POST, "https://site.com");
    expect(r).toEqual({ telegram: "ok", facebook: "err" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/autopost/announce.test.ts`
Expected: FAIL.

**Step 3: Implementation**

Create `lib/autopost/announce.ts`:

```typescript
import { formatBlogPost, isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram";
import { isFacebookConfigured, postToFacebookPage } from "@/lib/facebook";
import type { BlogPost } from "@/lib/blog/types";
import type { AnnounceResults } from "./types";

export async function announce(post: BlogPost, siteUrl: string): Promise<AnnounceResults> {
  const url = `${siteUrl}/blog/${post.slug}`;
  const [tg, fb] = await Promise.all([
    isTelegramConfigured()
      ? sendTelegramMessage({ text: formatBlogPost(post, siteUrl) }).then((r) => (r.ok ? "ok" : "err") as const)
      : Promise.resolve("skipped" as const),
    isFacebookConfigured()
      ? postToFacebookPage({ message: `${post.title}\n\n${post.excerpt}`, link: url }).then((r) =>
          (r.ok ? "ok" : "err") as const,
        )
      : Promise.resolve("skipped" as const),
  ]);
  return { telegram: tg, facebook: fb };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/autopost/announce.test.ts`
Expected: 3 tests pass.

**Step 5: Commit**

```bash
git add lib/autopost/announce.ts tests/autopost/announce.test.ts
git commit -m "$(cat <<'EOF'
feat(autopost): parallel telegram + facebook announce module

Author: Nishant Ranjan
EOF
)"
```

---

## Task 8: Pipeline orchestrator

**Files:**
- Create: `lib/autopost/pipeline.ts`
- Test: `tests/autopost/pipeline.test.ts`

**Step 1: Write the failing test**

Create `tests/autopost/pipeline.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { runPipeline } from "@/lib/autopost/pipeline";
import { _resetBlogStore, blogStore } from "@/lib/blog/store";
import { _resetAutopostState, autopostState } from "@/lib/autopost/state";
import type { NewsPost } from "@/lib/types";

function newsItem(over: Partial<NewsPost> = {}): NewsPost {
  return {
    id: "1",
    slug: "bbc-sport-barcelona-yamal-deal",
    title: "Yamal signs Barcelona deal",
    content: "Lamine Yamal signed today.",
    category: "barca",
    createdAt: "2026-05-14T10:00:00Z",
    lang: "en",
    link: "https://bbc.co.uk/x",
    ...over,
  };
}

const GOOD_DRAFT = {
  title: "Yamal commits future to Barcelona",
  body: "Lamine Yamal has signed a new contract with Barcelona. " + "word ".repeat(700),
  excerpt: "Yamal extends his Barcelona contract.",
  tags: ["barcelona", "yamal"],
  provider: "gemini" as const,
};

beforeEach(async () => {
  _resetBlogStore();
  _resetAutopostState();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.AUTOPOST_ENABLED;
  await blogStore()._reset?.();
  await autopostState()._reset?.();
  vi.restoreAllMocks();
});

describe("runPipeline", () => {
  it("returns disabled when AUTOPOST_ENABLED=false", async () => {
    process.env.AUTOPOST_ENABLED = "false";
    const r = await runPipeline({
      fetchNews: async () => [],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "disabled" });
  });

  it("skips with no_eligible_news when feed is empty", async () => {
    const r = await runPipeline({
      fetchNews: async () => [],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "no_eligible_news" });
  });

  it("publishes a passing draft and records the publish", async () => {
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "ok", facebook: "ok" }),
      siteUrl: "https://x.com",
    });
    expect(r.status).toBe("published");
    if (r.status === "published") {
      expect(r.slug).toBe("yamal-commits-future-to-barcelona");
      expect(r.announces).toEqual({ telegram: "ok", facebook: "ok" });
    }
    expect(await autopostState().publishedToday()).toBe(1);
  });

  it("skips when word count gate fails", async () => {
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () =>
        ({ ok: true, draft: { ...GOOD_DRAFT, body: "too short" } }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "gate_word_count" });
    expect(await autopostState().publishedToday()).toBe(0);
  });

  it("skips when day cap is already reached", async () => {
    const s = autopostState();
    for (let i = 0; i < 24; i++) await s.recordPublish({ provider: "gemini" });
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "day_cap_reached" });
  });

  it("skips with manual_cooldown when newest blog post is younger than 55min", async () => {
    await blogStore().create({ title: "Manual post", body: "x" });
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: true, draft: GOOD_DRAFT }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "manual_cooldown" });
  });

  it("propagates provider failure as all_providers_failed", async () => {
    const r = await runPipeline({
      fetchNews: async () => [newsItem()],
      generate: async () => ({ ok: false, reason: "all_providers_failed" }),
      announceFn: async () => ({ telegram: "skipped", facebook: "skipped" }),
      siteUrl: "https://x.com",
    });
    expect(r).toEqual({ status: "skipped", reason: "all_providers_failed" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/autopost/pipeline.test.ts`
Expected: FAIL — module not found.

**Step 3: Implementation**

Create `lib/autopost/pipeline.ts`:

```typescript
import type { NewsPost } from "@/lib/types";
import { blogStore } from "@/lib/blog/store";
import { autopostState } from "./state";
import { selectNewsItem, extractEntities } from "./select";
import {
  wordCountGate,
  duplicateTopicGate,
  bannedPhrasesGate,
  entityCoverageGate,
} from "./gates";
import type { DraftPost, PipelineResult, AnnounceResults } from "./types";
import type { GenerateResult } from "./generate";

const DAY_CAP = 24;
const MANUAL_COOLDOWN_MS = 55 * 60 * 1000;

export interface PipelineDeps {
  fetchNews: () => Promise<NewsPost[]>;
  generate: (item: ReturnType<typeof selectNewsItem> & object) => Promise<GenerateResult>;
  announceFn: (post: import("@/lib/blog/types").BlogPost, siteUrl: string) => Promise<AnnounceResults>;
  siteUrl: string;
}

export async function runPipeline(deps: PipelineDeps): Promise<PipelineResult> {
  if (process.env.AUTOPOST_ENABLED === "false") {
    return { status: "skipped", reason: "disabled" };
  }

  const state = autopostState();

  if (await state.dayCapReached(DAY_CAP)) {
    await state.recordSkip("day_cap_reached");
    return { status: "skipped", reason: "day_cap_reached" };
  }

  // Manual cooldown: don't auto-post if a human posted within the last 55 min.
  const recent = await blogStore().list({ limit: 1 });
  if (recent.length > 0) {
    const age = Date.now() - +new Date(recent[0].createdAt);
    if (age < MANUAL_COOLDOWN_MS) {
      await state.recordSkip("manual_cooldown");
      return { status: "skipped", reason: "manual_cooldown" };
    }
  }

  // 1. Select
  const items = await deps.fetchNews();
  const recentEntities = await state.recentEntities(7);
  const selected = selectNewsItem(items, { recentEntities, excludeSources: [] });
  if (!selected) {
    await state.recordSkip("no_eligible_news");
    return { status: "skipped", reason: "no_eligible_news" };
  }

  // 2. Generate
  await state.recordGenerated();
  const gen = await deps.generate(selected);
  if (!gen.ok) {
    await state.recordSkip(gen.reason);
    return { status: "skipped", reason: gen.reason };
  }
  const draft: DraftPost = gen.draft;

  // 3. Quality gates
  const gateResult = runGates({ draft, item: selected, recent });
  if (gateResult !== "ok") {
    await state.recordSkip(gateResult);
    return { status: "skipped", reason: gateResult };
  }

  // 4. Persist
  const attribution = selected.source.link
    ? `\n\n*Original reporting by [${selected.source.title}](${selected.source.link})*`
    : "";
  const post = await blogStore().create({
    title: draft.title,
    body: draft.body + attribution,
    excerpt: draft.excerpt,
    tags: draft.tags,
    author: "BarcaPulse",
  });
  await state.recordPublish({ provider: draft.provider });
  await state.recordEntities(selected.entities);

  // 5. Announce (best-effort)
  const announces = await deps.announceFn(post, deps.siteUrl);

  return { status: "published", slug: post.slug, provider: draft.provider, announces };
}

function runGates(args: {
  draft: DraftPost;
  item: ReturnType<typeof selectNewsItem> & object;
  recent: import("@/lib/blog/types").BlogPost[];
}): "ok" | "gate_word_count" | "gate_duplicate_topic" | "gate_banned_phrases" | "gate_entity_coverage" {
  if (!wordCountGate(args.draft.body)) return "gate_word_count";
  if (!bannedPhrasesGate(args.draft.body)) return "gate_banned_phrases";
  if (!entityCoverageGate({ entities: args.item.entities, body: args.draft.body }))
    return "gate_entity_coverage";
  const titleEntities = extractEntities(args.draft.title).map((s) => s.toLowerCase());
  const dupe = duplicateTopicGate({
    newTitle: args.draft.title,
    recentTitles: args.recent.map((p) => p.title),
    newEntities: titleEntities,
    recentEntities: [],
  });
  if (!dupe) return "gate_duplicate_topic";
  return "ok";
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/autopost/pipeline.test.ts`
Expected: 7 tests pass.

**Step 5: Commit**

```bash
git add lib/autopost/pipeline.ts tests/autopost/pipeline.test.ts
git commit -m "$(cat <<'EOF'
feat(autopost): pipeline orchestrator with all stages wired

Author: Nishant Ranjan
EOF
)"
```

---

## Task 9: Env additions for cron + autopost flags

**Files:**
- Modify: `lib/env.ts`
- Test: `tests/lib/env.test.ts`

**Step 1: Add to env test**

Open `tests/lib/env.test.ts` and add this `describe` block at the bottom:

```typescript
describe("autopost env", () => {
  it("exposes cronToken and autopostEnabled", () => {
    process.env.CRON_TOKEN = "secret";
    process.env.AUTOPOST_ENABLED = "true";
    resetEnvCache();
    expect(env.cronToken).toBe("secret");
    expect(env.autopostEnabled).toBe(true);
  });
  it("autopostEnabled defaults to false", () => {
    delete process.env.AUTOPOST_ENABLED;
    resetEnvCache();
    expect(env.autopostEnabled).toBe(false);
  });
  it("autopostEnabled=true only when literal 'true'", () => {
    process.env.AUTOPOST_ENABLED = "yes";
    resetEnvCache();
    expect(env.autopostEnabled).toBe(false);
  });
});
```

(Note: `resetEnvCache` is already exported from `lib/env.ts`. Existing tests already import it.)

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/env.test.ts`
Expected: FAIL — `env.cronToken` / `env.autopostEnabled` don't exist.

**Step 3: Modify `lib/env.ts`**

Edit `lib/env.ts`. In the `AppEnv` interface, add:

```typescript
  cronToken?: string;
  autopostEnabled: boolean;
```

In the `build()` function, add to the returned object:

```typescript
    cronToken: process.env.CRON_TOKEN?.trim() || undefined,
    autopostEnabled: process.env.AUTOPOST_ENABLED?.trim() === "true",
```

**Step 4: Verify tests pass**

Run: `npm test -- tests/lib/env.test.ts`
Expected: all env tests pass (existing + 3 new).

**Step 5: Commit**

```bash
git add lib/env.ts tests/lib/env.test.ts
git commit -m "$(cat <<'EOF'
feat(env): add cronToken and autopostEnabled

Author: Nishant Ranjan
EOF
)"
```

---

## Task 10: API route — `/api/cron/auto-post`

**Files:**
- Create: `app/api/cron/auto-post/route.ts`
- Test: `tests/autopost/route.test.ts`

**Step 1: Write the failing test**

Create `tests/autopost/route.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/cron/auto-post/route";
import { _resetBlogStore, blogStore } from "@/lib/blog/store";
import { _resetAutopostState, autopostState } from "@/lib/autopost/state";
import { resetEnvCache } from "@/lib/env";

beforeEach(async () => {
  _resetBlogStore();
  _resetAutopostState();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.AUTOPOST_ENABLED;
  process.env.CRON_TOKEN = "test-cron-token";
  process.env.SITE_URL = "https://site.example";
  resetEnvCache();
  await blogStore()._reset?.();
  await autopostState()._reset?.();
  vi.restoreAllMocks();
});

function withAuth(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/auto-post", {
    method: "POST",
    headers: { authorization: "Bearer test-cron-token", ...headers },
  });
}

describe("POST /api/cron/auto-post", () => {
  it("returns 401 without bearer", async () => {
    const r = await POST(new Request("http://localhost/api/cron/auto-post", { method: "POST" }));
    expect(r.status).toBe(401);
  });

  it("returns 401 with wrong bearer", async () => {
    const r = await POST(
      new Request("http://localhost/api/cron/auto-post", {
        method: "POST",
        headers: { authorization: "Bearer nope" },
      }),
    );
    expect(r.status).toBe(401);
  });

  it("returns 200 + disabled when AUTOPOST_ENABLED=false", async () => {
    process.env.AUTOPOST_ENABLED = "false";
    resetEnvCache();
    const r = await POST(withAuth());
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ status: "skipped", reason: "disabled" });
  });

  // Note: a full happy-path test through this route would require mocking
  // fetchAllNews, generateDraft, and announce — too much surface for a unit
  // test. The pipeline test (Task 8) already covers that. We just confirm
  // here that the route auths correctly and forwards results.
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/autopost/route.test.ts`
Expected: FAIL — module not found.

**Step 3: Implementation**

Create `app/api/cron/auto-post/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { fetchAllNews } from "@/lib/news/rss";
import { runPipeline } from "@/lib/autopost/pipeline";
import { generateDraft } from "@/lib/autopost/generate";
import { announce } from "@/lib/autopost/announce";
import { autopostState } from "@/lib/autopost/state";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const result = await runPipeline({
      fetchNews: fetchAllNews,
      generate: generateDraft,
      announceFn: announce,
      siteUrl: env.siteUrl,
    });

    if (result.status === "published") {
      revalidatePath("/blog");
      revalidatePath(`/blog/${result.slug}`);
      revalidatePath("/sitemap.xml");
    }

    // One-line structured log for grepping.
    console.log(
      JSON.stringify({
        kind: "autopost",
        durationMs: Date.now() - started,
        ...result,
      }),
    );

    return NextResponse.json(result);
  } catch (err) {
    await autopostState().recordError();
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ kind: "autopost", error: message, durationMs: Date.now() - started }));
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}

function isAuthed(req: Request): boolean {
  const expected = env.cronToken;
  if (!expected) return false;
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  const got = m?.[1];
  if (!got || got.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/autopost/route.test.ts`
Expected: 3 tests pass.

**Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests pass (existing + ~32 new).

**Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

**Step 7: Commit**

```bash
git add app/api/cron/auto-post/route.ts tests/autopost/route.test.ts
git commit -m "$(cat <<'EOF'
feat(autopost): /api/cron/auto-post route with bearer-token auth

Author: Nishant Ranjan
EOF
)"
```

---

## Task 11: GitHub Actions hourly cron workflow

**Files:**
- Create: `.github/workflows/auto-post.yml`

**Step 1: Verify the file location is correct**

Run: `ls .github/workflows/ 2>/dev/null || echo "no workflows yet"`
Expected: either an empty/existing list or "no workflows yet".

**Step 2: Write the workflow**

Create `.github/workflows/auto-post.yml`:

```yaml
name: Hourly auto-post

on:
  schedule:
    - cron: "0 * * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Call /api/cron/auto-post
        env:
          SITE_URL: https://dhf-fcb.iamnishant.in
          CRON_TOKEN: ${{ secrets.CRON_TOKEN }}
        run: |
          set -euo pipefail
          if [ -z "${CRON_TOKEN:-}" ]; then
            echo "CRON_TOKEN secret is missing"
            exit 1
          fi
          response=$(mktemp)
          http=$(curl --silent --show-error --max-time 90 \
            --output "$response" --write-out "%{http_code}" \
            -X POST "$SITE_URL/api/cron/auto-post" \
            -H "Authorization: Bearer $CRON_TOKEN")
          echo "HTTP $http"
          cat "$response"
          echo
          # Any 2xx is success — pipeline returns 200 for both published
          # and skipped (skipped is expected on slow news hours).
          if [[ "$http" =~ ^2 ]]; then
            exit 0
          fi
          exit 1
```

**Step 3: Verify YAML syntax**

Run:
```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/auto-post.yml'))" && echo "OK"
```
Expected: `OK`.

**Step 4: Commit**

```bash
git add .github/workflows/auto-post.yml
git commit -m "$(cat <<'EOF'
ci(autopost): GitHub Actions hourly cron triggering /api/cron/auto-post

Author: Nishant Ranjan
EOF
)"
```

---

## Task 12: Admin stats route

**Files:**
- Create: `app/api/admin/autopost/stats/route.ts`

**Step 1: Write the route**

Create `app/api/admin/autopost/stats/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/blog/auth";
import { autopostState } from "@/lib/autopost/state";

export async function GET(req: Request) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const days = await autopostState().recentStats(7);
  return NextResponse.json({ days });
}
```

**Step 2: Smoke-check it typechecks**

Run: `npm run typecheck`
Expected: no errors.

**Step 3: Commit**

```bash
git add app/api/admin/autopost/stats/route.ts
git commit -m "$(cat <<'EOF'
feat(autopost): admin stats API route (last 7 days)

Author: Nishant Ranjan
EOF
)"
```

---

## Task 13: Admin dashboard page

**Files:**
- Create: `app/admin/(authed)/autopost/page.tsx`

**Step 1: Inspect the existing admin layout for patterns**

Run: `cat 'app/admin/(authed)/layout.tsx'`
Expected: read the layout to see how nav / styling is structured. Match patterns.

**Step 2: Write the page**

Create `app/admin/(authed)/autopost/page.tsx`:

```typescript
import { autopostState } from "@/lib/autopost/state";

export const dynamic = "force-dynamic";

export default async function AutopostDashboard() {
  const days = await autopostState().recentStats(7);
  const total = days.reduce((acc, d) => ({
    published: acc.published + d.published,
    generated: acc.generated + d.generated,
    errors: acc.errors + d.errors,
    by_gemini: acc.by_gemini + d.by_gemini,
    by_groq: acc.by_groq + d.by_groq,
  }), { published: 0, generated: 0, errors: 0, by_gemini: 0, by_groq: 0 });

  return (
    <div className="px-3 py-4 text-white">
      <h1 className="text-xl font-bold mb-3">Auto-post stats — last 7 days</h1>

      <section className="grid grid-cols-2 gap-2 mb-6">
        <Tile label="Published" value={total.published} />
        <Tile label="Generated" value={total.generated} />
        <Tile label="Gemini" value={total.by_gemini} />
        <Tile label="Groq" value={total.by_groq} />
        <Tile label="Errors" value={total.errors} />
      </section>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted mb-2">
        Per day
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-muted">
            <th className="py-1">Date</th>
            <th>Pub</th>
            <th>Gen</th>
            <th>Gemini</th>
            <th>Groq</th>
            <th>Err</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date} className="border-t border-ink-line">
              <td className="py-1">{d.date}</td>
              <td>{d.published}</td>
              <td>{d.generated}</td>
              <td>{d.by_gemini}</td>
              <td>{d.by_groq}</td>
              <td>{d.errors}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted mt-6 mb-2">
        Skip reasons (today)
      </h2>
      <ul className="text-sm space-y-1">
        {Object.entries(days[days.length - 1]?.skipped_by_reason ?? {}).map(
          ([reason, count]) => (
            <li key={reason} className="text-ink-muted">
              <span className="text-white">{count}</span> × {reason}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-ink-soft border border-ink-line rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
```

**Step 3: Verify the page builds**

Run: `npm run typecheck`
Expected: no errors.

**Step 4: Manually verify**

Run: `npm run dev` (in another terminal) → log in at `/admin/login` → navigate to `/admin/autopost`. You should see zeros across the board with no errors.

(Kill the dev server when done: `Ctrl-C`.)

**Step 5: Commit**

```bash
git add 'app/admin/(authed)/autopost/page.tsx'
git commit -m "$(cat <<'EOF'
feat(autopost): admin dashboard for 7-day stats

Author: Nishant Ranjan
EOF
)"
```

---

## Task 14: Ops runbook

**Files:**
- Create: `docs/autopost.md`

**Step 1: Write the runbook**

Create `docs/autopost.md`:

```markdown
# Auto-post — operator runbook

A GitHub Actions cron triggers `POST /api/cron/auto-post` every hour. The
route picks an uncovered news headline, asks Gemini (with Groq fallback) to
write an original post, runs four quality gates, persists the post, then
pushes to Telegram and the Facebook Page.

## Required env vars (Vercel)

| Var | Source | Notes |
|---|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/ → API keys | Free tier: 1500 req/day |
| `GROQ_API_KEY` | https://console.groq.com/ → API keys | Optional but recommended. Free tier: ~14400 req/day |
| `FACEBOOK_PAGE_ID` | FB Page → About → Page ID | Numeric |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Meta dev portal, long-lived | ~60 day lifetime — see Renewal below |
| `CRON_TOKEN` | `openssl rand -hex 32` | Random secret; also set as GH repo secret |
| `AUTOPOST_ENABLED` | `"true"` to start, `"false"` to pause | Kill switch |
| `SITE_URL` | `https://dhf-fcb.iamnishant.in` | Already set; used for post links |

## GitHub Actions setup

1. Repo → Settings → Secrets and variables → Actions
2. New repository secret: `CRON_TOKEN` (same value as Vercel)
3. The workflow at `.github/workflows/auto-post.yml` runs on `cron: "0 * * * *"`
4. To test immediately: Actions → "Hourly auto-post" → Run workflow

## Kill switch

Pause everything without a deploy: set `AUTOPOST_ENABLED=false` in Vercel and
redeploy (env-only redeploy is fast). The route returns
`{ status: "skipped", reason: "disabled" }`.

To resume: set `AUTOPOST_ENABLED=true` and redeploy.

## Facebook token renewal

Meta's long-lived Page Access Tokens last ~60 days. To renew:

1. Generate a new long-lived User token via Graph Explorer
2. Exchange for a long-lived Page token: `GET /me/accounts`
3. Replace `FACEBOOK_PAGE_ACCESS_TOKEN` in Vercel and redeploy

Calendar a reminder for ~50 days after each rotation.

## Monitoring

- **Per-run logs:** Vercel → Logs, filter `kind:"autopost"`. Each run emits one
  JSON line with `status`, `reason`, `durationMs`, `slug` if published.
- **Dashboard:** `/admin/autopost` shows the last 7 days of counters.
- **GitHub Actions:** Actions tab → "Hourly auto-post" — green/red per hour.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| All runs return `quota` | Gemini free tier exhausted | Wait for daily reset (midnight Pacific), or add `GROQ_API_KEY` |
| All runs return `no_eligible_news` | Recent-topics set too aggressive | Wait — topics expire after 7 days |
| All runs return `gate_word_count` | Model producing short outputs | Bump prompt's word-count instruction; check Gemini quota didn't switch model |
| Facebook push always `err` | Token expired | Renew per "Facebook token renewal" above |
| Telegram push always `err` | Bot was kicked from channel / token rotated | Re-invite bot; rotate `TELEGRAM_BOT_TOKEN` |
| GH Actions runs not firing | Cron drifted; GitHub disabled cron on idle repo | Trigger via `workflow_dispatch` to revive |

## Rolling back

To stop new auto-posts and keep existing ones:
1. `AUTOPOST_ENABLED=false` → redeploy.

To delete a specific bad auto-post:
1. Admin UI → Blog → Delete on that post.

To wipe the entire auto-posting feature (emergency):
1. Disable the GH Actions workflow (Actions → "Hourly auto-post" → ⋯ → Disable workflow).
2. Set `AUTOPOST_ENABLED=false`.
3. Revert the feature branch when ready.
```

**Step 2: Commit**

```bash
git add docs/autopost.md
git commit -m "$(cat <<'EOF'
docs(autopost): operator runbook with env setup, troubleshooting, rollback

Author: Nishant Ranjan
EOF
)"
```

---

## Task 15: Final verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: all tests pass. Note total count vs. baseline.

**Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

**Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

**Step 4: Build (production)**

Run: `npm run build`
Expected: build succeeds. Note: this calls `prebuild` which fetches static fixtures — should work as long as you have network access.

**Step 5: Manual smoke test (after deploy + env setup)**

Once deployed to Vercel with all env vars set (see `docs/autopost.md`):
```bash
curl -X POST https://dhf-fcb.iamnishant.in/api/cron/auto-post \
  -H "Authorization: Bearer $CRON_TOKEN" | jq
```
Expected: HTTP 200, JSON with either `status:"published"` (with `slug`) or `status:"skipped"` (with `reason`).

Verify the published post exists:
```bash
curl https://dhf-fcb.iamnishant.in/blog | grep -c "href=\"/blog/"
```
Expected: increases by 1 vs. before the call.

**Step 6: Verify Telegram + Facebook posts arrived**

- Telegram channel: new message with post title.
- Facebook Page: new post with title + excerpt + link.

**Step 7: Open PR (if working in a worktree)**

```bash
git push -u origin feat/autopost
gh pr create --title "feat: hourly autonomous blog generation" --body "$(cat <<'EOF'
## Summary
- Hourly auto-blog generation: Gemini primary + Groq fallback
- Four quality gates (word count, dupe topic, banned phrases, entity coverage)
- Telegram + Facebook Page announce
- Admin dashboard at /admin/autopost
- Kill switch via AUTOPOST_ENABLED env var

Design: docs/plans/2026-05-14-hourly-autopost-design.md
Plan:   docs/plans/2026-05-14-hourly-autopost-plan.md
Runbook: docs/autopost.md

## Test plan
- [ ] npm test — all pass
- [ ] npm run typecheck — clean
- [ ] npm run build — succeeds
- [ ] After merge + env setup: manual curl returns 200
- [ ] First scheduled run publishes a post and pushes to TG + FB
- [ ] /admin/autopost shows the run

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Done criteria

- All 15 tasks committed with green tests.
- Vercel env vars set per `docs/autopost.md`.
- `AUTOPOST_ENABLED=true`.
- First scheduled GH Actions run published a real post and announced to both channels.
- `/admin/autopost` reflects the run.

## Future work (not in this plan)

- Cover-image generation (deferred per design doc's "Open questions").
- Self-extending refresh of long-lived FB token via cron.
- Multi-language post generation (Spanish/English split for `lang=es` sources).
- A/B prompt experiments tracked through provider stats.

# Hourly Auto-Posting — Design

**Date:** 2026-05-14
**Status:** Design validated, ready for implementation plan
**Motivation:** AdSense application is blocked on content volume (`docs/adsense.md` calls for 10–20 original posts). This system generates one original blog post per hour from existing news sources, runs quality gates, then publishes to the blog + announces to Telegram and a Facebook Page.

## Goals

- Reach ~20 quality posts within 24 hours of enabling, satisfying AdSense's "real, useful site" bar.
- Sustain a steady cadence afterwards without manual effort.
- Fail safe: a bad hour produces no post, not a bad post.
- Stay reversible: a single env-var flip pauses everything.

## Non-goals

- Replacing the existing admin/manual blog flow. Manual posts coexist; the auto-poster yields when a manual post has been published in the same hour.
- Multi-author voices, image generation, video. Text + source attribution only.
- Reviewing posts before publishing. We chose autonomous publishing with **quality gates** instead.

## Architecture overview

Every hour, GitHub Actions hits a protected Vercel API route. The route picks an uncovered news headline, asks Gemini 2.0 Flash to write an original ~800-word post, runs four quality gates, and on success persists the post and pushes to Telegram + Facebook.

| Layer | Where | What |
|---|---|---|
| Scheduler | `.github/workflows/auto-post.yml` | `0 * * * *` cron → `curl POST /api/cron/auto-post -H "Authorization: Bearer $CRON_TOKEN"` |
| HTTP entry | `app/api/cron/auto-post/route.ts` | Auth check, orchestration, structured logging, returns JSON status |
| Pipeline | `lib/autopost/pipeline.ts` | Pure async function: `run() → { status, post?, reason? }`. Drives the 5 stages below. |
| News selection | `lib/autopost/select.ts` | Pull from existing news sources, filter out already-covered topics |
| Generation | `lib/autopost/generate.ts` | Gemini API call with sports-blog prompt template; Groq fallback |
| Quality gates | `lib/autopost/gates.ts` | Four pure functions: word count, similarity, banned phrases, entity coverage |
| Publish | `lib/autopost/publish.ts` | Reuses existing `blogStore().create()` + state updates |
| Announce | `lib/autopost/announce.ts` | Parallel push to Telegram + Facebook (best-effort) |
| Facebook client | `lib/facebook.ts` | One function: `postLink({ message, link })` → Meta Graph API |
| State | Upstash Redis | New keys: `autopost:recent_topics` (sorted set), `autopost:stats:YYYYMMDD` (counters) |

**Key principle:** the route is dumb — it authenticates and calls `pipeline.run()`. All logic is in `lib/autopost/*`, fully unit-testable without HTTP/network mocking.

## Stack decisions

| Decision | Choice | Why |
|---|---|---|
| Content source | AI-rewritten news from existing RSS feeds (`lib/news`) | Already wired up; gives original-enough output; topical |
| Primary LLM | Gemini 2.0 Flash | Free tier covers 24/day with room; quality acceptable for sports rewrites |
| Fallback LLM | Groq (Llama 3.3 70B) | Independent vendor; 14,400 free req/day; one fallback hop, no retry loop |
| Scheduler | GitHub Actions cron | Free, version-controlled in repo, no new service; ±15min drift acceptable for blog cadence |
| Review flow | Fully autonomous + quality gates | Speed to AdSense-eligible content; gates filter bad outputs |
| Facebook | Meta Graph API with long-lived Page Access Token | Standard, well-documented; needs one-time ~30min token setup |

**Rejected alternatives:**
- Vercel Pro cron — $20/mo for a single feature, not justified.
- Upstash QStash — adds a dashboard nobody on the team can audit; GH Actions cron config lives in the repo.
- Draft-queue review flow — slows the AdSense path; quality gates give 80% of the safety with 0% of the manual work.
- Grok — same cost tier as Gemini Sonnet without the long-form strength.
- DeepSeek — fine choice but Gemini + Groq together hit $0/mo, which DeepSeek alone doesn't.

## Pipeline data flow

The pipeline runs five sequential stages. Each stage either passes input forward or returns a `skip` result with a reason. Exceptions are reserved for bugs/outages, not expected failure paths.

```
GET /api/cron/auto-post  (Authorization: Bearer $CRON_TOKEN)
  │
  ▼
1. SELECT NEWS ITEM
   - Fetch latest from existing news sources (lib/news)
   - Drop items whose key entities are in autopost:recent_topics (7d window)
   - Pick top 1 by source quality + recency
   → NewsItem | { skip: "no_eligible_news" }
  │
  ▼
2. GENERATE POST (Gemini, fallback Groq)
   - Prompt: source headline + summary + style rules
   - JSON output: { title, body (markdown, 800-1000 words), tags[5], excerpt }
   - 30s timeout, 1 retry on transient failure
   - On Gemini quota/transient: one fallback hop to Groq
   → DraftPost | throws
  │
  ▼
3. QUALITY GATES (all four must pass)
   a. word_count:       body ≥ 600 words
   b. duplicate_topic:  Jaccard of title tokens vs last 7d titles < 0.5
                        AND key entities not in recent_topics
   c. banned_phrases:   no "as an AI", "language model", "I cannot";
                        no repeated paragraph (≥3 sentence verbatim repeat)
   d. entity_coverage:  every named entity from source headline appears in body
   → DraftPost | { skip: "gate_<name>_failed" }
  │
  ▼
4. PERSIST
   - blogStore().create(draft)
   - ZADD autopost:recent_topics (entities, score=now)
   - INCR autopost:stats:YYYYMMDD.{generated,published}
   → BlogPost
  │
  ▼
5. ANNOUNCE (parallel, best-effort)
   - Telegram: existing lib/telegram.ts
   - Facebook: lib/facebook.ts → POST /{page_id}/feed
   - Both wrapped — post stays live even if push fails
   → { post, announces: { telegram, facebook } }
```

**Route return contract:**
```json
{
  "status": "published" | "skipped" | "error",
  "reason": "gate_word_count_failed" | "no_eligible_news" | "quota" | ...,
  "post": { "slug": "...", "title": "..." },
  "announces": { "telegram": "ok", "facebook": "ok" }
}
```

A `skipped` response returns HTTP 200. Only HTTP 500 if the pipeline itself crashes. This means a slow news day produces green GH Actions runs, not red alerts.

## Provider fallback

Single hop, not a retry loop, to bound execution time within Vercel's function timeout and avoid double-billing for partial responses.

```
generate(prompt):
  result = await tryGemini(prompt)
  if (result.retry === "quota" || result.retry === "transient")
    return await tryGroq(prompt)
  return result
```

**If both providers fail:** the route returns `{ status: "skipped", reason: "all_providers_failed" }` with HTTP 200. Next hour tries again.

**If `GROQ_API_KEY` is missing:** the pipeline degrades gracefully — Gemini failure becomes a skip instead of a fallback attempt. Telemetry still records the cause.

**Stats tracking:** `autopost:stats:YYYYMMDD` includes `generated_by_gemini` and `generated_by_groq` counters. The `/admin/autopost` dashboard exposes fallback usage. Sustained Groq usage >20% is a signal Gemini quota is too tight.

## Error handling

| Failure | Response | Why |
|---|---|---|
| Gemini API timeout (>30s) | Retry once with 5s delay; then fallback to Groq | Transient — most Gemini outages are <1min |
| Gemini quota exceeded (429) | Fallback to Groq immediately | Free tier is 1500 RPD; quota signals hit-the-ceiling |
| Provider returns malformed JSON | Retry once with stricter prompt; then skip | Model occasionally adds ```json fences |
| All gates fail | HTTP 200 `{status:"skipped", reason:"gate_*"}` | Expected; not an error |
| Redis write fails after generation | HTTP 500 with generated body in logs | Rare; surface so it can be manually published |
| Telegram/Facebook push fails | Log error, HTTP 200 `{announces:{...}}` with failures | Post is already live; social push is best-effort |
| Auth header missing/wrong | HTTP 401 immediately | Cheap rejection of probing |

## AdSense-safety guardrails (hard-coded, not config)

1. **Hard cap: 24 posts/day.** Day counter `autopost:stats:YYYYMMDD.published > 24` → skip. Prevents runaway if cron double-fires.
2. **Soft cap: 1 post per source per 24h.** Prevents single RSS source dominating the day.
3. **Cooldown after manual posts.** If newest blog post is <55min old, auto-skip. Lets you publish manually without auto-post stepping on it.
4. **Source attribution.** Every generated post ends with `*Original reporting by [Source Name](url)*`. Cheapest AdSense copyright insurance.
5. **`X-Robots-Tag: noindex` for first 10 minutes.** Posts whose `generatedAt` is <10min old send `noindex` header. Window to spot bad posts before Google crawls them.

## Observability

- **Per-run log line** (structured): `{ts, status, reason, durationMs, sourceUrl, sourceName, slug, wordCount, provider}`. Greppable in Vercel logs.
- **Daily stats key:** `autopost:stats:2026-05-14` → `{generated, published, skipped_by_gate, skipped_by_cap, errors, by_gemini, by_groq}`.
- **Admin dashboard:** `/admin/autopost` renders the last 7 days from stats keys. Lists recent posts with slug + provider + gate-pass timing.

## Kill switch

Env var `AUTOPOST_ENABLED=false` makes the route return HTTP 200 `{status:"disabled"}` immediately. No deploy needed to pause everything. Documented in the ops runbook.

## File surface

```
NEW
├── .github/workflows/auto-post.yml             # cron 0 * * * *, curls the route
├── app/api/cron/auto-post/route.ts             # ~40 lines, auth + call pipeline
├── app/admin/(authed)/autopost/page.tsx        # 7-day stats dashboard
├── app/api/admin/autopost/stats/route.ts       # GET stats JSON
├── lib/autopost/
│   ├── types.ts            # DraftPost, PipelineResult, NewsItem
│   ├── pipeline.ts         # orchestrator
│   ├── select.ts           # news selection + recent-topic filter
│   ├── generate.ts         # Gemini + Groq with fallback
│   ├── gates.ts            # 4 pure gate functions
│   ├── publish.ts          # blog create + recent-topics update + stats incr
│   ├── announce.ts         # parallel telegram + facebook push
│   └── state.ts            # Redis helpers: recent-topics, stats, day-cap
├── lib/facebook.ts         # Page Graph API client (postLink)
└── tests/autopost/*.test.ts                    # 5 test files

CHANGED
├── lib/env.ts              # add GEMINI_API_KEY, GROQ_API_KEY,
│                           #     FACEBOOK_PAGE_ACCESS_TOKEN, FACEBOOK_PAGE_ID,
│                           #     CRON_TOKEN, AUTOPOST_ENABLED
└── docs/autopost.md        # new: setup + ops runbook
```

Estimated size: ~600 lines production code, ~400 lines tests, ~150 lines docs. Single PR.

## Testing strategy

Mirrors `lib/autopost/` — each pure function has its own test. Only HTTP transport (`fetch`) is mocked; never the library's behavior under test.

| Layer | Mock | Don't mock |
|---|---|---|
| `generate.ts` | `fetch` returning canned provider responses | Parsing logic |
| `select.ts` | `fetch` for RSS | Filtering logic |
| `gates.ts` | Nothing — pure functions | Anything |
| `pipeline.ts` | The four lib functions above (dependency injection) | Orchestration |
| `facebook.ts` | `fetch` only | Request shaping |

**Critical tests:**
1. Gemini quota error → falls back to Groq → publishes.
2. Each gate has a passing-input + failing-input test.
3. Pipeline returns `skipped` (HTTP 200) on every expected non-error path.
4. Hard cap: 24th post passes, 25th returns skip.
5. Duplicate-topic: same headline twice → second is rejected.

## Env vars

| Var | Source | When |
|---|---|---|
| `GEMINI_API_KEY` | aistudio.google.com → API keys | Before first deploy |
| `GROQ_API_KEY` | console.groq.com → API keys | Before first deploy |
| `FACEBOOK_PAGE_ID` | FB Page → About | Before first deploy |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Meta dev portal, long-lived | Before first deploy |
| `CRON_TOKEN` | `openssl rand -hex 32` | Before first deploy |
| `AUTOPOST_ENABLED` | `"true"` to start, `"false"` to pause | Anytime |

Plus a GitHub repo secret `CRON_TOKEN` (same value) so the workflow can curl with `Authorization: Bearer $CRON_TOKEN`.

## Rollout plan

1. Land the code with `AUTOPOST_ENABLED=false`.
2. Smoke-test the route manually with `curl -H "Authorization: Bearer $CRON_TOKEN"` to confirm one full happy path.
3. Flip `AUTOPOST_ENABLED=true`. Let GH Actions run for 24h.
4. Review the resulting ~20 posts. Edit/delete any that look weak.
5. Tighten gates if needed (raise word-count threshold, add banned phrases).
6. Apply for AdSense once content count and quality meet the bar in `docs/adsense.md`.

## Open questions

- Facebook token lifetime: long-lived Page tokens technically last ~60 days unless extended via long-lived User token. Need a renewal reminder or a doc note in `docs/autopost.md`. Will revisit during the implementation plan.
- Image strategy: posts currently have optional `coverImage`. We could pull og:image from the source article (with attribution) or skip cover images entirely. Defaulting to "skip" for v1 to avoid copyright risk; revisit after AdSense approval.

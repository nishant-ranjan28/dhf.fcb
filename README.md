# BarcaPulse

Mobile-first football web app focused on **FC Barcelona** (primary) and the **FIFA World Cup** (secondary). Built for speed, Facebook traffic, and Telegram-funnel monetization.

## Stack

- Next.js 16 (App Router) + React 19.2 + Turbopack
- TypeScript (strict)
- Tailwind CSS 3
- Vitest for unit tests
- Multi-source data chain: football-data.org → API-Football enrichment → openfootball static → mock
- RSS-backed news (BBC, ESPN FC, Marca, Mundo Deportivo)
- SSE for live match updates (one upstream poll fans out to all clients)

## Run

```bash
npm install
cp .env.example .env.local
# Optional: add FOOTBALL_DATA_API_KEY for real data — defaults to mock fixtures.
npm run dev                  # http://localhost:3000
```

Build & verify:

```bash
npm run test         # unit tests
npm run typecheck
npm run build
npm start
./scripts/smoke.sh   # HTTP smoke test against localhost:3000
```

## Deploy

See [`docs/deploy.md`](docs/deploy.md) for the Vercel + custom-domain runbook including required env vars and post-deploy checks.

## Implementation plan

The full task breakdown is at [`docs/plans/2026-05-06-data-integration-and-launch-readiness.md`](docs/plans/2026-05-06-data-integration-and-launch-readiness.md).

## Project layout

```
app/
  page.tsx                       Homepage (live, Barca feed, FIFA, trending)
  match/[slug]/page.tsx          Match detail (SSE-driven, JSON-LD)
  barca/page.tsx                 Barca news + fixtures
  fifa/page.tsx                  FIFA news + fixtures
  live/page.tsx                  All live matches
  error.tsx, global-error.tsx    Error boundaries
  robots.ts, sitemap.ts          SEO metadata routes
  opengraph-image.tsx            1200×630 site OG image
  api/
    scores/route.ts              GET ?live=1
    scores/[slug]/route.ts       GET single match
    news/route.ts                GET (public) / POST (Bearer ADMIN_TOKEN)
    live/stream/route.ts         SSE; per-slug shared poll loop
components/
  Header, BottomNav, MatchCard, LiveMatches, NewsCard,
  TelegramCTA, AdSlot (AdSense-aware), SectionTitle, LiveScoreClient
lib/
  env.ts                         Provider auto-detection, lazy proxy
  http.ts                        rateLimited(), fetchJson(), HttpError
  cache.ts                       cached() — in-memory; Redis swap-ready
  football.ts                    Public data API (chain orchestrator + enrichment)
  football/chain.ts              ProviderChain w/ 429 cooldown
  football/quota.ts              Sliding-window rate counter
  football/providers/            footballData, apiFootball, staticFixtures
  news/rss.ts                    RSS aggregator (BBC, ESPN, Marca, MD)
  news.ts                        listNews + getNewsBySlug + createPost (admin)
  types.ts, slug.ts
data/
  worldcup-2026.json             Static WC schedule (refreshed by prebuild)
scripts/
  fetch-static-fixtures.mjs      Prebuild fetcher
  smoke.sh                       12+ route HTTP smoke test
docs/
  deploy.md                      Vercel runbook
  plans/                         Implementation plan
```

## Data layer

`lib/football.ts` exposes `getAllMatches`, `getLiveMatches`, `getMatchBySlug`, etc. Behind it sits a **provider chain** (`lib/football/chain.ts`) that walks providers in order and falls through on error or empty result, with a 90-second cooldown on `HttpError(429)`:

1. **football-data.org** (primary) — when `FOOTBALL_DATA_API_KEY` is set. Free tier, 10 req/min, covers LaLiga + UCL + WC.
2. **openfootball static** — pre-fetched WC schedule at `data/worldcup-2026.json` (committed; refreshed by `prebuild`).
3. **mock seeds** — last-resort dev/CI fallback, six hand-crafted matches with simulated minute/status.

`getMatchBySlug` additionally **enriches Barca matches** via API-Football events (`API_FOOTBALL_KEY` optional) — gated on a 90/day quota, near-kickoff window, and a hasMappedLeague check so unmappable competitions don't burn quota.

## News

`lib/news/rss.ts` aggregates four feeds (BBC Sport, ESPN FC, Marca Barca, Mundo Deportivo Barca) via `Promise.allSettled` so one bad feed can't block the rest. Cached `NEWS_TTL_SECONDS` (default 600s). `lib/news.ts` merges any admin-pushed posts on top of the RSS stream — slugs are source-prefixed (e.g. `bbc-yamal-stars-...`) so duplicate headlines don't collide.

## Live updates

`components/LiveScoreClient.tsx` opens a `/api/live/stream` EventSource. The route runs **one shared poll loop per slug** in process — N viewers cost 1 upstream call every 30s, not N. Falls back to `/api/scores/[slug]` polling if EventSource is unavailable or the stream genuinely closes (UA's built-in retry handles transient errors). FT closes the stream automatically.

## Caching

`lib/cache.ts` provides `cached(key, ttl, loader)`. Today an in-memory `Map`. Swap to Redis: replace `store` with `ioredis`/`@upstash/redis` implementing the same `get/set/expire`. No callers change.

API routes also send `Cache-Control: s-maxage=...` so the Vercel edge caches GETs.

## Performance

- Home / list / news pages use **ISR** (`revalidate = 60`).
- Match pages use **ISR** (`revalidate = 30`) + `generateStaticParams` — every match pre-rendered at build.
- 115 static pages produced by `next build` for the current dataset.
- No client-side fetching on first load except the match-page SSE.
- Images: `next/image` ready in `next.config.ts`.

## Monetization

- `<AdSlot size="300x250" | "320x100" | "320x50" />` — renders Google AdSense `<ins>` when `NEXT_PUBLIC_ADSENSE_CLIENT` + slot id are set; otherwise a same-sized placeholder so layout doesn't shift when ads activate.
- `<StickyBottomAd />` — 320×50 above the bottom nav.
- `<TelegramCTA />` — strip variant in feeds; `variant="sticky"` for above-nav CTA. Reads `NEXT_PUBLIC_TELEGRAM_URL`; in dev, an amber banner reminds you when it's unset.

## Admin: posting news

```bash
curl -X POST http://localhost:3000/api/news \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Yamal hat-trick","content":"...","category":"barca"}'
```

POST requires `Bearer ${ADMIN_TOKEN}`; comparison is timing-safe. Without `ADMIN_TOKEN` set, the endpoint always returns 401.

## SEO

- `/robots.txt`, `/sitemap.xml` are Next 16 metadata routes (`app/robots.ts`, `app/sitemap.ts`).
- Site-wide OG image at `/opengraph-image` (1200×630, `next/og`).
- Match pages emit `SportsEvent` JSON-LD with `eventStatus`, `sport`, canonical `url`.

## Blog

Long-form posts at `/blog` + `/blog/<slug>`. Admin-only authoring at `/admin/blog/new` (gated by `ADMIN_TOKEN` cookie set via `/admin/login`).

- **Markdown body** with raw HTML allowed (admin trusted) → all media types via paste:
  - Images: `![alt](https://...)`
  - YouTube: paste the URL on its own line → auto-embeds 16:9 iframe
  - Twitter / Instagram / oEmbed: paste the publisher's iframe HTML
  - Tables, code blocks, blockquotes via standard GFM
- **Storage:** Upstash Redis (free tier via Vercel Marketplace). In-memory fallback when Upstash env vars are unset (dev only — posts vanish on restart).
- **SEO:** each post emits BlogPosting JSON-LD, OpenGraph article metadata, and appears in `/sitemap.xml`. `/admin/*` is `noindex` and disallowed in `robots.txt`.

To enable persistence in production, add the Upstash Redis integration on Vercel — see [`docs/deploy.md`](docs/deploy.md).

## Roadmap

- Real-time goal push notifications (Telegram bot worker).
- Blog post editing (currently delete + recreate; edit endpoint not yet exposed).
- Historical xG via nightly `soccerdata` ETL into the static fixtures pipeline.

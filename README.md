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
  page.tsx                      Homepage (live, Barca feed, FIFA, trending)
  match/[slug]/page.tsx         Match detail (auto-refreshing)
  barca/page.tsx                Barca news + fixtures
  fifa/page.tsx                 FIFA news + fixtures
  live/page.tsx                 All live matches
  api/scores/route.ts           GET ?live=1
  api/scores/[slug]/route.ts    GET single match
  api/news/route.ts             GET / POST
components/
  Header, BottomNav, MatchCard, LiveMatches, NewsCard,
  TelegramCTA, AdSlot, SectionTitle, LiveScoreClient
lib/
  football.ts                   Data adapter (mock | api-football)
  news.ts                       In-memory news store
  cache.ts                      Cache abstraction (swap to Redis later)
  types.ts, slug.ts
```

## Data adapter

`lib/football.ts` exposes `getAllMatches`, `getLiveMatches`, `getMatchBySlug`, etc. The provider is selected via `FOOTBALL_PROVIDER`:

- `mock` (default) — returns realistic seeded matches with live-status inferred from the current time.
- `api-football` — implement `fetchApiFootballAll()` and set `FOOTBALL_API_KEY`. The shape returned (`Match`) is the only contract the rest of the app cares about.

## Caching

`lib/cache.ts` provides `cached(key, ttl, loader)`. Today it uses an in-memory `Map`. To use Redis: replace `store` with a Redis client (`ioredis`/`@upstash/redis`) implementing the same `get/set` semantics. No callers change.

API routes also send `Cache-Control: s-maxage=30, stale-while-revalidate=60` so a CDN (Vercel) caches them.

## Live updates

`components/LiveScoreClient.tsx` polls `/api/scores/[slug]` every 30 seconds while a match is `LIVE`/`HT`. When the match goes `FT` polling stops.

## Performance

- Home / list / news pages use **ISR** (`revalidate = 60`).
- Match pages use **ISR** (`revalidate = 30`) + `generateStaticParams` so every match is pre-rendered.
- No client-side fetching on first load — only the match page's polling loop.
- Images: `next/image` ready (`next.config.ts` allows the typical football CDNs); add as needed.

## Monetization placeholders

- `<AdSlot size="320x100" | "300x250" | "320x50" />` — drop-in placeholder. Replace inner div with your ad network's component.
- `<StickyBottomAd />` — sticky 320×50 above the bottom nav.
- `<TelegramCTA />` — strip variant in feeds; `variant="sticky"` for above-nav CTA.

## Adding news

```bash
curl -X POST http://localhost:3000/api/news \
  -H 'content-type: application/json' \
  -d '{"title":"Yamal hat-trick","content":"...","category":"barca"}'
```

In production, wire `lib/news.ts` to a DB / CMS — the `listNews` / `getNewsBySlug` / `createPost` API stays the same.

## Roadmap (not built yet)

- Real `api-football` integration (stub exists).
- Redis swap (interface ready).
- Auth / admin UI for news (currently API-only).
- Push notifications for goals.

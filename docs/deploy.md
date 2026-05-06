# Deploying BarcaPulse to Vercel

This is a standard Next.js 16 App Router project. Vercel auto-detects everything; the only setup is environment variables and a domain.

## 1. Push to GitHub

```bash
# Already done if you cloned:
git remote -v
# Should show: origin  https://github.com/<you>/<repo>.git

# Push your latest:
git push origin main
```

## 2. Create the Vercel project

1. Go to https://vercel.com/new
2. Import the GitHub repo.
3. Framework preset: **Next.js** (auto-detected).
4. Build command: `npm run build` (auto). The `prebuild` step runs `node scripts/fetch-static-fixtures.mjs` to refresh the World Cup fixture JSON — this happens automatically.
5. Root directory: leave default.
6. Click **Deploy** — the first build will fail at runtime with mock fixtures only (no API key set yet). That's fine, we wire keys next.

## 3. Environment variables

Add these in **Project → Settings → Environment Variables** (apply to Production + Preview unless noted).

### Required for live data
| Key | Value | Notes |
|---|---|---|
| `FOOTBALL_DATA_API_KEY` | (your free key) | https://www.football-data.org/client/register — instant signup, free tier 10 req/min |
| `SITE_URL` | `https://barcapulse.com` | Whatever your custom domain is. Used by sitemap, robots, OG image, JSON-LD |

### Required for monetization & engagement
| Key | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_TELEGRAM_URL` | `https://t.me/your_channel` | The CTA links here |
| `ADMIN_TOKEN` | (random 32-byte hex) | `openssl rand -hex 32`. Used for `POST /api/news` |

### Optional — enrichment
| Key | Value | Notes |
|---|---|---|
| `API_FOOTBALL_KEY` | (your free key) | https://dashboard.api-football.com/register — 100 req/day. App enriches Barca match events when set; safely no-ops when not |

### Optional — AdSense (after approval)
| Key | Value |
|---|---|
| `NEXT_PUBLIC_ADSENSE_CLIENT` | `ca-pub-XXXXXXXXXXXXXXXX` |
| `NEXT_PUBLIC_ADSENSE_SLOT_300x250` | (slot id) |
| `NEXT_PUBLIC_ADSENSE_SLOT_320x100` | (slot id) |
| `NEXT_PUBLIC_ADSENSE_SLOT_320x50` | (slot id) |

Without these, ad placeholders render with the right dimensions (no CLS jump when ads activate).

### Optional — cache TTLs (defaults are fine)
| Key | Default |
|---|---|
| `SCORES_TTL_SECONDS` | `30` |
| `LIST_TTL_SECONDS` | `60` |
| `NEWS_TTL_SECONDS` | `600` |

## 3a. Vercel plan — note on SSE

The match page uses Server-Sent Events at `/api/live/stream`. The route is configured with `maxDuration = 300` (5 min). Vercel Hobby caps function execution at **10s**, which will close the stream prematurely; the client gracefully falls back to `/api/scores/[slug]` polling so users still get updates. **For real SSE behavior, deploy on Pro+.** The fallback means launch on Hobby is fine, just slightly less efficient.

The `prebuild` script (`scripts/fetch-static-fixtures.mjs`) refreshes `data/worldcup-2026.json` from openfootball on every build. The file is also committed to git, so a cold build with no network access still produces a working fallback.

## 4. Custom domain

1. **Project → Settings → Domains** → add your domain.
2. Update DNS at your registrar to point at Vercel (CNAME `cname.vercel-dns.com` for subdomain, or A record `76.76.21.21` for apex). Vercel's UI tells you exactly.
3. Wait 5–30 minutes for DNS propagation. SSL is automatic.
4. Once active, set `SITE_URL` to the new domain in env vars and redeploy.

## 5. Vercel Web Analytics

Already wired in `app/layout.tsx` via `<Analytics />`. Just enable it in **Project → Analytics** — no code change. Free for hobby plan.

## 6. Post-deploy checks

```bash
# Run the smoke test against the live URL:
./scripts/smoke.sh https://barcapulse.com
```

Manual sanity:
- Open `/` → live matches and Barca feed render
- Open a match page → SSE stream appears in Network tab (one `event-stream` request, not polling)
- View source on `/match/<slug>` → `<script type="application/ld+json">` with SportsEvent
- Open `/sitemap.xml` → all URLs use your custom domain (not `example.com`)
- Open `/robots.txt` → references the correct sitemap URL

## 7. Telegram funnel

The footer CTA points at `NEXT_PUBLIC_TELEGRAM_URL`. For the goal-alerts bot itself (out of scope of this deploy), see https://core.telegram.org/bots — a separate worker process can subscribe to your `/api/scores?live=1` endpoint or directly to the upstream API and push messages.

## 8. Re-deploys

Every push to `main` triggers a Production deploy. Pull requests get Preview URLs automatically.

The `prebuild` script (`scripts/fetch-static-fixtures.mjs`) fetches the openfootball World Cup schedule on every build. If openfootball is unreachable at build time, the script warns but does not fail — the committed `data/worldcup-2026.json` is reused. Force a refresh by re-deploying.

# Auto-post — operator runbook

An external cron (cron-job.org) triggers `POST /api/cron/auto-post` every hour.
A GitHub Actions schedule remains as a fallback and for manual runs. The route
picks an uncovered news headline, asks Groq (with OpenRouter fallback) to write
an original post, runs four quality gates, persists the post, then pushes to
Telegram, Facebook, Bluesky, Mastodon, Threads, and Reddit. Channels are optional:
a channel is skipped when its env vars are absent, and a failed channel is
reported in `announces.errors` without blocking the others. X/Twitter is left
disabled because its API now requires paid credits.

> Why not GitHub Actions alone? GitHub's scheduler is best-effort and drops most
> high-frequency runs on low-activity repos. This repo's history shows only
> ~3 scheduled runs/day even on an every-2-hours cron, so the external trigger
> is the primary one.

## Required env vars (Vercel)

| Var | Source | Notes |
|---|---|---|
| `GROQ_API_KEY` | https://console.groq.com/ → API keys | Required. Free tier: 30 RPM / 1K req/day on `openai/gpt-oss-20b` |
| `OPENROUTER_API_KEY` | https://openrouter.ai/ → API keys | Fallback when Groq fails. Model via `OPENROUTER_MODEL` (default `openai/gpt-oss-20b`) |
| `FACEBOOK_PAGE_ID` | FB Page → About → Page ID | Numeric |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | `GET /me/accounts` with a Meta app token | Page token — see Facebook setup below |
| `BLUESKY_IDENTIFIER` / `BLUESKY_APP_PASSWORD` | bsky.app → Settings → App Passwords | Optional, free |
| `MASTODON_INSTANCE` / `MASTODON_ACCESS_TOKEN` | Your instance → Preferences → Development → New application (`write:statuses`) | Optional, free — see below |
| `THREADS_ACCESS_TOKEN` (+ optional `THREADS_USER_ID`) | Threads API OAuth on the Meta app (`threads_content_publish`) | Optional, free — see below |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` / `REDDIT_USERNAME` / `REDDIT_PASSWORD` / `REDDIT_SUBREDDIT` | https://www.reddit.com/prefs/apps → **script** | Optional, free — check subreddit rules |
| `CRON_TOKEN` | `openssl rand -hex 32` | Random secret; also set as GH repo secret |
| `AUTOPOST_ENABLED` | `"true"` to start, anything else to pause | Kill switch. Default if unset is OFF — you must explicitly set `AUTOPOST_ENABLED=true` to enable the feature. |
| `SITE_URL` | `https://dhf-fcb.iamnishant.in` | Already set; used for post links |

## External cron setup (primary trigger)

Use any scheduler that supports `POST` + custom headers. cron-job.org is free
and has no meaningful hourly limit.

1. Copy `CRON_TOKEN` from Vercel → Project → Settings → Environment Variables.
2. Sign in to https://cron-job.org and choose **Create cronjob**.
3. Fill in:
   - **URL:** `https://dhf-fcb.iamnishant.in/api/cron/auto-post`
   - **Schedule:** every hour (`0 * * * *`)
   - **Request method:** `POST`
   - **Header:** `Authorization: Bearer <CRON_TOKEN>`
   - **Timeout:** 30 seconds (cron-job.org's maximum; the route acks in <1s)
4. Save, then **Run now** to verify. Expected: `HTTP 200` and
   `{"status":"accepted"}`. That ack is deliberate — cron-job.org has a hard
   30s timeout, while generation can take ~60s (Groq, then OpenRouter). The
   route replies immediately and Next's `after()` keeps the function alive to
   finish the work.
5. Check the result at `/admin/autopost` → **Last cron run**, which records the
   status, reason, duration and published slug. Repeat triggers inside 50
   minutes show `skipped · min_interval` there by design.
6. Credentials are stored by the cron service — if `CRON_TOKEN` is rotated,
   update it here and in Vercel/GitHub at the same time.

The min-interval guard in `lib/autopost/pipeline.ts` means the external cron and
the GitHub fallback can both fire in the same hour without double-publishing.

## GitHub Actions setup (fallback / manual runs)

1. Repo → Settings → Secrets and variables → Actions
2. New repository secret: `CRON_TOKEN` (same value as Vercel)
3. The workflow at `.github/workflows/auto-post.yml` runs on `cron: "0 * * * *"`
   as a best-effort fallback. Keep it enabled — if the external cron fails, a
   GitHub run can still publish, but expect only a few scheduled runs per day.
4. To test immediately: Actions → "Auto-post (throttled)" → Run workflow
5. To make the external cron the only trigger, delete the `schedule:` block
   from the workflow and keep `workflow_dispatch:`.

## Kill switch

Pause everything without a deploy: set `AUTOPOST_ENABLED=false` in Vercel and
redeploy (env-only redeploy is fast). The route still acks with
`{"status":"accepted"}`; `/admin/autopost` → **Last cron run** shows
`skipped · disabled`.

The default if unset is OFF — you must explicitly set `AUTOPOST_ENABLED=true`
to enable the feature. Any value other than the literal string `"true"` keeps
the feature paused.

To resume: set `AUTOPOST_ENABLED=true` and redeploy.

## Facebook setup (Page token)

Posting uses the **Page** endpoint `POST /{page-id}/feed`, so a personal
facebook.com login is not enough — the code needs a Page access token minted by
a Meta app.

1. https://developers.facebook.com/apps → **Create app** → type **Business**.
   (Consumer apps cannot request Pages permissions.) Add **Facebook Login for
   Business**.
2. Request `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, and
   make sure your user has the `CREATE_CONTENT` task on the Page.
3. In Graph API Explorer, with that app selected and those scopes granted, use
   **Get Token → Generate Access Token** and complete the Login for Business
   flow, explicitly selecting the target Page (an empty `/me/accounts` usually
   means no Page was selected in that flow).
4. Exchange the short-lived User token for a ~60-day one:
   `GET /oauth/access_token?grant_type=fb_exchange_token&client_id=<app-id>&client_secret=<app-secret>&fb_exchange_token=<user-token>`.
   Then `GET /me/accounts?fields=id,name,tasks,access_token` with the long-lived
   User token → copy the Page `id` and its `access_token`.
5. Set `FACEBOOK_PAGE_ID` and `FACEBOOK_PAGE_ACCESS_TOKEN` in Vercel, then
   redeploy. Verify with `/debug_token?input_token=<page-token>`: `type` should
   be `PAGE`, `is_valid` true, and `expires_at` **0** (a Page token derived from
   a long-lived User token never expires).

Because the blog posts only to a Page you own and you are an admin of the app,
**Standard Access is enough — no App Review or business verification**. A Page
token minted from a long-lived User token does not expire on its own; if posting
starts failing, check `announces.errors.facebook` in the cron ack first.

Graph API version is pinned in `lib/facebook.ts`. `v21.0` is retired
**21 Jan 2027**, so the code uses `v27.0` (current as of Nov 2026). Bump it when
Meta retires that version.

## Mastodon setup

1. Create/login on an instance (e.g. `mastodon.social`) with a bot-friendly
   account.
2. **Preferences → Development → New application**: name it `BarcaPulse`, scope
   `write:statuses`, then copy the generated access token.
3. Set `MASTODON_INSTANCE=mastodon.social` (bare hostname; a full URL is also
   accepted) and `MASTODON_ACCESS_TOKEN`, then redeploy.

Posts are public, 500 characters max (title + URL), and no approval is needed.

## Threads setup

1. In the existing **BarcaPulse Auto-post** Meta app, add the **Threads API**
   product and link it to the Threads profile that should post.
2. Use cases → **Access the Threads API → Settings**: add the redirect URI
   `https://dhf-fcb.iamnishant.in/callback` under **Valid OAuth Redirect URIs**.
   Also fill the **Deauthorize callback URL** and **Data Deletion Requests URL**
   with the same value — Meta refuses to save otherwise. Add the posting profile
   as a **Threads Tester** under App roles → Roles and accept the invite in
   Threads → Settings → Account → Website permissions → Invites.
3. Open the authorize URL in a browser (you must be logged into the Threads
   profile):
   `https://threads.net/oauth/authorize?client_id=<threads-app-id>&redirect_uri=https%3A%2F%2Fdhf-fcb.iamnishant.in%2Fcallback&response_type=code&scope=threads_basic,threads_content_publish`
   Approve the screen; the redirect 404s but the `code` is in the URL.
4. Exchange the code for a short-lived token:
   `POST https://graph.threads.net/oauth/access_token` with `client_id`,
   `client_secret` (**Threads app secret**, not the Facebook one),
   `grant_type=authorization_code`, `redirect_uri`, `code`.
5. Upgrade to a long-lived (60-day) token:
   `GET https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=<threads-app-secret>&access_token=<short-token>`.
6. Set `THREADS_ACCESS_TOKEN` (and optionally `THREADS_USER_ID`, otherwise the
   code resolves it from `/me`), then redeploy.

Text posts only (title + URL, 500 chars). Standard Access is enough because you
own the account. The code refreshes the long-lived token on every post (Meta
allows this once it is 24h old), so a single env var keeps working indefinitely
as long as the app is used at least once every 60 days.

## Reddit setup

1. https://www.reddit.com/prefs/apps → **Create another app…** → type **script**.
   Note the client id (under the app name) and client secret.
2. Use the Reddit account that will own the posts as `REDDIT_USERNAME` /
   `REDDIT_PASSWORD`, and set `REDDIT_SUBREDDIT` to the plain subreddit name
   (e.g. `Barcelona`, not `/r/Barcelona`).
3. Set all five vars in Vercel and redeploy.

Reddit submits link posts with the post URL. Check the target subreddit's
self-promotion rules first — repeated posting can get an account banned.

## Monitoring

- **Per-run logs:** Vercel → Logs, filter `kind:"autopost"`. Each run emits one
  JSON line with `status`, `reason`, `durationMs`, `slug` if published.
- **Dashboard:** `/admin/autopost` shows the last 7 days of counters plus the
  outcome of the most recent run. This is the place to check whether a run
  published, skipped or errored.
- **External cron:** cron-job.org → job history should show hourly
  `Successful — 200 OK`. The ack body includes the **previous** run's outcome,
  e.g. `{"status":"accepted","lastRun":{"status":"skipped","reason":"gate_entity_coverage","diagnostics":{"missingEntities":["araujo"]}}}`.
  A `Failed (timeout)` here means the route itself stopped acking (e.g. a bad
  deploy), not that generation was slow. A successful ack with no new post
  means the pipeline skipped — check `lastRun.reason`, not the HTTP status.
  On a publish, `lastRun.announces` shows each platform and
  `lastRun.announces.errors.<platform>` carries the provider's error text, so
  "published but no Facebook post" is diagnosable from the ack alone.
- **GitHub Actions (fallback):** Actions tab → "Auto-post (throttled)" — only a
  few scheduled runs/day are expected; use `workflow_dispatch` for a one-off.

## Known limitations

- **Stats counters use read-modify-write on a single Redis key per day.** Two
  concurrent runs (e.g. GH Actions cron + a manual `workflow_dispatch` firing
  in the same second) can lose an increment. The day-cap is enforced upstream
  so this never produces over-publishing in practice, but the dashboard
   counts may be off by 1 in those edge cases. Acceptable for v1 — the cron
   runs once an hour and the route is sequential per invocation.

- **Provider failures are silent.** `/api/cron/auto-post` swallows Groq
  errors into a generic `all_providers_failed` skip reason; consult the
  per-run `console.warn` lines in Vercel logs (`[autopost] groq http 429`
  etc.) to see why the call failed.

- **`maxDuration` is 90s on the cron route**, sized for a slow Groq call
  (30s) + a slow OpenRouter fallback (30s) + pipeline overhead. On Vercel Hobby
  plans this is silently clamped to 60s. `after()` inherits that budget, so if
  a run is killed mid-generation there will be no **Last cron run** update —
  lower the provider timeouts in `lib/autopost/generate.ts` or upgrade the plan.

- **Attribution uses the article headline as link text** (`*Source:
  <headline>*`). We don't carry the publisher name on `NewsPost`. If you'd
  rather show "BBC Sport", add a `publisher` field to RSS-parsed posts and
  update `lib/autopost/pipeline.ts`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| All runs return `all_providers_failed` with `groq http 400 ... json_validate_failed` | gpt-oss reasoning used up the output budget before emitting JSON | Already fixed in `lib/autopost/generate.ts`: 4096 tokens and no strict `response_format`; check Vercel logs for the provider error body |
| All runs return `quota` | Groq free tier exhausted (30 RPM / 1K req/day) | Wait for daily reset, or upgrade the Groq plan |
| All runs return `no_eligible_news` | Recent-topics set too aggressive | Wait — topics expire after 7 days |
| All runs return `gate_word_count` | Model producing short outputs | Bump prompt's word-count instruction; check `GROQ_MODEL` is still a served ID |
| All runs return `gate_entity_coverage` | LLM omitted a headline name (often an accented spelling like `Araújo` vs `araujo`) | Already fixed: one automatic regeneration with the missing names called out, plus accent-insensitive matching. If it persists, check `lastRun.diagnostics.missingEntities` |
| Facebook push always `err` | Token expired | Renew per "Facebook token renewal" above |
| Telegram push always `err` | Bot was kicked from channel / token rotated | Re-invite bot; rotate `TELEGRAM_BOT_TOKEN` |
| GH Actions runs not firing | GitHub drops/delays scheduled runs on idle repos | Rely on the external cron; trigger via `workflow_dispatch` for a one-off |
| Last run always `min_interval` | Two triggers are firing within 50 min | Expected when both crons fire; disable the GH `schedule` block to stop it |
| Cron history shows `Failed (timeout)` | Route is not reaching its immediate ack (bad deploy, or auth failing before `after()`) | Redeploy; check `/admin/autopost` → Last cron run and the `kind:"autopost"` logs |
| No **Last cron run** update after an ack | The background task was killed before finishing (Vercel duration clamp) | Check Vercel logs; lower provider timeouts or upgrade the plan |

## Rolling back

To stop new auto-posts and keep existing ones:
1. `AUTOPOST_ENABLED=false` → redeploy.

To delete a specific bad auto-post:
1. Admin UI → Blog → Delete on that post.

To wipe the entire auto-posting feature (emergency):
1. Disable the GH Actions workflow (Actions → "Auto-post (throttled)" → ⋯ → Disable workflow).
2. Set `AUTOPOST_ENABLED=false`.
3. Revert the feature branch when ready.

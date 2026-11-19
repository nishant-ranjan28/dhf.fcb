# Auto-post — operator runbook

An external cron (cron-job.org) triggers `POST /api/cron/auto-post` every hour.
A GitHub Actions schedule remains as a fallback and for manual runs. The route
picks an uncovered news headline, asks Groq (with OpenRouter fallback) to write
an original post, runs four quality gates, persists the post, then pushes to
Telegram and the Facebook Page.

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
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Meta dev portal, long-lived | ~60 day lifetime — see Renewal below |
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
   - **Timeout:** 30 seconds (cron-job.org's maximum; a typical run takes ~20s)
4. Save, then **Run now** to verify. Expected: `HTTP 200` and a JSON body with
   `"status":"published"` or a `"status":"skipped"` reason. Repeat triggers
   inside 50 minutes return `{"status":"skipped","reason":"min_interval"}` by
   design.

If runs start timing out at 30s, either move the job to a scheduler with a
longer timeout (CronJobPro free allows 5 minutes) or have the external cron
dispatch the GitHub workflow instead of calling the route directly:
`POST https://api.github.com/repos/nishant-ranjan28/dhf.fcb/actions/workflows/auto-post.yml/dispatches`
with a fine-grained PAT (repo → Actions: write) and body `{"ref":"main"}`.
GitHub then calls the route with its own 90s budget.
5. Credentials are stored by the cron service — if `CRON_TOKEN` is rotated,
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
redeploy (env-only redeploy is fast). The route returns
`{ status: "skipped", reason: "disabled" }`.

The default if unset is OFF — you must explicitly set `AUTOPOST_ENABLED=true`
to enable the feature. Any value other than the literal string `"true"` keeps
the feature paused.

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
- **External cron:** cron-job.org → job history shows the hourly HTTP status and
  response body.
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
  (30s) + pipeline overhead. On Vercel Hobby plans this is silently
  clamped to 60s — if you're on Hobby and start seeing timeouts, upgrade
  to Pro or lower the provider timeout in `lib/autopost/generate.ts`.

- **Attribution uses the article headline as link text** (`*Source:
  <headline>*`). We don't carry the publisher name on `NewsPost`. If you'd
  rather show "BBC Sport", add a `publisher` field to RSS-parsed posts and
  update `lib/autopost/pipeline.ts`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| All runs return `quota` | Groq free tier exhausted (30 RPM / 1K req/day) | Wait for daily reset, or upgrade the Groq plan |
| All runs return `no_eligible_news` | Recent-topics set too aggressive | Wait — topics expire after 7 days |
| All runs return `gate_word_count` | Model producing short outputs | Bump prompt's word-count instruction; check `GROQ_MODEL` is still a served ID |
| Facebook push always `err` | Token expired | Renew per "Facebook token renewal" above |
| Telegram push always `err` | Bot was kicked from channel / token rotated | Re-invite bot; rotate `TELEGRAM_BOT_TOKEN` |
| GH Actions runs not firing | GitHub drops/delays scheduled runs on idle repos | Rely on the external cron; trigger via `workflow_dispatch` for a one-off |
| Every run returns `min_interval` | Two triggers are firing within 50 min | Expected when both crons fire; disable the GH `schedule` block to stop it |

## Rolling back

To stop new auto-posts and keep existing ones:
1. `AUTOPOST_ENABLED=false` → redeploy.

To delete a specific bad auto-post:
1. Admin UI → Blog → Delete on that post.

To wipe the entire auto-posting feature (emergency):
1. Disable the GH Actions workflow (Actions → "Auto-post (throttled)" → ⋯ → Disable workflow).
2. Set `AUTOPOST_ENABLED=false`.
3. Revert the feature branch when ready.

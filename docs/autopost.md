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

## Facebook token renewal

Meta's long-lived Page Access Tokens last ~60 days. To renew:

1. Generate a new long-lived User token via Graph Explorer
2. Exchange for a long-lived Page token: `GET /me/accounts`
3. Replace `FACEBOOK_PAGE_ACCESS_TOKEN` in Vercel and redeploy

Calendar a reminder for ~50 days after each rotation.

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

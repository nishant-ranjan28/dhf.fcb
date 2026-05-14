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

## Known limitations

- **Stats counters use read-modify-write on a single Redis key per day.** Two
  concurrent runs (e.g. GH Actions cron + a manual `workflow_dispatch` firing
  in the same second) can lose an increment. The day-cap is enforced upstream
  so this never produces over-publishing in practice, but the dashboard
  counts may be off by 1 in those edge cases. Acceptable for v1 — the cron
  is hourly and the route is sequential per invocation.

- **Provider failures are silent.** `/api/cron/auto-post` swallows Gemini/Groq
  errors into a generic `all_providers_failed` skip reason; consult the
  per-run `console.warn` lines in Vercel logs (`[autopost] gemini http 429`
  etc.) to see which provider failed and why.

- **Attribution uses the article headline as link text** (`*Source:
  <headline>*`). We don't carry the publisher name on `NewsPost`. If you'd
  rather show "BBC Sport", add a `publisher` field to RSS-parsed posts and
  update `lib/autopost/pipeline.ts`.

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

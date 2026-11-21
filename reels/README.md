# Reels autopilot

Daily original Barça Reels for **Die Hard Fans of FC Barcelona** (facebook.com/DHF.FCB).

```
07:30 IST  Generate ─ news (Google News RSS) + fixtures/results/table (football-data.org)
                    ─ Claude writes 4 original scripts (news / matchday / did-you-know / stats)
                    ─ free-licence photos for each line (Wikipedia / Wikimedia Commons / Pexels), credited on screen
                    ─ AI voice (Kokoro, free, offline) + 1080x1920 video render
                    ─ drafts listed in a GitHub issue for approval (or sent to Telegram)
   you      Comment `approve 1 3` on the drafts issue (or use Telegram: tap ✅ / reply with a 🎙 voice note)
12:30 · 16:00 · 19:30 · 22:00 · 00:30 IST
           Publish ─ reads your taps / voice notes, posts ONE approved Reel to the Page
                    ─ replies on the issue with the Reel link
```

Nothing is posted without your approval unless you turn on `AUTO_APPROVE` or `AUTO_APPROVE_AFTER_HOURS`.
Matchday and news videos are posted before facts. News expires if it isn't posted within 2 days.

## One-time setup

Everything lives in `reels/` and runs from three workflows: **Reels - generate drafts**, **Reels - publish** and **Reels - preview**. The website code is untouched.

### 1. Try it with no keys
**Actions → Reels - preview (no keys needed) → Run workflow.** It renders the sample script with real photos and attaches the video to the run.

### 2. Keys: nothing new to add
The workflows reuse the repo's existing `CRON_TOKEN` secret (the one the auto-post trigger uses) to call `POST /api/cron/reels` on the site. The site then uses the keys it already has in Vercel:

| Job | Site action | Vercel env var used |
|---|---|---|
| Write the scripts | `scripts` | `GROQ_API_KEY` |
| Fixtures and results | `matches` | `FOOTBALL_DATA_API_KEY` |
| Upload and publish the Reel, add the link comment | `publish` | `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` |

The `publish` action only accepts videos from this repo's `queue` release. The link comment needs `pages_manage_engagement` on the Page token; without it the comment is skipped and the Reel still posts.

**Approval happens in a GitHub issue.** Each morning the generate job opens an issue called "Reel drafts · <date>" with a link to every draft video, its script and its photo credits. Reply with `approve all`, `approve 1 3` or `reject 2`. `reject` also pulls a draft that was approved but has not been posted yet. Only comments from the repo owner or collaborators count. Nothing is posted without an approval.

Optional repo secrets, if you want to change the defaults:

| Secret | Effect |
|---|---|
| `REELS_TELEGRAM_BOT_TOKEN` + `REELS_TELEGRAM_CHAT_ID` | Approve in Telegram instead of an issue, and reply with a voice note to use your own voice. Use a new bot, not the channel bot |
| `ANTHROPIC_API_KEY` | Better scripts than Groq |
| `PEXELS_API_KEY` | Generic stock photos |
| `GROQ_API_KEY`, `FOOTBALL_DATA_API_KEY`, `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` | Call those services directly from the workflow instead of through the site |

### 3. Optional variables  (same page → *Variables*)

| Variable | Default | Notes |
|---|---|---|
| `DAILY_VIDEOS` | `4` | Drafts generated each morning |
| `MAX_POSTS_PER_DAY` | `5` | Safety cap |
| `VOICE_MODE` | `tts` | `own` = drafts arrive as scripts only; your voice-note reply renders and approves them |
| `KOKORO_VOICE` | `bm_george` | Also try `bm_lewis`, `am_michael`, `am_onyx` |
| `AUTO_APPROVE_AFTER_HOURS` | `0` (off) | e.g. `4` = drafts you haven't rejected are approved after 4 hours. Applies only to drafts less than 20 hours old |
| `AUTO_APPROVE` | `false` | Skip approval entirely |
| `COMMENT_LINK` | `true` | First comment on each Reel links to the site |

### 4. First real run
**Actions → Reels - generate drafts → Run workflow.** A drafts issue appears in about 10 minutes. Comment `approve 1`, then run **Reels - publish** to post it immediately. Scheduled runs only start once these workflows are on the default branch.

## Fully automatic running

GitHub's own schedule delays or skips runs on quiet repos, so the reliable trigger is the same external hourly scheduler (cron-job.org) that drives auto-post:

1. Create a fine-grained GitHub token: GitHub → Settings → Developer settings → Fine-grained tokens → Generate. Repository access: only `nishant-ranjan28/dhf.fcb`. Permissions: **Actions: Read and write** (nothing else). Pick the longest expiry you are comfortable with and note the date.
2. Add it in Vercel as `GITHUB_DISPATCH_TOKEN` and redeploy.
3. In cron-job.org, add a job: every hour, `POST https://dhf-fcb.iamnishant.in/api/cron/reels`, header `Authorization: Bearer <CRON_TOKEN>` (the same value as the auto-post job), empty body.

Each hourly call starts `reels-publish`, and between 07:00 and 12:59 IST also `reels-generate`. The workflows keep their own rules: one batch of drafts a day, posts only between 09:00 and 01:00 IST, at least 2.5 hours apart, duplicates skipped. GitHub's schedule stays on as a backup.

With `AUTO_APPROVE_AFTER_HOURS=4`, drafts nobody rejects are approved after 4 hours, so the page runs with no daily action. Set `AUTO_APPROVE=true` instead to post drafts as soon as they are made, with no review window.

## Daily use (2–5 minutes)
- **✅ / ❌** on each draft.
- **Reply to a draft with a voice note** to replace the AI voice with yours. Read the captions on screen; the video is re-rendered at the next publish run and auto-approved. Your own voice usually gets better reach and is clearly original content.
- Bot commands: `approve all`, `status`.
- **Background music:** drop royalty-free `.mp3` files into `assets/music/` (for example from the YouTube Audio Library or Pixabay Music). One is picked at random at low volume. Never use chart songs.

## Where the photos and news come from
- **Named people and places** (a player, the coach, a stadium): the lead photo of the Wikipedia article if it is freely licensed, otherwise a Wikimedia Commons search.
- **Generic scenes**: Pexels (or Openverse, which indexes Creative Commons photos from Flickr and others, when there is no Pexels key), then Commons.
- Only CC0, public-domain, CC BY and CC BY-SA files are accepted. Crests, logos, kits and anything non-commercial are filtered out. The required credit is printed under each photo, listed on the Telegram draft, and added to the Facebook caption automatically. Don't remove it: the credit is the licence condition.
- **News**: stories come from feeds that carry real article text (Mundo Deportivo, Barca Blaugranes, Barca Universal, BBC Sport, the Guardian, plus Barça stories from Football España and Get Football News Spain; see `RICH_FEEDS`). They are rewritten in the page's own words, fact-checked against the article text, and the outlet is credited on screen and in the caption.
- **Photo posts**: each morning up to `DAILY_PHOTOS` (default 2) extra news stories become photo posts: a headline card built on a free-licence photo, with the photographer credited on the card and in the post text, and the outlet credited as the source.
- Photos from the news articles themselves are **not** used, even with credit. They belong to agencies such as Getty; a credit is not a licence, and reposting them gets Pages claimed and demonetized.
- Check the photo on each draft before approving. Commons search occasionally returns the wrong person or an old photo; reject the draft if so. If no free photo exists for a line, that line falls back to the plain club-colour background.

## Content rules that protect monetization
- **Never** add match footage, broadcaster clips or other pages' videos. Meta treats reposts as unoriginal content, and leagues file copyright claims.
- Don't add official club crests or kits to the visuals. The image filter skips them on purpose.
- Facts must be checkable. Prompts forbid invented scores, quotes and fees, and rumours must be labelled as rumours. Still read each script before approving it.
- Reply to comments in the first hour. Comments count heavily toward reach.

## Run locally
```bash
cd reels && pip install -r requirements.txt   # also needs ffmpeg
python -m autopilot sample               # renders samples/sample_fact.json → work/sample/sample.mp4
STORE=local python -m autopilot generate # uses ./data instead of GitHub releases
```

## Files
```
autopilot/sources.py   news + football-data.org
autopilot/writer.py    Claude script writer (formats, accuracy rules)
autopilot/media.py     free-licence photo search + credits
autopilot/voice.py     Kokoro / Edge TTS, or your voice note
autopilot/render.py    video renderer (Pillow + ffmpeg)
autopilot/telegram.py  approval inbox
autopilot/facebook.py  Graph API Reels upload
autopilot/store.py     queue on a GitHub release
```
Fonts: Anton and Montserrat (SIL Open Font License, see `assets/fonts`).

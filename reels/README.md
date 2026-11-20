# Reels autopilot

Daily original Barça Reels for **Die Hard Fans of FC Barcelona** (facebook.com/DHF.FCB).

```
07:30 IST  Generate ─ news (Google News RSS) + fixtures/results/table (football-data.org)
                    ─ Claude writes 4 original scripts (news / matchday / did-you-know / stats)
                    ─ free-licence photos for each line (Wikipedia / Wikimedia Commons / Pexels), credited on screen
                    ─ AI voice (Kokoro, free, offline) + 1080x1920 video render
                    ─ drafts sent to your Telegram with ✅ / ❌ buttons
   you      Tap ✅ — or reply to a draft with a 🎙 voice note to use your own voice
12:30 · 16:00 · 19:30 · 22:00 · 00:30 IST
           Publish ─ reads your taps / voice notes, posts ONE approved Reel to the Page
                    ─ sends you the Reel link in Telegram
```

Nothing is posted without your approval unless you turn on `AUTO_APPROVE` or `AUTO_APPROVE_AFTER_HOURS`.
Matchday and news videos are posted before facts. News expires if it isn't posted within 2 days.

## One-time setup

Everything lives in `reels/` and runs from three workflows: **Reels - generate drafts**, **Reels - publish** and **Reels - preview**. The website code is untouched.

### 1. Try it with no keys
**Actions → Reels - preview (no keys needed) → Run workflow.** It renders the sample script with real photos and attaches the video to the run.

### 2. Repo secrets  (Settings → Secrets and variables → Actions → *Secrets*)
The first four use the same names and values as the site's Vercel env vars, so copy them across.

| Secret | Notes |
|---|---|
| `FACEBOOK_PAGE_ID` | Same as Vercel |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Same as Vercel. Needs `pages_manage_posts`; add `pages_manage_engagement` if you want the automatic link comment |
| `GROQ_API_KEY` | Same as Vercel. Writes the scripts for free. Set `ANTHROPIC_API_KEY` instead (or as well) for better scripts |
| `FOOTBALL_DATA_API_KEY` | Same as Vercel. Optional, but matchday videos need it |
| `REELS_TELEGRAM_BOT_TOKEN` | A **new** bot from @BotFather, used only as your private approval inbox. Don't reuse the channel bot: its webhook or other readers would swallow your button taps |
| `REELS_TELEGRAM_CHAT_ID` | Message the new bot once, open `https://api.telegram.org/bot<TOKEN>/getUpdates`, copy `message.chat.id` |
| `PEXELS_API_KEY` | Optional, free at pexels.com/api: generic stock photos |

Without the two Telegram secrets every draft is auto-approved and posted with no review.

### 3. Optional variables  (same page → *Variables*)

| Variable | Default | Notes |
|---|---|---|
| `DAILY_VIDEOS` | `4` | Drafts generated each morning |
| `MAX_POSTS_PER_DAY` | `5` | Safety cap |
| `VOICE_MODE` | `tts` | `own` = drafts arrive as scripts only; your voice-note reply renders and approves them |
| `KOKORO_VOICE` | `bm_george` | Also try `bm_lewis`, `am_michael`, `am_onyx` |
| `AUTO_APPROVE_AFTER_HOURS` | `0` (off) | e.g. `6` = post drafts you haven't rejected after 6 hours |
| `AUTO_APPROVE` | `false` | Skip approval entirely |
| `COMMENT_LINK` | `true` | First comment on each Reel links to the site |

### 4. First real run
**Actions → Reels - generate drafts → Run workflow.** Drafts arrive in Telegram in about 10 minutes. Approve one, then run **Reels - publish** to post it immediately. Scheduled runs only start once these workflows are on the default branch.

## Daily use (2–5 minutes)
- **✅ / ❌** on each draft.
- **Reply to a draft with a voice note** to replace the AI voice with yours. Read the captions on screen; the video is re-rendered at the next publish run and auto-approved. Your own voice usually gets better reach and is clearly original content.
- Bot commands: `approve all`, `status`.
- **Background music:** drop royalty-free `.mp3` files into `assets/music/` (for example from the YouTube Audio Library or Pixabay Music). One is picked at random at low volume. Never use chart songs.

## Where the photos and news come from
- **Named people and places** (a player, the coach, a stadium): the lead photo of the Wikipedia article if it is freely licensed, otherwise a Wikimedia Commons search.
- **Generic scenes**: Pexels (or Openverse, which indexes Creative Commons photos from Flickr and others, when there is no Pexels key), then Commons.
- Only CC0, public-domain, CC BY and CC BY-SA files are accepted. Crests, logos, kits and anything non-commercial are filtered out. The required credit is printed under each photo, listed on the Telegram draft, and added to the Facebook caption automatically. Don't remove it: the credit is the licence condition.
- **News**: stories are found through Google News, rewritten in the page's own words, and the outlet is credited on screen ("SOURCE: ...") and in the caption. Photos from the news articles themselves are **not** used. They belong to agencies such as Getty, and using them gets Pages claimed and demonetized.
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

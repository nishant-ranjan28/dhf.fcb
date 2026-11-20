"""Turn news + match data into short original Reel scripts using Claude."""
import json
import time
from datetime import datetime, timezone

import requests

from . import config, site

FORMATS = {
    "news": "BARÇA NEWS",
    "match": "MATCHDAY",
    "fact": "DID YOU KNOW?",
    "stats": "BY THE NUMBERS",
}

SCHEMA = {
    "type": "object",
    "properties": {
        "videos": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "format": {"type": "string", "enum": list(FORMATS)},
                    "title": {"type": "string", "description": "On-screen headline, max 45 characters, punchy, ALL information must be accurate"},
                    "segments": {
                        "type": "array",
                        "description": "5-8 spoken lines. The first is the hook, the last is the call to action.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "say": {"type": "string", "description": "One spoken sentence, max 22 words"},
                                "emphasis": {"type": "string", "description": "One word or short phrase copied exactly from 'say' to highlight"},
                                "stat_value": {"type": "string", "description": "Optional big number shown on screen, e.g. '127' or '3-1'"},
                                "stat_label": {"type": "string", "description": "Optional label under the number, max 28 characters"},
                                "image_query": {"type": "string", "description": "What photo to show on this line. For image_type 'entity': the exact Wikipedia article name of the person, stadium, city or trophy, e.g. 'Lamine Yamal', 'Camp Nou'. For 'stock': 2-4 generic words, e.g. 'football stadium floodlights'"},
                                "image_type": {"type": "string", "enum": ["entity", "stock"]},
                            },
                            "required": ["say"],
                        },
                    },
                    "fb_caption": {"type": "string", "description": "Facebook caption, 1-3 lines, ends with a question to drive comments"},
                    "hashtags": {"type": "array", "items": {"type": "string"}},
                    "source_name": {"type": "string", "description": "News/match videos: the outlet(s) the story comes from, e.g. 'Mundo Deportivo' or 'BBC Sport, Marca'. Shown on screen as the source"},
                    "source_urls": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["format", "title", "segments", "fb_caption", "hashtags"],
            },
        }
    },
    "required": ["videos"],
}

GROQ_PAUSE = 20  # seconds between Groq batches

SYSTEM = f"""You write scripts for short vertical videos (Facebook Reels, 30-45 seconds) for the
fan page "{config.PAGE_NAME}" ({config.PAGE_HANDLE}), an unofficial {config.TEAM_NAME} fan page.
Language: {config.LANGUAGE}. Voice: an excited but credible fan-journalist talking to fellow fans.

Hard rules:
- Accuracy first. News and match videos may ONLY use facts present in the supplied material.
  Never invent scores, quotes, injuries, transfer fees or dates.
- Rumours must be framed as rumours ("reports in Spain claim..."), naming the outlet if known.
- Fact videos use well-established club history you are certain of. If unsure, pick another fact.
- Write everything in your own words. Never copy a headline or sentence from the material.
- No hate, no mocking players' appearance, no betting, no engagement bait like "share or bad luck".
- Spoken lines are short and rhythmic. Line 1 is a hook that makes people stop scrolling.
  The final line is a varied call to follow the page or comment.
- Total spoken length 75-115 words per video.
- Visuals: give most lines an image_query so the video shows real photos. Use 'entity' for the
  specific player, coach, stadium, city or trophy the line is about (lines without a stat_value
  show the photo large). Use 'stock' for generic atmosphere. Lines that carry a stat_value still
  benefit from an image_query (it becomes the blurred backdrop). Never ask for club crests, logos,
  kits or screenshots, and vary the images across the video.
- News and match videos must set source_name to the outlet(s) that reported the story.
"""


def _prompt(news, matches, count, avoid):
    today = datetime.now(timezone.utc).strftime("%A %d %B %Y")
    material = {
        "today_utc": today,
        "news": news if config.ANTHROPIC_API_KEY else [  # keep the prompt small for Groq's free tier
            {**n, "summary": (n.get("summary") or "")[:160], "link": ""} for n in news[:14]],
        "matches": matches,
        "recently_posted_titles_do_not_repeat": list(avoid)[-40:],
    }
    return (
        f"Write {count} different videos for today. Mix formats sensibly: lead with the biggest real "
        "news or match story; use 'match' when there is a fixture in the next 48h or a result in the "
        "last 24h; include at least one 'fact' or 'stats' video across the day. Skip weak or duplicate "
        "stories.\n\n"
        f"<material>\n{json.dumps(material, ensure_ascii=False, indent=1)}\n</material>"
    )


def write_scripts(news, matches, count, recent_titles=()):
    if config.ANTHROPIC_API_KEY:
        videos = _ask_claude(_prompt(news, matches, count, recent_titles))
        return [v for v in (_tidy(v) for v in videos) if v][:count]
    # Groq's free tier has a small output budget, so ask for two videos at a time.
    ask = _ask_groq if (config.GROQ_API_KEY or not site.enabled()) else _ask_site
    out, avoid, errors = [], list(recent_titles), 0
    while len(out) < count and errors < 2:
        if out or errors:
            time.sleep(GROQ_PAUSE)  # stay under the tokens-per-minute limit
        need = min(2, count - len(out))
        hint = "" if out else " Start with the biggest story."
        if out and not any(v["format"] in ("fact", "stats") for v in out):
            hint = " At least one of these must be a 'fact' or 'stats' video."
        try:
            batch = [v for v in (_tidy(v) for v in ask(_prompt(news, matches, need, avoid) + hint)) if v]
        except Exception as e:  # noqa: BLE001
            print(f"[writer] batch failed: {e}")
            batch = []
        if not batch:
            errors += 1
            continue
        out += batch[:need]
        avoid += [v["title"] for v in batch]
    if not out:
        raise RuntimeError("No scripts could be written")
    return out[:count]


def _extract_videos(text):
    """Pull the JSON object out of a model reply that may wrap it in prose or a code fence."""
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in reply")
    data = json.loads(text[start:end + 1])
    videos = data.get("videos") if isinstance(data, dict) else None
    if isinstance(data, dict) and videos is None and data.get("segments"):
        videos = [data]  # a single video returned bare
    if not videos:
        raise ValueError("no videos in reply")
    return videos


def _ask_claude(prompt):
    import anthropic
    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    resp = client.messages.create(
        model=config.CLAUDE_MODEL,
        max_tokens=8000,
        system=SYSTEM,
        tools=[{"name": "save_videos", "description": "Save the video scripts", "input_schema": SCHEMA}],
        tool_choice={"type": "tool", "name": "save_videos"},
        messages=[{"role": "user", "content": prompt}],
    )
    for block in resp.content:
        if block.type == "tool_use":
            return block.input.get("videos", [])
    raise RuntimeError("Claude returned no scripts")


def _json_system():
    return (SYSTEM + "\nReply with ONE JSON object and nothing else (no markdown, no commentary), matching this "
            "JSON Schema:\n" + json.dumps(SCHEMA))


def _ask_site(prompt):
    """Have the website call Groq with the key stored in Vercel."""
    return _extract_videos(site.call("scripts", system=_json_system(), prompt=prompt)["content"])


def _ask_groq(prompt):
    """Same job straight against Groq's OpenAI-compatible API."""
    if not config.GROQ_API_KEY:
        raise RuntimeError("Set ANTHROPIC_API_KEY, GROQ_API_KEY or CRON_TOKEN")
    r = requests.post("https://api.groq.com/openai/v1/chat/completions", timeout=180,
                      headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
                      json={"model": config.GROQ_MODEL, "temperature": 0.7, "max_tokens": 4096,
                            "messages": [{"role": "system", "content": _json_system()},
                                         {"role": "user", "content": prompt}]})
    if r.status_code >= 400:
        raise RuntimeError(f"Groq HTTP {r.status_code}: {r.text[:300]}")
    return _extract_videos(r.json()["choices"][0]["message"]["content"])


def _tidy(v):
    if not isinstance(v, dict) or not v.get("title") or not v.get("fb_caption"):
        return None
    if v.get("format") not in FORMATS:
        v["format"] = "news"
    segs = [s for s in v.get("segments", []) if isinstance(s, dict) and str(s.get("say", "")).strip()]
    if len(segs) < 3:
        return None
    for s in segs:
        if s.get("emphasis") and s["emphasis"].lower() not in s["say"].lower():
            s["emphasis"] = ""
    v["segments"] = segs
    v["title"] = v["title"].strip()[:60]
    tags = []
    for t in v.get("hashtags", []):
        t = "#" + t.strip().lstrip("#").replace(" ", "")
        if len(t) > 1 and t.lower() not in (x.lower() for x in tags):
            tags.append(t)
    v["hashtags"] = tags[:6]
    return v

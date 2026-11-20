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

GROQ_PAUSE = 20  # seconds between Groq calls, to stay under the tokens-per-minute limit

SYSTEM = f"""You write scripts for short vertical videos (Facebook Reels, 30-45 seconds) for the
fan page "{config.PAGE_NAME}" ({config.PAGE_HANDLE}), an unofficial {config.TEAM_NAME} fan page.
Language: {config.LANGUAGE}. Voice: an excited but credible fan-journalist talking to fellow fans.

ACCURACY RULES. These matter more than anything else:
- You may ONLY state facts that appear in the <material> you are given. Your own memory of
  football is unreliable: do not add any name, number, date, score, position, role, transfer fee,
  record or event that is not written in the material. If the material is thin, write a shorter
  video (4 lines is fine) rather than padding it with things you believe to be true.
- Never write a direct quote. Do not use quotation marks at all. Report what was said in your own
  words only if the material itself reports it.
- Rumours must be framed as rumours ("reports in Spain claim..."), naming the outlet.
- stat_value must be a number or score that appears in the material, exactly.
- Write in your own words; never copy a sentence from the material.

STYLE:
- Line 1 is a hook that makes people stop scrolling. The final line is a varied call to follow the
  page or comment. Opinions, questions to the audience and calls to action are always allowed.
- Spoken lines are short and rhythmic. 50-110 spoken words per video.
- No hate, no mocking players' appearance, no betting, no engagement bait like "share or bad luck".
- Visuals: give most lines an image_query. Use 'entity' with the exact Wikipedia article name of the
  player, coach, stadium, city or trophy the line is about. Use 'stock' with 2-4 generic words for
  atmosphere. Never ask for club crests, logos, kits or screenshots, and vary the images.
- News and match videos must set source_name to the outlet(s) named in the material.
"""

CHECK_SYSTEM = """You are a strict fact-checker for football video scripts. You get MATERIAL and a
numbered SCRIPT. For every script line, decide whether each factual claim in it (names, numbers,
dates, scores, positions, roles, records, events, quotes) is directly supported by the MATERIAL.
Ignore opinions, questions to the audience, greetings and calls to follow or comment.
Use only the MATERIAL, never your own knowledge.
Reply with ONE JSON object and nothing else:
{"unsupported": [{"line": <number>, "claim": "<the unsupported claim>"}]}
Return an empty list if every factual claim is supported."""


def _json_system():
    return (SYSTEM + "\nReply with ONE JSON object and nothing else (no markdown, no commentary), matching this "
            "JSON Schema:\n" + json.dumps(SCHEMA))


def _extract_json(text):
    """Pull the JSON object out of a model reply that may wrap it in prose or a code fence."""
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in reply")
    return json.loads(text[start:end + 1])


def _extract_videos(text):
    data = _extract_json(text)
    videos = data.get("videos") if isinstance(data, dict) else None
    if isinstance(data, dict) and videos is None and data.get("segments"):
        videos = [data]  # a single video returned bare
    if not videos:
        raise ValueError("no videos in reply")
    return videos


_calls = 0


def _llm(system, prompt):
    """One text completion from whichever provider is configured."""
    global _calls
    if config.ANTHROPIC_API_KEY:
        import anthropic
        resp = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY).messages.create(
            model=config.CLAUDE_MODEL, max_tokens=6000, system=system,
            messages=[{"role": "user", "content": prompt}])
        return "".join(b.text for b in resp.content if b.type == "text")
    if _calls:
        time.sleep(GROQ_PAUSE)
    _calls += 1
    if config.GROQ_API_KEY or not site.enabled():
        if not config.GROQ_API_KEY:
            raise RuntimeError("Set ANTHROPIC_API_KEY, GROQ_API_KEY or CRON_TOKEN")
        r = requests.post("https://api.groq.com/openai/v1/chat/completions", timeout=180,
                          headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
                          json={"model": config.GROQ_MODEL, "temperature": 0.4, "max_tokens": 4096,
                                "messages": [{"role": "system", "content": system},
                                             {"role": "user", "content": prompt}]})
        if r.status_code >= 400:
            raise RuntimeError(f"Groq HTTP {r.status_code}: {r.text[:300]}")
        return r.json()["choices"][0]["message"]["content"]
    return site.call("scripts", system=system, prompt=prompt, model=config.GROQ_MODEL)["content"]


def _material_text(kind, material):
    if kind == "news":
        parts = [f"[{i}] {n['title']} (outlet: {n.get('source') or 'unknown'})\n{n.get('summary', '')}"
                 for i, n in enumerate(material["news"], 1)]
        if material.get("matches"):
            parts.append("MATCH DATA: " + json.dumps(material["matches"], ensure_ascii=False))
        return "\n\n".join(parts)
    return "\n\n".join(f"[From the Wikipedia article '{p['title']}']\n{p['text']}" for p in material["passages"])


def _write(kind, material, count, avoid):
    today = datetime.now(timezone.utc).strftime("%A %d %B %Y")
    if kind == "news":
        ask = (f"Write {count} different videos, format 'news' or 'match', each about ONE story from the "
               "material. Pick the stories with the most detail and the most interest for Barça fans. Use "
               "'match' only for a fixture or result listed in MATCH DATA.")
    else:
        ask = (f"Write {count} different videos, format 'fact' or 'stats', each built on one surprising, "
               "specific fact from the material. Use 'stats' when the hook is a number.")
    prompt = (f"Today is {today}. {ask}\nDo not repeat these recent titles: {json.dumps(list(avoid)[-30:])}\n\n"
              f"<material>\n{_material_text(kind, material)}\n</material>")
    videos = [v for v in (_tidy(v) for v in _extract_videos(_llm(_json_system(), prompt))) if v]
    for v in videos:
        if kind != "news":
            v.pop("source_name", None)
            if v["format"] not in ("fact", "stats"):
                v["format"] = "fact"
        elif v["format"] not in ("news", "match"):
            v["format"] = "news"
    return videos[:count]


QUOTE_MARKS = ('"', "“", "”", "«", "»")


def _verify(video, kind, material):
    """True if an independent check finds every factual claim in the material. Fails closed."""
    lines = [s["say"] + (f" [on-screen number: {s['stat_value']}]" if s.get("stat_value") else "")
             for s in video["segments"]]
    if any(q in line for line in lines for q in QUOTE_MARKS):
        print(f"[check] dropped '{video['title']}': contains a direct quote")
        return False
    script = f"0. (headline) {video['title']}\n" + "\n".join(f"{i}. {t}" for i, t in enumerate(lines, 1))
    try:
        reply = _extract_json(_llm(CHECK_SYSTEM, f"MATERIAL:\n{_material_text(kind, material)}\n\nSCRIPT:\n{script}"))
        bad = reply.get("unsupported")
        if not isinstance(bad, list):
            raise ValueError("no 'unsupported' list in reply")
    except Exception as e:  # noqa: BLE001
        print(f"[check] dropped '{video['title']}': check failed ({e})")
        return False
    if bad:
        claims = "; ".join(str(b.get("claim", b))[:80] if isinstance(b, dict) else str(b)[:80] for b in bad[:3])
        print(f"[check] dropped '{video['title']}': unsupported -> {claims}")
        return False
    return True


def write_scripts(news, matches, passages, count, recent_titles=()):
    """Write and fact-check scripts. Returns fewer than `count` (or none) rather than unverified ones."""
    n_news = (count + 1) // 2 if news else 0
    n_fact = count - n_news if passages else 0
    plan = [("news", {"news": news[:10], "matches": matches}, n_news),
            ("fact", {"passages": passages}, n_fact)]
    out, avoid = [], list(recent_titles)
    for kind, material, want in plan:
        got = 0
        for _attempt in range(2):  # one retry if the checker rejects drafts
            if got >= want:
                break
            try:
                drafts = _write(kind, material, want - got, avoid)
            except Exception as e:  # noqa: BLE001
                print(f"[writer] {kind} batch failed: {e}")
                continue
            for v in drafts:
                avoid.append(v["title"])
                if _verify(v, kind, material):
                    out.append(v)
                    got += 1
    return out


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

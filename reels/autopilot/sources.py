"""Collect raw material: recent Barça news (RSS) and fixtures/results/table (football-data.org)."""
import re
import time
import urllib.parse
from datetime import datetime, timedelta, timezone

import feedparser
import requests

from . import config

UA = {"User-Agent": "Mozilla/5.0 (dhf-autopilot)"}


def _google_news_url(query):
    q = urllib.parse.quote(f"{query} when:2d")
    return f"https://news.google.com/rss/search?q={q}&hl=en-GB&gl=GB&ceid=GB:en"


def _clean(text):
    text = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"\s+", " ", text).strip()


def _norm(title):
    title = re.sub(r"\s+-\s+[^-]+$", "", title)  # strip " - Source" suffix
    return re.sub(r"[^a-z0-9 ]", "", title.lower())[:80]


def fetch_news(max_items=30, max_age_hours=36):
    feeds = [_google_news_url(q) for q in config.NEWS_QUERIES] + config.EXTRA_FEEDS
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    seen, items = set(), []
    for url in feeds:
        try:
            feed = feedparser.parse(url, agent=UA["User-Agent"])
        except Exception as e:  # noqa: BLE001
            print(f"[news] feed failed {url}: {e}")
            continue
        for e in feed.entries:
            published = None
            if getattr(e, "published_parsed", None):
                published = datetime.fromtimestamp(time.mktime(e.published_parsed), timezone.utc)
                if published < cutoff:
                    continue
            title = _clean(e.get("title"))
            key = _norm(title)
            if not title or key in seen:
                continue
            seen.add(key)
            source = e.get("source", {}).get("title") if isinstance(e.get("source"), dict) else None
            items.append({
                "title": title,
                "summary": _clean(e.get("summary"))[:400],
                "source": source or "",
                "link": e.get("link", ""),
                "published": published.isoformat() if published else "",
            })
    items.sort(key=lambda x: x["published"], reverse=True)
    print(f"[news] {len(items)} fresh items")
    return items[:max_items]


def _fd_get(path, **params):
    r = requests.get(f"https://api.football-data.org/v4{path}", params=params,
                     headers={"X-Auth-Token": config.FOOTBALL_DATA_TOKEN}, timeout=20)
    r.raise_for_status()
    return r.json()


def fetch_matches():
    """Recent results, upcoming fixtures and La Liga table. Empty dict if no token."""
    if not config.FOOTBALL_DATA_TOKEN:
        print("[matches] FOOTBALL_DATA_TOKEN not set, skipping match data")
        return {}
    today = datetime.now(timezone.utc).date()
    out = {"results": [], "fixtures": [], "table": []}
    try:
        data = _fd_get(f"/teams/{config.FOOTBALL_DATA_TEAM_ID}/matches",
                       dateFrom=str(today - timedelta(days=7)), dateTo=str(today + timedelta(days=7)))
        for m in data.get("matches", []):
            row = {
                "competition": m["competition"]["name"],
                "date": m["utcDate"],
                "home": m["homeTeam"]["shortName"] or m["homeTeam"]["name"],
                "away": m["awayTeam"]["shortName"] or m["awayTeam"]["name"],
                "status": m["status"],
            }
            if m["status"] == "FINISHED":
                ft = m["score"]["fullTime"]
                row["score"] = f'{ft["home"]}-{ft["away"]}'
                out["results"].append(row)
            elif m["status"] in ("SCHEDULED", "TIMED"):
                out["fixtures"].append(row)
    except Exception as e:  # noqa: BLE001
        print(f"[matches] matches failed: {e}")
    try:
        st = _fd_get("/competitions/PD/standings")
        table = st["standings"][0]["table"]
        out["table"] = [{"pos": t["position"], "team": t["team"]["shortName"], "pts": t["points"],
                         "played": t["playedGames"], "gd": t["goalDifference"]} for t in table[:8]]
    except Exception as e:  # noqa: BLE001
        print(f"[matches] standings failed: {e}")
    return out

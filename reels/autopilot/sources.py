"""Collect raw material: recent Barça news (RSS) and fixtures/results/table (football-data.org)."""
import calendar
import random
import re
import time
import urllib.parse
from datetime import datetime, timedelta, timezone

import feedparser
import requests

from . import config, site

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


def fetch_rich_news(max_items=12, max_age_hours=48, min_chars=70):
    """Stories with a real summary from the club feeds of established outlets."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    seen, items = set(), []
    for outlet, url in config.RICH_FEEDS:
        kept = 0
        try:
            feed = feedparser.parse(url, agent=UA["User-Agent"])
        except Exception as e:  # noqa: BLE001
            print(f"[news] {outlet} failed: {e}")
            continue
        for e in feed.entries:
            when = getattr(e, "published_parsed", None) or getattr(e, "updated_parsed", None)
            if not when:
                continue
            published = datetime.fromtimestamp(calendar.timegm(when), timezone.utc)
            title, summary = _clean(e.get("title")), _clean(e.get("summary"))
            key = _norm(title)
            if published < cutoff or len(summary) < min_chars or not title or key in seen:
                continue
            seen.add(key)
            kept += 1
            items.append({"title": title, "summary": summary[:900], "source": outlet,
                          "link": e.get("link", ""), "published": published.isoformat()})
        print(f"[news] {outlet}: {kept} usable of {len(feed.entries)}")
    items.sort(key=lambda x: x["published"], reverse=True)
    # spread across outlets so one busy feed does not crowd out the rest
    out, per = [], {}
    for it in items:
        if per.get(it["source"], 0) < max(3, max_items // 3):
            out.append(it)
            per[it["source"]] = per.get(it["source"], 0) + 1
    return out[:max_items]


def fetch_squad():
    """Current coach and squad via the site (football-data.org). Empty dict if unavailable."""
    if not site.enabled():
        return {}
    try:
        data = site.call("squad", timeout=40)
        return {"coach": data.get("coach", ""), "players": data.get("players", [])}
    except Exception as e:  # noqa: BLE001
        print(f"[squad] unavailable: {e}")
        return {}


def fetch_fact_passages(count, used_titles=()):
    """Random passages from Wikipedia articles about the club; the only allowed source for fact videos."""
    pages = [p for p in config.FACT_PAGES if p not in used_titles] or list(config.FACT_PAGES)
    random.shuffle(pages)
    out = []
    for title in pages:
        if len(out) >= count:
            break
        try:
            r = requests.get("https://en.wikipedia.org/w/api.php", timeout=30,
                             headers={"User-Agent": f"dhf-autopilot/1.0 ({config.CONTACT_URL})"},
                             params={"action": "query", "format": "json", "prop": "extracts", "explaintext": 1,
                                     "exsectionformat": "plain", "redirects": 1, "titles": title})
            r.raise_for_status()
            page = next(iter(r.json()["query"]["pages"].values()))
            text = page.get("extract") or ""
        except Exception as e:  # noqa: BLE001
            print(f"[facts] {title}: {e}")
            continue
        for stop in ("\nSee also\n", "\nReferences\n", "\nNotes\n", "\nExternal links\n"):
            text = text.split(stop)[0]
        paras = [p.strip() for p in text.split("\n") if len(p.strip()) > 200]
        if not paras:
            continue
        start = random.randrange(len(paras))
        chunk, size = [], 0
        for p in paras[start:] + paras[:start]:
            if size + len(p) > 2200 and chunk:
                break
            chunk.append(p[:2200])
            size += len(p)
        out.append({"title": page.get("title", title), "text": "\n".join(chunk)})
    print(f"[facts] {len(out)} passage(s): {', '.join(p['title'] for p in out)}")
    return out


def fetch_news(max_items=30, max_age_hours=36):
    """Headline-only Google News items. Too thin to write scripts from; kept for reference."""
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
        if site.enabled():
            try:
                data = site.call("matches", timeout=60)
                return {"results": data.get("results", []), "fixtures": data.get("fixtures", []), "table": []}
            except Exception as e:  # noqa: BLE001
                print(f"[matches] site lookup failed: {e}")
        print("[matches] no match data available")
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

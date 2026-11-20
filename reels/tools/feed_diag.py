"""Temporary: print what each candidate news feed actually returns."""
import calendar, re, statistics, sys, time
import feedparser, requests

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8"}
FEEDS = {
 "Guardian": "https://www.theguardian.com/football/barcelona/rss",
 "BBC": "https://feeds.bbci.co.uk/sport/football/teams/barcelona/rss.xml",
 "Marca": "https://e00-marca.uecdn.es/rss/futbol/barcelona.xml",
 "MD-a": "https://www.mundodeportivo.com/feed/rss/fc-barcelona",
 "MD-b": "https://www.mundodeportivo.com/rss/futbol/fc-barcelona.xml",
 "Sport": "https://www.sport.es/es/rss/barca/rss.xml",
 "BarcaBlaugranes": "https://www.barcablaugranes.com/rss/index.xml",
 "FootballEspana": "https://www.football-espana.net/feed",
 "BarcaUniversal": "https://barcauniversal.com/feed/",
 "GFNSpain": "https://www.getfootballnewsspain.com/feed/",
 "FCB-official": "https://www.fcbarcelona.com/en/rss/news",
 "ESPN": "https://www.espn.com/espn/rss/soccer/news",
 "Goal": "https://www.goal.com/feeds/en/news",
 "AS": "https://as.com/rss/tags/fc_barcelona/a.xml",
 "Yahoo": "https://sports.yahoo.com/soccer/teams/barcelona/rss/",
 "OneFootball-none": "https://www.barcablog.com/feed",
}
clean = lambda t: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t or "")).strip()
now = time.time()
for name, url in FEEDS.items():
    try:
        r = requests.get(url, headers=UA, timeout=25)
        f = feedparser.parse(r.content)
    except Exception as e:
        print(f"DIAG {name}: ERROR {type(e).__name__} {str(e)[:80]}"); continue
    ages, sums, bodies, barca = [], [], [], 0
    for e in f.entries:
        w = getattr(e, "published_parsed", None) or getattr(e, "updated_parsed", None)
        ages.append((now - calendar.timegm(w)) / 3600 if w else -1)
        s = clean(e.get("summary")); c = clean(e.content[0].value) if e.get("content") else ""
        sums.append(len(s)); bodies.append(len(c))
        if re.search(r"bar[cç]a|barcelona", (e.get("title", "") + " " + s), re.I): barca += 1
    n = len(f.entries)
    if not n:
        print(f"DIAG {name}: HTTP {r.status_code} bytes={len(r.content)} entries=0 ctype={r.headers.get('content-type','')[:30]}"); continue
    fresh = sum(1 for a in ages if 0 <= a <= 48)
    print(f"DIAG {name}: HTTP {r.status_code} entries={n} fresh48h={fresh} nodate={sum(1 for a in ages if a < 0)} "
          f"age_min={min(a for a in ages):.0f}h summary_med={statistics.median(sums):.0f} summary>=70:{sum(1 for x in sums if x >= 70)} "
          f"body_med={statistics.median(bodies):.0f} barca_mentions={barca} | {clean(f.entries[0].get('title'))[:60]}")

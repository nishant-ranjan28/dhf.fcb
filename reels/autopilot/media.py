"""Find free-to-use photos for each line of a script.

Sources, in order:
  entity (a named player, coach, stadium, city, trophy)
      1. the lead photo of the matching Wikipedia article, if it is freely licensed
      2. Wikimedia Commons search, then Openverse
  stock (a generic scene: "football stadium floodlights")
      1. Pexels (needs the free PEXELS_API_KEY), else Openverse
      2. Wikimedia Commons search

Only CC0 / public domain / CC BY / CC BY-SA files are accepted, and every image comes back with
the credit line its licence requires. News-site photos are never used: they belong to agencies.
"""
import hashlib
import html
import io
import re
from pathlib import Path

import requests
from PIL import Image, ImageOps

from . import config

UA = {"User-Agent": f"dhf-autopilot/1.0 ({config.CONTACT_URL})"}
COMMONS = "https://commons.wikimedia.org/w/api.php"
WIKIPEDIA = "https://en.wikipedia.org/w/api.php"
OK_LICENSE = re.compile(r"^(cc0|public domain|pd\b|pd-|cc by(-sa)? \d)", re.I)
BAD_LICENSE = re.compile(r"\b(nc|nd)\b|non-?free|fair use", re.I)
# crests, kits, maps and flags are either trademarked or just not useful as video visuals
BAD_NAME = re.compile(r"logo|crest|badge|escut|kit[ _]|icon|map|flag|diagram|chart|signature|\.svg", re.I)
MIN_W, MIN_H = 700, 450


def _get(url, **kw):
    r = requests.get(url, headers={**UA, **kw.pop("headers", {})}, timeout=25, **kw)
    r.raise_for_status()
    return r


def _clean_artist(raw):
    t = html.unescape(re.sub(r"<[^>]+>", " ", raw or ""))
    t = re.sub(r"\s+", " ", t).strip(" .,;")
    t = re.sub(r"^(photo(graph)? by|by|author:?)\s+", "", t, flags=re.I)
    return (t[:27] + "…") if len(t) > 28 else (t or "Unknown author")


def _commons_candidates(params):
    """Run a Commons imageinfo query and return acceptable files, best first."""
    q = {"action": "query", "format": "json", "prop": "imageinfo", "iiurlwidth": 1600,
         "iiprop": "url|size|mime|extmetadata", **params}
    pages = (_get(COMMONS, params=q).json().get("query") or {}).get("pages") or {}
    out = []
    for p in sorted(pages.values(), key=lambda p: p.get("index", 0)):
        info = (p.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata") or {}
        lic = (meta.get("LicenseShortName") or {}).get("value", "")
        title = p.get("title", "")
        if info.get("mime") not in ("image/jpeg", "image/png"):
            continue
        if info.get("width", 0) < MIN_W or info.get("height", 0) < MIN_H:
            continue
        if not OK_LICENSE.search(lic) or BAD_LICENSE.search(lic) or BAD_NAME.search(title):
            continue
        public = lic.lower().startswith(("public", "pd", "cc0"))
        artist = _clean_artist((meta.get("Artist") or {}).get("value"))
        out.append({
            "url": info.get("thumburl") or info["url"],
            "page": info.get("descriptionurl", ""),
            "license": "Public domain" if public else lic,
            "credit": f"{artist} / Wikimedia Commons · {'Public domain' if public else lic}",
            "key": title,
        })
    return out


def _wikipedia_lead(query):
    """File name of the free lead image of the best-matching Wikipedia article."""
    q = {"action": "query", "format": "json", "generator": "search", "gsrsearch": query, "gsrlimit": 1,
         "prop": "pageimages", "piprop": "name", "pilicense": "free"}
    pages = (_get(WIKIPEDIA, params=q).json().get("query") or {}).get("pages") or {}
    for p in pages.values():
        if p.get("pageimage"):
            return "File:" + p["pageimage"]
    return None


def _entity(query):
    cands = []
    try:
        lead = _wikipedia_lead(query)
        if lead:
            cands += _commons_candidates({"titles": lead})
    except Exception as e:  # noqa: BLE001
        print(f"[media] wikipedia lookup failed for {query!r}: {e}")
    cands += _commons_search(query)
    return cands or _openverse(query)


def _commons_search(query):
    try:
        return _commons_candidates({"generator": "search", "gsrnamespace": 6, "gsrlimit": 10,
                                    "gsrsearch": f"{query} filetype:bitmap"})
    except Exception as e:  # noqa: BLE001
        print(f"[media] commons search failed for {query!r}: {e}")
        return []


def _pexels(query):
    if not config.PEXELS_API_KEY:
        return []
    try:
        data = _get("https://api.pexels.com/v1/search", headers={"Authorization": config.PEXELS_API_KEY},
                    params={"query": query, "per_page": 8, "orientation": "landscape"}).json()
    except Exception as e:  # noqa: BLE001
        print(f"[media] pexels failed for {query!r}: {e}")
        return []
    return [{"url": p["src"]["large2x"], "page": p["url"], "license": "Pexels License",
             "credit": f"{_clean_artist(p.get('photographer'))} / Pexels", "key": f"pexels:{p['id']}"}
            for p in data.get("photos", [])]


def _openverse(query):
    """Openverse indexes CC photos from Flickr and others. No key needed for light use."""
    try:
        data = _get("https://api.openverse.org/v1/images/", params={
            "q": query, "license": "cc0,pdm,by,by-sa", "page_size": 8, "mature": "false"}).json()
    except Exception as e:  # noqa: BLE001
        print(f"[media] openverse failed for {query!r}: {e}")
        return []
    out = []
    for r in data.get("results", []):
        lic = (r.get("license") or "").lower()
        if lic not in ("cc0", "pdm", "by", "by-sa") or BAD_NAME.search(r.get("title") or ""):
            continue
        if (r.get("width") or 0) < MIN_W or (r.get("height") or 0) < MIN_H or not r.get("url"):
            continue
        public = lic in ("cc0", "pdm")
        label = "Public domain" if public else f"CC {lic.upper()} {r.get('license_version') or ''}".strip()
        src = (r.get("source") or "Openverse").capitalize()
        out.append({"url": r["url"], "page": r.get("foreign_landing_url", ""), "license": label,
                    "credit": f"{_clean_artist(r.get('creator'))} / {src} · {label}", "key": f"ov:{r.get('id')}"})
    return out


def _download(cand, workdir: Path):
    name = hashlib.sha1(cand["key"].encode()).hexdigest()[:16] + ".jpg"
    dest = workdir / name
    if not dest.exists():
        raw = _get(cand["url"]).content
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
        if img.width < MIN_W * 0.8 or img.height < MIN_H * 0.8:
            raise ValueError("image too small")
        img.save(dest, quality=92)
    return dest


def find(query, kind, workdir: Path, used: set):
    """Return {'path', 'credit', 'license', 'page'} for the best unused free image, or None."""
    query = (query or "").strip()
    if not query or not config.USE_IMAGES:
        return None
    workdir.mkdir(parents=True, exist_ok=True)
    cands = (_pexels(query) or _openverse(query)) + _commons_search(query) if kind == "stock" else _entity(query)
    # prefer an image this video hasn't shown yet, but allow a repeat rather than nothing
    for cand in [c for c in cands if c["key"] not in used] + [c for c in cands if c["key"] in used]:
        try:
            path = _download(cand, workdir)
        except Exception as e:  # noqa: BLE001
            print(f"[media] skip {cand['key']}: {e}")
            continue
        used.add(cand["key"])
        return {"path": str(path), "credit": cand["credit"], "license": cand["license"], "page": cand["page"]}
    print(f"[media] no free image for {query!r}")
    return None


def attach(script, workdir: Path):
    """Pick an image per segment. Returns (list aligned with segments, de-duplicated credit lines)."""
    used, cache, picks, credits = set(), {}, [], []
    for seg in script["segments"]:
        q, kind = seg.get("image_query"), seg.get("image_type", "entity")
        if q and (q, kind) not in cache:
            cache[(q, kind)] = find(q, kind, workdir, used)
        m = cache.get((q, kind)) if q else None
        picks.append(m)
        if m and m["credit"] not in credits:
            credits.append(m["credit"])
    return picks, credits

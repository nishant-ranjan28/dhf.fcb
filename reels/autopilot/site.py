"""Use the website's /api/cron/reels endpoint, so the Groq and Facebook keys stay in Vercel."""
import requests

from . import config


def enabled():
    return bool(config.CRON_TOKEN and config.SITE_URL)


def call(action, timeout=150, **payload):
    r = requests.post(f"{config.SITE_URL.rstrip('/')}/api/cron/reels", timeout=timeout,
                      headers={"Authorization": f"Bearer {config.CRON_TOKEN}"},
                      json={"action": action, **payload})
    try:
        data = r.json()
    except ValueError:
        raise RuntimeError(f"site {action}: HTTP {r.status_code} {r.text[:200]}") from None
    if r.status_code >= 400 or not data.get("ok"):
        raise RuntimeError(f"site {action}: HTTP {r.status_code} {data.get('error', data)}")
    return data

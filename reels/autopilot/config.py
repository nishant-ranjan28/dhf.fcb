"""All settings come from environment variables (GitHub Actions secrets/vars)."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
FONTS = ASSETS / "fonts"
MUSIC = ASSETS / "music"
WORK = ROOT / "work"          # scratch dir, git-ignored
MODELS = ROOT / "models"      # Kokoro model cache, git-ignored


def env(key, default=None):
    v = os.environ.get(key)
    return v if v not in (None, "") else default


def env_bool(key, default=False):
    v = env(key)
    return default if v is None else v.strip().lower() in ("1", "true", "yes", "on")


# --- Page identity -----------------------------------------------------------
PAGE_NAME = env("PAGE_NAME", "Die Hard Fans of FC Barcelona")
PAGE_HANDLE = env("PAGE_HANDLE", "@DHF.FCB")
TEAM_NAME = env("TEAM_NAME", "FC Barcelona")
FOOTBALL_DATA_TEAM_ID = int(env("FOOTBALL_DATA_TEAM_ID", "81"))  # 81 = FC Barcelona

# --- Content -----------------------------------------------------------------
DAILY_VIDEOS = int(env("DAILY_VIDEOS", "4"))
MAX_POSTS_PER_DAY = int(env("MAX_POSTS_PER_DAY", "5"))
LANGUAGE = env("LANGUAGE", "English")
CLAUDE_MODEL = env("CLAUDE_MODEL", "claude-sonnet-5-5")
NEWS_QUERIES = [q.strip() for q in env(
    "NEWS_QUERIES", '"FC Barcelona"|Barca Flick|Barcelona La Liga').split("|") if q.strip()]
# Feeds with real article summaries. Scripts are only written from these, never from bare headlines.
RICH_FEEDS = [tuple(x.strip() for x in f.split("=", 1)) for f in env(
    "RICH_FEEDS",
    "The Guardian=https://www.theguardian.com/football/barcelona/rss|"
    "BBC Sport=https://feeds.bbci.co.uk/sport/football/teams/barcelona/rss.xml|"
    "Marca=https://e00-marca.uecdn.es/rss/futbol/barcelona.xml|"
    "Mundo Deportivo=https://www.mundodeportivo.com/feed/rss/fc-barcelona").split("|") if "=" in f]
# Wikipedia articles that fact / stats videos are drawn from (one random passage each per video).
FACT_PAGES = [p.strip() for p in env(
    "FACT_PAGES", "FC Barcelona|History of FC Barcelona|List of FC Barcelona records and statistics|Camp Nou|"
    "La Masia|El Clásico|FC Barcelona in international football|Joan Gamper|Johan Cruyff|Pep Guardiola|"
    "Lionel Messi|Xavi|Andrés Iniesta|Carles Puyol|Ronaldinho|László Kubala|Dream Team (FC Barcelona)|"
    "2008–09 FC Barcelona season|Més que un club|Estadi Olímpic Lluís Companys").split("|") if p.strip()]
EXTRA_FEEDS = [f.strip() for f in env("NEWS_FEEDS", "").split(",") if f.strip()]

# --- Voice -------------------------------------------------------------------
# VOICE_MODE: "tts"  -> AI voice on every draft; reply to a draft with a voice note to swap in yours
#             "own"  -> drafts arrive as scripts only; your voice-note reply renders + approves it
VOICE_MODE = env("VOICE_MODE", "tts")
TTS_ENGINE = env("TTS_ENGINE", "kokoro")        # kokoro (offline, free) | edge
KOKORO_VOICE = env("KOKORO_VOICE", "bm_george")  # British male; try am_michael, bm_lewis
EDGE_VOICE = env("EDGE_VOICE", "en-GB-RyanNeural")
TTS_SPEED = float(env("TTS_SPEED", "1.08"))
MUSIC_VOLUME = float(env("MUSIC_VOLUME", "0.10"))

# --- Images ------------------------------------------------------------------
USE_IMAGES = env_bool("USE_IMAGES", True)
PEXELS_API_KEY = env("PEXELS_API_KEY")   # free key from pexels.com/api, for generic stock photos
CONTACT_URL = env("CONTACT_URL", "https://www.facebook.com/DHF.FCB")  # sent to Wikimedia as required by their API policy

# --- Approval ----------------------------------------------------------------
AUTO_APPROVE = env_bool("AUTO_APPROVE", False)

# --- Engagement --------------------------------------------------------------
SITE_URL = env("SITE_URL", "https://dhf-fcb.iamnishant.in")
# After a Reel is published, add a first comment linking to the site. Links in comments do not
# suppress reach the way link posts do. Needs the pages_manage_engagement permission on the token.
COMMENT_LINK = env_bool("COMMENT_LINK", True)
# If >0, drafts still pending after this many hours are approved automatically.
AUTO_APPROVE_AFTER_HOURS = float(env("AUTO_APPROVE_AFTER_HOURS", "0"))

# --- Secrets -----------------------------------------------------------------
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY")
GROQ_API_KEY = env("GROQ_API_KEY")            # used when no Anthropic key is set (free tier is enough)
GROQ_MODEL = env("GROQ_MODEL", "openai/gpt-oss-120b")  # the 20b model invents facts; the site falls back to its own model if this one is unavailable
FOOTBALL_DATA_TOKEN = env("FOOTBALL_DATA_TOKEN")
TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = env("TELEGRAM_CHAT_ID")
# With CRON_TOKEN set and no key of its own, the pipeline asks the site (SITE_URL/api/cron/reels)
# to write scripts, list matches and publish, using the keys that already live in Vercel.
CRON_TOKEN = env("CRON_TOKEN")
GITHUB_REPOSITORY = env("GH_REPO") or env("GITHUB_REPOSITORY")
FB_PAGE_ID = env("FB_PAGE_ID")
FB_PAGE_TOKEN = env("FB_PAGE_TOKEN")
FB_GRAPH_VERSION = env("FB_GRAPH_VERSION", "v27.0")  # keep in step with lib/facebook.ts

# --- Storage -----------------------------------------------------------------
# "github" stores the queue + videos as assets of a GitHub release; "local" uses ./data
STORE = env("STORE", "github" if env("GITHUB_ACTIONS") else "local")
QUEUE_RELEASE_TAG = env("QUEUE_RELEASE_TAG", "queue")

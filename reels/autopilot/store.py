"""Queue state + video files. On GitHub Actions they live as assets of one release (tag 'queue')."""
import json
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import config

LOCAL = config.ROOT / "data"
EMPTY = {"items": [], "tg_offset": 0}


def now():
    return datetime.now(timezone.utc)


def _gh(*args, check=True):
    return subprocess.run(["gh", *args], capture_output=True, text=True, check=check)


def _ensure_release():
    if _gh("release", "view", config.QUEUE_RELEASE_TAG, check=False).returncode != 0:
        _gh("release", "create", config.QUEUE_RELEASE_TAG, "--title", "Video queue (automated)",
            "--notes", "Managed by dhf-autopilot. Do not edit by hand.", "--prerelease")


def load():
    if config.STORE == "local":
        p = LOCAL / "queue.json"
        return json.loads(p.read_text()) if p.exists() else json.loads(json.dumps(EMPTY))
    _ensure_release()
    tmp = config.WORK / "dl"
    tmp.mkdir(parents=True, exist_ok=True)
    r = _gh("release", "download", config.QUEUE_RELEASE_TAG, "-p", "queue.json", "-D", str(tmp), "--clobber",
            check=False)
    p = tmp / "queue.json"
    if r.returncode != 0 or not p.exists():
        return json.loads(json.dumps(EMPTY))
    return json.loads(p.read_text())


def save(state):
    data = json.dumps(state, indent=1, ensure_ascii=False)
    if config.STORE == "local":
        LOCAL.mkdir(parents=True, exist_ok=True)
        (LOCAL / "queue.json").write_text(data)
        return
    p = config.WORK / "queue.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(data)
    _gh("release", "upload", config.QUEUE_RELEASE_TAG, str(p), "--clobber")


def put_video(path: Path, name: str):
    if config.STORE == "local":
        (LOCAL / "videos").mkdir(parents=True, exist_ok=True)
        shutil.copy(path, LOCAL / "videos" / name)
        return
    named = path.parent / name
    if named != path:
        shutil.copy(path, named)
    _gh("release", "upload", config.QUEUE_RELEASE_TAG, str(named), "--clobber")


def get_video(name: str, dest_dir: Path) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    if config.STORE == "local":
        shutil.copy(LOCAL / "videos" / name, dest_dir / name)
    else:
        _gh("release", "download", config.QUEUE_RELEASE_TAG, "-p", name, "-D", str(dest_dir), "--clobber")
    return dest_dir / name


def delete_video(name: str):
    if config.STORE == "local":
        (LOCAL / "videos" / name).unlink(missing_ok=True)
    else:
        _gh("release", "delete-asset", config.QUEUE_RELEASE_TAG, name, "-y", check=False)


def prune(state, keep_days=4):
    """Drop finished items (and their videos) older than keep_days; keep titles for de-duplication."""
    cutoff = now() - timedelta(days=keep_days)
    history = state.setdefault("history_titles", [])
    kept = []
    for it in state["items"]:
        done = it["status"] in ("posted", "rejected", "failed", "expired", "duplicate")
        if done and datetime.fromisoformat(it["created"]) < cutoff:
            for name in (it.get("video"), it.get("image")):
                if name:
                    delete_video(name)
            history.append(it["script"]["title"])
        else:
            kept.append(it)
    state["items"] = kept
    state["history_titles"] = history[-200:]

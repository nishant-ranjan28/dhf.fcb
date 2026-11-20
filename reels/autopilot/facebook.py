"""Publish a Reel to the Facebook Page via the Graph API (resumable upload)."""
import time
from pathlib import Path

import requests

from . import config


def _graph(path):
    return f"https://graph.facebook.com/{config.FB_GRAPH_VERSION}/{path}"


def _check(r):
    try:
        data = r.json()
    except ValueError:
        r.raise_for_status()
        raise
    if r.status_code >= 400 or "error" in data:
        raise RuntimeError(f"Graph API error: {data}")
    return data


def publish_reel(video: Path, description: str) -> str:
    token, page = config.FB_PAGE_TOKEN, config.FB_PAGE_ID
    start = _check(requests.post(_graph(f"{page}/video_reels"),
                                 data={"upload_phase": "start", "access_token": token}, timeout=60))
    video_id = start["video_id"]
    upload_url = start.get("upload_url") or \
        f"https://rupload.facebook.com/video-upload/{config.FB_GRAPH_VERSION}/{video_id}"
    size = video.stat().st_size
    with open(video, "rb") as fh:
        _check(requests.post(upload_url, data=fh, timeout=600, headers={
            "Authorization": f"OAuth {token}", "offset": "0", "file_size": str(size)}))
    _check(requests.post(_graph(f"{page}/video_reels"), timeout=60, data={
        "upload_phase": "finish", "video_id": video_id, "video_state": "PUBLISHED",
        "description": description, "access_token": token}))
    # Wait (up to ~4 min) for Facebook to finish processing so failures are reported.
    for _ in range(24):
        time.sleep(10)
        st = _check(requests.get(_graph(video_id), params={"fields": "status", "access_token": token},
                                 timeout=30)).get("status", {})
        if st.get("video_status") in ("ready", "published") or \
                st.get("publishing_phase", {}).get("status") == "complete":
            break
        if st.get("video_status") == "error" or st.get("processing_phase", {}).get("status") == "error":
            raise RuntimeError(f"Facebook processing failed: {st}")
    return video_id


def comment(object_id: str, message: str) -> str:
    """Comment on a post or Reel as the Page."""
    r = requests.post(_graph(f"{object_id}/comments"), timeout=60,
                      data={"message": message, "access_token": config.FB_PAGE_TOKEN})
    return _check(r).get("id", "")


def reel_url(video_id):
    return f"https://www.facebook.com/reel/{video_id}"

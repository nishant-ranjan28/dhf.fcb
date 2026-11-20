"""Telegram bot used as the approval inbox."""
import json
from pathlib import Path

import requests

from . import config


def _api(method, **kw):
    url = f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/{method}"
    r = requests.post(url, timeout=120, **kw)
    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(f"Telegram {method} failed: {data}")
    return data["result"]


def enabled():
    return bool(config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_CHAT_ID)


def _buttons(item_id):
    return json.dumps({"inline_keyboard": [[
        {"text": "✅ Approve", "callback_data": f"approve:{item_id}"},
        {"text": "❌ Reject", "callback_data": f"reject:{item_id}"},
    ]]})


def _script_text(item):
    s = item["script"]
    lines = "\n".join(f"{i + 1}. {seg['say']}" for i, seg in enumerate(s["segments"]))
    return lines


def send_draft(item, video_path: Path | None):
    s = item["script"]
    head = f"🎬 <b>{_esc(s['title'])}</b>  [{s['format']}]  id: <code>{item['id']}</code>"
    if video_path:
        extra = (f"\n📰 Source: {_esc(s['source_name'])}" if s.get("source_name") else "") + \
                (f"\n📸 {_esc('; '.join(s['credits']))}" if s.get("credits") else "\n📸 no photos found")
        cap = (f"{head}\n\n{_esc(s['fb_caption'])}\n{' '.join(s['hashtags'])}{extra[:420]}\n\n"
               "Reply to this video with a 🎙 voice note to use your own voice.")
        photo = item.get("kind") == "photo"
        with open(video_path, "rb") as fh:
            msg = _api("sendPhoto" if photo else "sendVideo",
                       data={"chat_id": config.TELEGRAM_CHAT_ID,
                             "caption": (cap.split("\n\nReply to this video")[0] if photo else cap)[:1024],
                             "parse_mode": "HTML", "supports_streaming": "true",
                             "reply_markup": _buttons(item["id"])},
                       files={"photo" if photo else "video": (video_path.name, fh)})
    else:
        text = (f"{head}\n\n🎙 <b>Record this script and reply with a voice note:</b>\n\n"
                f"{_esc(_script_text(item))}\n\n<i>Caption:</i> {_esc(s['fb_caption'])}")
        msg = _api("sendMessage", data={"chat_id": config.TELEGRAM_CHAT_ID, "text": text[:4096],
                                        "parse_mode": "HTML",
                                        "reply_markup": json.dumps({"inline_keyboard": [[
                                            {"text": "❌ Skip", "callback_data": f"reject:{item['id']}"}]]})})
    return msg["message_id"]


def send_video(path: Path, caption):
    with open(path, "rb") as fh:
        _api("sendVideo", data={"chat_id": config.TELEGRAM_CHAT_ID, "caption": caption[:1024]},
             files={"video": (path.name, fh, "video/mp4")})


def notify(text):
    if enabled():
        try:
            _api("sendMessage", data={"chat_id": config.TELEGRAM_CHAT_ID, "text": text[:4096],
                                      "disable_web_page_preview": "true"})
        except Exception as e:  # noqa: BLE001
            print(f"[telegram] notify failed: {e}")


def updates(offset):
    return _api("getUpdates", data={"offset": offset, "timeout": 0,
                                    "allowed_updates": json.dumps(["message", "callback_query"])})


def answer(callback_id, text):
    try:
        _api("answerCallbackQuery", data={"callback_query_id": callback_id, "text": text})
    except Exception:  # noqa: BLE001  (callbacks expire after a while; harmless)
        pass


def clear_buttons(message_id):
    try:
        _api("editMessageReplyMarkup", data={"chat_id": config.TELEGRAM_CHAT_ID, "message_id": message_id,
                                             "reply_markup": json.dumps({"inline_keyboard": []})})
    except Exception:  # noqa: BLE001
        pass


def download(file_id, dest: Path):
    info = _api("getFile", data={"file_id": file_id})
    url = f"https://api.telegram.org/file/bot{config.TELEGRAM_BOT_TOKEN}/{info['file_path']}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(requests.get(url, timeout=120).content)
    return dest


def _esc(t):
    return (t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

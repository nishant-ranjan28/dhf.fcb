"""
python -m autopilot generate          # make today's drafts and send them to Telegram
python -m autopilot publish           # read approvals/voice notes, then post the next approved Reel
python -m autopilot publish --no-post # only read approvals/voice notes
python -m autopilot sample [file]     # render a sample script offline (no API keys needed)
"""
import argparse
import json
import secrets
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import config, facebook, ghissue, media, render, site, sources, store, telegram, voice, writer

PRIORITY = {"match": 0, "news": 1, "photo": 2, "stats": 3, "fact": 4}


def _render_item(item, audio_src=None):
    wd = config.WORK / item["id"]
    segs = item["script"]["segments"]
    if audio_src:
        wav, timings = voice.own_recording(audio_src, segs, wd / "voice")
    else:
        wav, timings = voice.tts(segs, wd / "voice")
    out = wd / f"{item['id']}.mp4"
    images, credits = media.attach(item["script"], wd / "media")
    item["script"]["credits"] = credits
    print(f"[render] {item['id']}: {sum(1 for m in images if m)}/{len(images)} lines have a photo")
    render.render(item["script"], wav, timings, out, wd / "frames", images=images)
    return out


def _render_photo(item):
    """Build the headline card for a photo post. Returns None if no free photo was found."""
    wd = config.WORK / item["id"]
    images, credits = media.attach(item["script"], wd / "media")
    pick = next((m for m in images if m), None)
    if not pick:
        return None
    item["script"]["credits"] = [pick["credit"]]
    wd.mkdir(parents=True, exist_ok=True)
    return render.render_card(item["script"], pick, wd / f"{item['id']}.jpg")


def _caption(item):
    """Facebook text for a post: the checked lines for a photo post, then caption, tags and credits."""
    s = item["script"]
    body = s["fb_caption"]
    if item.get("kind") == "photo":
        body = "\n".join(seg["say"] for seg in s["segments"]) + "\n\n" + body
    desc = f"{body}\n\n{' '.join(s['hashtags'])}"
    if s.get("source_name"):
        desc += f"\n\n📰 Source: {s['source_name']}"
    if s.get("credits"):
        desc += "\n📸 " + "; ".join(s["credits"])
    return desc


def _ist_now():
    return datetime.now(timezone(timedelta(hours=5, minutes=30)))


def cmd_generate(args):
    state = store.load()
    if not args.force:
        today = _ist_now().date()
        made_today = any(datetime.fromisoformat(i["created"]).astimezone(_ist_now().tzinfo).date() == today
                         for i in state["items"])
        if made_today:
            print("[generate] drafts already made today; nothing to do")
            return
        if _ist_now().hour < config.GENERATE_AFTER_IST:
            print("[generate] too early in the day; nothing to do")
            return
    store.prune(state)
    news = sources.fetch_rich_news()
    matches = sources.fetch_matches()
    squad = sources.fetch_squad()
    print(f"[generate] material: {len(news)} stories with summaries, squad of {len(squad.get('players', []))}")
    recent = state.get("history_titles", []) + [i["script"]["title"] for i in state["items"]]
    count = args.count or config.DAILY_VIDEOS
    passages = sources.fetch_fact_passages(max(2, count - min((count + 1) // 2, len(news))))
    scripts = writer.write_scripts(news, matches, passages, count, recent, squad)
    print(f"[generate] {len(scripts)} of {count} scripts passed the fact check")
    # photo posts come from the stories the videos did not get to
    photo_scripts = writer.write_photo_posts(news[10:], config.DAILY_PHOTOS,
                                             recent + [s["title"] for s in scripts], squad, scripts)
    for s in scripts + photo_scripts:
        s.pop("_story_key", None)
    print(f"[generate] {len(photo_scripts)} of {config.DAILY_PHOTOS} photo posts passed the fact check")
    tg, gi = telegram.enabled(), ghissue.enabled()
    review = tg or gi
    if not review and not config.AUTO_APPROVE:
        print("[generate] WARNING: no Telegram bot or GitHub issue approval available, so drafts are auto-approved")
    made, batch = 0, []
    for s in scripts:
        item = {"id": datetime.now().strftime("%m%d") + secrets.token_hex(2), "created": store.now().isoformat(),
                "script": s, "status": "pending", "voice": "tts", "video": None, "tg_msg": None, "attempts": 0}
        try:
            if config.VOICE_MODE == "own" and tg:
                item["status"] = "awaiting_voice"
                item["tg_msg"] = telegram.send_draft(item, None)
            else:
                mp4 = _render_item(item)
                item["video"] = mp4.name
                store.put_video(mp4, mp4.name)
                if tg:
                    item["tg_msg"] = telegram.send_draft(item, mp4)
                if config.AUTO_APPROVE or not review:
                    item["status"] = "approved"
                elif gi:
                    batch.append(item)
            state["items"].append(item)
            store.save(state)  # save after each so a later crash keeps earlier drafts
            made += 1
            print(f"[generate] {item['id']} {s['title']} -> {item['status']}")
        except Exception:  # noqa: BLE001
            traceback.print_exc()
    for s in photo_scripts:
        item = {"id": datetime.now().strftime("%m%d") + secrets.token_hex(2), "created": store.now().isoformat(),
                "script": s, "kind": "photo", "status": "pending", "voice": None, "video": None, "image": None,
                "tg_msg": None, "attempts": 0}
        try:
            jpg = _render_photo(item)
            if not jpg:
                print(f"[generate] photo post skipped, no free photo: {s['title']}")
                continue
            item["image"] = jpg.name
            store.put_video(jpg, jpg.name)
            if tg:
                item["tg_msg"] = telegram.send_draft(item, jpg)
            if config.AUTO_APPROVE or not review:
                item["status"] = "approved"
            elif gi:
                batch.append(item)
            state["items"].append(item)
            store.save(state)
            made += 1
            print(f"[generate] {item['id']} photo: {s['title']} -> {item['status']}")
        except Exception:  # noqa: BLE001
            traceback.print_exc()
    if batch:
        try:
            number = ghissue.open_drafts(batch, datetime.now().strftime("%d %b %Y"))
            print(f"[generate] drafts listed in issue #{number}")
        except Exception:  # noqa: BLE001  (drafts stay pending and expire rather than post unreviewed)
            traceback.print_exc()
        store.save(state)
    telegram.notify(f"📥 {made} new draft(s) ready. Approve the ones you like; they post at the next slots.")


def _find(state, **kw):
    for it in state["items"]:
        if all(it.get(k) == v for k, v in kw.items()):
            return it
    return None


def _process_updates(state):
    if not telegram.enabled():
        return
    for u in telegram.updates(state.get("tg_offset", 0)):
        state["tg_offset"] = u["update_id"] + 1
        try:
            if "callback_query" in u:
                cq = u["callback_query"]
                if str(cq["message"]["chat"]["id"]) != str(config.TELEGRAM_CHAT_ID):
                    continue
                action, _, item_id = cq["data"].partition(":")
                it = _find(state, id=item_id)
                if not it:
                    telegram.answer(cq["id"], "Not found (already cleaned up)")
                    continue
                if it["status"] in ("pending", "awaiting_voice"):
                    it["status"] = "approved" if action == "approve" else "rejected"
                telegram.answer(cq["id"], f"{it['script']['title'][:40]}: {it['status']}")
                telegram.clear_buttons(cq["message"]["message_id"])
                continue
            msg = u.get("message") or {}
            if str(msg.get("chat", {}).get("id")) != str(config.TELEGRAM_CHAT_ID):
                continue
            text = (msg.get("text") or "").strip().lower()
            audio = msg.get("voice") or msg.get("audio") or msg.get("video_note")
            reply = msg.get("reply_to_message")
            if audio and reply:
                it = _find(state, tg_msg=reply["message_id"])
                if not it:
                    telegram.notify("🤔 That voice note isn't a reply to a draft I know.")
                elif it["status"] == "posted":
                    telegram.notify("That one is already posted.")
                else:
                    src = telegram.download(audio["file_id"], config.WORK / it["id"] / "own_voice.ogg")
                    mp4 = _render_item(it, audio_src=src)
                    it["video"] = mp4.name
                    store.put_video(mp4, mp4.name)
                    it.update(status="approved", voice="own")
                    telegram.send_video(mp4, f"✅ Re-rendered with your voice and queued: {it['script']['title']}")
            elif text in ("/approve all", "approve all", "/approveall"):
                n = 0
                for it in state["items"]:
                    if it["status"] == "pending":
                        it["status"], n = "approved", n + 1
                telegram.notify(f"✅ Approved {n} draft(s).")
            elif text in ("/status", "status"):
                counts = {}
                for it in state["items"]:
                    counts[it["status"]] = counts.get(it["status"], 0) + 1
                telegram.notify("📊 Queue: " + (", ".join(f"{k}: {v}" for k, v in counts.items()) or "empty"))
        except Exception:  # noqa: BLE001
            traceback.print_exc()


def _housekeeping(state):
    t = store.now()
    for it in state["items"]:
        age = t - datetime.fromisoformat(it["created"])
        if it["status"] == "pending" and config.AUTO_APPROVE_AFTER_HOURS > 0 and \
                age > timedelta(hours=config.AUTO_APPROVE_AFTER_HOURS):
            it["status"] = "approved"
        # news goes stale: drop anything not posted within 2 days (fact/stats keep for 5)
        limit = 5 if it["script"]["format"] in ("fact", "stats") else 2
        if it["status"] in ("pending", "awaiting_voice", "approved") and age > timedelta(days=limit):
            it["status"] = "expired"


def _post_next(state, force=False):
    since = store.now() - timedelta(hours=24)
    posted_24h = [i for i in state["items"] if i.get("posted_at")
                  and datetime.fromisoformat(i["posted_at"]) > since]
    if len(posted_24h) >= config.MAX_POSTS_PER_DAY:
        print("[publish] daily cap reached")
        return
    if not force:
        start, _, end = config.POST_HOURS_IST.partition("-")
        hour = _ist_now().hour
        if not (int(start) <= hour < int(end) or int(start) <= hour + 24 < int(end)):
            print(f"[publish] outside posting hours ({config.POST_HOURS_IST} IST)")
            return
        last = max((datetime.fromisoformat(i["posted_at"]) for i in state["items"] if i.get("posted_at")),
                   default=None)
        if last and store.now() - last < timedelta(hours=config.MIN_GAP_HOURS):
            print(f"[publish] last post was under {config.MIN_GAP_HOURS}h ago")
            return
    ready = [i for i in state["items"] if i["status"] == "approved" and (i.get("video") or i.get("image"))]
    if not ready:
        print("[publish] nothing approved")
        return
    it = sorted(ready, key=lambda i: (PRIORITY.get(i.get("kind") or i["script"]["format"], 9), i["created"]))[0]
    s = it["script"]
    photo = it.get("kind") == "photo"
    name = it["image"] if photo else it["video"]
    desc = _caption(it)
    try:
        link = f"More Barça news, fixtures and live scores 👉 {config.SITE_URL}" \
            if config.COMMENT_LINK and config.SITE_URL else ""
        if config.FB_PAGE_TOKEN and config.FB_PAGE_ID:
            path = store.get_video(name, config.WORK / "post")
            vid = facebook.publish_photo(path, desc) if photo else facebook.publish_reel(path, desc)
            if link:
                try:
                    facebook.comment(vid, link)
                except Exception as e:  # noqa: BLE001  (needs pages_manage_engagement; never block the post)
                    print(f"[publish] link comment skipped: {e}")
        elif site.enabled() and config.STORE == "github":
            # the site downloads the release asset and uploads it with the Page token held in Vercel
            if photo:
                vid = site.call("photo", imageUrl=ghissue.video_url(name), caption=desc, comment=link)["id"]
            else:
                vid = site.call("publish", videoUrl=ghissue.video_url(name), description=desc, comment=link)["id"]
        else:
            raise RuntimeError("No way to publish: set FB_PAGE_ID + FB_PAGE_TOKEN, or CRON_TOKEN")
        url = facebook.post_url(vid) if photo else facebook.reel_url(vid)
        it.update(status="posted", posted_at=store.now().isoformat(), fb_video_id=vid)
        telegram.notify(f"🚀 Posted: {s['title']}\n{url}")
        if it.get("issue"):
            ghissue.comment(it["issue"], f"🚀 Posted draft {it.get('n')}: {url}")
        print(f"[publish] posted {it['id']} -> {vid}")
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        it["attempts"] = it.get("attempts", 0) + 1
        if it["attempts"] >= 2:
            it["status"] = "failed"
        telegram.notify(f"⚠️ Posting failed ({it['attempts']}/2) for {s['title']}:\n{str(e)[:600]}")
        if it.get("issue"):
            ghissue.comment(it["issue"], f"⚠️ Posting draft {it.get('n')} failed ({it['attempts']}/2): `{str(e)[:300]}`")


def cmd_publish(args):
    state = store.load()
    _process_updates(state)
    if ghissue.enabled():
        ghissue.process(state)
    store.save(state)
    _housekeeping(state)
    if not args.no_post:
        _post_next(state, force=args.force)
    if ghissue.enabled():
        ghissue.close_finished(state)
    store.prune(state)
    store.save(state)


def cmd_sample(args):
    script = json.loads(Path(args.file).read_text())
    item = {"id": "sample", "script": script}
    out = _render_item(item)
    print(f"[sample] {out}")


def main():
    p = argparse.ArgumentParser(prog="autopilot")
    sub = p.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("generate")
    g.add_argument("--count", type=int)
    g.add_argument("--force", action="store_true", help="make drafts even if today's already exist")
    g.set_defaults(fn=cmd_generate)
    pb = sub.add_parser("publish")
    pb.add_argument("--no-post", action="store_true")
    pb.add_argument("--force", action="store_true", help="ignore posting hours and the gap between posts")
    pb.set_defaults(fn=cmd_publish)
    sm = sub.add_parser("sample")
    sm.add_argument("file", nargs="?", default=str(config.ROOT / "samples" / "sample_fact.json"))
    sm.set_defaults(fn=cmd_sample)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()

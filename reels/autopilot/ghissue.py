"""Approve drafts from a GitHub issue. Used when no Telegram bot is configured.

Each morning's drafts are listed in one issue. The repo owner (or a collaborator) replies with
`approve all`, `approve 1 3` or `reject 2`. Needs only the workflow's own GITHUB_TOKEN.
"""
import json
import re
import subprocess

from . import config, telegram

TRUSTED = {"OWNER", "MEMBER", "COLLABORATOR"}
SLOTS = "12:30, 16:00, 19:30, 22:00 and 00:30 IST"


def enabled():
    return bool(config.GITHUB_REPOSITORY and config.env("GH_TOKEN")) and not telegram.enabled()


def _api(method, path, payload=None):
    cmd = ["gh", "api", "-X", method, f"repos/{config.GITHUB_REPOSITORY}/{path}"]
    if payload is not None:
        cmd += ["--input", "-"]
    r = subprocess.run(cmd, input=json.dumps(payload) if payload is not None else None,
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"gh api {method} {path} failed: {r.stderr.strip()[:300]}")
    return json.loads(r.stdout) if r.stdout.strip() else {}


def _quiet(text):
    """Stop @names and #numbers in generated text from pinging people or linking issues."""
    return re.sub(r"([@#])(?=\w)", "\\1\u200b", text or "")


def video_url(name):
    return f"https://github.com/{config.GITHUB_REPOSITORY}/releases/download/{config.QUEUE_RELEASE_TAG}/{name}"


def open_drafts(items, date_label):
    """Create the issue for a batch of drafts and tag each item with its issue and number."""
    parts = [f"{len(items)} draft Reel(s) for the Facebook Page. Nothing is posted until you approve it.\n\n"
             "**Reply with a comment:** `approve all`, `approve 1 3`, or `reject 2`.\n"
             f"Approved Reels go out one per slot ({SLOTS}). News drafts not approved within 2 days are dropped.\n"]
    for n, it in enumerate(items, 1):
        s = it["script"]
        lines = "\n".join(f"> {seg['say']}" for seg in s["segments"])
        extra = []
        if s.get("source_name"):
            extra.append(f"Source: {s['source_name']}")
        extra.append("Photos: " + ("; ".join(s["credits"]) if s.get("credits") else "none found"))
        parts.append(f"---\n### {n}. {_quiet(s['title'])}  `{s['format']}`\n"
                     f"▶️ **[Watch the draft]({video_url(it['video'])})**\n\n{_quiet(lines)}\n\n"
                     f"**Caption:** {_quiet(s['fb_caption'])} {_quiet(' '.join(s['hashtags']))}\n\n"
                     f"<sub>{_quiet(' · '.join(extra))}</sub>\n")
    issue = _api("POST", "issues", {"title": f"Reel drafts · {date_label}", "body": "\n".join(parts)})
    for n, it in enumerate(items, 1):
        it["issue"], it["n"] = issue["number"], n
    return issue["number"]


def parse(text):
    """Return [(action, targets)] where targets is 'all' or a set of draft numbers."""
    out = []
    for line in (text or "").lower().splitlines():
        m = re.match(r"^\W*(approve|reject)\b(.*)$", line.strip())
        if not m:
            continue
        rest = m.group(2)
        if re.search(r"\ball\b", rest):
            out.append((m.group(1), "all"))
        else:
            nums = {int(x) for x in re.findall(r"\b\d{1,2}\b", rest)}
            if nums:
                out.append((m.group(1), nums))
    return out


def process(state):
    """Apply approve / reject comments from trusted users to pending drafts."""
    seen = state.setdefault("gh_seen", {})
    open_issues = sorted({it["issue"] for it in state["items"] if it.get("issue") and it["status"] == "pending"})
    for number in open_issues:
        try:
            comments = _api("GET", f"issues/{number}/comments?per_page=100")
        except Exception as e:  # noqa: BLE001
            print(f"[issue] could not read #{number}: {e}")
            continue
        last = seen.get(str(number), 0)
        for c in comments:
            if c["id"] <= last:
                continue
            seen[str(number)] = max(seen.get(str(number), 0), c["id"])
            if c.get("author_association") not in TRUSTED or c.get("user", {}).get("type") == "Bot":
                continue
            changed = 0
            for action, targets in parse(c.get("body")):
                for it in state["items"]:
                    if it.get("issue") == number and it["status"] == "pending" and \
                            (targets == "all" or it.get("n") in targets):
                        it["status"] = "approved" if action == "approve" else "rejected"
                        changed += 1
            if changed:
                try:
                    _api("POST", f"issues/comments/{c['id']}/reactions", {"content": "+1"})
                except Exception:  # noqa: BLE001
                    pass
                print(f"[issue] #{number}: {changed} draft(s) updated by {c['user']['login']}")


def comment(number, text):
    try:
        _api("POST", f"issues/{number}/comments", {"body": text})
    except Exception as e:  # noqa: BLE001
        print(f"[issue] comment failed: {e}")


def close_finished(state):
    """Close draft issues once none of their drafts is waiting or queued."""
    closed = state.setdefault("gh_closed", [])
    active = {it["issue"] for it in state["items"] if it.get("issue") and it["status"] in ("pending", "approved")}
    for number in {it["issue"] for it in state["items"] if it.get("issue")} - active - set(closed):
        try:
            _api("PATCH", f"issues/{number}", {"state": "closed"})
            closed.append(number)
        except Exception as e:  # noqa: BLE001
            print(f"[issue] close failed: {e}")
    state["gh_closed"] = closed[-60:]

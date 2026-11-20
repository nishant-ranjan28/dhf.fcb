"""Render a 1080x1920 Reel: free-licence photos (with credits), headline, animated captions, stat cards."""
import random
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from . import config
from .voice import duration
from .writer import FORMATS

W, H = 1080, 1920
BLUE, GARNET, GOLD = (0, 77, 152), (165, 0, 68), (237, 187, 0)
NAVY = (8, 16, 40)
MARGIN_X = 70
TEXT_MAX_X = W - 150  # keep clear of Facebook's right-side buttons
SAFE_BOTTOM = 1600     # Facebook draws the caption and buttons below this


def _font(name, size, weight=None):
    f = ImageFont.truetype(str(config.FONTS / name), size)
    if weight:
        try:
            f.set_variation_by_axes([weight])
        except Exception:  # noqa: BLE001
            pass
    return f


def anton(size):
    return _font("Anton-Regular.ttf", size)


def mont(size, weight=800):
    return _font("Montserrat.ttf", size, weight)


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def background(path: Path, seed=0):
    """Oversized background so ffmpeg can slowly pan across it."""
    bw, bh = 1320, 2240
    rnd = random.Random(seed)
    img = Image.new("RGB", (bw, bh))
    px = img.load()
    for y in range(bh):
        for x in range(0, bw, 4):
            t = min(1, max(0, (x * 0.35 + y) / (bw * 0.35 + bh)))
            c = _lerp(BLUE, GARNET, t)
            for dx in range(4):
                if x + dx < bw:
                    px[x + dx, y] = c
    d = ImageDraw.Draw(img, "RGBA")
    stripe = 150
    for i, x in enumerate(range(-bh, bw, stripe)):
        col = (0, 40, 110, 70) if i % 2 else (120, 0, 50, 70)
        d.polygon([(x, bh), (x + stripe // 2, bh), (x + stripe // 2 + bh // 3, 0), (x + bh // 3, 0)], fill=col)
    for _ in range(26):  # soft light blobs
        r = rnd.randint(80, 260)
        cx, cy = rnd.randint(0, bw), rnd.randint(0, bh)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, rnd.randint(6, 16)))
    img = img.filter(ImageFilter.GaussianBlur(2))
    shade = Image.new("L", (bw, bh), 0)  # vignette + darken for readability
    sd = ImageDraw.Draw(shade)
    for i in range(60):
        a = int(150 * (i / 60) ** 2)
        sd.rectangle([i * 9, i * 13, bw - i * 9, bh - i * 13], outline=255 - a, width=14)
    dark = Image.new("RGB", (bw, bh), NAVY)
    img = Image.composite(img, dark, shade.filter(ImageFilter.GaussianBlur(60)))
    img = Image.blend(img, dark, 0.28)
    img.save(path)
    return path


def _wrap(draw, words, font, max_w):
    lines, cur = [], []
    for w in words:
        test = " ".join(cur + [w])
        if cur and draw.textlength(test, font=font) > max_w:
            lines.append(cur)
            cur = [w]
        else:
            cur.append(w)
    if cur:
        lines.append(cur)
    return lines


def static_layer(path: Path, title, fmt, source_name=""):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # brand line
    d.text((MARGIN_X, 118), f"{config.PAGE_NAME.upper()}  ·  {config.PAGE_HANDLE}", font=mont(30, 700),
           fill=(255, 255, 255, 215))
    # format pill
    label = FORMATS.get(fmt, "BARÇA")
    f = mont(38, 900)
    tw = d.textlength(label, font=f)
    d.rounded_rectangle([MARGIN_X, 178, MARGIN_X + tw + 52, 246], radius=34, fill=GOLD)
    d.text((MARGIN_X + 26, 212), label, font=f, fill=NAVY, anchor="lm")
    # headline (shrink to fit 3 lines)
    words = title.upper().split()
    for size in (118, 106, 96, 86, 78):
        hf = anton(size)
        lines = _wrap(d, words, hf, TEXT_MAX_X - MARGIN_X)
        if len(lines) <= 3:
            break
    y = 280
    for ln in lines:
        txt = " ".join(ln)
        d.text((MARGIN_X + 4, y + 5), txt, font=hf, fill=(0, 0, 0, 120))
        d.text((MARGIN_X, y), txt, font=hf, fill="white")
        y += int(size * 1.12)
    d.rectangle([MARGIN_X, y + 42, MARGIN_X + 160, y + 54], fill=GOLD)
    y += 54
    if source_name:  # credit the outlet(s) the story came from
        sf = mont(28, 700)
        txt = f"SOURCE: {source_name.upper()}"
        while d.textlength(txt, font=sf) > TEXT_MAX_X - MARGIN_X and len(txt) > 12:
            txt = txt[:-2].rstrip(" ,") + "…"
        d.text((MARGIN_X, y + 22), txt, font=sf, fill=(255, 255, 255, 220))
        y += 60
    img.save(path)
    return y  # bottom of header block


def _cover(img, w, h):
    scale = max(w / img.width, h / img.height)
    img = img.resize((max(w, round(img.width * scale)), max(h, round(img.height * scale))), Image.LANCZOS)
    x, y = (img.width - w) // 2, (img.height - h) // 3  # bias the crop upward: faces sit high
    return img.crop((x, y, x + w, y + h))


def photo_backdrop(src, path: Path):
    """Blurred, darkened full-screen version of the photo (oversized so ffmpeg can pan it)."""
    img = _cover(Image.open(src).convert("RGB"), 1240, 2200).filter(ImageFilter.GaussianBlur(26))
    img = Image.blend(img, Image.new("RGB", img.size, NAVY), 0.55)
    img.save(path, quality=90)
    return path


def _photo_card(base, src, top, max_h, credit):
    """Paste the sharp photo as a rounded card with a gold frame. Returns the y below it."""
    photo = Image.open(src).convert("RGB")
    box_w = TEXT_MAX_X - MARGIN_X
    ratio = photo.width / photo.height
    ratio = min(max(ratio, 0.8), 1.9)            # crop extreme panoramas / very tall shots
    h = min(max_h, round(box_w / ratio))
    w = min(box_w, round(h * ratio))
    photo = _cover(photo, w, h)
    x = MARGIN_X + (box_w - w) // 2
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([x - 4, top + 8, x + w + 12, top + h + 20], radius=34, fill=(0, 0, 0, 150))
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=30, fill=255)
    base.paste(photo, (x, top), mask)
    d = ImageDraw.Draw(base)
    d.rounded_rectangle([x - 3, top - 3, x + w + 2, top + h + 2], radius=32, outline=GOLD, width=6)
    cf = mont(22, 600)
    txt = f"Photo: {credit}"
    while d.textlength(txt, font=cf) > box_w and len(txt) > 20:
        txt = txt[:-2] + "…"
    d.text((MARGIN_X + box_w // 2, top + h + 16), txt, font=cf, fill=(255, 255, 255, 215), anchor="mt")
    return top + h + 62


def segment_layer(path: Path, seg, header_bottom, media=None):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    top = max(header_bottom + 50, 660)
    box_w = TEXT_MAX_X - MARGIN_X
    has_stat = bool(seg.get("stat_value"))
    show_card = bool(media) and not has_stat

    # lay out the caption first so we know how much room is left for a stat or a photo
    say = seg["say"].strip()
    emph = (seg.get("emphasis") or "").strip().lower()
    words = say.split()
    emph_words = set()
    if emph:
        ew = emph.split()
        low = [w.lower().strip(".,!?:;'\"") for w in words]
        for i in range(len(words) - len(ew) + 1):
            if [x.strip(".,!?:;'\"") for x in ew] == low[i:i + len(ew)]:
                emph_words = set(range(i, i + len(ew)))
                break
    for size in ((50, 46, 42) if show_card else (66, 60, 54, 48)):
        cf = mont(size, 800)
        lines = _wrap(d, words, cf, box_w - 80)
        if len(lines) <= (4 if show_card else 5):
            break
    lh = int(size * 1.3)
    box_h = lh * len(lines) + 70

    if has_stat:
        sv = seg["stat_value"].strip()
        sf_size = 300 if len(sv) <= 4 else 220 if len(sv) <= 7 else 160
        sf = anton(sf_size)
        cx = (MARGIN_X + TEXT_MAX_X) // 2
        d.text((cx + 6, top + 8), sv, font=sf, fill=(0, 0, 0, 110), anchor="mt")
        d.text((cx, top), sv, font=sf, fill=GOLD, anchor="mt")
        top += int(sf_size * 1.08)
        if seg.get("stat_label"):
            d.text((cx, top), seg["stat_label"].upper(), font=mont(40, 800), fill="white", anchor="mt")
            top += 80
        top += 40
    elif show_card:
        room = SAFE_BOTTOM - top - box_h - 62
        if room >= 280:
            top = _photo_card(img, media["path"], top, min(room, 700), media["credit"])
            d = ImageDraw.Draw(img)
    if media and has_stat:  # photo is only the blurred backdrop here, but still needs its credit
        d.text((MARGIN_X + box_w // 2, top + box_h + 16), f"Photo: {media['credit']}"[:70], font=mont(22, 600),
               fill=(255, 255, 255, 200), anchor="mt")

    d.rounded_rectangle([MARGIN_X, top, MARGIN_X + box_w, top + box_h], radius=36, fill=(8, 16, 40, 205))
    d.rectangle([MARGIN_X, top + 28, MARGIN_X + 10, top + box_h - 28], fill=GOLD)
    y, idx = top + 35, 0
    space = d.textlength(" ", font=cf)
    for ln in lines:
        lw = d.textlength(" ".join(ln), font=cf)
        x = MARGIN_X + (box_w - lw) / 2
        for w in ln:
            d.text((x, y), w, font=cf, fill=GOLD if idx in emph_words else "white")
            x += d.textlength(w, font=cf) + space
            idx += 1
        y += lh
    img.save(path)


def render(script, voice_wav: Path, timings, out_mp4: Path, workdir: Path, seed=None, images=None):
    workdir.mkdir(parents=True, exist_ok=True)
    seed = seed if seed is not None else random.randint(0, 9999)
    n = len(script["segments"])
    images = list(images or []) + [None] * n
    bg = background(workdir / "bg.png", seed)
    header_bottom = static_layer(workdir / "static.png", script["title"], script["format"],
                                 script.get("source_name", ""))
    total = duration(voice_wav) + 0.6
    inputs, count = [], 0

    def add(*args):
        nonlocal count
        inputs.extend(args)
        count += 1
        return count - 1

    def still(p):
        return add("-loop", "1", "-framerate", "30", "-i", str(p))

    i_bg, i_static = still(bg), still(workdir / "static.png")
    seg_idx, back_idx, backs = [], [], {}
    for i, seg in enumerate(script["segments"]):
        p = workdir / f"seg{i}.png"
        segment_layer(p, seg, header_bottom, images[i])
        seg_idx.append(still(p))
    for i in range(n):
        m = images[i]
        if m and m["path"] not in backs:
            backs[m["path"]] = photo_backdrop(m["path"], workdir / f"back{len(backs)}.jpg")
        back_idx.append(still(backs[m["path"]]) if m else None)
    i_voice = add("-i", str(voice_wav))
    music = sorted(config.MUSIC.glob("*.mp3")) + sorted(config.MUSIC.glob("*.m4a"))
    i_music = add("-stream_loop", "-1", "-i", str(random.Random(seed).choice(music))) if music else None

    f = [f"[{i_bg}:v]crop={W}:{H}:x='120+110*sin(2*PI*t/23)':y='160+150*sin(2*PI*t/31)',format=rgba[b0]"]
    last, k = "b0", 0
    for i, (start, end) in enumerate(timings):  # blurred photo backdrops, cross-fading into each other
        if back_idx[i] is None:
            continue
        end = total if i == n - 1 else end + 0.4
        sx, sy = (1, -1) if i % 2 else (-1, 1)
        f.append(f"[{back_idx[i]}:v]crop={W}:{H}:x='80+{sx}*70*sin(2*PI*t/21)':y='140+{sy}*110*sin(2*PI*t/29)',"
                 f"format=rgba,fade=t=in:st=0:d=0.4:alpha=1,setpts=PTS-STARTPTS+{start:.3f}/TB[p{i}]")
        k += 1
        f.append(f"[{last}][p{i}]overlay=0:0:enable='between(t,{start:.3f},{end:.3f})':eof_action=pass[b{k}]")
        last = f"b{k}"
    f.append(f"[{last}][{i_static}:v]overlay=0:0[v0]")
    last = "v0"
    for i, (start, end) in enumerate(timings):
        end = total if i == n - 1 else end
        f.append(f"[{seg_idx[i]}:v]format=rgba,fade=t=in:st=0:d=0.18:alpha=1,"
                 f"setpts=PTS-STARTPTS+{start:.3f}/TB[s{i}]")
        f.append(f"[{last}][s{i}]overlay=x=0:y='if(lt(t-{start:.3f},0.22),40*(1-(t-{start:.3f})/0.22),0)'"
                 f":enable='between(t,{start:.3f},{end:.3f})':eof_action=pass:eval=frame[v{i + 1}]")
        last = f"v{i + 1}"
    f.append(f"color=c=0xEDBB00:s={W}x12:r=30:d={total:.3f}[bar]")
    f.append(f"[{last}][bar]overlay=x='-w+W*t/{total:.3f}':y=0:eval=frame,format=yuv420p[vout]")
    if i_music is not None:
        f.append(f"[{i_music}:a]volume={config.MUSIC_VOLUME}[m]")
        f.append(f"[{i_voice}:a]apad[vo];[vo][m]amix=inputs=2:duration=first:normalize=0,"
                 f"loudnorm=I=-14:TP=-1.5:LRA=11[aout]")
    else:
        f.append(f"[{i_voice}:a]apad,loudnorm=I=-14:TP=-1.5:LRA=11[aout]")

    cmd = ["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(f), "-map", "[vout]", "-map", "[aout]",
           "-t", f"{total:.3f}", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart",
           str(out_mp4)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{res.stderr[-3000:]}")
    return out_mp4


def render_card(script, media, out_jpg: Path):
    """1080x1350 news card: free-licence photo on top, headline, source and photo credit below."""
    cw, ch, ph = 1080, 1350, 760
    img = Image.new("RGB", (cw, ch), NAVY)
    img.paste(_cover(Image.open(media["path"]).convert("RGB"), cw, ph), (0, 0))
    fade = Image.new("L", (cw, ph), 0)  # fade the photo into the panel
    fd = ImageDraw.Draw(fade)
    for y in range(ph - 260, ph):
        fd.line([(0, y), (cw, y)], fill=int(255 * ((y - (ph - 260)) / 260) ** 1.5))
    img.paste(Image.new("RGB", (cw, ph), NAVY), (0, 0), fade)
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([0, 0, cw, 12], fill=GOLD)
    credit = f"Photo: {media['credit']}"
    cf = mont(22, 600)
    while d.textlength(credit, font=cf) > cw - 120 and len(credit) > 20:
        credit = credit[:-2] + "…"
    tw = d.textlength(credit, font=cf)
    d.rounded_rectangle([cw - tw - 52, 30, cw - 24, 74], radius=22, fill=(8, 16, 40, 170))
    d.text((cw - 38, 52), credit, font=cf, fill=(255, 255, 255, 235), anchor="rm")
    label = FORMATS.get(script.get("format"), "BARÇA NEWS")
    lf = mont(36, 900)
    lw = d.textlength(label, font=lf)
    y = ph - 70
    d.rounded_rectangle([60, y, 60 + lw + 48, y + 64], radius=32, fill=GOLD)
    d.text((84, y + 32), label, font=lf, fill=NAVY, anchor="lm")
    y += 96
    words = script["title"].upper().split()
    for size in (104, 94, 84, 76, 68):
        hf = anton(size)
        lines = _wrap(d, words, hf, cw - 120)
        if len(lines) <= 4:
            break
    for ln in lines[:4]:
        d.text((60, y), " ".join(ln), font=hf, fill="white")
        y += int(size * 1.12)
    d.rectangle([60, y + 30, 220, y + 42], fill=GOLD)
    foot = ch - 64
    if script.get("source_name"):
        d.text((60, foot), f"SOURCE: {script['source_name'].upper()}"[:60], font=mont(26, 700),
               fill=(255, 255, 255, 215), anchor="lm")
    d.text((cw - 60, foot), config.PAGE_HANDLE, font=mont(26, 800), fill=GOLD, anchor="rm")
    img.save(out_jpg, quality=92)
    return out_jpg

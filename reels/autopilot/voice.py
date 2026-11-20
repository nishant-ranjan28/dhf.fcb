"""Voiceover: AI text-to-speech per segment, or the owner's own recording."""
import asyncio
import subprocess
from pathlib import Path

from . import config

GAP = 0.22  # seconds of silence between lines
KOKORO_FILES = {
    "kokoro-v1.0.int8.onnx": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx",
    "voices-v1.0.bin": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
}
_kokoro = None


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def _get_kokoro():
    global _kokoro
    if _kokoro is None:
        import urllib.request
        from kokoro_onnx import Kokoro
        config.MODELS.mkdir(parents=True, exist_ok=True)
        for name, url in KOKORO_FILES.items():
            p = config.MODELS / name
            if not p.exists():
                print(f"[voice] downloading {name}")
                urllib.request.urlretrieve(url, p)
        _kokoro = Kokoro(str(config.MODELS / "kokoro-v1.0.int8.onnx"), str(config.MODELS / "voices-v1.0.bin"))
    return _kokoro


def _tts_line(text, out_wav):
    if config.TTS_ENGINE == "edge":
        import edge_tts
        mp3 = out_wav.with_suffix(".mp3")
        rate = f"{round((config.TTS_SPEED - 1) * 100):+d}%"
        asyncio.run(edge_tts.Communicate(text, config.EDGE_VOICE, rate=rate).save(str(mp3)))
        run(["ffmpeg", "-y", "-i", str(mp3), "-ar", "24000", "-ac", "1", str(out_wav)])
    else:
        import soundfile as sf
        k = _get_kokoro()
        lang = "en-gb" if config.KOKORO_VOICE.startswith("b") else "en-us"
        samples, sr = k.create(text, voice=config.KOKORO_VOICE, speed=config.TTS_SPEED, lang=lang)
        sf.write(str(out_wav), samples, sr)


def tts(segments, workdir: Path):
    """Synthesize each line, join with gaps. Returns (wav_path, [(start, end), ...])."""
    workdir.mkdir(parents=True, exist_ok=True)
    parts, timings, t = [], [], 0.0
    silence = workdir / "gap.wav"
    run(["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", str(GAP), str(silence)])
    for i, seg in enumerate(segments):
        wav = workdir / f"line{i}.wav"
        _tts_line(seg["say"], wav)
        d = duration(wav)
        timings.append((t, t + d + GAP))
        parts += [wav, silence]
        t += d + GAP
    listfile = workdir / "lines.txt"
    listfile.write_text("".join(f"file '{p.resolve()}'\n" for p in parts))
    out = workdir / "voice.wav"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listfile), "-c", "copy", str(out)])
    return out, timings


def own_recording(src: Path, segments, workdir: Path):
    """Clean up a voice note and spread captions over it by line length."""
    workdir.mkdir(parents=True, exist_ok=True)
    out = workdir / "voice.wav"
    trim = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,"
            "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.2,areverse,"
            "highpass=f=80,afftdn=nf=-25,acompressor=threshold=-18dB:ratio=3")
    run(["ffmpeg", "-y", "-i", str(src), "-af", trim, "-ar", "48000", "-ac", "1", str(out)])
    total = duration(out)
    weights = [len(s["say"]) + 12 for s in segments]
    scale = total / sum(weights)
    timings, t = [], 0.0
    for w in weights:
        timings.append((t, t + w * scale))
        t += w * scale
    return out, timings

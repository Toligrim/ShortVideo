#!/usr/bin/env python3
"""Озвучка сценария посценно + тайминги слов для караоке.

Провайдеры:
  edge   — Edge TTS (ru-RU-DmitryNeural): тайминги из WordBoundary-событий.
  gemini — Gemini TTS (gemini-3.1-flash-tts-preview, голос Fenrir): живой стиль
           промптом; таймингов не отдаёт → forced alignment через faster-whisper.

Narration — устная форма с разметкой {SHOW|скажи}: на экране SHOW, голос
произносит «скажи». Оба провайдера произносят «скажи»-форму (транслитерацию),
поэтому выравнивание надёжно для любых терминов.

Выход в --out: audio/scene-<i>.mp3, meta.json [{index, duration, words[]}].

Запуск: venv/bin/python tools/tts_scenes.py episodes/<slug>.json \
        --out video/public/episodes/<slug> [--provider gemini|edge]
"""
import argparse
import asyncio
import base64
import difflib
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

EDGE_VOICE = "ru-RU-DmitryNeural"
EDGE_RATE = "+8%"
GEMINI_MODEL = "gemini-3.1-flash-tts-preview"
GEMINI_VOICE = "Fenrir"
STYLE_PROMPT = (
    "Прочитай энергично и живо, по-русски, как харизматичный ведущий коротких "
    "видео про технологии — с драйвом, но чётко и без спешки:\n\n"
)

TOKEN_RE = re.compile(r"\{([^|{}]+)\|([^{}]+)\}|(\S+)")
ALNUM_RE = re.compile(r"[\w\d]", re.UNICODE)


def parse_markup(narration: str):
    """→ (spoken_text, tokens=[{show, n}]). Пунктуационные токены клеятся к предыдущему."""
    tokens, spoken_parts = [], []
    for m in TOKEN_RE.finditer(narration):
        if m.group(1) is not None:
            show, say = m.group(1).strip(), m.group(2).strip()
        else:
            show = say = m.group(3)
        n = sum(1 for w in say.split() if ALNUM_RE.search(w))
        spoken_parts.append(say)
        if n == 0 and tokens:
            sep = "" if show[:1] in ",.;:!?»)…" else " "
            tokens[-1]["show"] += sep + show
        else:
            tokens.append({"show": show, "n": n})
    return " ".join(spoken_parts), tokens


def mp3_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def norm(w: str) -> str:
    return re.sub(r"[^\p{L}\p{N}]" if False else r"[^\w\d]", "", w.lower().replace("ё", "е"))


# ---------- Edge TTS ----------

async def synth_edge(spoken: str, mp3_path: Path):
    import edge_tts
    comm = edge_tts.Communicate(spoken, EDGE_VOICE, rate=EDGE_RATE, boundary="WordBoundary")
    events = []
    with open(mp3_path, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / 1e7
                events.append({"text": chunk["text"], "start": round(start, 3),
                               "end": round(start + chunk["duration"] / 1e7, 3)})
    return events


# ---------- Gemini TTS ----------

def gemini_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        for line in (ROOT / ".env").read_text().splitlines():
            if line.startswith("GEMINI_API_KEY="):
                key = line.split("=", 1)[1].strip()
    if not key:
        sys.exit("нет GEMINI_API_KEY (ни в env, ни в .env)")
    return key


def synth_gemini(spoken: str, mp3_path: Path, key: str):
    body = json.dumps({
        "contents": [{"parts": [{"text": STYLE_PROMPT + spoken}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": GEMINI_VOICE}}},
        },
    }).encode()
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{GEMINI_MODEL}:generateContent")
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": "application/json", "x-goog-api-key": key})
    last_err = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.load(resp)
            pcm = base64.b64decode(
                data["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
            p = subprocess.run(
                ["ffmpeg", "-v", "quiet", "-y", "-f", "s16le", "-ar", "24000", "-ac", "1",
                 "-i", "pipe:0", "-b:a", "128k", str(mp3_path)], input=pcm)
            if p.returncode != 0:
                raise RuntimeError("ffmpeg encode failed")
            return
        except Exception as e:  # 429/5xx/сеть — бэкофф
            last_err = e
            time.sleep(5 * (attempt + 1))
    sys.exit(f"gemini synth failed: {last_err}")


# ---------- Forced alignment (faster-whisper) ----------

_model = None


def whisper_words(mp3_path: Path):
    global _model
    from faster_whisper import WhisperModel
    if _model is None:
        _model = WhisperModel("small", device="cpu", compute_type="int8")
    segments, _info = _model.transcribe(
        str(mp3_path), language="ru", word_timestamps=True, beam_size=3)
    words = []
    for seg in segments:
        for w in seg.words or []:
            words.append({"text": w.word.strip(), "start": round(w.start, 3),
                          "end": round(w.end, 3)})
    return words


def align(expected: list, heard: list, duration: float):
    """Сопоставить ожидаемые say-слова с услышанными whisper-словами.
    difflib по нормализованным словам; дыры — линейная интерполяция."""
    exp_n = [norm(w) for w in expected]
    heard_n = [norm(w["text"]) for w in heard]
    sm = difflib.SequenceMatcher(a=exp_n, b=heard_n, autojunk=False)
    starts: list = [None] * len(expected)
    ends: list = [None] * len(expected)
    for block in sm.get_matching_blocks():
        for k in range(block.size):
            starts[block.a + k] = heard[block.b + k]["start"]
            ends[block.a + k] = heard[block.b + k]["end"]
    # интерполяция дыр между известными точками
    n = len(expected)
    for i in range(n):
        if starts[i] is None:
            prev_i = next((j for j in range(i - 1, -1, -1) if ends[j] is not None), None)
            next_i = next((j for j in range(i + 1, n) if starts[j] is not None), None)
            lo = ends[prev_i] if prev_i is not None else 0.0
            hi = starts[next_i] if next_i is not None else duration
            span_slots = (next_i if next_i is not None else n) - (prev_i + 1 if prev_i is not None else 0)
            slot = i - (prev_i + 1 if prev_i is not None else 0)
            step = (hi - lo) / max(span_slots, 1)
            starts[i] = round(lo + step * slot, 3)
            ends[i] = round(lo + step * (slot + 1), 3)
    return [{"start": s, "end": e} for s, e in zip(starts, ends)]


def tokens_to_words(tokens, say_timings):
    """Группировка таймингов say-слов в display-токены (n штук на токен)."""
    words, idx = [], 0
    for t in tokens:
        take = say_timings[idx:idx + t["n"]]
        idx += t["n"]
        if take:
            words.append({"text": t["show"], "start": take[0]["start"], "end": take[-1]["end"]})
        else:
            prev = words[-1]["end"] if words else 0.0
            words.append({"text": t["show"], "start": prev, "end": round(prev + 0.3, 3)})
    return words


# ---------- main ----------

async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("--out", required=True)
    ap.add_argument("--lang", default="ru")
    ap.add_argument("--provider", default="gemini", choices=["gemini", "edge"])
    args = ap.parse_args()

    episode = json.loads(Path(args.episode).read_text())
    out = Path(args.out)
    (out / "audio").mkdir(parents=True, exist_ok=True)
    key = gemini_key() if args.provider == "gemini" else None

    meta = []
    for i, scene in enumerate(episode["scenes"]):
        narration = scene["narration"]
        if isinstance(narration, dict):
            narration = narration[args.lang]
        spoken, tokens = parse_markup(narration)
        say_words = [w for w in spoken.split() if ALNUM_RE.search(w)]
        mp3 = out / "audio" / f"scene-{i}.mp3"

        if args.provider == "edge":
            for attempt in range(3):
                events = await synth_edge(spoken, mp3)
                if mp3.stat().st_size > 1000 and events:
                    break
                print(f"scene {i}: пустой синтез, ретрай", file=sys.stderr)
            else:
                sys.exit(f"scene {i}: edge synth failed")
            timings = [{"start": e["start"], "end": e["end"]} for e in events]
        else:
            synth_gemini(spoken, mp3, key)
            time.sleep(2)  # не долбить preview-квоту
            heard = whisper_words(mp3)
            timings = align(say_words, heard, mp3_duration(mp3))
            matched = sum(1 for i2, w in enumerate(heard) if i2 < len(say_words))
            print(f"scene {i}: whisper услышал {len(heard)} слов, ожидалось {len(say_words)}",
                  file=sys.stderr)

        meta.append({"index": i, "duration": round(mp3_duration(mp3), 3),
                     "words": tokens_to_words(tokens, timings)})
        print(f"scene {i}: {meta[-1]['duration']}s, {len(meta[-1]['words'])} слов")

    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    total = sum(m["duration"] for m in meta)
    print(f"OK: {len(meta)} сцен, {total:.1f}s аудио ({args.provider}) → {out}/meta.json")


if __name__ == "__main__":
    asyncio.run(main())

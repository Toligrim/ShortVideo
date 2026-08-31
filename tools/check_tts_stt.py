#!/usr/bin/env python3
"""Проверка озвучки через обратный STT (Groq Whisper large-v3-turbo).

Идея: TTS даёт голос, но не гарантирует, что он произнёс именно то, что
написано в script.json (проглотил слово, перепутал термин и т.п.). Этот
скрипт прогоняет каждый audio/scene-N.mp3 обратно через Whisper и сверяет
транскрипт с ожидаемым текстом (narration с раскрытым {ON|SAY} → SAY).

Ключ GROQ_API_KEY берётся из окружения, иначе из ~/projects/SST/.env —
там уже есть рабочий ключ для проекта STT (общий Groq-аккаунт).

Запуск:
  python3 tools/check_tts_stt.py                       # последний эпизод
  python3 tools/check_tts_stt.py <slug>                 # конкретный эпизод
  python3 tools/check_tts_stt.py <slug> --scene 2        # одна сцена
"""
import argparse
import difflib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EPISODES_DIR = ROOT / "video" / "public" / "episodes"
SST_ENV = Path.home() / "projects" / "SST" / ".env"

GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_MODEL = "whisper-large-v3-turbo"

TOKEN_RE = re.compile(r"\{([^|{}]+)\|([^{}]+)\}|(\S+)")


def groq_key() -> str:
    key = os.environ.get("GROQ_API_KEY", "").strip()
    if key:
        return key
    if SST_ENV.exists():
        for line in SST_ENV.read_text().splitlines():
            if line.startswith("GROQ_API_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit("GROQ_API_KEY не найден ни в окружении, ни в ~/projects/SST/.env")


def spoken_text(narration: str) -> str:
    """Раскрывает {ON|SAY} → SAY (то, что реально произносит голос)."""
    parts = []
    for m in TOKEN_RE.finditer(narration):
        if m.group(1) is not None:
            parts.append(m.group(2).strip())
        else:
            parts.append(m.group(3))
    return " ".join(parts)


def norm_words(text: str) -> list:
    text = text.lower().replace("ё", "е")
    text = re.sub(r"[^\w\s]", "", text, flags=re.UNICODE)
    return [w for w in text.split() if w]


def latest_episode() -> str:
    dirs = [d for d in EPISODES_DIR.iterdir() if d.is_dir() and (d / "script.json").exists()]
    if not dirs:
        sys.exit(f"нет эпизодов с script.json в {EPISODES_DIR}")
    return max(dirs, key=lambda d: (d / "script.json").stat().st_mtime).name


def transcribe(key: str, mp3_path: Path) -> str:
    cmd = [
        "curl", "-s", GROQ_URL,
        "-H", f"Authorization: Bearer {key}",
        "-F", f"model={GROQ_MODEL}",
        "-F", "language=ru",
        "-F", "temperature=0",
        "-F", "response_format=json",
        "-F", f"file=@{mp3_path}",
    ]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True)
    try:
        data = json.loads(out.stdout)
    except json.JSONDecodeError:
        sys.exit(f"Groq вернул не-JSON для {mp3_path.name}: {out.stdout[:500]}")
    if "text" not in data:
        sys.exit(f"Groq error для {mp3_path.name}: {data}")
    return data["text"].strip()


def diff_words(expected: list, got: list) -> tuple:
    sm = difflib.SequenceMatcher(a=expected, b=got, autojunk=False)
    ratio = sm.ratio()
    parts = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            parts.append(" ".join(expected[i1:i2]))
        elif tag == "replace":
            parts.append(f"[{' '.join(expected[i1:i2])} → {' '.join(got[j1:j2])}]")
        elif tag == "delete":
            parts.append(f"[-{' '.join(expected[i1:i2])}-]")
        elif tag == "insert":
            parts.append(f"[+{' '.join(got[j1:j2])}+]")
    return ratio, " ".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug", nargs="?", default=None)
    ap.add_argument("--scene", type=int, default=None, help="проверить только одну сцену (индекс с 0)")
    args = ap.parse_args()

    slug = args.slug or latest_episode()
    ep_dir = EPISODES_DIR / slug
    script_path = ep_dir / "script.json"
    if not script_path.exists():
        sys.exit(f"не найден {script_path}")

    script = json.loads(script_path.read_text())
    key = groq_key()

    print(f"эпизод: {slug}  ({script.get('title', '')})\n")

    scenes = script["scenes"]
    indices = [args.scene] if args.scene is not None else range(len(scenes))

    total_ratio = []
    for i in indices:
        scene = scenes[i]
        narration = scene["narration"]
        if isinstance(narration, dict):
            narration = narration.get("ru") or next(iter(narration.values()))
        expected = spoken_text(narration)

        mp3_path = ep_dir / "audio" / f"scene-{i}.mp3"
        if not mp3_path.exists():
            print(f"[{i}] нет файла {mp3_path}")
            continue

        got = transcribe(key, mp3_path)
        exp_w, got_w = norm_words(expected), norm_words(got)
        ratio, marked = diff_words(exp_w, got_w)
        total_ratio.append(ratio)

        flag = "✅" if ratio >= 0.95 else ("⚠️" if ratio >= 0.85 else "❌")
        print(f"[{i}] {flag} совпадение слов: {ratio:.0%}  ({scene.get('type')})")
        if ratio < 1.0:
            print(f"    ожидалось:      {expected}")
            print(f"    расшифровано:   {got}")
            print(f"    diff:           {marked}")
        print()

    if total_ratio:
        avg = sum(total_ratio) / len(total_ratio)
        worst = min(total_ratio)
        verdict = "✅ ок" if worst >= 0.9 else ("⚠️ проверить вручную" if worst >= 0.75 else "❌ похоже на брак озвучки")
        print(f"итог: среднее {avg:.0%}, минимум по сцене {worst:.0%} — {verdict}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Валидация эпизода по schema/scenes.schema.json + смысловые проверки.

Запуск: python3 tools/validate.py episodes/<slug>.json
Выход 0 — можно озвучивать; иначе — список ошибок в stderr.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def fail(errors):
    for e in errors:
        print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: validate.py episodes/<slug>.json")
    path = Path(sys.argv[1])
    episode = json.loads(path.read_text())
    errors = []

    try:
        import jsonschema
        schema = json.loads((ROOT / "schema" / "scenes.schema.json").read_text())
        v = jsonschema.Draft202012Validator(schema)
        for err in sorted(v.iter_errors(episode), key=lambda e: list(e.path)):
            loc = "/".join(str(p) for p in err.path) or "<root>"
            errors.append(f"[schema] {loc}: {err.message[:200]}")
    except ImportError:
        print("warn: jsonschema не установлен, только смысловые проверки", file=sys.stderr)

    scenes = episode.get("scenes", [])
    if scenes and scenes[0].get("type") not in ("hook", "story"):
        errors.append("первая сцена должна быть hook или story")

    if scenes and scenes[-1].get("type") != "outro":
        errors.append("последняя сцена должна быть outro")

    total_words = 0
    for i, s in enumerate(scenes):
        narr = s.get("narration", "")
        if isinstance(narr, dict):
            narr = narr.get("ru", "")
        total_words += len(narr.split())
        # onWord должен существовать в реплике (в форме SHOW)
        shows = " ".join(
            m.group(1) if m.group(1) else m.group(3)
            for m in re.finditer(r"\{([^|{}]+)\|([^{}]+)\}|(\S+)", narr)
        ).lower()
        anchors = [p.get("onWord") for p in s.get("packets", []) if p.get("onWord")]
        anchors += [b.get("onWord") for b in s.get("beats", []) if b.get("onWord")]
        if s.get("state", {}).get("onWord"):
            anchors.append(s["state"]["onWord"])
        for a in anchors:
            token = re.sub(r"[^\w\d-]", "", a.lower())
            if token and token not in re.sub(r"[^\w\d\s-]", "", shows):
                errors.append(f"сцена {i}: onWord «{a}» не найдено в реплике")
        # непрописанная латиница вне разметки {|}
        bare = re.sub(r"\{[^{}]+\}", "", narr)
        latin = re.findall(r"[A-Za-z]{2,}", bare)
        if latin:
            errors.append(f"сцена {i}: латиница без разметки {{SHOW|скажи}}: {latin}")

    if not 100 <= total_words <= 170:
        errors.append(f"объём реплик: {total_words} слов (норма 120–150, жёсткие рамки 100–170)")

    if errors:
        fail(errors)
    print(f"OK: {len(scenes)} сцен, ~{total_words} слов")


if __name__ == "__main__":
    main()

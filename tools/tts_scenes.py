#!/usr/bin/env python3
"""Озвучка сценария посценно + тайминги слов для караоке.

Единственный провайдер — Gemini TTS (gemini-3.1-flash-tts-preview, голос
Fenrir): живой стиль промптом; таймингов не отдаёт → forced alignment через
faster-whisper. Нет фолбэка на ДРУГОЙ TTS (пробовали Yandex SpeechKit
2026-09-05 — голос заметно унылее промпт-управляемого Gemini, отказались):
если Gemini недоступен (квота, сеть), скрипт останавливается с ошибкой —
озвучка либо идёт через Gemini, либо не идёт совсем. Единственный способ
раздвинуть бесплатный потолок — несколько ключей GEMINI_API_KEY(_N) с разных
Google-аккаунтов (у каждого своя независимая квота), см. gemini_keys().

Narration — устная форма с разметкой {SHOW|скажи}: на экране SHOW, голос
произносит «скажи» (транслитерацию) — так forced alignment надёжен для любых
терминов.

Выход в --out: audio/scene-<i>.mp3, meta.json [{index, duration, words[]}].

Запуск: venv/bin/python tools/tts_scenes.py episodes/<slug>.json \
        --out video/public/episodes/<slug>
"""
import argparse
import asyncio
import base64
import datetime
import difflib
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - stdlib since 3.9, always present here
    ZoneInfo = None

ROOT = Path(__file__).resolve().parent.parent

# Порядок = приоритет; при 429 переходим к следующей (квоты у моделей раздельные).
# GEMINI_TTS_MODEL в env ставит выбранную модель первой — для консистентности тембра.
GEMINI_MODELS = [
    "gemini-3.1-flash-tts-preview",
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-pro-preview-tts",
]
if os.environ.get("GEMINI_TTS_MODEL"):
    m = os.environ["GEMINI_TTS_MODEL"]
    GEMINI_MODELS = [m] + [x for x in GEMINI_MODELS if x != m]
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


# ---------- Gemini TTS ----------

def gemini_keys() -> list:
    """All configured Gemini API keys, in priority order: GEMINI_API_KEY,
    then GEMINI_API_KEY_2, GEMINI_API_KEY_3, ... (env first, falling back to
    .env), stopping at the first gap. Each key is a separate Google
    account/project with its own independent free-tier quota pool (see
    QUOTA_RESET_TZ) - a second key roughly doubles the (key, model)
    combinations synth_gemini can try before every door is shut for the
    day, without touching the paid tier. Returns [] rather than exiting -
    callers that require at least one key (main()) use require_gemini_keys();
    callers that just want to know what's available (cmd_check_quota) don't
    need to hard-fail on a config gap that isn't their job to report."""
    env_lines = None
    keys = []
    i = 0
    while True:
        name = "GEMINI_API_KEY" if i == 0 else f"GEMINI_API_KEY_{i + 1}"
        val = os.environ.get(name, "")
        if not val:
            if env_lines is None:
                env_path = ROOT / ".env"
                env_lines = env_path.read_text().splitlines() if env_path.exists() else []
            for line in env_lines:
                if line.startswith(f"{name}="):
                    val = line.split("=", 1)[1].strip()
                    break
        if not val:
            break
        keys.append(val)
        i += 1
    return keys


def require_gemini_keys() -> list:
    keys = gemini_keys()
    if not keys:
        sys.exit("нет GEMINI_API_KEY (ни в env, ни в .env)")
    return keys


def _key_fingerprint(key: str) -> str:
    """Never write raw key material to the quota state file - identify a
    key in the exhausted_combos bookkeeping by a short hash instead."""
    return hashlib.sha256(key.encode()).hexdigest()[:10]


# Google's documented reset boundary for Gemini API free-tier daily quotas
# is midnight Pacific Time, not a rolling 24h-from-first-use window -
# confirmed empirically 2026-09-05 (a run at ~00:50 PT got partial quota
# back that had been fully exhausted since the previous afternoon).
QUOTA_RESET_TZ = "America/Los_Angeles"


def _quota_state_path() -> Path:
    override = os.environ.get("SV_TTS_QUOTA_STATE")
    if override:
        return Path(override)
    return Path.home() / ".local" / "share" / "shortvideo" / "tts-quota.json"


def _today_key() -> str:
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    if ZoneInfo is not None:
        try:
            return now_utc.astimezone(ZoneInfo(QUOTA_RESET_TZ)).strftime("%Y-%m-%d")
        except Exception:
            pass
    # Defensive fallback if tzdata is somehow unavailable: a fixed UTC-8
    # offset is off by an hour during PDT, but still resets once a day.
    return (now_utc - datetime.timedelta(hours=8)).strftime("%Y-%m-%d")


def _load_quota_state() -> dict:
    """An entry in exhausted_combos ("<key fingerprint>:<model>") means:
    that key already got a 429 from that model today (QUOTA_RESET_TZ-local).
    We deliberately never try to guess or count toward the actual per-day
    request limit (10 at last check per key per model, but Google owns that
    number and could change it) - only "has this combo already told us no
    today", which self-clears on the next local day."""
    path = _quota_state_path()
    today = _today_key()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, ValueError):
        raw = None
    if not isinstance(raw, dict) or raw.get("day") != today:
        return {"day": today, "exhausted_combos": []}
    exhausted = raw.get("exhausted_combos")
    if not isinstance(exhausted, list) or not all(isinstance(m, str) for m in exhausted):
        exhausted = []
    return {"day": today, "exhausted_combos": exhausted}


def _save_quota_state(state: dict) -> None:
    path = _quota_state_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass  # best-effort bookkeeping - must never break a real synth call


def mark_combo_exhausted(key: str, model: str) -> None:
    combo = f"{_key_fingerprint(key)}:{model}"
    state = _load_quota_state()
    if combo not in state["exhausted_combos"]:
        state["exhausted_combos"].append(combo)
    _save_quota_state(state)


def combo_is_known_exhausted(key: str, model: str) -> bool:
    return f"{_key_fingerprint(key)}:{model}" in _load_quota_state()["exhausted_combos"]


def has_quota_for_any_model(keys=None) -> bool:
    """Any (key, model) combination not yet known-exhausted today, across
    every configured key? keys=None reads gemini_keys() itself; callers that
    already have the list (synth_gemini) pass it through to avoid a
    redundant .env re-read."""
    if keys is None:
        keys = gemini_keys()
    exhausted = set(_load_quota_state()["exhausted_combos"])
    return any(f"{_key_fingerprint(k)}:{m}" not in exhausted for k in keys for m in GEMINI_MODELS)


def synth_gemini(spoken: str, mp3_path: Path, keys):
    body = json.dumps({
        "contents": [{"parts": [{"text": STYLE_PROMPT + spoken}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": GEMINI_VOICE}}},
        },
    }).encode()
    last_err = None
    attempted_any = False
    for key in keys:
        tag = f"…{key[-4:]}"
        for model in GEMINI_MODELS:
            if combo_is_known_exhausted(key, model):
                print(f"  {model} (ключ {tag}): уже помечена исчерпанной сегодня, "
                      f"пропускаю без запроса", file=sys.stderr)
                continue
            attempted_any = True
            url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
                   f"{model}:generateContent")
            req = urllib.request.Request(url, data=body, headers={
                "Content-Type": "application/json", "x-goog-api-key": key})
            for attempt in range(3):
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
                    if key != keys[0] or model != GEMINI_MODELS[0]:
                        print(f"  (ключ {tag}, модель: {model})", file=sys.stderr)
                    return
                except urllib.error.HTTPError as e:
                    last_err = e
                    if e.code == 429:
                        print(f"  {model} (ключ {tag}): 429, пробую следующую комбинацию",
                              file=sys.stderr)
                        mark_combo_exhausted(key, model)
                        break  # квота этой пары кончилась — к следующей
                    time.sleep(5 * (attempt + 1))
                except Exception as e:  # 5xx/сеть — бэкофф
                    last_err = e
                    time.sleep(5 * (attempt + 1))
    if not attempted_any:
        sys.exit(
            "gemini synth failed: every (key, model) combination already known "
            f"exhausted today ({_quota_state_path()}) — no request was even sent"
        )
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

def parse_scenes_arg(raw: str, n: int) -> set:
    idx = {int(x) for x in raw.split(",") if x.strip() != ""}
    bad = [i for i in idx if not (0 <= i < n)]
    if bad:
        sys.exit(f"--scenes: индекс(ы) вне диапазона 0..{n - 1}: {bad}")
    return idx


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("--out", required=True)
    ap.add_argument("--lang", default="ru")
    ap.add_argument("--scenes", default=None,
                     help="точечная пере-озвучка: индексы через запятую (0-based), напр. 2,5. "
                          "Остальные сцены берутся из существующего meta.json — если у сцены "
                          "поменялся только show-текст (say-слова те же), подпись обновляется "
                          "in place на старых таймингах без пере-синтеза; иначе сцена остаётся "
                          "как была и печатается предупреждение.")
    args = ap.parse_args()

    episode = json.loads(Path(args.episode).read_text())
    out = Path(args.out)
    (out / "audio").mkdir(parents=True, exist_ok=True)

    n_scenes = len(episode["scenes"])
    target = parse_scenes_arg(args.scenes, n_scenes) if args.scenes else set(range(n_scenes))

    old_meta = {}
    if args.scenes:
        meta_path = out / "meta.json"
        if not meta_path.exists():
            sys.exit(f"--scenes задан, но нет {meta_path} для слияния")
        old_meta = {m["index"]: m for m in json.loads(meta_path.read_text())}

    keys = require_gemini_keys() if target else None

    meta = []
    for i, scene in enumerate(episode["scenes"]):
        narration = scene["narration"]
        if isinstance(narration, dict):
            narration = narration[args.lang]
        spoken, tokens = parse_markup(narration)
        say_words = [w for w in spoken.split() if ALNUM_RE.search(w)]
        mp3 = out / "audio" / f"scene-{i}.mp3"

        if i in target:
            synth_gemini(spoken, mp3, keys)
            time.sleep(2)  # не долбить preview-квоту
            heard = whisper_words(mp3)
            timings = align(say_words, heard, mp3_duration(mp3))
            print(f"scene {i}: whisper услышал {len(heard)} слов, ожидалось {len(say_words)}",
                  file=sys.stderr)
            meta.append({"index": i, "duration": round(mp3_duration(mp3), 3),
                         "words": tokens_to_words(tokens, timings)})
            print(f"scene {i}: пере-озвучена, {meta[-1]['duration']}s, {len(meta[-1]['words'])} слов")
        else:
            prev = old_meta.get(i)
            if prev is None:
                sys.exit(f"scene {i}: нет в старом meta.json и не в --scenes — нечем заполнить")
            if len(prev["words"]) == len(tokens):
                # say-текст не менялся (то же число токенов) — переносим тайминги,
                # обновляем только show-текст (ловит правки вида SHOW→термин без пере-синтеза).
                words = [{"text": t["show"], "start": w["start"], "end": w["end"]}
                         for t, w in zip(tokens, prev["words"])]
                changed = [n for n, o in zip(words, prev["words"]) if n["text"] != o["text"]]
                meta.append({"index": i, "duration": prev["duration"], "words": words})
                if changed:
                    print(f"scene {i}: не пере-озвучена, обновлена подпись "
                          f"({len(changed)} слов) на старых таймингах")
                else:
                    print(f"scene {i}: без изменений (взята из старого meta.json)")
            else:
                print(f"scene {i}: ВНИМАНИЕ — число say-токенов изменилось "
                      f"({len(prev['words'])} → {len(tokens)}), но сцена не в --scenes — "
                      f"оставляю как была, тайминги могут не совпадать с новым текстом",
                      file=sys.stderr)
                meta.append(prev)

    meta.sort(key=lambda m: m["index"])
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    total = sum(m["duration"] for m in meta)
    print(f"OK: {len(meta)} сцен, {total:.1f}s аудио (gemini) → {out}/meta.json")


def cmd_check_quota() -> int:
    """Cheap local pre-flight: does at least one (key, model) combination
    still have quota today, per our own bookkeeping (see
    has_quota_for_any_model)? No network call - Google exposes no free
    API-key-authenticated endpoint to ask this directly (only a
    browser-auth'd dashboard, see https://ai.dev/rate-limit), so this can
    only ever be a local memory of "which combos already said no today",
    not a live guarantee. Exit 0 if some combo might still work, 1 if every
    configured key's every model already said no today (or no key is
    configured at all). Used by run_episode.sh to fail fast before spending
    real delegate time on a run that would only fail at TTS anyway.
    """
    keys = gemini_keys()
    if not keys:
        print(json.dumps({"day": _today_key(), "keys_configured": 0,
                           "exhausted_combos": [], "available_combos": 0}, ensure_ascii=False))
        return 1
    state = _load_quota_state()
    exhausted = set(state["exhausted_combos"])
    available_count = sum(
        1 for k in keys for m in GEMINI_MODELS if f"{_key_fingerprint(k)}:{m}" not in exhausted
    )
    print(json.dumps({
        "day": state["day"],
        "keys_configured": len(keys),
        "exhausted_combos": state["exhausted_combos"],
        "available_combos": available_count,
    }, ensure_ascii=False))
    return 0 if available_count else 1


if __name__ == "__main__":
    if "--check-quota" in sys.argv[1:]:
        sys.exit(cmd_check_quota())
    asyncio.run(main())

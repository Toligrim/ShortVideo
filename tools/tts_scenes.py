#!/usr/bin/env python3
"""Озвучка сценария посценно + тайминги слов для караоке.

Основной провайдер — Gemini TTS (gemini-3.1-flash-tts-preview, голос
Fenrir): живой стиль промптом; таймингов не отдаёт → forced alignment через
faster-whisper. Второй провайдер — Yandex SpeechKit (голос ermil): включается
автоматически, только когда у Gemini исчерпана дневная бесплатная квота на
всех моделях (has_quota_for_any_model()) — не «на глаз получше», а строго как
запасной вариант, чтобы не простаивать день из-за чужого лимита. Какой
провайдер реально озвучил сцену — видно и в логе (не тихая деградация), и в
meta.json (поле provider у каждой сцены). Если Yandex тоже недоступен
(нет ключа, сетевая ошибка) — как и раньше, скрипт останавливается с ошибкой.

Narration — устная форма с разметкой {SHOW|скажи}: на экране SHOW, голос
произносит «скажи» (транслитерацию) — так forced alignment надёжен для любых
терминов.

Выход в --out: audio/scene-<i>.mp3, meta.json [{index, duration, words[], provider}].

Запуск: venv/bin/python tools/tts_scenes.py episodes/<slug>.json \
        --out video/public/episodes/<slug>
"""
import argparse
import asyncio
import base64
import datetime
import difflib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
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

def gemini_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        for line in (ROOT / ".env").read_text().splitlines():
            if line.startswith("GEMINI_API_KEY="):
                key = line.split("=", 1)[1].strip()
    if not key:
        sys.exit("нет GEMINI_API_KEY (ни в env, ни в .env)")
    return key


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
    """A model in exhausted_models means: Gemini already answered 429 for it
    today (QUOTA_RESET_TZ-local). We deliberately never try to guess or
    count toward the actual per-day request limit (10 at last check, but
    Google owns that number and could change it) - only "has this model
    already told us no today", which self-clears on the next local day."""
    path = _quota_state_path()
    today = _today_key()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, ValueError):
        raw = None
    if not isinstance(raw, dict) or raw.get("day") != today:
        return {"day": today, "exhausted_models": []}
    exhausted = raw.get("exhausted_models")
    if not isinstance(exhausted, list) or not all(isinstance(m, str) for m in exhausted):
        exhausted = []
    return {"day": today, "exhausted_models": exhausted}


def _save_quota_state(state: dict) -> None:
    path = _quota_state_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass  # best-effort bookkeeping - must never break a real synth call


def mark_model_exhausted(model: str) -> None:
    state = _load_quota_state()
    if model not in state["exhausted_models"]:
        state["exhausted_models"].append(model)
    _save_quota_state(state)


def model_is_known_exhausted(model: str) -> bool:
    return model in _load_quota_state()["exhausted_models"]


def has_quota_for_any_model() -> bool:
    exhausted = set(_load_quota_state()["exhausted_models"])
    return any(m not in exhausted for m in GEMINI_MODELS)


def synth_gemini(spoken: str, mp3_path: Path, key: str):
    body = json.dumps({
        "contents": [{"parts": [{"text": STYLE_PROMPT + spoken}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": GEMINI_VOICE}}},
        },
    }).encode()
    last_err = None
    attempted_any = False
    for model in GEMINI_MODELS:
        if model_is_known_exhausted(model):
            print(f"  {model}: уже помечена исчерпанной сегодня, пропускаю без запроса",
                  file=sys.stderr)
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
                if model != GEMINI_MODELS[0]:
                    print(f"  (модель: {model})", file=sys.stderr)
                return
            except urllib.error.HTTPError as e:
                last_err = e
                if e.code == 429:
                    print(f"  {model}: 429, пробую следующую модель", file=sys.stderr)
                    mark_model_exhausted(model)
                    break  # квота этой модели кончилась — к следующей
                time.sleep(5 * (attempt + 1))
            except Exception as e:  # 5xx/сеть — бэкофф
                last_err = e
                time.sleep(5 * (attempt + 1))
    if not attempted_any:
        sys.exit(
            "gemini synth failed: every model already known exhausted today "
            f"({_quota_state_path()}) — no request was even sent"
        )
    sys.exit(f"gemini synth failed: {last_err}")


# ---------- Yandex SpeechKit TTS (fallback, engages when Gemini has none) ----------

YANDEX_VOICE = "ermil"
# ermil only supports the "neutral" emotion (jane/omazh support good/evil) -
# see https://yandex.cloud/en/docs/speechkit/tts/voices
YANDEX_EMOTION = "neutral"


class YandexUnavailable(Exception):
    """Yandex SpeechKit itself couldn't produce audio (network, bad key,
    quota) - distinct from "not configured at all" (yandex_iam_token()
    returning None), which the caller treats as expected, not an error."""


def _yandex_sa_key_path() -> Path:
    override = os.environ.get("SV_YANDEX_SA_KEY_FILE")
    if override:
        return Path(override)
    return Path.home() / ".config" / "yandex-cloud" / "shortvideo-sa-key.json"


def _yandex_sa_key() -> dict:
    try:
        raw = json.loads(_yandex_sa_key_path().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return raw if isinstance(raw, dict) else {}


def yandex_folder_id() -> str:
    folder = os.environ.get("YANDEX_FOLDER_ID", "")
    if not folder:
        env_path = ROOT / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("YANDEX_FOLDER_ID="):
                    folder = line.split("=", 1)[1].strip()
    return folder


def yandex_is_configured() -> bool:
    """Purely local check, no network - mirrors the Gemini quota check's own
    philosophy of cheap bookkeeping over live probes. Confirms a usable-
    looking key + folder id exist, not that the key is still unrevoked
    (that's only ever known for certain at actual synth time)."""
    key = _yandex_sa_key()
    return bool(
        key.get("private_key") and key.get("service_account_id") and key.get("id")
        and yandex_folder_id()
    )


_yandex_iam_cache = {"token": None, "expires_at": 0.0}


def yandex_iam_token():
    """Mint an IAM token from the service account's authorized key via the
    documented JWT exchange (PS256, exp-iat<=3600,
    https://iam.api.cloud.yandex.net/iam/v1/tokens) - no `yc` binary
    dependency, no browser. Cached in-memory for this process (a token is
    valid 12h; one tts_scenes.py run never runs anywhere near that long).
    Returns None - not an error - when no key is configured at all, so
    callers can treat Yandex as simply "not set up" rather than crash."""
    now = time.time()
    if _yandex_iam_cache["token"] and now < _yandex_iam_cache["expires_at"] - 60:
        return _yandex_iam_cache["token"]
    key = _yandex_sa_key()
    if not key.get("private_key") or not key.get("service_account_id") or not key.get("id"):
        return None
    import jwt  # only needed once the fallback actually engages
    payload = {
        "aud": "https://iam.api.cloud.yandex.net/iam/v1/tokens",
        "iss": key["service_account_id"],
        "iat": int(now),
        "exp": int(now) + 3600,
    }
    signed = jwt.encode(payload, key["private_key"], algorithm="PS256",
                         headers={"kid": key["id"]})
    req = urllib.request.Request(
        "https://iam.api.cloud.yandex.net/iam/v1/tokens",
        data=json.dumps({"jwt": signed}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    token = data["iamToken"]
    _yandex_iam_cache.update(token=token, expires_at=now + 12 * 3600)
    return token


def synth_yandex(spoken: str, mp3_path: Path, iam_token: str, folder_id: str):
    """REST v1 (not the gRPC-only v3 with native word timings) - chosen to
    match Gemini's own urllib-only style and to reuse the existing whisper
    forced-alignment pipeline unchanged for both providers, rather than
    pulling in grpcio+generated stubs just for this fallback path."""
    if not folder_id:
        raise YandexUnavailable("YANDEX_FOLDER_ID не задан")
    body = urllib.parse.urlencode({
        "text": spoken,
        "lang": "ru-RU",
        "voice": YANDEX_VOICE,
        "emotion": YANDEX_EMOTION,
        "speed": "1.1",
        "format": "mp3",
        "folderId": folder_id,
    }).encode()
    req = urllib.request.Request(
        "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize",
        data=body,
        headers={"Authorization": f"Bearer {iam_token}"},
    )
    last_err = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                mp3_path.write_bytes(resp.read())
            return
        except Exception as e:
            last_err = e
            time.sleep(5 * (attempt + 1))
    raise YandexUnavailable(str(last_err))


def synth_scene(spoken: str, mp3_path: Path, gemini_api_key: str) -> str:
    """Gemini first, unless we already know today's quota is gone on every
    model; Yandex SpeechKit only as the fallback. synth_gemini() still
    sys.exit()s on total failure when called directly (unchanged, existing
    callers/tests rely on that) - SystemExit is a BaseException, so it's
    caught here deliberately, same as any other exception, to attempt the
    fallback instead of letting it kill the process. Returns which provider
    actually produced the audio - recorded in meta.json and printed, so a
    fallback is always visible, never a silent quality change."""
    if has_quota_for_any_model():
        try:
            synth_gemini(spoken, mp3_path, gemini_api_key)
            return "gemini"
        except SystemExit as e:
            print(f"  Gemini не смог озвучить сцену ({e}), пробую Yandex SpeechKit",
                  file=sys.stderr)
    else:
        print("  Gemini: вся квота на сегодня уже исчерпана, сразу пробую Yandex SpeechKit",
              file=sys.stderr)
    token = yandex_iam_token()
    if token is None:
        sys.exit(
            "оба провайдера недоступны: Gemini исчерпан/упал, а Yandex SpeechKit не "
            f"настроен (нет валидного ключа в {_yandex_sa_key_path()} или не задан "
            "YANDEX_FOLDER_ID)"
        )
    try:
        synth_yandex(spoken, mp3_path, token, yandex_folder_id())
    except YandexUnavailable as e:
        sys.exit(f"оба провайдера недоступны: Gemini исчерпан/упал, Yandex SpeechKit тоже: {e}")
    return "yandex"


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

    key = gemini_key() if target else None

    meta = []
    for i, scene in enumerate(episode["scenes"]):
        narration = scene["narration"]
        if isinstance(narration, dict):
            narration = narration[args.lang]
        spoken, tokens = parse_markup(narration)
        say_words = [w for w in spoken.split() if ALNUM_RE.search(w)]
        mp3 = out / "audio" / f"scene-{i}.mp3"

        if i in target:
            provider = synth_scene(spoken, mp3, key)
            time.sleep(2)  # не долбить preview-квоту Gemini (безвредно и для Yandex)
            heard = whisper_words(mp3)
            timings = align(say_words, heard, mp3_duration(mp3))
            print(f"scene {i}: whisper услышал {len(heard)} слов, ожидалось {len(say_words)}",
                  file=sys.stderr)
            meta.append({"index": i, "duration": round(mp3_duration(mp3), 3),
                         "words": tokens_to_words(tokens, timings), "provider": provider})
            print(f"scene {i}: пере-озвучена ({provider}), "
                  f"{meta[-1]['duration']}s, {len(meta[-1]['words'])} слов")
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
                meta.append({"index": i, "duration": prev["duration"], "words": words,
                             "provider": prev.get("provider", "gemini")})
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
    providers = sorted({m.get("provider", "gemini") for m in meta})
    print(f"OK: {len(meta)} сцен, {total:.1f}s аудио ({'/'.join(providers)}) → {out}/meta.json")


def cmd_check_quota() -> int:
    """Cheap local pre-flight: can *some* provider still synthesize today?
    Gemini: does at least one model still have quota, per our own
    bookkeeping (see has_quota_for_any_model) - no network call, Google
    exposes no free API-key-authenticated endpoint to ask this directly
    (only a browser-auth'd dashboard, see https://ai.dev/rate-limit), so
    this can only ever be a local memory of "which models already said no
    today", not a live guarantee. Yandex: purely local too (yandex_is_
    configured, see its docstring) - a revoked-but-present key would still
    report ready here and only fail for real at synth time.
    Exit 0 if Gemini has quota OR Yandex is configured as a fallback,
    1 only if truly nothing can synthesize this run. Used by run_episode.sh
    to fail fast before spending real delegate time on a run that would
    only fail at TTS anyway.
    """
    state = _load_quota_state()
    available = [m for m in GEMINI_MODELS if m not in state["exhausted_models"]]
    yandex_ready = yandex_is_configured()
    print(json.dumps({
        "day": state["day"],
        "exhausted_models": state["exhausted_models"],
        "available_models": available,
        "yandex_fallback_ready": yandex_ready,
    }, ensure_ascii=False))
    return 0 if (available or yandex_ready) else 1


if __name__ == "__main__":
    if "--check-quota" in sys.argv[1:]:
        sys.exit(cmd_check_quota())
    asyncio.run(main())

#!/usr/bin/env python3
"""Внешний, не зависящий от LLM логгер прогонов конвейера ShortVideo.

Реализует часть I-II плана docs/observability-and-analytics-plan.md: время
меряет этот процесс (time.time() + time.monotonic()), а не самоотчёт модели.
Модель выбирает КОГДА позвать команду, но не какое время записать.

    pipeline_log.py run-start   --slug S --topic T --cli C --model M [--effort E] [--invocation ...] [--orchestration subagents|single-actor]
    pipeline_log.py stage-start STAGE [--role R] [--model M] [--note "..."]
    pipeline_log.py stage-end   STAGE [--status ok|failed|skipped] [--data k=v ...] [--note "..."]
    pipeline_log.py wrap        STAGE [--allow-fail] -- <команда...>
    pipeline_log.py event       KIND  [--stage S] [--severity ...] [--detail "..."] [--data k=v]
    pipeline_log.py verdict     --round N --verdict accepted|revisions --issues N [--report PATH]
    pipeline_log.py snapshot    --label before|after
    pipeline_log.py finish      [--status ok|failed] [--exit-code N]

Логгер никогда не роняет прогон: любая внутренняя ошибка (кроме finish)
печатает предупреждение в stderr и завершается кодом 0.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / "runs"

STAGES = {
    "scriptwriter", "director", "forge", "validate", "tts", "stills",
    "critic", "render", "telegram", "publish", "commit", "other",
}

INCIDENT_PATTERNS = [
    (re.compile(r"429.{0,40}(пробую|fallback|следующ)", re.I), "tts", "fallback"),
    (re.compile(r"gemini synth failed", re.I), "tts", "error"),
    (re.compile(r"edge synth failed", re.I), "tts", "error"),
    (re.compile(r"^ERROR:", re.M), "validate", "validation_failed"),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
        f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def warn(msg: str) -> None:
    print(f"pipeline_log: предупреждение: {msg}", file=sys.stderr)


def die_soft(msg: str) -> None:
    """Печатает предупреждение и завершает процесс кодом 0 — телеметрия не роняет прогон."""
    warn(msg)
    raise SystemExit(0)


# ---------- разрешение активного прогона ----------

def current_run_id() -> str | None:
    rid = os.environ.get("SV_RUN_ID", "").strip()
    if rid:
        return rid
    cur = RUNS / ".current"
    if cur.is_file():
        return cur.read_text().strip() or None
    return None


def run_dir_for(run_id: str) -> Path:
    d = os.environ.get("SV_RUN_DIR", "").strip()
    if d:
        return Path(d)
    # runs/.current хранит просто run_id; каталог всегда runs/<run_id>
    hit = list(RUNS.glob(f"{run_id}"))
    if (RUNS / run_id).is_dir():
        return RUNS / run_id
    if hit:
        return hit[0]
    return RUNS / run_id


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:40] or "implicit"


def ensure_run(create_if_missing: bool = True) -> Path:
    rid = current_run_id()
    if rid:
        d = run_dir_for(rid)
        if d.is_dir():
            return d
    if not create_if_missing:
        die_soft("нет активного прогона (run-start не вызывался)")
    # implicit-прогон: не терять события ручных вызовов вне run-start
    rid = f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-implicit"
    d = RUNS / rid
    d.mkdir(parents=True, exist_ok=True)
    (d / "cmd").mkdir(exist_ok=True)
    (d / "mono_start").write_text(repr(time.monotonic()))
    (RUNS / ".current").write_text(rid)
    append_event(d, {
        "kind": "run_start", "runner": "unknown", "topic": None, "slug": None,
        "origin": "implicit",
    })
    return d


def mono_start(d: Path) -> float:
    try:
        return float((d / "mono_start").read_text())
    except (OSError, ValueError):
        return time.monotonic()


def next_seq(d: Path) -> int:
    ev = d / "events.jsonl"
    if not ev.is_file():
        return 1
    n = 0
    with ev.open("rb") as f:
        for _ in f:
            n += 1
    return n + 1


def append_event(d: Path, fields: dict[str, Any]) -> dict[str, Any]:
    ev = d / "events.jsonl"
    d.mkdir(parents=True, exist_ok=True)
    with ev.open("a", encoding="utf-8") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            seq = next_seq(d)
            record = {
                "seq": seq,
                "ts": now_iso(),
                "mono": round(time.monotonic() - mono_start(d), 3),
                "run_id": d.name,
                **fields,
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
    return record


def parse_kv(pairs: list[str] | None) -> dict[str, str]:
    out: dict[str, str] = {}
    for p in pairs or []:
        if "=" not in p:
            continue
        k, v = p.split("=", 1)
        out[k] = v
    return out


def open_stages_path(d: Path) -> Path:
    return d / ".open_stages.json"


def load_open_stages(d: Path) -> dict[str, float]:
    p = open_stages_path(d)
    if not p.is_file():
        return {}
    try:
        return json.loads(p.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def save_open_stages(d: Path, data: dict[str, float]) -> None:
    open_stages_path(d).write_text(json.dumps(data))


# ---------- команды ----------

def cmd_run_start(args: argparse.Namespace) -> None:
    slug = args.slug or "untitled"
    rid = f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{slugify(slug)}"
    d = RUNS / rid
    d.mkdir(parents=True, exist_ok=True)
    (d / "cmd").mkdir(exist_ok=True)
    (d / "mono_start").write_text(repr(time.monotonic()))
    RUNS.mkdir(exist_ok=True)
    (RUNS / ".current").write_text(rid)
    append_event(d, {
        "kind": "run_start",
        "runner": {
            "cli": args.cli, "model": args.model, "effort": args.effort,
            "orchestration": args.orchestration, "invocation": args.invocation,
        },
        "topic": args.topic, "slug": slug,
    })
    print(rid)


def cmd_stage_start(args: argparse.Namespace) -> None:
    if args.stage not in STAGES:
        die_soft(f"неизвестный stage '{args.stage}', допустимые: {sorted(STAGES)}")
    d = ensure_run()
    actor = {}
    if args.role:
        actor["role"] = args.role
    if args.model:
        actor["model"] = args.model
    rec = append_event(d, {
        "kind": "stage_start", "stage": args.stage, "actor": actor or None,
        "note": args.note,
    })
    open_stages = load_open_stages(d)
    open_stages[args.stage] = rec["mono"]
    save_open_stages(d, open_stages)


def cmd_stage_end(args: argparse.Namespace) -> None:
    if args.stage not in STAGES:
        die_soft(f"неизвестный stage '{args.stage}'")
    d = ensure_run()
    open_stages = load_open_stages(d)
    inferred = args.stage not in open_stages
    start_mono = open_stages.pop(args.stage, None)
    save_open_stages(d, open_stages)
    wall_sec = round(time.monotonic() - mono_start(d) - start_mono, 3) if start_mono is not None else None
    append_event(d, {
        "kind": "stage_end", "stage": args.stage, "status": args.status,
        "data": parse_kv(args.data), "note": args.note,
        "inferred_start": inferred, "wall_sec": wall_sec,
    })


def stream_and_capture(proc: subprocess.Popen, log_path: Path, tail_lines: int = 40) -> tuple[str, str, int]:
    """Читает stdout/stderr дочернего процесса, зеркалит в терминал и в файл."""
    from collections import deque
    out_tail: deque[str] = deque(maxlen=tail_lines)
    err_tail: deque[str] = deque(maxlen=tail_lines)
    with log_path.open("w", encoding="utf-8", errors="replace") as logf:
        import selectors
        sel = selectors.DefaultSelector()
        sel.register(proc.stdout, selectors.EVENT_READ, ("out", sys.stdout))
        sel.register(proc.stderr, selectors.EVENT_READ, ("err", sys.stderr))
        open_streams = 2
        while open_streams:
            for key, _ in sel.select():
                stream_name, mirror = key.data
                line = key.fileobj.readline()
                if not line:
                    sel.unregister(key.fileobj)
                    open_streams -= 1
                    continue
                mirror.write(line)
                mirror.flush()
                logf.write(f"[{stream_name}] {line}")
                (out_tail if stream_name == "out" else err_tail).append(line)
    code = proc.wait()
    return "".join(out_tail), "".join(err_tail), code


def detect_incidents(d: Path, stage: str, stderr_text: str, exit_code: int) -> None:
    for pattern, inc_stage, kind in INCIDENT_PATTERNS:
        if pattern.search(stderr_text):
            append_event(d, {
                "kind": "incident", "stage": inc_stage or stage,
                "severity": "warn" if kind == "fallback" else "error",
                "detail": kind, "source": "stderr-pattern",
            })
    if exit_code != 0:
        append_event(d, {
            "kind": "incident", "stage": stage, "severity": "error",
            "detail": "command_failed", "source": "exit_code",
        })


def cmd_wrap(args: argparse.Namespace) -> None:
    if args.stage not in STAGES:
        die_soft(f"неизвестный stage '{args.stage}'")
    if args.command and args.command[0] == "--":
        args.command = args.command[1:]
    if not args.command:
        die_soft("wrap требует команду после --")
    d = ensure_run()
    (d / "cmd").mkdir(exist_ok=True)
    idx = len(list((d / "cmd").glob(f"{args.stage}-*.log"))) + 1
    log_path = d / "cmd" / f"{args.stage}-{idx}.log"

    start_rec = append_event(d, {"kind": "stage_start", "stage": args.stage, "actor": None})
    t0 = start_rec["mono"]

    proc = subprocess.Popen(
        args.command, cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    out_tail, err_tail, code = stream_and_capture(proc, log_path)
    wall = round(time.monotonic() - mono_start(d) - t0, 3)

    append_event(d, {
        "kind": "cmd", "stage": args.stage, "argv": args.command,
        "exit_code": code, "wall_sec": wall,
        "stdout_tail": out_tail[-4000:], "stderr_tail": err_tail[-4000:],
    })
    detect_incidents(d, args.stage, err_tail, code)
    append_event(d, {
        "kind": "stage_end", "stage": args.stage,
        "status": "ok" if code == 0 else "failed", "wall_sec": wall,
    })

    if code != 0 and not args.allow_fail:
        raise SystemExit(code)


def cmd_event(args: argparse.Namespace) -> None:
    d = ensure_run()
    append_event(d, {
        "kind": args.kind, "stage": args.stage, "severity": args.severity,
        "detail": args.detail, "data": parse_kv(args.data),
    })


def cmd_verdict(args: argparse.Namespace) -> None:
    d = ensure_run()
    append_event(d, {
        "kind": "verdict", "round": args.round, "verdict": args.verdict,
        "issues": args.issues, "report": args.report,
    })


# ---------- снапшот библиотеки визуалов ----------

def sha1_file(p: Path) -> str:
    h = hashlib.sha1()
    h.update(p.read_bytes())
    return h.hexdigest()[:12]


def extract_visuals(schema: dict) -> list[str]:
    try:
        return list(schema["$defs"]["story"]["properties"]["beats"]["items"]
                    ["properties"]["visual"]["enum"])
    except (KeyError, TypeError):
        return []


def extract_scene_types(schema: dict) -> list[str]:
    types = []
    for name, d in (schema.get("$defs") or {}).items():
        if not isinstance(d, dict):
            continue
        const = (d.get("properties") or {}).get("type", {}).get("const")
        if const:
            types.append(const)
    return sorted(types)


def extract_catalog_visuals(catalog_path: Path) -> list[str]:
    """Только строки таблицы `| visual | Что происходит | params |` — не любую таблицу."""
    if not catalog_path.is_file():
        return []
    visuals = []
    in_visual_table = False
    for line in catalog_path.read_text().splitlines():
        if re.match(r"\|\s*visual\s*\|", line, re.I):
            in_visual_table = True
            continue
        if not line.strip().startswith("|"):
            in_visual_table = False
            continue
        if in_visual_table:
            m = re.match(r"\|\s*`([a-z0-9-]+)`\s*\|", line)
            if m:
                visuals.append(m.group(1))
    return visuals


def build_snapshot() -> dict[str, Any]:
    schema_path = ROOT / "schema" / "scenes.schema.json"
    catalog_path = ROOT / ".claude" / "skills" / "animator" / "catalog.md"
    schema = json.loads(schema_path.read_text()) if schema_path.is_file() else {}

    components: dict[str, str] = {}
    for pattern in ("video/src/scenes/*.tsx", "video/src/primitives/*.tsx"):
        for p in sorted(ROOT.glob(pattern)):
            components[str(p.relative_to(ROOT))] = sha1_file(p)

    try:
        git_head = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        git_head = None

    return {
        "taken_at": now_iso(),
        "git_head": git_head,
        "story_visuals": extract_visuals(schema),
        "scene_types": extract_scene_types(schema),
        "catalog_visuals": extract_catalog_visuals(catalog_path),
        "components": components,
    }


def cmd_snapshot(args: argparse.Namespace) -> None:
    if args.label not in {"before", "after"}:
        die_soft("--label должен быть before|after")
    d = ensure_run()
    snap = build_snapshot()
    (d / f"snapshot-{args.label}.json").write_text(json.dumps(snap, ensure_ascii=False, indent=1))
    digest = hashlib.sha1(json.dumps(snap, sort_keys=True).encode()).hexdigest()[:12]
    append_event(d, {"kind": "snapshot", "label": args.label, "digest": digest})


def diff_snapshots(before: dict, after: dict) -> dict[str, Any]:
    bv, av = set(before.get("story_visuals", [])), set(after.get("story_visuals", []))
    bt, at = set(before.get("scene_types", [])), set(after.get("scene_types", []))
    bc, ac = before.get("components", {}), after.get("components", {})
    new_components = sorted(set(ac) - set(bc))
    modified_components = sorted(
        name for name in (set(ac) & set(bc)) if ac[name] != bc[name]
    )
    catalog_after = set(after.get("catalog_visuals", []))
    in_schema_not_in_catalog = sorted(av - catalog_after)
    in_catalog_not_in_schema = sorted(catalog_after - av)
    new_visuals = sorted(av - bv)
    return {
        "new_scene_types": sorted(at - bt),
        "new_story_visuals": new_visuals,
        "new_components": new_components,
        "modified_components": modified_components,
        "count": len(new_visuals) + len(sorted(at - bt)),
        "catalog_drift": {
            "in_schema_not_in_catalog": in_schema_not_in_catalog,
            "in_catalog_not_in_schema": in_catalog_not_in_schema,
        },
        "detected_by": ["snapshot-diff", "git-diff"],
        "git_before": before.get("git_head"),
        "git_after": after.get("git_head"),
    }


# ---------- сборка manifest.json ----------

def read_json(p: Path) -> Any:
    try:
        return json.loads(p.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def build_composition(slug: str | None) -> dict[str, Any]:
    if not slug:
        return {}
    ep = read_json(ROOT / "episodes" / f"{slug}.json")
    meta = read_json(ROOT / "video" / "public" / "episodes" / slug / "meta.json")
    comp: dict[str, Any] = {}
    if ep:
        scenes = ep.get("scenes", [])
        comp["scene_count"] = len(scenes)
        comp["scene_type_histogram"] = {}
        visuals_used: set[str] = set()
        total_words = 0
        for sc in scenes:
            t = sc.get("type", "?")
            comp["scene_type_histogram"][t] = comp["scene_type_histogram"].get(t, 0) + 1
            narration = sc.get("narration", "") or ""
            total_words += len(re.findall(r"\S+", narration))
            for beat in sc.get("beats", []) or []:
                if beat.get("visual"):
                    visuals_used.add(beat["visual"])
        comp["spoken_words"] = total_words
        comp["visuals_used"] = sorted(visuals_used)
    if isinstance(meta, list):
        comp["audio_sec"] = round(sum(s.get("duration", 0) for s in meta), 2)
    mp4 = ROOT / "video" / "out" / f"{slug}.mp4"
    if mp4.is_file():
        comp["mp4_bytes"] = mp4.stat().st_size
        try:
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-select_streams", "v:0",
                 "-show_entries", "format=duration", "-of", "json", str(mp4)],
                capture_output=True, text=True, check=True,
            )
            dur = json.loads(probe.stdout).get("format", {}).get("duration")
            if dur:
                comp["video_sec"] = round(float(dur), 2)
        except (OSError, subprocess.CalledProcessError, json.JSONDecodeError, KeyError):
            pass
    return comp


def build_artifacts(slug: str | None) -> dict[str, Any]:
    if not slug:
        return {}
    paths = {
        "draft_json": f"episodes/drafts/{slug}.draft.json",
        "episode_json": f"episodes/{slug}.json",
        "meta_json": f"video/public/episodes/{slug}/meta.json",
        "script_json": f"video/public/episodes/{slug}/script.json",
        "audio_dir": f"video/public/episodes/{slug}/audio",
        "mp4": f"video/out/{slug}.mp4",
    }
    return {k: v for k, v in paths.items() if (ROOT / v).exists()}


def cmd_finish(args: argparse.Namespace) -> None:
    d = ensure_run(create_if_missing=False)
    open_stages = load_open_stages(d)
    for stage, start_mono in open_stages.items():
        append_event(d, {
            "kind": "stage_end", "stage": stage, "status": "unknown",
            "inferred_start": False, "inferred_end": True,
            "wall_sec": round(time.monotonic() - mono_start(d) - start_mono, 3),
        })
    save_open_stages(d, {})

    finish_rec = append_event(d, {
        "kind": "run_end", "status": args.status, "exit_code": args.exit_code,
    })

    events = [json.loads(line) for line in (d / "events.jsonl").read_text().splitlines() if line.strip()]
    run_start_ev = next((e for e in events if e.get("kind") == "run_start"), {})
    runner = run_start_ev.get("runner") or {}
    slug = run_start_ev.get("slug")
    topic = run_start_ev.get("topic")

    stages: dict[str, Any] = {}
    for e in events:
        if e.get("kind") == "stage_end":
            st = e["stage"]
            prev = stages.get(st, {"wall_sec": 0.0})
            wall = e.get("wall_sec", prev.get("wall_sec", 0.0))
            stages[st] = {
                "wall_sec": round(prev.get("wall_sec", 0.0) + (wall or 0), 3),
                "status": e.get("status"),
                "inferred_start": e.get("inferred_start", False),
            }

    incidents = [e for e in events if e.get("kind") == "incident"]
    verdicts = [e for e in events if e.get("kind") == "verdict"]

    before = read_json(d / "snapshot-before.json") or {}
    after = read_json(d / "snapshot-after.json") or {}
    library_growth = diff_snapshots(before, after) if (before and after) else {}

    wall_total = finish_rec["mono"]
    accounted = round(sum(s["wall_sec"] for s in stages.values()), 3)

    manifest = {
        "schema_version": 1,
        "run_id": d.name,
        "slug": slug,
        "status": args.status,
        "episode": {"topic": topic},
        "runner": runner,
        "timing": {
            "started_at": run_start_ev.get("ts"),
            "finished_at": finish_rec.get("ts"),
            "wall_sec": wall_total,
            "unaccounted_sec": round(wall_total - accounted, 3),
            "coverage_pct": round(100 * accounted / wall_total, 1) if wall_total else None,
            "measured_by": "tools/pipeline_log.py",
            "stages": stages,
        },
        "composition": build_composition(slug),
        "library_growth": library_growth,
        "incidents": [
            {"stage": e.get("stage"), "severity": e.get("severity"), "detail": e.get("detail")}
            for e in incidents
        ],
        "verdicts": [
            {"round": e.get("round"), "verdict": e.get("verdict"), "issues": e.get("issues")}
            for e in verdicts
        ],
        "artifacts": build_artifacts(slug),
        "integrity": {
            "stages_measured": sorted(stages.keys()),
            "clock": "utc+monotonic, tools/pipeline_log.py",
        },
    }
    (d / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))

    RUNS.mkdir(exist_ok=True)
    with (RUNS / "index.jsonl").open("a", encoding="utf-8") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            f.write(json.dumps({
                "run_id": d.name, "slug": slug, "status": args.status,
                "cli": runner.get("cli"), "model": runner.get("model"),
                "effort": runner.get("effort"), "orchestration": runner.get("orchestration"),
                "wall_sec": wall_total, "coverage_pct": manifest["timing"]["coverage_pct"],
                "new_visuals": len(library_growth.get("new_story_visuals", [])),
                "scene_count": manifest["composition"].get("scene_count"),
            }, ensure_ascii=False) + "\n")
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)

    cur = RUNS / ".current"
    if cur.is_file() and cur.read_text().strip() == d.name:
        cur.unlink()

    print(json.dumps(manifest, ensure_ascii=False, indent=1))


# ---------- CLI ----------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    rs = sub.add_parser("run-start")
    rs.add_argument("--slug", required=True)
    rs.add_argument("--topic", default=None)
    rs.add_argument("--cli", required=True)
    rs.add_argument("--model", required=True)
    rs.add_argument("--effort", default=None)
    rs.add_argument("--orchestration", default="single-actor")
    rs.add_argument("--invocation", default=None)

    ss = sub.add_parser("stage-start")
    ss.add_argument("stage")
    ss.add_argument("--role", default=None)
    ss.add_argument("--model", default=None)
    ss.add_argument("--note", default=None)

    se = sub.add_parser("stage-end")
    se.add_argument("stage")
    se.add_argument("--status", default="ok", choices=["ok", "failed", "skipped"])
    se.add_argument("--data", action="append")
    se.add_argument("--note", default=None)

    wr = sub.add_parser("wrap")
    wr.add_argument("stage")
    wr.add_argument("--allow-fail", action="store_true")
    wr.add_argument("command", nargs=argparse.REMAINDER)

    ev = sub.add_parser("event")
    ev.add_argument("kind")
    ev.add_argument("--stage", default=None)
    ev.add_argument("--severity", default=None)
    ev.add_argument("--detail", default=None)
    ev.add_argument("--data", action="append")

    vd = sub.add_parser("verdict")
    vd.add_argument("--round", type=int, required=True)
    vd.add_argument("--verdict", required=True, choices=["accepted", "revisions"])
    vd.add_argument("--issues", type=int, default=0)
    vd.add_argument("--report", default=None)

    sn = sub.add_parser("snapshot")
    sn.add_argument("--label", required=True, choices=["before", "after"])

    fn = sub.add_parser("finish")
    fn.add_argument("--status", default="ok", choices=["ok", "failed", "killed"])
    fn.add_argument("--exit-code", type=int, default=0)

    return p


def main() -> int:
    args = build_parser().parse_args()
    handlers = {
        "run-start": cmd_run_start,
        "stage-start": cmd_stage_start,
        "stage-end": cmd_stage_end,
        "wrap": cmd_wrap,
        "event": cmd_event,
        "verdict": cmd_verdict,
        "snapshot": cmd_snapshot,
        "finish": cmd_finish,
    }
    try:
        handlers[args.cmd](args)
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 — телеметрия не имеет права ронять прогон
        if args.cmd == "finish":
            raise
        warn(f"{args.cmd} упал: {exc}")
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Втягивание сессий Codex-делегатов в каталог прогона.

Зачем. Делегаты запускаются через MCP-сервер `codex` отдельными процессами, и
конвейер о них не знает ничего: `runs/<run_id>/` видел только этапы, которые
оркестратор соблаговолил разметить. В инциденте auto-20260831-164055 всё, что
реально делали три параллельных делегата — включая `git stash push
--include-untracked` и `kill -TERM -- -990719` — существовало ТОЛЬКО в
~/.codex/sessions/2026/08/31/rollout-*.jsonl, вне репозитория, и было найдено
руками через несколько часов раскопок. Разбор —
corrections/git-reset-clean-incident/REPORT.md.

Этот импортёр делает раскопки штатной операцией: после (или во время) прогона
он находит сессии, относящиеся к этому прогону, кладёт их сырые файлы в
`runs/<run_id>/agents/<session_id>/rollout.jsonl` (побайтово, как есть — это
доказательство), рядом пишет нормализованный `actions.jsonl` (по одной строке
на действие, единый формат) и поднимает `anomaly`-события на опасные команды.

Что в rollout-файлах реально есть (проверено чтением на этой машине, codex
0.149.0):

    session_meta            → payload.session_id, payload.cwd, payload.source,
                              payload.timestamp. `source == "mcp"` — признак
                              делегата: так отличается под-агент, поднятый
                              через MCP, от оркестратора (`source` иной).
    response_item/custom_tool_call
                            → payload.name (напр. "exec"), payload.input —
                              ПОЛНЫЙ текст вызова, включая shell-команду.
                              Именно здесь видны `git stash` и `kill`.
    response_item/custom_tool_call_output → результат вызова.
    event_msg/agent_message → видимая реплика модели. Это то место, откуда взяты
                              цитаты в INCIDENT-NARRATIVE.md («Перед созданием
                              файла сохраню текущий dirty worktree в stash») —
                              то есть намерение модели, высказанное вслух.
    response_item/reasoning → summary: [] и encrypted_content — сырое
                              «размышление» ЗАШИФРОВАНО и недоступно.

Последнее — важное честное ограничение, и его нельзя обойти: восстановить
можно намерение, высказанное моделью в тексте, и фактические действия, но не
скрытую цепочку рассуждений. Подробнее — docs/agent-safety-architecture.md,
раздел «Чего мы принципиально не увидим».

    codex_session_import.py import  [--run-id ID] [--since ISO] [--until ISO] [--sessions-dir D]
    codex_session_import.py scan    [--since ISO] [--until ISO]   # только показать, ничего не писать
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_log  # noqa: E402
from delegate_worktree import WORKTREES_ROOT  # noqa: E402

ROOT = pipeline_log.ROOT
DEFAULT_SESSIONS_DIR = Path.home() / ".codex" / "sessions"

# Паттерны опасных действий. Ищутся в тексте вызова инструмента (payload.input),
# то есть в том, что делегат ФАКТИЧЕСКИ попытался выполнить. Список намеренно
# узкий: сюда попадает только необратимое и только то, что уже случалось или
# прямо запрещено правилами, — а не всё, что теоретически может пойти не так.
# Расширять его следует по факту наблюдённых в рассказах прогонов ошибок.
DANGER_PATTERNS: list[tuple[re.Pattern[str], str, str, str]] = [
    # Только записывающие формы стеша. `git stash show/list/apply/pop/drop` —
    # операции чтения и восстановления, они безвредны и регулярно встречаются
    # в добросовестной диагностике (в том числе в разборе самого инцидента),
    # поэтому явно исключены: ложная тревога в рассказе обесценивает настоящие.
    (re.compile(r"\bgit\s+stash\s+(?!show|list|apply|pop|drop|branch|clear)"
                r"[^\n;|&]*"
                r"(--include-untracked|--all|(?<![\w-])-[a-zA-Z]*[ua])"),
     "git_stash_untracked", "error",
     "git stash с -u/-a сметает ВСЕ незакоммиченные файлы репозитория — механизм инцидента 31.08"),
    (re.compile(r"\bgit\s+reset\s+[^\n;|&]*--(hard|merge)"),
     "git_reset_hard", "error",
     "git reset --hard уничтожает незакоммиченную работу"),
    (re.compile(r"\bgit\s+clean\b"),
     "git_clean", "error",
     "git clean удаляет untracked-файлы без возможности восстановления"),
    (re.compile(r"(?<![\w-])(kill|pkill|killall)\s+(-\S+\s+)*-?-?\s*\d|(?<![\w-])pkill\s+-[sfg]\b|(?<![\w-])kill\s+-TERM\s+--"),
     "process_kill", "error",
     "попытка убить процесс: делегат вправе завершать только собственные прямые дочерние процессы"),
    (re.compile(r"\bgit\s+push\s+[^\n;|&]*--force(?!-with-lease)"),
     "git_force_push", "error",
     "force-push переписывает удалённую историю"),
    (re.compile(r"\bgit\s+worktree\s+remove\b[^\n;|&]*--force"),
     "worktree_force_remove", "warn",
     "принудительное удаление worktree уничтожает несохранённые файлы делегата"),
]


def parse_iso(text: str) -> datetime:
    t = text.strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(t)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def iter_rollouts(sessions_dir: Path) -> Iterator[Path]:
    if not sessions_dir.is_dir():
        return
    yield from sorted(sessions_dir.rglob("rollout-*.jsonl"))


def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    """Читает JSONL, молча пропуская битые строки.

    Последняя строка живого (или убитого) rollout-файла регулярно оказывается
    недописанной — это нормальное состояние, а не повод отказаться от импорта
    всей сессии.
    """
    try:
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except ValueError:
                    continue
    except OSError:
        return


def session_meta(path: Path) -> dict[str, Any] | None:
    for rec in read_jsonl(path):
        if isinstance(rec, dict) and rec.get("type") == "session_meta":
            payload = rec.get("payload") or {}
            if isinstance(payload, dict):
                return payload
            return None
    return None


def plain_output_text(out: str) -> str:
    """MCP-инструменты часто отдают output не голым текстом, а сериализованным
    списком content-блоков (`[{"type": "input_text", "text": "..."}]`). Если
    достать текст до обрезки в 2000 символов, а не после — output_head не
    превращается в обрубок JSON с незакрытыми скобками. Не парсится —
    отдаём как есть, это не единственный формат, который тут встречается."""
    stripped = out.strip()
    if not stripped or stripped[0] not in "[{":
        return out
    try:
        parsed = json.loads(stripped)
    except ValueError:
        return out
    if isinstance(parsed, list):
        texts = [str(b.get("text")) for b in parsed
                 if isinstance(b, dict) and isinstance(b.get("text"), str)]
        if texts:
            return "\n".join(texts)
    elif isinstance(parsed, dict) and isinstance(parsed.get("text"), str):
        return parsed["text"]
    return out


def normalize(path: Path) -> list[dict[str, Any]]:
    """rollout-*.jsonl → плоский список действий в едином формате."""
    actions: list[dict[str, Any]] = []
    for rec in read_jsonl(path):
        # Строка может оказаться валидным JSON, но не объектом (обрывок,
        # голая строка). Молча пропускаем — одна кривая запись не повод
        # потерять всю сессию.
        if not isinstance(rec, dict):
            continue
        rtype = rec.get("type")
        payload = rec.get("payload")
        if not isinstance(payload, dict):
            payload = {}
        ts = rec.get("timestamp") or payload.get("timestamp")
        ptype = payload.get("type")

        if rtype == "response_item" and ptype == "custom_tool_call":
            actions.append({
                "ts": ts, "kind": "tool_call",
                "name": payload.get("name"),
                "call_id": payload.get("call_id"),
                "input": payload.get("input"),
                "status": payload.get("status"),
            })
        elif rtype == "response_item" and ptype == "custom_tool_call_output":
            out = payload.get("output")
            if not isinstance(out, str):
                out = json.dumps(out, ensure_ascii=False) if out is not None else ""
            actions.append({
                "ts": ts, "kind": "tool_result",
                "call_id": payload.get("call_id"),
                "output_head": plain_output_text(out)[:2000],
                "output_bytes": len(out),
            })
        elif rtype == "event_msg" and ptype == "agent_message":
            actions.append({
                "ts": ts, "kind": "agent_message",
                "text": payload.get("message") or payload.get("text"),
            })
        elif rtype == "event_msg" and ptype == "user_message":
            text = payload.get("message") or payload.get("text") or ""
            actions.append({
                "ts": ts, "kind": "task_prompt",
                "text": text[:8000], "text_bytes": len(text),
            })
        elif rtype == "response_item" and ptype == "reasoning":
            # Содержимое зашифровано; фиксируем только сам факт и его объём,
            # чтобы в рассказе было видно, где модель думала долго.
            summary = payload.get("summary") or []
            actions.append({
                "ts": ts, "kind": "reasoning",
                "available": bool(summary),
                "summary": summary if summary else None,
            })
        elif rtype == "event_msg" and ptype in ("task_started", "task_complete"):
            actions.append({"ts": ts, "kind": ptype})
    return actions


# "code mode" Codex не вызывает shell напрямую — модель пишет JS, которая сама
# зовёт tools.exec_command({cmd: "...", ...}). Один вызов custom_tool_call
# нередко несёт МНОГО НЕсвязанного текста в одном блоке: реальные shell-команды
# в cmd:"...", но рядом же — например, при делегировании через
# tools.mcp__codex__codex({..., prompt: "..."}) — целый промпт для суб-делегата
# свободным текстом. Проверено на живом прогоне 2026-09-01: промпт
# оркестратора (tools/producer_scheduler.py::build_prompt) сам ЦИТИРУЕТ команды
# инцидента, объясняя делегату, что они запрещены — и старая версия детектора,
# сканируя весь input целиком, ловила эту цитату как будто делегат её выполнил.
# Поэтому danger-паттерны ищутся ТОЛЬКО внутри значений cmd:"..."/cmd:'...' —
# то, что делегат реально просил выполнить оболочку, а не любой текст рядом.
CMD_LITERAL_RE = re.compile(r"""cmd\s*:\s*(["'`])((?:\\.|(?!\1).)*)\1""", re.S)


def extract_shell_commands(text: str) -> list[str]:
    return [m.group(2) for m in CMD_LITERAL_RE.finditer(text)]


def detect_dangers(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for act in actions:
        if act.get("kind") != "tool_call":
            continue
        raw = act.get("input") or ""
        commands = extract_shell_commands(raw)
        if not commands:
            continue
        for cmd_text in commands:
            for pattern, kind, severity, why in DANGER_PATTERNS:
                if pattern.search(cmd_text):
                    found.append({
                        "ts": act.get("ts"), "anomaly_kind": kind,
                        "severity": severity, "why": why,
                        "evidence": cmd_text[:1000],
                    })
    return found


def select_sessions(sessions_dir: Path, since: datetime, until: datetime,
                    cwd_prefixes: list[str]) -> list[tuple[Path, dict[str, Any]]]:
    """Сессии, относящиеся к окну прогона.

    Критерий отбора намеренно НЕ полагается на то, что оркестратор аккуратно
    записал threadId каждого делегата: в инциденте он этого не сделал, и
    именно поэтому связь пришлось восстанавливать руками. Отбор идёт по двум
    объективным признакам — время старта сессии внутри окна прогона и рабочий
    каталог внутри репозитория (или его worktree). Если threadId в реестре
    всё-таки есть, он уточняет привязку, но не является её условием.
    """
    picked: list[tuple[Path, dict[str, Any]]] = []
    for path in iter_rollouts(sessions_dir):
        meta = session_meta(path)
        if not meta:
            continue
        raw_ts = meta.get("timestamp")
        if not raw_ts:
            continue
        try:
            started = parse_iso(str(raw_ts))
        except ValueError:
            continue
        if not (since <= started <= until):
            continue
        cwd = str(meta.get("cwd") or "")
        if cwd_prefixes and not any(cwd.startswith(p) for p in cwd_prefixes):
            continue
        picked.append((path, meta))
    return picked


def run_window(run_dir: Path) -> tuple[datetime, datetime]:
    """Окно прогона из его же events.jsonl (run_start … run_end/сейчас)."""
    events_path = run_dir / "events.jsonl"
    start: datetime | None = None
    end: datetime | None = None
    for rec in read_jsonl(events_path):
        ts = rec.get("ts")
        if not ts:
            continue
        try:
            when = parse_iso(str(ts))
        except ValueError:
            continue
        if rec.get("kind") == "run_start" and start is None:
            start = when
        if rec.get("kind") == "run_end":
            end = when
    if start is None:
        start = datetime.now(timezone.utc) - timedelta(hours=6)
    # Делегат может пережить оркестратора (в инциденте так и было: MCP-сессии
    # не являются его прямыми детьми и продолжали работать после его смерти),
    # поэтому правая граница окна берётся с запасом после run_end.
    if end is None:
        end = datetime.now(timezone.utc)
    else:
        end = end + timedelta(minutes=30)
    return start, end


def cmd_import(args: argparse.Namespace) -> int:
    run_dir = pipeline_log.ensure_run() if not args.run_id else pipeline_log.RUNS / args.run_id
    if not run_dir.is_dir():
        print(f"codex_session_import: нет каталога прогона {run_dir}", file=sys.stderr)
        return 2

    since = parse_iso(args.since) if args.since else None
    until = parse_iso(args.until) if args.until else None
    win_start, win_end = run_window(run_dir)
    since = since or win_start
    until = until or win_end

    # Делегаты этапа 3 (worktree-изоляция) работают не в ROOT, а в своей
    # изолированной копии repo под WORKTREES_ROOT/<run_id>/<agent_id> — без
    # этого префикса их сессии тихо выпадали из отбора: select_sessions()
    # проверяет cwd на префикс, а cwd делегата больше не начинается с ROOT.
    prefixes = [str(ROOT), str(WORKTREES_ROOT / run_dir.name)] + (args.cwd_prefix or [])
    sessions = select_sessions(Path(args.sessions_dir), since, until, prefixes)

    agents_dir = run_dir / "agents"
    agents_dir.mkdir(parents=True, exist_ok=True)

    imported: list[dict[str, Any]] = []
    for path, meta in sessions:
        session_id = str(meta.get("session_id") or meta.get("id") or path.stem)
        dest = agents_dir / session_id
        dest.mkdir(parents=True, exist_ok=True)

        # Сырой файл — побайтово. Это доказательство, его не нормализуем.
        shutil.copy2(path, dest / "rollout.jsonl")

        actions = normalize(path)
        with (dest / "actions.jsonl").open("w", encoding="utf-8") as fh:
            for act in actions:
                fh.write(json.dumps(act, ensure_ascii=False) + "\n")

        dangers = detect_dangers(actions)
        tool_calls = [a for a in actions if a["kind"] == "tool_call"]
        info = {
            "session_id": session_id,
            "source": meta.get("source"),
            "is_delegate": meta.get("source") == "mcp",
            "cwd": meta.get("cwd"),
            "cli_version": meta.get("cli_version"),
            "started_at": meta.get("timestamp"),
            "rollout_origin": str(path),
            "actions_total": len(actions),
            "tool_calls": len(tool_calls),
            "agent_messages": sum(1 for a in actions if a["kind"] == "agent_message"),
            "reasoning_items": sum(1 for a in actions if a["kind"] == "reasoning"),
            "reasoning_readable": any(a.get("available") for a in actions
                                      if a["kind"] == "reasoning"),
            "dangers": dangers,
        }
        (dest / "session.json").write_text(
            json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
        imported.append(info)

        for d in dangers:
            # "ts" здесь ОБЯЗАТЕЛЕН: append_event() по умолчанию проставляет
            # now_iso() (время самого импорта, а не события) — для этапов
            # конвейера это верно (append_event зовётся сразу), но импорт
            # сессий Codex почти всегда идёт постфактум, после завершения
            # прогона. Без явного "ts" в fields сводка "Что пошло не так" в
            # рассказе показывала все аномалии одним временем — временем
            # самого импорта, а не тем, когда делегат реально это выполнил
            # (найдено на живом прогоне 2026-09-01).
            pipeline_log.append_event(run_dir, {
                "kind": "anomaly", "anomaly_kind": d["anomaly_kind"],
                "actor": session_id, "severity": d["severity"],
                "detail": d["why"], "evidence": d["evidence"][:1000],
                "source": "codex-session-import", "ts": d.get("ts"),
            })

    index = {
        "imported_at": pipeline_log.now_iso(),
        "window": {"since": since.isoformat(), "until": until.isoformat()},
        "sessions_dir": str(args.sessions_dir),
        "count": len(imported),
        "delegates": sum(1 for i in imported if i["is_delegate"]),
        "sessions": imported,
    }
    (agents_dir / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")

    print(json.dumps({
        "run_dir": str(run_dir), "sessions": len(imported),
        "delegates": index["delegates"],
        "anomalies": sum(len(i["dangers"]) for i in imported),
    }, ensure_ascii=False, indent=1))
    return 0


def cmd_scan(args: argparse.Namespace) -> int:
    since = parse_iso(args.since) if args.since else \
        datetime.now(timezone.utc) - timedelta(hours=6)
    until = parse_iso(args.until) if args.until else datetime.now(timezone.utc)
    # cmd_scan не привязан к конкретному run_id, поэтому берёт весь корень
    # воркри целиком, а не поддиректорию одного прогона (см. cmd_import).
    prefixes = [str(ROOT), str(WORKTREES_ROOT)] + (args.cwd_prefix or [])
    sessions = select_sessions(Path(args.sessions_dir), since, until, prefixes)
    if not sessions:
        print("сессий в окне не найдено")
        return 0
    for path, meta in sessions:
        actions = normalize(path)
        dangers = detect_dangers(actions)
        tag = "делегат" if meta.get("source") == "mcp" else str(meta.get("source"))
        print(f"{meta.get('timestamp')}  {tag:<10} "
              f"{str(meta.get('session_id'))[:8]}  "
              f"действий={len(actions):<5} опасных={len(dangers)}")
        for d in dangers:
            print(f"    ⚠ {d['anomaly_kind']}: {d['evidence'][:120]}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="codex_session_import.py", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("import", "scan"):
        sp = sub.add_parser(name)
        sp.add_argument("--sessions-dir", default=str(DEFAULT_SESSIONS_DIR))
        sp.add_argument("--since", default=None)
        sp.add_argument("--until", default=None)
        sp.add_argument("--cwd-prefix", action="append", default=None,
                        help="дополнительный префикс cwd (например каталог worktree делегатов)")
        if name == "import":
            sp.add_argument("--run-id", default=None)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return {"import": cmd_import, "scan": cmd_scan}[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())

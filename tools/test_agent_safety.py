#!/usr/bin/env python3
"""Тесты защитного контура: реестр делегирования, детектор опасных действий,
изоляция делегатов в worktree и сборка рассказа о прогоне.

Главный тест здесь — `test_duplicate_delegation_is_structurally_denied`: он
проверяет, что сценарий инцидента auto-20260831-164055 (три параллельных
делегата на один slug) больше не воспроизводится. Не «запрещён текстом
промпта», а именно отвергается реестром — включая случай, когда попытки идут
из РАЗНЫХ процессов одновременно.

    python3 -m pytest tools/test_agent_safety.py -q
"""
from __future__ import annotations

import importlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))


@pytest.fixture()
def sandbox(tmp_path, monkeypatch):
    """Изолированный «репозиторий» с собственным runs/ и активным прогоном."""
    root = tmp_path / "repo"
    (root / "tools").mkdir(parents=True)
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    subprocess.run(["git", "-C", str(root), "config", "user.email", "t@t"], check=True)
    subprocess.run(["git", "-C", str(root), "config", "user.name", "t"], check=True)
    (root / "README.md").write_text("seed\n")
    subprocess.run(["git", "-C", str(root), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(root), "commit", "-qm", "seed"], check=True)

    import pipeline_log
    importlib.reload(pipeline_log)
    monkeypatch.setattr(pipeline_log, "ROOT", root)
    monkeypatch.setattr(pipeline_log, "RUNS", root / "runs")

    import agent_log
    importlib.reload(agent_log)
    monkeypatch.setattr(agent_log, "ROOT", root)
    monkeypatch.setattr(agent_log.pipeline_log, "ROOT", root)
    monkeypatch.setattr(agent_log.pipeline_log, "RUNS", root / "runs")

    run_dir = root / "runs" / "20260901-120000-test-slug"
    run_dir.mkdir(parents=True)
    (run_dir / "mono_start").write_text(repr(time.monotonic()))
    (root / "runs" / ".current").write_text(run_dir.name)
    monkeypatch.setenv("SV_RUN_ID", run_dir.name)
    monkeypatch.setenv("SV_RUN_DIR", str(run_dir))

    return {"root": root, "run_dir": run_dir, "agent_log": agent_log,
            "pipeline_log": pipeline_log}


def last_json(out: str) -> dict:
    """Последний JSON-объект в stdout.

    Команды печатают несколько объектов подряд (например `close` сначала
    показывает закрытие лизы, потом итог слияния) — тесту нужен итоговый.
    """
    decoder = json.JSONDecoder()
    idx, last = 0, {}
    text = out.strip()
    while idx < len(text):
        while idx < len(text) and text[idx] in " \n\r\t":
            idx += 1
        if idx >= len(text):
            break
        try:
            obj, end = decoder.raw_decode(text, idx)
        except ValueError:
            break
        last, idx = obj, end
    return last


def events(run_dir: Path) -> list[dict]:
    path = run_dir / "events.jsonl"
    if not path.is_file():
        return []
    return [json.loads(x) for x in path.read_text().splitlines() if x.strip()]


# ---------------------------------------------------------------------------
# Реестр делегирования
# ---------------------------------------------------------------------------

def test_first_claim_is_granted(sandbox, capsys):
    al = sandbox["agent_log"]
    rc = al.main(["delegate-claim", "--task-id", "scriptwriter:test-slug",
                  "--role", "scriptwriter", "--agent-id", "w1",
                  "--reason", "нужен драфт"])
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    assert out["granted"] is True and out["agent_id"] == "w1"


def test_duplicate_delegation_is_structurally_denied(sandbox, capsys):
    """Сценарий инцидента: второй и третий делегат на ту же задачу."""
    al = sandbox["agent_log"]
    assert al.main(["delegate-claim", "--task-id", "scriptwriter:test-slug",
                    "--role", "scriptwriter", "--agent-id", "w1"]) == 0
    capsys.readouterr()

    for dup in ("w2", "w3"):
        rc = al.main(["delegate-claim", "--task-id", "scriptwriter:test-slug",
                      "--role", "scriptwriter", "--agent-id", dup])
        out = json.loads(capsys.readouterr().out)
        assert rc == 4, f"{dup} не должен был получить задачу"
        assert out["granted"] is False
        assert out["held_by"] == "w1"

    kinds = [e["kind"] for e in events(sandbox["run_dir"])]
    assert kinds.count("delegation_denied") == 2, \
        "оба дублирующих делегирования обязаны остаться в журнале"


def test_different_tasks_may_run_in_parallel(sandbox, capsys):
    """Осознанная параллельность разрешена — запрещено только дублирование."""
    al = sandbox["agent_log"]
    assert al.main(["delegate-claim", "--task-id", "research:a", "--role", "researcher",
                    "--agent-id", "r1", "--parallel-group", "shazam"]) == 0
    assert al.main(["delegate-claim", "--task-id", "research:b", "--role", "researcher",
                    "--agent-id", "r2", "--parallel-group", "shazam"]) == 0
    capsys.readouterr()


def test_released_task_can_be_reclaimed(sandbox, capsys):
    al = sandbox["agent_log"]
    al.main(["delegate-claim", "--task-id", "t:1", "--role", "scriptwriter",
             "--agent-id", "w1"])
    al.main(["delegate-release", "--agent-id", "w1", "--status", "failed",
             "--note", "не справился"])
    capsys.readouterr()
    rc = al.main(["delegate-claim", "--task-id", "t:1", "--role", "scriptwriter",
                  "--agent-id", "w2"])
    out = json.loads(capsys.readouterr().out)
    assert rc == 0 and out["attempt"] == 2, \
        "после честного закрытия лизы повтор разрешён и считается попыткой №2"


def test_expired_lease_frees_the_task(sandbox, capsys):
    al = sandbox["agent_log"]
    al.main(["delegate-claim", "--task-id", "t:1", "--role", "scriptwriter",
             "--agent-id", "w1", "--lease-sec", "0"])
    capsys.readouterr()
    time.sleep(0.01)
    assert al.main(["delegate-claim", "--task-id", "t:1", "--role", "scriptwriter",
                    "--agent-id", "w2"]) == 0
    capsys.readouterr()
    kinds = [e["kind"] for e in events(sandbox["run_dir"])]
    assert "delegation_release" in kinds, "истёкшая лиза обязана быть отмечена в журнале"


def test_claim_is_atomic_across_processes(sandbox):
    """Реестр под flock: одновременные попытки из разных процессов.

    Именно этот случай текстовый запрет в промпте закрыть не может в принципе.
    """
    root = sandbox["root"]
    script = TOOLS / "agent_log.py"
    env = {**os.environ, "SV_RUN_ID": sandbox["run_dir"].name,
           "SV_RUN_DIR": str(sandbox["run_dir"]), "PYTHONPATH": str(TOOLS)}
    # Подменяем корень так, чтобы дочерние процессы писали в песочницу.
    shim = root / "tools" / "run_claim.py"
    shim.write_text(
        "import sys, pathlib\n"
        f"sys.path.insert(0, {str(TOOLS)!r})\n"
        "import pipeline_log, agent_log\n"
        f"pipeline_log.ROOT = pathlib.Path({str(root)!r})\n"
        f"pipeline_log.RUNS = pathlib.Path({str(root / 'runs')!r})\n"
        "raise SystemExit(agent_log.main(sys.argv[1:]))\n"
    )
    procs = [
        subprocess.Popen([sys.executable, str(shim), "delegate-claim",
                          "--task-id", "scriptwriter:race", "--role", "scriptwriter",
                          "--agent-id", f"w{i}"],
                         env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        for i in range(5)
    ]
    codes = [p.wait() for p in procs]
    assert codes.count(0) == 1, f"ровно один процесс должен победить, коды: {codes}"
    assert codes.count(4) == 4, f"остальные обязаны получить отказ, коды: {codes}"
    assert script.is_file()


# ---------------------------------------------------------------------------
# Детектор опасных действий в сессиях Codex
# ---------------------------------------------------------------------------

def _exec_input(cmd: str) -> str:
    """Реалистичная форма payload.input: code-mode Codex не зовёт shell
    напрямую, модель пишет JS, которая сама вызывает tools.exec_command({cmd:
    ..., ...}). Детектор обязан искать danger-паттерны именно внутри cmd:"...",
    а не в input целиком — см. CMD_LITERAL_RE и её комментарий."""
    return f'const r = await tools.exec_command({{cmd:{json.dumps(cmd)},workdir:"/x"}}); text(r.output);'


@pytest.mark.parametrize("cmd,expected", [
    ("git stash push --include-untracked --message 'x'", "git_stash_untracked"),
    ("git stash -u", "git_stash_untracked"),
    ("git stash save --all", "git_stash_untracked"),
    ("git reset --hard HEAD", "git_reset_hard"),
    ("git clean -fdx", "git_clean"),
    ("kill 990705 990700", "process_kill"),
    ("kill -TERM -- -990719", "process_kill"),
    ("pkill -TERM -s 990680", "process_kill"),
    ("git push --force origin main", "git_force_push"),
])
def test_dangerous_commands_are_detected(cmd, expected):
    import codex_session_import as csi
    actions = [{"kind": "tool_call", "ts": "2026-08-31T16:00:00Z", "input": _exec_input(cmd)}]
    found = csi.detect_dangers(actions)
    assert expected in [f["anomaly_kind"] for f in found], f"{cmd!r} не пойман"


@pytest.mark.parametrize("cmd", [
    "git stash list --date=iso",
    "git stash show --include-untracked --stat stash@{0}",
    "git stash apply stash@{0}",
    "git stash pop",
    "git status --short",
    "git reset --soft HEAD~1",
    "git push --force-with-lease origin feature",
    "rg -i 'kill' notes.md",
])
def test_safe_commands_are_not_flagged(cmd):
    """Ложная тревога обесценивает настоящую — читатель перестаёт им верить."""
    import codex_session_import as csi
    actions = [{"kind": "tool_call", "ts": "2026-08-31T16:00:00Z", "input": _exec_input(cmd)}]
    assert csi.detect_dangers(actions) == [], f"{cmd!r} ошибочно помечен опасным"


def test_prompt_text_mentioning_dangerous_commands_is_not_flagged():
    """Инцидент 2026-09-01: промпт делегирования (tools/producer_scheduler.py::
    build_prompt) сам ЦИТИРУЕТ команды инцидента, объясняя делегату, что они
    запрещены. Детектор ловил эту цитату как будто делегат её выполнил — один
    custom_tool_call нередко несёт и реальный cmd:"...", и рядом свободный
    текст промпта для суб-делегата (tools.mcp__codex__codex({prompt: "..."})).
    Danger-паттерны обязаны смотреть только внутрь cmd:"...", не в prompt."""
    import codex_session_import as csi
    blob = (
        'const dict = await tools.exec_command({cmd:"sed -n \'1,10p\' README.md",workdir:"/x"});\n'
        'const prompt = `ДЕЛЕГАТУ ЗАПРЕЩЕНО: git stash push --include-untracked, '
        'git reset --hard, git clean, kill -TERM -- -990719`;\n'
        'const res = await tools.mcp__codex__codex({cwd:"/x",prompt:prompt});'
    )
    actions = [{"kind": "tool_call", "ts": "2026-09-01T08:00:00Z", "input": blob}]
    assert csi.detect_dangers(actions) == []


def test_normalize_extracts_tool_calls_and_messages(tmp_path):
    import codex_session_import as csi
    path = tmp_path / "rollout-x.jsonl"
    path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in [
        {"type": "session_meta", "payload": {"session_id": "s1", "source": "mcp",
                                             "cwd": "/repo", "timestamp": "2026-08-31T16:00:00Z"}},
        {"type": "response_item", "timestamp": "2026-08-31T16:01:00Z",
         "payload": {"type": "custom_tool_call", "name": "exec",
                     "input": 'const r = await tools.exec_command({cmd: "git status"});',
                     "call_id": "c1"}},
        {"type": "event_msg", "timestamp": "2026-08-31T16:02:00Z",
         "payload": {"type": "agent_message", "message": "начинаю работу"}},
        {"type": "response_item", "timestamp": "2026-08-31T16:03:00Z",
         "payload": {"type": "reasoning", "summary": [], "encrypted_content": "xxx"}},
    ]) + "\n"
        # Недописанная последняя строка — обычное состояние rollout-файла
        # живого или убитого делегата, импорт обязан её пережить.
        + '{"type": "response_item", "payl')
    actions = csi.normalize(path)
    kinds = [a["kind"] for a in actions]
    assert kinds == ["tool_call", "agent_message", "reasoning"]
    assert actions[2]["available"] is False, \
        "зашифрованное размышление обязано быть помечено как недоступное"
    meta = csi.session_meta(path)
    assert meta["source"] == "mcp"


def test_import_preserves_original_anomaly_timestamp(sandbox):
    """Инцидент 2026-09-01: append_event() по умолчанию ставит now_iso() —
    верно для этапов конвейера (append_event зовётся сразу), но импорт сессий
    почти всегда идёт постфактум. Без явного "ts" в fields сводка "Что пошло
    не так" в рассказе показывала все аномалии временем самого импорта, а не
    временем, когда делегат реально это выполнил."""
    import codex_session_import as csi
    importlib.reload(csi)
    root = sandbox["root"]
    csi.pipeline_log.ROOT = root
    csi.pipeline_log.RUNS = root / "runs"
    csi.ROOT = root

    original_ts = "2026-09-01T05:03:00.178Z"
    sessions_dir = sandbox["root"].parent / "codex-sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    rollout = sessions_dir / "rollout-x.jsonl"
    rollout.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in [
        {"type": "session_meta", "payload": {"session_id": "s1", "source": "exec",
                                             "cwd": str(sandbox["root"]), "timestamp": original_ts}},
        {"type": "response_item", "timestamp": original_ts,
         "payload": {"type": "custom_tool_call", "name": "exec",
                     "input": 'const r = await tools.exec_command({cmd: "git reset --hard HEAD"});',
                     "call_id": "c1"}},
    ]) + "\n")

    # Явный --since/--until вместо запасного окна "сейчас минус 6 часов":
    # без events.jsonl с run_start в этом сэндбоксе run_window() всё равно
    # падает на этот фолбэк, а он зависит от реального времени часов —
    # фиксированный original_ts рано или поздно вываливается за его край.
    code = csi.main(["import", "--run-id", sandbox["run_dir"].name,
                     "--sessions-dir", str(sessions_dir),
                     "--since", "2026-09-01T00:00:00Z",
                     "--until", "2026-09-01T23:59:59Z"])
    assert code == 0

    events = [json.loads(line) for line in
              (sandbox["run_dir"] / "events.jsonl").read_text().splitlines()]
    anomalies = [e for e in events if e.get("kind") == "anomaly"]
    assert len(anomalies) == 1
    assert anomalies[0]["ts"] == original_ts, (
        f"ожидали время самой команды ({original_ts}), получили время импорта "
        f"({anomalies[0]['ts']})"
    )


# ---------------------------------------------------------------------------
# Рассказ
# ---------------------------------------------------------------------------

def test_story_reports_unclosed_run_and_denials(sandbox, monkeypatch, capsys):
    al = sandbox["agent_log"]
    al.main(["delegate-claim", "--task-id", "scriptwriter:test-slug",
             "--role", "scriptwriter", "--agent-id", "w1", "--reason", "нужен драфт"])
    al.main(["delegate-claim", "--task-id", "scriptwriter:test-slug",
             "--role", "scriptwriter", "--agent-id", "w2"])
    capsys.readouterr()

    import episode_story
    importlib.reload(episode_story)
    monkeypatch.setattr(episode_story, "ROOT", sandbox["root"])
    monkeypatch.setattr(episode_story, "RUNS", sandbox["root"] / "runs")

    text = episode_story.RunStory(sandbox["run_dir"]).render()
    assert "Прогон не был закрыт штатно" in text
    assert "w1" in text and "нужен драфт" in text
    assert "отклонена" in text, "отказ реестра обязан попасть в рассказ"


def test_story_brief_forbids_invention(sandbox, monkeypatch):
    import episode_story
    importlib.reload(episode_story)
    monkeypatch.setattr(episode_story, "RUNS", sandbox["root"] / "runs")
    brief = episode_story.RunStory(sandbox["run_dir"]).brief()
    assert "не добавляй ни одного факта" in brief.lower()


def test_shell_of_unwraps_codex_tool_call():
    import episode_story
    wrapped = 'const r = await tools.exec_command({\n  cmd: "git stash push -u",\n  workdir: "/x"\n});'
    assert episode_story.shell_of(wrapped) == "git stash push -u"


def test_detail_flag_shows_everything_default_truncates(sandbox):
    """Запрос оператора 2026-09-01: по умолчанию рассказ обрезает середину
    (первые 6 реплик / 12 команд) — удобно для быстрого чтения, но теряет
    детали. --detail обязан показывать всё."""
    import episode_story
    importlib.reload(episode_story)
    run_dir = sandbox["run_dir"]
    agents_dir = run_dir / "agents" / "s1"
    agents_dir.mkdir(parents=True)
    (run_dir / "agents" / "index.json").write_text(json.dumps({"sessions": [
        {"session_id": "s1", "is_delegate": True, "source": "mcp",
         "cwd": "/x", "started_at": "2026-09-01T08:00:00Z",
         "actions_total": 30, "tool_calls": 20, "agent_messages": 10,
         "reasoning_items": 0},
    ]}))
    actions = []
    for i in range(10):
        actions.append({"kind": "agent_message", "ts": f"2026-09-01T08:{i:02d}:00Z",
                        "text": f"реплика номер {i}"})
    for i in range(20):
        actions.append({"kind": "tool_call", "ts": f"2026-09-01T08:{i:02d}:30Z",
                        "input": f'tools.exec_command({{cmd:"echo command-{i}"}})'})
    (agents_dir / "actions.jsonl").write_text(
        "\n".join(json.dumps(a, ensure_ascii=False) for a in actions) + "\n")

    plain = episode_story.RunStory(run_dir, detail=False).render()
    detailed = episode_story.RunStory(run_dir, detail=True).render()

    assert "реплика номер 0" in plain and "реплика номер 9" not in plain
    assert "и ещё 4 реплик" in plain
    assert "echo command-0" in plain and "echo command-19" in plain  # head+tail
    assert "echo command-9" not in plain  # где-то в середине, обрезано
    assert "… ещё" in plain

    for i in range(10):
        assert f"реплика номер {i}" in detailed
    for i in range(20):
        assert f"echo command-{i}" in detailed
    assert "… ещё" not in detailed
    assert "и ещё" not in detailed


def test_detail_flag_shows_full_commands_outputs_and_plans(sandbox):
    """Запрос оператора 2026-09-01: --detail был реализован, но у него ещё три
    потолка — многострочные команды обрезались до первой строки, вывод команд
    вообще не показывался ни в каком режиме, update_plan тонул в списке команд
    как обрезанная JS-строка вместо осмысленного текста. Все три убраны в
    detailed_actions()/plan_of() — этот тест их фиксирует."""
    import episode_story
    importlib.reload(episode_story)
    run_dir = sandbox["run_dir"]
    agents_dir = run_dir / "agents" / "s1"
    agents_dir.mkdir(parents=True)
    (run_dir / "agents" / "index.json").write_text(json.dumps({"sessions": [
        {"session_id": "s1", "is_delegate": True, "source": "mcp",
         "cwd": "/x", "started_at": "2026-09-01T08:00:00Z",
         "actions_total": 3, "tool_calls": 2, "agent_messages": 0,
         "reasoning_items": 0},
    ]}))
    actions = [
        {"kind": "tool_call", "ts": "2026-09-01T08:00:00Z", "call_id": "c1",
         "input": 'await tools.exec_command({cmd:"printf line-one\\nline-two\\n; git status", workdir:"."})'},
        {"kind": "tool_result", "call_id": "c1",
         "output_head": "line-one\nline-two\nOn branch master, clean"},
        {"kind": "tool_call", "ts": "2026-09-01T08:01:00Z", "call_id": "c2",
         "input": 'await tools.update_plan({explanation:"Сначала собрать данные, потом обработать их", plan:[]})'},
    ]
    (agents_dir / "actions.jsonl").write_text(
        "\n".join(json.dumps(a, ensure_ascii=False) for a in actions) + "\n")

    plain = episode_story.RunStory(run_dir, detail=False).render()
    detailed = episode_story.RunStory(run_dir, detail=True).render()

    # По умолчанию — только первая строка команды, вывод не показан, план
    # тонет в общем списке как сырая JS-строка, а не осмысленный текст.
    assert "printf line-one" in plain
    assert "line-two" not in plain
    assert "On branch master" not in plain
    assert "[план]" not in plain

    # В --detail: команда целиком, её вывод, и план вслух отдельной строкой.
    assert "printf line-one" in detailed and "line-two" in detailed
    assert "git status" in detailed
    assert "On branch master, clean" in detailed
    assert "[план] Сначала собрать данные, потом обработать их" in detailed


# ---------------------------------------------------------------------------
# Изоляция в worktree
# ---------------------------------------------------------------------------

def test_worktree_open_close_merges_only_allowed_paths(sandbox, monkeypatch, capsys):
    import delegate_worktree as dw
    importlib.reload(dw)
    monkeypatch.setattr(dw, "ROOT", sandbox["root"])
    monkeypatch.setattr(dw.pipeline_log, "ROOT", sandbox["root"])
    monkeypatch.setattr(dw.pipeline_log, "RUNS", sandbox["root"] / "runs")
    monkeypatch.setattr(dw.agent_log.pipeline_log, "ROOT", sandbox["root"])
    monkeypatch.setattr(dw.agent_log.pipeline_log, "RUNS", sandbox["root"] / "runs")
    monkeypatch.setattr(dw, "WORKTREES_ROOT", sandbox["root"].parent / "wt")
    monkeypatch.setattr(dw, "ALLOC_LOCK", sandbox["root"].parent / "wt.lock")

    assert dw.main(["open", "--task-id", "scriptwriter:test-slug",
                    "--role", "scriptwriter", "--agent-id", "w1"]) == 0
    capsys.readouterr()
    wt = sandbox["root"].parent / "wt" / sandbox["run_dir"].name / "w1"
    assert wt.is_dir(), "worktree делегата должен быть создан"

    (wt / "draft.json").write_text('{"ok":true}')
    rc = dw.main(["close", "--agent-id", "w1", "--allow", "draft.json"])
    capsys.readouterr()
    assert rc == 0
    assert (sandbox["root"] / "draft.json").read_text() == '{"ok":true}', \
        "разрешённый результат обязан быть влит в основное дерево"


def test_worktree_rejects_paths_outside_allowlist(sandbox, monkeypatch, capsys):
    """Делегат тронул чужой файл — не вливаем ничего и не удаляем его работу."""
    import delegate_worktree as dw
    importlib.reload(dw)
    monkeypatch.setattr(dw, "ROOT", sandbox["root"])
    monkeypatch.setattr(dw.pipeline_log, "ROOT", sandbox["root"])
    monkeypatch.setattr(dw.pipeline_log, "RUNS", sandbox["root"] / "runs")
    monkeypatch.setattr(dw.agent_log.pipeline_log, "ROOT", sandbox["root"])
    monkeypatch.setattr(dw.agent_log.pipeline_log, "RUNS", sandbox["root"] / "runs")
    monkeypatch.setattr(dw, "WORKTREES_ROOT", sandbox["root"].parent / "wt2")
    monkeypatch.setattr(dw, "ALLOC_LOCK", sandbox["root"].parent / "wt2.lock")

    dw.main(["open", "--task-id", "t:1", "--role", "scriptwriter", "--agent-id", "w1"])
    capsys.readouterr()
    wt = sandbox["root"].parent / "wt2" / sandbox["run_dir"].name / "w1"
    (wt / "draft.json").write_text("{}")
    (wt / "tools").mkdir(exist_ok=True)
    (wt / "tools" / "pipeline_log.py").write_text("# подменён делегатом")

    rc = dw.main(["close", "--agent-id", "w1", "--allow", "draft.json"])
    out = last_json(capsys.readouterr().out)
    assert rc == 6
    assert out["merged"] is False
    assert "tools/pipeline_log.py" in out["violations"]
    assert not (sandbox["root"] / "draft.json").exists(), \
        "при нарушении allowlist не вливается НИЧЕГО, даже разрешённое"
    assert wt.is_dir(), "работа делегата не должна молча уничтожаться"


def test_worktree_open_denied_when_task_already_claimed(sandbox, monkeypatch, capsys):
    import delegate_worktree as dw
    importlib.reload(dw)
    monkeypatch.setattr(dw, "ROOT", sandbox["root"])
    monkeypatch.setattr(dw.pipeline_log, "ROOT", sandbox["root"])
    monkeypatch.setattr(dw.pipeline_log, "RUNS", sandbox["root"] / "runs")
    monkeypatch.setattr(dw.agent_log.pipeline_log, "ROOT", sandbox["root"])
    monkeypatch.setattr(dw.agent_log.pipeline_log, "RUNS", sandbox["root"] / "runs")
    monkeypatch.setattr(dw, "WORKTREES_ROOT", sandbox["root"].parent / "wt3")
    monkeypatch.setattr(dw, "ALLOC_LOCK", sandbox["root"].parent / "wt3.lock")

    assert dw.main(["open", "--task-id", "t:x", "--role", "scriptwriter",
                    "--agent-id", "w1"]) == 0
    capsys.readouterr()
    assert dw.main(["open", "--task-id", "t:x", "--role", "scriptwriter",
                    "--agent-id", "w2"]) == 4
    capsys.readouterr()
    wt2 = sandbox["root"].parent / "wt3" / sandbox["run_dir"].name / "w2"
    assert not wt2.exists(), \
        "при отказе реестра worktree не создаётся вовсе — ни каталога, ни мусора"

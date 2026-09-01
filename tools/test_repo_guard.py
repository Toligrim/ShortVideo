#!/usr/bin/env python3
"""Тесты tools/repo_guard.py.

    python3 -m pytest tools/test_repo_guard.py -q
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))


@pytest.fixture()
def repo(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    root.mkdir()
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    subprocess.run(["git", "-C", str(root), "config", "user.email", "t@t"], check=True)
    subprocess.run(["git", "-C", str(root), "config", "user.name", "t"], check=True)
    (root / "README.md").write_text("seed\n")
    subprocess.run(["git", "-C", str(root), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(root), "commit", "-qm", "seed"], check=True)

    import repo_guard
    monkeypatch.setattr(repo_guard, "ROOT", root)
    return root


def test_clean_repo_exits_zero(repo, capsys):
    import repo_guard
    code = repo_guard.main(["check"])
    assert code == 0
    assert "чисто" in capsys.readouterr().err


def test_untracked_level_a_file_is_flagged(repo, capsys):
    import repo_guard
    (repo / "tools").mkdir()
    (repo / "tools" / "pipeline_log.py").write_text("# critical\n")
    code = repo_guard.main(["check"])
    assert code == 1
    assert "tools/pipeline_log.py" in capsys.readouterr().err


def test_untracked_level_b_or_c_is_not_flagged(repo):
    """Видео/аудио (уровень B, идут в R2) и node_modules (уровень C,
    воспроизводим) — не забота этой проверки."""
    import repo_guard
    (repo / "video" / "out").mkdir(parents=True)
    (repo / "video" / "out" / "ep.mp4").write_bytes(b"\x00")
    (repo / "node_modules").mkdir()
    (repo / "node_modules" / "x.js").write_text("x")
    assert repo_guard.main(["check"]) == 0


def test_rollout_jsonl_is_never_flagged_even_though_it_ends_in_jsonl(repo, monkeypatch):
    """rollout.jsonl несёт сырые транскрипты (потенциальные секреты, §4.8) —
    уже в .gitignore, но repo_guard не должен полагаться только на это:
    если .gitignore когда-нибудь сломают, проверка не обязана молчать об
    этом конкретном файле сама по себе (её дело — untracked-файлы, которые
    git status вообще показывает; ignored-файлы git status не показывает)."""
    import repo_guard
    d = repo / "runs" / "20260901-000000-x" / "agents" / "s1"
    d.mkdir(parents=True)
    (d / "rollout.jsonl").write_text('{"secret": "x"}\n')
    (repo / ".gitignore").write_text("runs/*/agents/*/rollout.jsonl\n")
    subprocess.run(["git", "-C", str(repo), "add", ".gitignore"], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-qm", "gitignore"], check=True)
    assert repo_guard.main(["check"]) == 0


def test_warn_only_never_fails(repo):
    import repo_guard
    (repo / "docs").mkdir()
    (repo / "docs" / "plan.md").write_text("x")
    assert repo_guard.main(["check", "--warn-only"]) == 0


def test_json_output_lists_violations(repo, capsys):
    import repo_guard
    import json
    (repo / "corrections").mkdir()
    (repo / "corrections" / "note.md").write_text("x")
    repo_guard.main(["check", "--json"])
    out = json.loads(capsys.readouterr().out)
    assert out["clean"] is False
    assert "corrections/note.md" in out["violations"]


@pytest.mark.parametrize("rel_path,expected", [
    ("tools/pipeline_log.py", True),
    ("video/src/scenes/Foo.tsx", True),
    (".claude/skills/produce/SKILL.md", True),
    ("schema/scenes.schema.json", True),
    ("corrections/x/REPORT.md", True),
    ("docs/plan.md", True),
    ("deploy/systemd/x.service", True),
    ("episodes/auto-1.json", True),
    ("episodes/auto-1.metadata.json", True),
    ("episodes/drafts/auto-1.draft.json", True),
    ("runs/x/events.jsonl", True),
    ("runs/x/manifest.json", True),
    ("runs/x/STORY.md", True),
    ("runs/x/agents/s1/actions.jsonl", True),
    ("runs/x/agents/s1/session.json", True),
    ("runs/x/agents/index.json", True),
    ("runs/x/delegations.json", True),
    ("video/out/ep.mp4", False),
    ("video/public/episodes/x/audio/scene-0.mp3", False),
    ("node_modules/x/index.js", False),
    ("venv/lib/x.py", False),
    ("data/activity-ledger/events/_pending.jsonl", False),
    ("runs/x/cli-stderr.log", False),
    ("runs/x/agents/s1/rollout.jsonl", False),
])
def test_is_level_a_classification(rel_path, expected):
    import repo_guard
    assert repo_guard.is_level_a(rel_path) is expected, rel_path

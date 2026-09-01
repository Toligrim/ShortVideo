#!/usr/bin/env python3
"""Регрессии для безопасного сбора и слияния изменений worktree.

Запуск:
    python3 -m pytest tools/test_delegate_worktree.py -v

Каждый тест создаёт отдельный временный git-репозиторий. Production-файлы
не подменяются и не читаются через текстовые декодеры там, где проверяются
raw bytes.
"""
from __future__ import annotations

import importlib
import json
import subprocess
import sys
import time
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))


def run_git(cwd: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(["git", "-C", str(cwd), *args],
                          check=check, capture_output=True)


def commit_all(root: Path, message: str) -> None:
    run_git(root, "add", "-A")
    run_git(root, "commit", "-qm", message)


def set_base_file(sandbox: dict, rel: str, content: bytes | None) -> None:
    path = sandbox["root"] / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if content is None:
        if path.exists() or path.is_symlink():
            path.unlink()
    else:
        path.write_bytes(content)
    commit_all(sandbox["root"], f"base {rel}")


def head(root: Path) -> str:
    return run_git(root, "rev-parse", "HEAD").stdout.decode().strip()


def status_raw(dw, root: Path, *paths: str) -> bytes:
    return dw.git_raw(["status", "--porcelain=v1", "-z",
                       "--untracked-files=all", "--", *paths], cwd=root)


def last_json(output: str) -> dict:
    """Извлечь последний JSON из stdout claim/release и самой команды."""
    decoder = json.JSONDecoder()
    index = 0
    result: dict = {}
    while index < len(output):
        while index < len(output) and output[index] in " \n\r\t":
            index += 1
        if index >= len(output):
            break
        try:
            value, end = decoder.raw_decode(output, index)
        except ValueError:
            break
        if isinstance(value, dict):
            result = value
        index = end
    return result


@pytest.fixture()
def sandbox(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict:
    root = tmp_path / "repo"
    root.mkdir()
    run_git(root, "init", "-q")
    run_git(root, "config", "user.email", "delegate-tests@example.invalid")
    run_git(root, "config", "user.name", "delegate tests")
    # Журнал тестовой песочницы не должен становиться untracked-изменением
    # самого репозитория при проверках changed_paths.
    (root / ".gitignore").write_text("runs/\n")
    (root / "README.md").write_bytes(b"seed\n")
    commit_all(root, "seed")

    import pipeline_log
    importlib.reload(pipeline_log)
    monkeypatch.setattr(pipeline_log, "ROOT", root)
    monkeypatch.setattr(pipeline_log, "RUNS", root / "runs")

    import agent_log
    importlib.reload(agent_log)
    monkeypatch.setattr(agent_log, "ROOT", root)
    monkeypatch.setattr(agent_log.pipeline_log, "ROOT", root)
    monkeypatch.setattr(agent_log.pipeline_log, "RUNS", root / "runs")

    import delegate_worktree
    importlib.reload(delegate_worktree)
    monkeypatch.setattr(delegate_worktree, "ROOT", root)
    monkeypatch.setattr(delegate_worktree.pipeline_log, "ROOT", root)
    monkeypatch.setattr(delegate_worktree.pipeline_log, "RUNS", root / "runs")
    monkeypatch.setattr(delegate_worktree.agent_log, "ROOT", root)
    monkeypatch.setattr(delegate_worktree.agent_log.pipeline_log, "ROOT", root)
    monkeypatch.setattr(delegate_worktree.agent_log.pipeline_log, "RUNS", root / "runs")

    run_dir = root / "runs" / "20260901-120000-delegate-tests"
    run_dir.mkdir(parents=True)
    (run_dir / "mono_start").write_text(repr(time.monotonic()))
    (root / "runs" / ".current").write_text(run_dir.name)
    monkeypatch.setenv("SV_RUN_ID", run_dir.name)
    monkeypatch.setenv("SV_RUN_DIR", str(run_dir))

    worktrees = tmp_path / "worktrees"
    monkeypatch.setattr(delegate_worktree, "WORKTREES_ROOT", worktrees)
    monkeypatch.setattr(delegate_worktree, "ALLOC_LOCK", tmp_path / "worktree.lock")
    return {"root": root, "run_dir": run_dir, "dw": delegate_worktree,
            "worktrees": worktrees}


def open_delegate(sandbox: dict, capsys: pytest.CaptureFixture[str], agent_id: str = "a1") -> Path:
    dw = sandbox["dw"]
    assert dw.main(["open", "--task-id", f"task:{agent_id}",
                    "--role", "tester", "--agent-id", agent_id]) == 0
    capsys.readouterr()
    return sandbox["worktrees"] / sandbox["run_dir"].name / agent_id


def close_delegate(
    sandbox: dict, capsys: pytest.CaptureFixture[str], agent_id: str,
    *allowed: str,
) -> tuple[int, dict, str]:
    rc = sandbox["dw"].main(["close", "--agent-id", agent_id,
                              *sum((["--allow", path] for path in allowed), [])])
    output = capsys.readouterr().out
    return rc, last_json(output), output


def remove_clean_worktree(sandbox: dict, wt: Path) -> None:
    """Убрать тестовый worktree после восстановления его чистого состояния."""
    if not wt.is_dir():
        return
    marker = wt / ".delegate-base"
    if marker.exists():
        marker.unlink()
    result = run_git(sandbox["root"], "worktree", "remove", str(wt), check=False)
    assert result.returncode == 0, result.stderr.decode(errors="replace")


def test_first_unstaged_status_record_keeps_leading_space(sandbox, capsys):
    set_base_file(sandbox, "alpha.json", b"base\n")
    (sandbox["root"] / "alpha.json").write_bytes(b"changed\n")

    raw = status_raw(sandbox["dw"], sandbox["root"], "alpha.json")
    assert raw == b" M alpha.json\0"
    tracked, untracked = sandbox["dw"].changed_paths(sandbox["root"], head(sandbox["root"]))
    assert tracked == {"alpha.json"}
    assert not untracked


def test_first_unstaged_delete_status_record_keeps_leading_space(sandbox):
    set_base_file(sandbox, "alpha.json", b"base\n")
    (sandbox["root"] / "alpha.json").unlink()

    raw = status_raw(sandbox["dw"], sandbox["root"], "alpha.json")
    assert raw == b" D alpha.json\0"
    tracked, untracked = sandbox["dw"].changed_paths(sandbox["root"], head(sandbox["root"]))
    assert tracked == {"alpha.json"}
    assert not untracked


def test_multiple_nul_delimited_status_records_are_preserved(sandbox):
    set_base_file(sandbox, "alpha.json", b"a\n")
    set_base_file(sandbox, "beta.json", b"b\n")
    root = sandbox["root"]
    (root / "alpha.json").write_bytes(b"changed\n")
    (root / "beta.json").unlink()
    (root / "gamma.json").write_bytes(b"new\n")

    raw = status_raw(sandbox["dw"], root, "alpha.json", "beta.json", "gamma.json")
    assert raw.split(b"\0")[:-1] == [
        b" M alpha.json", b" D beta.json", b"?? gamma.json",
    ]
    assert raw.count(b"\0") == 3
    tracked, untracked = sandbox["dw"].changed_paths(root, head(root))
    assert tracked == {"alpha.json", "beta.json"}
    assert untracked == {"gamma.json"}


def test_trailing_newline_in_base_is_not_a_false_conflict(sandbox, capsys):
    set_base_file(sandbox, "value.txt", b"v1\n")
    wt = open_delegate(sandbox, capsys)
    (wt / "value.txt").write_bytes(b"v2\n")

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "value.txt")
    assert rc == 0
    assert result["conflicts"] == []
    assert (sandbox["root"] / "value.txt").read_bytes() == b"v2\n"
    (wt / "value.txt").write_bytes(b"v1\n")
    remove_clean_worktree(sandbox, wt)


def test_multiple_trailing_newlines_are_compared_byte_for_byte(sandbox, capsys):
    set_base_file(sandbox, "value.txt", b"v1\n\n\n")
    wt = open_delegate(sandbox, capsys)
    (wt / "value.txt").write_bytes(b"v2\n\n\n\n")

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "value.txt")
    assert rc == 0
    assert result["conflicts"] == []
    assert (sandbox["root"] / "value.txt").read_bytes() == b"v2\n\n\n\n"
    (wt / "value.txt").write_bytes(b"v1\n\n\n")
    remove_clean_worktree(sandbox, wt)


def test_trailing_spaces_are_preserved_in_file_comparison(sandbox, capsys):
    set_base_file(sandbox, "value.txt", b"base   \n")
    wt = open_delegate(sandbox, capsys)
    (wt / "value.txt").write_bytes(b"delegate  \n")

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "value.txt")
    assert rc == 0
    assert result["conflicts"] == []
    assert (sandbox["root"] / "value.txt").read_bytes() == b"delegate  \n"
    (wt / "value.txt").write_bytes(b"base   \n")
    remove_clean_worktree(sandbox, wt)


def test_crlf_line_endings_are_preserved(sandbox, capsys):
    set_base_file(sandbox, "value.txt", b"one\r\ntwo\r\n")
    wt = open_delegate(sandbox, capsys)
    (wt / "value.txt").write_bytes(b"changed\r\nline\r\n")

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "value.txt")
    assert rc == 0
    assert result["conflicts"] == []
    assert (sandbox["root"] / "value.txt").read_bytes() == b"changed\r\nline\r\n"
    (wt / "value.txt").write_bytes(b"one\r\ntwo\r\n")
    remove_clean_worktree(sandbox, wt)


def test_binary_content_is_merged_without_text_decoding(sandbox, capsys):
    base_content = bytes(range(256)) + b"\x00\xff\x80"
    delegate_content = b"\x00\xffdelegate\x81\xfe\n\x00"
    set_base_file(sandbox, "payload.bin", base_content)
    wt = open_delegate(sandbox, capsys)
    (wt / "payload.bin").write_bytes(delegate_content)

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "payload.bin")
    assert rc == 0
    assert result["conflicts"] == []
    assert (sandbox["root"] / "payload.bin").read_bytes() == delegate_content
    (wt / "payload.bin").write_bytes(base_content)
    remove_clean_worktree(sandbox, wt)


def test_empty_base_file_is_distinct_from_missing_file(sandbox, capsys):
    set_base_file(sandbox, "empty.txt", b"")
    wt = open_delegate(sandbox, capsys)
    (wt / "empty.txt").write_bytes(b"delegate")
    # Если b"" ошибочно использовался как маркер отсутствия, это изменение
    # main прошло бы без конфликта.
    (sandbox["root"] / "empty.txt").write_bytes(b"main")

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "empty.txt")
    assert rc == 2
    assert result["conflicts"] == ["empty.txt"]
    assert (sandbox["root"] / "empty.txt").read_bytes() == b"main"
    (wt / "empty.txt").write_bytes(b"")
    remove_clean_worktree(sandbox, wt)


def test_new_delegate_file_absent_from_base_merges(sandbox, capsys):
    wt = open_delegate(sandbox, capsys)
    (wt / "new.json").write_bytes(b'{"new":true}\n')
    run_git(wt, "add", "--", "new.json")
    run_git(wt, "commit", "-qm", "delegate add")

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "new.json")
    assert rc == 0
    assert result["change_types"] == {"new.json": "add"}
    assert (sandbox["root"] / "new.json").read_bytes() == b'{"new":true}\n'
    remove_clean_worktree(sandbox, wt)


def test_main_modification_after_open_is_a_real_conflict(sandbox, capsys):
    set_base_file(sandbox, "value.txt", b"base\n")
    wt = open_delegate(sandbox, capsys)
    (wt / "value.txt").write_bytes(b"delegate\n")
    (sandbox["root"] / "value.txt").write_bytes(b"main\n")

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "value.txt")
    assert rc == 2
    assert result["conflicts"] == ["value.txt"]
    assert (sandbox["root"] / "value.txt").read_bytes() == b"main\n"
    (wt / "value.txt").write_bytes(b"base\n")
    remove_clean_worktree(sandbox, wt)


def test_main_deletion_after_open_is_a_real_conflict(sandbox, capsys):
    set_base_file(sandbox, "value.txt", b"base\n")
    wt = open_delegate(sandbox, capsys)
    (wt / "value.txt").write_bytes(b"delegate\n")
    (sandbox["root"] / "value.txt").unlink()

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "value.txt")
    assert rc == 2
    assert result["conflicts"] == ["value.txt"]
    assert not (sandbox["root"] / "value.txt").exists()
    (wt / "value.txt").write_bytes(b"base\n")
    remove_clean_worktree(sandbox, wt)


def test_main_creation_of_same_new_path_is_a_real_conflict(sandbox, capsys):
    wt = open_delegate(sandbox, capsys)
    (wt / "new.json").write_bytes(b"delegate\n")
    (sandbox["root"] / "new.json").write_bytes(b"main\n")

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "new.json")
    assert rc == 2
    assert result["conflicts"] == ["new.json"]
    assert (sandbox["root"] / "new.json").read_bytes() == b"main\n"
    (wt / "new.json").unlink()
    remove_clean_worktree(sandbox, wt)


def test_ordinary_allowed_modify_merges_successfully(sandbox, capsys):
    set_base_file(sandbox, "value.txt", b"base")
    wt = open_delegate(sandbox, capsys)
    (wt / "value.txt").write_bytes(b"delegate")

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "value.txt")
    assert rc == 0
    assert result["change_types"]["value.txt"] == "modify"
    assert (sandbox["root"] / "value.txt").read_bytes() == b"delegate"
    (wt / "value.txt").write_bytes(b"base")
    remove_clean_worktree(sandbox, wt)


def test_untracked_allowed_file_merges_successfully(sandbox, capsys):
    wt = open_delegate(sandbox, capsys)
    (wt / "draft.json").write_bytes(b"draft\n")

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "draft.json")
    assert rc == 0
    assert result["change_types"]["draft.json"] == "add"
    assert (sandbox["root"] / "draft.json").read_bytes() == b"draft\n"
    (wt / "draft.json").unlink()
    remove_clean_worktree(sandbox, wt)


def test_path_outside_allowlist_still_returns_path_violation(sandbox, capsys):
    wt = open_delegate(sandbox, capsys)
    (wt / "allowed.json").write_bytes(b"allowed")
    (wt / "secret.json").write_bytes(b"secret")

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "allowed.json")
    assert rc == 6
    assert result["reason"] == "path_violation"
    assert result["violations"] == ["secret.json"]
    assert not (sandbox["root"] / "allowed.json").exists()
    assert not (sandbox["root"] / "secret.json").exists()
    assert wt.is_dir()
    (wt / "allowed.json").unlink()
    (wt / "secret.json").unlink()
    remove_clean_worktree(sandbox, wt)


def test_nested_allowed_path_merges_successfully(sandbox, capsys):
    wt = open_delegate(sandbox, capsys)
    rel = "episodes/drafts/foo.json"
    (wt / rel).parent.mkdir(parents=True)
    (wt / rel).write_bytes(b'{"nested":true}\n')

    rc, result, _ = close_delegate(sandbox, capsys, "a1", rel)
    assert rc == 0
    assert result["paths"] == [rel]
    assert (sandbox["root"] / rel).read_bytes() == b'{"nested":true}\n'
    (wt / rel).unlink()
    remove_clean_worktree(sandbox, wt)


def test_nul_path_decoding_preserves_spaces_and_non_ascii(sandbox, capsys):
    rel = "episodes/файл с пробелом .json"
    set_base_file(sandbox, rel, b"base\n")
    wt = open_delegate(sandbox, capsys)
    (wt / rel).write_bytes(b"delegate\n")

    rc, result, _ = close_delegate(sandbox, capsys, "a1", rel)
    assert rc == 0
    assert result["paths"] == [rel]
    assert (sandbox["root"] / rel).read_bytes() == b"delegate\n"
    (wt / rel).write_bytes(b"base\n")
    remove_clean_worktree(sandbox, wt)


def test_delete_and_rename_are_explicitly_merged_as_delete_plus_add(sandbox, capsys):
    set_base_file(sandbox, "delete.txt", b"delete\n")
    set_base_file(sandbox, "old.txt", b"rename\n")
    wt = open_delegate(sandbox, capsys)
    (wt / "delete.txt").unlink()
    (wt / "old.txt").rename(wt / "new.txt")

    rc, result, _ = close_delegate(
        sandbox, capsys, "a1", "delete.txt", "old.txt", "new.txt",
    )
    assert rc == 0
    assert result["change_types"] == {
        "delete.txt": "delete", "new.txt": "add", "old.txt": "delete",
    }
    assert not (sandbox["root"] / "delete.txt").exists()
    assert not (sandbox["root"] / "old.txt").exists()
    assert (sandbox["root"] / "new.txt").read_bytes() == b"rename\n"
    (wt / "delete.txt").write_bytes(b"delete\n")
    (wt / "old.txt").write_bytes(b"rename\n")
    (wt / "new.txt").unlink()
    remove_clean_worktree(sandbox, wt)


def test_symlink_change_returns_machine_readable_unsupported_error(sandbox, capsys):
    wt = open_delegate(sandbox, capsys)
    (wt / "link.txt").symlink_to("README.md")

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "link.txt")
    assert rc == 2
    assert result["error"] == "worktree_unsupported_change_type"
    assert result["reason"] == "worktree_unsupported_change_type"
    assert result["unsupported"] == [{
        "path": "link.txt", "type": "symlink", "change_type": "symlink",
    }]
    assert not (sandbox["root"] / "link.txt").exists()
    assert wt.is_dir()
    (wt / "link.txt").unlink()
    remove_clean_worktree(sandbox, wt)

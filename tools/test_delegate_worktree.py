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
import shutil
import subprocess
import sys
import threading
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
    monkeypatch.setattr(delegate_worktree, "INTEGRATION_LOCK", tmp_path / "integration.lock")
    return {"root": root, "run_dir": run_dir, "dw": delegate_worktree,
            "worktrees": worktrees}


def open_delegate(
    sandbox: dict,
    capsys: pytest.CaptureFixture[str],
    agent_id: str = "a1",
    task_id: str | None = None,
) -> Path:
    dw = sandbox["dw"]
    assert dw.main(["open", "--task-id", task_id or f"task:{agent_id}",
                    "--role", "tester", "--agent-id", agent_id]) == 0
    capsys.readouterr()
    return sandbox["worktrees"] / sandbox["run_dir"].name / agent_id


def index_bytes(dw, root: Path) -> bytes:
    path = Path(dw.git(["rev-parse", "--git-path", "index"], cwd=root))
    if not path.is_absolute():
        path = root / path
    return path.read_bytes()


def set_claim(sandbox: dict, agent_id: str, **updates: object) -> None:
    path = sandbox["run_dir"] / "delegations.json"
    registry = json.loads(path.read_text(encoding="utf-8"))
    registry["claims"][agent_id].update(updates)
    path.write_text(json.dumps(registry, indent=1), encoding="utf-8")


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
    if marker.exists() or marker.is_symlink():
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


def _assert_conflict_does_not_partially_merge(
    sandbox: dict, capsys, clean_path: str, conflict_path: str,
) -> None:
    set_base_file(sandbox, clean_path, b"clean-base\n")
    set_base_file(sandbox, conflict_path, b"conflict-base\n")
    wt = open_delegate(sandbox, capsys)
    (wt / clean_path).write_bytes(b"clean-delegate\n")
    (wt / conflict_path).write_bytes(b"conflict-delegate\n")
    (sandbox["root"] / conflict_path).write_bytes(b"main-wins\n")

    dw = sandbox["dw"]
    root = sandbox["root"]
    before_head = head(root)
    before_index = index_bytes(dw, root)
    before_status = status_raw(dw, root, clean_path, conflict_path)

    rc, result, _ = close_delegate(
        sandbox, capsys, "a1", clean_path, conflict_path,
    )
    assert rc == 2
    assert result["merged"] is False
    assert result["paths"] == []
    assert result["conflicts"] == [conflict_path]
    assert (root / clean_path).read_bytes() == b"clean-base\n"
    assert (root / conflict_path).read_bytes() == b"main-wins\n"
    assert head(root) == before_head
    assert index_bytes(dw, root) == before_index
    assert status_raw(dw, root, clean_path, conflict_path) == before_status
    assert wt.is_dir()

    (wt / clean_path).write_bytes(b"clean-base\n")
    (wt / conflict_path).write_bytes(b"conflict-base\n")
    remove_clean_worktree(sandbox, wt)


def test_conflict_does_not_partially_merge_when_clean_path_sorts_first(sandbox, capsys):
    _assert_conflict_does_not_partially_merge(
        sandbox, capsys, "a-clean.txt", "b-conflict.txt",
    )


def test_conflict_does_not_partially_merge_when_conflict_path_sorts_first(sandbox, capsys):
    _assert_conflict_does_not_partially_merge(
        sandbox, capsys, "b-clean.txt", "a-conflict.txt",
    )


def test_commit_failure_restores_root_and_index_and_keeps_worktree(
    sandbox, capsys, monkeypatch,
):
    set_base_file(sandbox, "value.txt", b"base\n")
    set_base_file(sandbox, "already-staged.txt", b"old\n")
    root = sandbox["root"]
    dw = sandbox["dw"]
    (root / "already-staged.txt").write_bytes(b"staged-before\n")
    run_git(root, "add", "--", "already-staged.txt")
    wt = open_delegate(sandbox, capsys)
    (wt / "value.txt").write_bytes(b"delegate\n")

    before_index = index_bytes(dw, root)
    before_status = status_raw(dw, root, "value.txt", "already-staged.txt")
    original_run = dw.subprocess.run

    def fail_commit(command, *args, **kwargs):
        if len(command) >= 2 and command[0] == "git" and command[1] == "commit":
            return subprocess.CompletedProcess(
                command, 1, stdout="", stderr="forced commit failure",
            )
        return original_run(command, *args, **kwargs)

    monkeypatch.setattr(dw.subprocess, "run", fail_commit)
    rc, result, _ = close_delegate(sandbox, capsys, "a1", "value.txt")

    assert rc == 2
    assert result["merged"] is False
    assert result["error_code"] == "worktree_commit_failed"
    assert result["commit"] is None
    assert (root / "value.txt").read_bytes() == b"base\n"
    assert (root / "already-staged.txt").read_bytes() == b"staged-before\n"
    assert index_bytes(dw, root) == before_index
    assert status_raw(dw, root, "value.txt", "already-staged.txt") == before_status
    assert wt.is_dir()

    (wt / "value.txt").write_bytes(b"base\n")
    remove_clean_worktree(sandbox, wt)


def test_tampered_delegate_base_fails_closed(sandbox, capsys):
    set_base_file(sandbox, "value.txt", b"base\n")
    wt = open_delegate(sandbox, capsys)
    (wt / "value.txt").write_bytes(b"delegate\n")
    (wt / ".delegate-base").write_text("0" * 40, encoding="utf-8")
    before = (sandbox["root"] / "value.txt").read_bytes()

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "value.txt")

    assert rc == 2
    assert result["error_code"] == "worktree_base_mismatch"
    assert (sandbox["root"] / "value.txt").read_bytes() == before
    assert wt.is_dir()
    (wt / "value.txt").write_bytes(b"base\n")
    remove_clean_worktree(sandbox, wt)


def test_expired_lease_cannot_merge(sandbox, capsys):
    wt = open_delegate(sandbox, capsys)
    (wt / "expired.json").write_bytes(b"delegate\n")
    set_claim(sandbox, "a1", expires_at=time.time() - 1)

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "expired.json")

    assert rc == 2
    assert result["error_code"] == "worktree_lease_expired"
    assert not (sandbox["root"] / "expired.json").exists()
    assert wt.is_dir()
    (wt / "expired.json").unlink()
    remove_clean_worktree(sandbox, wt)


def test_terminal_lease_cannot_merge(sandbox, capsys):
    wt = open_delegate(sandbox, capsys)
    (wt / "terminal.json").write_bytes(b"delegate\n")
    set_claim(sandbox, "a1", state="ok")

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "terminal.json")

    assert rc == 2
    assert result["error_code"] == "worktree_lease_invalid"
    assert result["lease_state"] == "ok"
    assert not (sandbox["root"] / "terminal.json").exists()
    assert wt.is_dir()
    (wt / "terminal.json").unlink()
    remove_clean_worktree(sandbox, wt)


def test_changed_claim_identity_cannot_merge(sandbox, capsys):
    set_base_file(sandbox, "identity.txt", b"base\n")
    wt = open_delegate(sandbox, capsys)
    (wt / "identity.txt").write_bytes(b"delegate\n")
    set_claim(sandbox, "a1", task_id="task:other")

    rc, result, _ = close_delegate(sandbox, capsys, "a1", "identity.txt")

    assert rc == 2
    assert result["error_code"] == "worktree_lease_identity_mismatch"
    assert (sandbox["root"] / "identity.txt").read_bytes() == b"base\n"
    assert wt.is_dir()
    (wt / "identity.txt").write_bytes(b"base\n")
    remove_clean_worktree(sandbox, wt)


def test_concurrent_closes_are_serialized_by_integration_lock(sandbox, capsys, monkeypatch):
    set_base_file(sandbox, "one.txt", b"one-base\n")
    set_base_file(sandbox, "two.txt", b"two-base\n")
    wt1 = open_delegate(sandbox, capsys, "a1", task_id="task:one")
    wt2 = open_delegate(sandbox, capsys, "a2", task_id="task:two")
    (wt1 / "one.txt").write_bytes(b"one-delegate\n")
    (wt2 / "two.txt").write_bytes(b"two-delegate\n")

    dw = sandbox["dw"]
    original_lock = dw.IntegrationLock
    original_apply = dw._apply_change
    state_lock = threading.Lock()
    first_apply = threading.Event()
    second_attempt = threading.Event()
    release_first = threading.Event()
    attempts = 0
    active = 0
    max_active = 0
    apply_calls = 0

    class TrackingIntegrationLock(original_lock):
        def __enter__(self):
            nonlocal attempts, active, max_active
            with state_lock:
                attempts += 1
                if attempts == 2:
                    second_attempt.set()
            result = super().__enter__()
            with state_lock:
                active += 1
                max_active = max(max_active, active)
            return result

        def __exit__(self, *exc):
            nonlocal active
            try:
                return super().__exit__(*exc)
            finally:
                with state_lock:
                    active -= 1

    def hold_first_apply(change, created_dirs):
        nonlocal apply_calls
        with state_lock:
            apply_calls += 1
            is_first = apply_calls == 1
        if is_first:
            first_apply.set()
            if not release_first.wait(5):
                raise RuntimeError("test did not release first close")
        return original_apply(change, created_dirs)

    monkeypatch.setattr(dw, "IntegrationLock", TrackingIntegrationLock)
    monkeypatch.setattr(dw, "_apply_change", hold_first_apply)
    results: dict[str, int] = {}
    errors: list[BaseException] = []

    def close_in_thread(agent_id: str, path: str) -> None:
        try:
            results[agent_id] = dw.main([
                "close", "--agent-id", agent_id, "--allow", path,
            ])
        except BaseException as exc:  # pragma: no cover - diagnostic guard
            errors.append(exc)

    first = threading.Thread(target=close_in_thread, args=("a1", "one.txt"))
    second = threading.Thread(target=close_in_thread, args=("a2", "two.txt"))
    first.start()
    assert first_apply.wait(5)
    second.start()
    assert second_attempt.wait(5)
    with state_lock:
        assert active == 1
    release_first.set()
    first.join(10)
    second.join(10)
    capsys.readouterr()

    assert not errors
    assert not first.is_alive()
    assert not second.is_alive()
    assert results == {"a1": 0, "a2": 0}
    assert max_active == 1
    assert (sandbox["root"] / "one.txt").read_bytes() == b"one-delegate\n"
    assert (sandbox["root"] / "two.txt").read_bytes() == b"two-delegate\n"

    (wt1 / "one.txt").write_bytes(b"one-base\n")
    (wt2 / "two.txt").write_bytes(b"two-base\n")
    remove_clean_worktree(sandbox, wt1)
    remove_clean_worktree(sandbox, wt2)


def test_timeout_quarantine_blocks_close_gc_release_and_retry(sandbox, capsys):
    wt = open_delegate(sandbox, capsys, "timed-out", task_id="task:timed-out")
    al = sandbox["dw"].agent_log

    assert al.main(["delegate-start", "--agent-id", "timed-out"]) == 0
    capsys.readouterr()
    assert al.main([
        "delegate-result", "--agent-id", "timed-out",
        "--result-class", "infrastructure_failure",
        "--error-code", "mcp_transport_timeout",
    ]) == 0
    result_output = capsys.readouterr().out
    assert last_json(result_output)["termination_unconfirmed"] is True

    (wt / "delegate-output.json").write_bytes(b"must remain quarantined")

    rc, result, _ = close_delegate(sandbox, capsys, "timed-out", "delegate-output.json")
    assert rc == 7
    assert result["error_code"] == "delegate_termination_unconfirmed"
    assert result["termination_unconfirmed"] is True
    assert result["worktree_removed"] is False
    assert wt.is_dir()
    assert not (sandbox["root"] / "delegate-output.json").exists()

    assert al.main([
        "delegate-release", "--agent-id", "timed-out", "--status", "abandoned",
    ]) == 7
    capsys.readouterr()
    assert sandbox["dw"].main(["abandon", "--agent-id", "timed-out"]) == 7
    capsys.readouterr()

    assert al.main([
        "delegate-claim", "--task-id", "task:timed-out", "--role", "tester",
        "--agent-id", "retry",
    ]) == 7
    retry_output = capsys.readouterr().out
    assert last_json(retry_output)["error_code"] == "delegate_termination_unconfirmed"

    set_claim(sandbox, "timed-out", expires_at=time.time() - 1)
    assert sandbox["dw"].main(["gc"]) == 0
    gc_result = last_json(capsys.readouterr().out)
    assert str(wt) in gc_result["kept"]
    assert wt.is_dir()

    assert al.main([
        "delegate-confirm-termination", "--agent-id", "timed-out",
        "--evidence", "operator verified the timed-out actor is gone",
    ]) == 0
    capsys.readouterr()
    (wt / "delegate-output.json").unlink()
    remove_clean_worktree(sandbox, wt)


def test_animation_workspace_write_canary_cannot_write_repository_root(sandbox, capsys):
    import codex_sandbox_doctor as doctor
    import delegate_invoke

    policy = json.loads(
        (TOOLS / "delegate_policy.json").read_text(encoding="utf-8")
    )
    assert policy["roles"]["animation-director"]["sandbox"] == "workspace-write"

    codex_path = shutil.which("codex")
    if codex_path is None:
        pytest.skip("Codex/bwrap is not installed")
    bwrap_path = doctor.resolve_vendored_bwrap(Path(codex_path))
    if bwrap_path is None:
        pytest.skip("Codex/bwrap is not installed")
    if doctor.run_smoke(bwrap_path)["error_class"] != "ok":
        pytest.skip("host cannot run the Codex sandbox")

    wt = open_delegate(sandbox, capsys, "animation-canary")
    root_sentinel = sandbox["root"] / "animation-root-canary.txt"
    worktree_marker = wt / "animation-worktree-canary.txt"
    script = (
        "from pathlib import Path; "
        f"Path({str(worktree_marker)!r}).write_text('worktree'); "
        f"Path({str(root_sentinel)!r}).write_text('root')"
    )
    command = [
        str(bwrap_path), "--die-with-parent", "--unshare-user", "--uid", "0",
        "--gid", "0", "--ro-bind", "/", "/", "--bind", str(wt), str(wt),
        "--chdir", str(wt), "--", sys.executable, "-c", script,
    ]
    proc = subprocess.run(command, capture_output=True)
    assert proc.returncode != 0
    assert worktree_marker.read_text(encoding="utf-8") == "worktree"
    assert not root_sentinel.exists()

    worktree_marker.unlink()
    remove_clean_worktree(sandbox, wt)

"""Focused regressions for registry, lease, open, and GC lifecycle safety."""
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


@pytest.fixture()
def sandbox(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict:
    root = tmp_path / "repo"
    root.mkdir()
    run_git(root, "init", "-q")
    run_git(root, "config", "user.email", "delegate-tests@example.invalid")
    run_git(root, "config", "user.name", "delegate tests")
    (root / ".gitignore").write_text("runs/\n", encoding="utf-8")
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
    (run_dir / "mono_start").write_text(repr(time.monotonic()), encoding="utf-8")
    (root / "runs" / ".current").write_text(run_dir.name, encoding="utf-8")
    monkeypatch.setenv("SV_RUN_ID", run_dir.name)
    monkeypatch.setenv("SV_RUN_DIR", str(run_dir))

    worktrees = tmp_path / "worktrees"
    monkeypatch.setattr(delegate_worktree, "WORKTREES_ROOT", worktrees)
    monkeypatch.setattr(delegate_worktree, "ALLOC_LOCK", tmp_path / "worktree.lock")
    monkeypatch.setattr(delegate_worktree, "INTEGRATION_LOCK", tmp_path / "integration.lock")
    return {"root": root, "run_dir": run_dir, "worktrees": worktrees,
            "agent_log": agent_log, "dw": delegate_worktree}


def claim(sandbox: dict, capsys: pytest.CaptureFixture[str], agent_id: str = "a1",
          task_id: str | None = None) -> dict:
    al = sandbox["agent_log"]
    task_id = task_id or f"task:{agent_id}"
    assert al.main([
        "delegate-claim", "--task-id", task_id, "--role", "tester",
        "--agent-id", agent_id,
    ]) == 0
    capsys.readouterr()
    path = sandbox["run_dir"] / "delegations.json"
    return json.loads(path.read_text(encoding="utf-8"))["claims"][agent_id]


def registry(sandbox: dict) -> Path:
    return sandbox["run_dir"] / "delegations.json"


def set_claim(sandbox: dict, agent_id: str, **updates: object) -> None:
    path = registry(sandbox)
    data = json.loads(path.read_text(encoding="utf-8"))
    data["claims"][agent_id].update(updates)
    path.write_text(json.dumps(data, indent=1), encoding="utf-8")


def make_actual_worktree(sandbox: dict, agent_id: str) -> Path:
    wt = sandbox["worktrees"] / sandbox["run_dir"].name / agent_id
    wt.parent.mkdir(parents=True, exist_ok=True)
    run_git(sandbox["root"], "worktree", "add", "--detach", str(wt), "HEAD")
    return wt


@pytest.mark.parametrize("content", [
    b'{"version": 2, "claims": {"leaked":',
    b'{"version": 1, "claims": {}}',
    b'{"version": 2, "claims": []}',
    b'{"version": 2, "claims": {"a1": "not-a-claim"}}',
])
def test_invalid_registry_is_not_replaced(sandbox, capsys, content: bytes):
    path = registry(sandbox)
    path.write_bytes(content)
    before = path.read_bytes()

    rc = sandbox["agent_log"].main([
        "delegate-claim", "--task-id", "task:new", "--role", "tester",
        "--agent-id", "new",
    ])
    output = capsys.readouterr()

    assert rc == 2
    assert "delegation_registry_invalid" in output.out + output.err
    assert path.read_bytes() == before
    assert "leaked" not in output.out + output.err


def test_unreadable_registry_is_not_replaced(sandbox, capsys, monkeypatch):
    path = registry(sandbox)
    path.write_text('{"version": 2, "claims": {}}', encoding="utf-8")
    before = path.read_bytes()
    original_read_text = Path.read_text

    def unreadable(candidate: Path, *args, **kwargs):
        if candidate == path:
            raise PermissionError("registry contents must not escape")
        return original_read_text(candidate, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", unreadable)
    rc = sandbox["agent_log"].main([
        "delegate-claim", "--task-id", "task:new", "--role", "tester",
        "--agent-id", "new",
    ])
    output = capsys.readouterr()

    assert rc == 2
    assert "delegation_registry_invalid" in output.out
    assert "registry contents" not in output.out + output.err
    assert path.read_bytes() == before


def heartbeat_args(agent_id: str, claim_data: dict) -> list[str]:
    return [
        "delegate-heartbeat", "--agent-id", agent_id,
        "--task-id", claim_data["task_id"], "--role", claim_data["role"],
        "--attempt", str(claim_data["attempt"]), "--thread-id", "new-thread",
    ]


def test_expired_heartbeat_cannot_extend_lease(sandbox, capsys):
    claim_data = claim(sandbox, capsys, "expired")
    set_claim(sandbox, "expired", expires_at=time.time() - 1)
    path = registry(sandbox)
    before = path.read_bytes()

    rc = sandbox["agent_log"].main(heartbeat_args("expired", claim_data))
    capsys.readouterr()

    assert rc == 5
    assert path.read_bytes() == before


def test_terminal_heartbeat_cannot_extend_lease(sandbox, capsys):
    claim_data = claim(sandbox, capsys, "terminal")
    set_claim(sandbox, "terminal", state="ok", expires_at=time.time() + 300)
    path = registry(sandbox)
    before = path.read_bytes()

    rc = sandbox["agent_log"].main(heartbeat_args("terminal", claim_data))
    capsys.readouterr()

    assert rc == 5
    assert path.read_bytes() == before


def test_heartbeat_identity_mismatch_cannot_extend_lease(sandbox, capsys):
    claim_data = claim(sandbox, capsys, "identity")
    path = registry(sandbox)
    before = path.read_bytes()

    args = heartbeat_args("identity", claim_data)
    args[args.index("--task-id") + 1] = "task:other"
    rc = sandbox["agent_log"].main(args)
    capsys.readouterr()

    assert rc == 5
    assert path.read_bytes() == before


def test_open_failure_releases_claim_as_infrastructure_failure(sandbox, capsys):
    blocked = sandbox["worktrees"] / sandbox["run_dir"].name / "blocked"
    blocked.mkdir(parents=True)
    (blocked / "occupied").write_bytes(b"not a worktree\n")

    rc = sandbox["dw"].main([
        "open", "--task-id", "task:blocked", "--role", "tester",
        "--agent-id", "blocked",
    ])
    output = capsys.readouterr()
    data = json.loads(registry(sandbox).read_text(encoding="utf-8"))
    failed = data["claims"]["blocked"]

    assert rc == 2
    assert "worktree_add_failed" in output.out
    assert failed["state"] == "failed"
    assert failed["result_class"] == "infrastructure_failure"
    assert failed["error_code"] == "worktree_add_failed"
    assert failed["infrastructure_counted"] is True
    assert blocked.is_dir()


def test_successful_merge_is_cleaned_by_gc(sandbox, capsys):
    dw = sandbox["dw"]
    assert dw.main([
        "open", "--task-id", "task:success", "--role", "tester",
        "--agent-id", "success",
    ]) == 0
    capsys.readouterr()
    wt = sandbox["worktrees"] / sandbox["run_dir"].name / "success"
    (wt / "result.txt").write_bytes(b"delegate result\n")

    rc = dw.main(["close", "--agent-id", "success", "--allow", "result.txt"])
    result = json.loads(capsys.readouterr().out)

    assert rc == 0
    assert result["worktree_removed"] is False
    assert wt.is_dir()

    rc = dw.main(["gc"])
    gc_result = json.loads(capsys.readouterr().out)

    assert rc == 0
    assert str(wt) in gc_result["removed"]
    assert not wt.exists()
    assert (sandbox["root"] / "result.txt").read_bytes() == b"delegate result\n"


def test_gc_removes_expired_clean_worktree_after_marker_cleanup(sandbox, capsys):
    dw = sandbox["dw"]
    assert dw.main([
        "open", "--task-id", "task:expired-gc", "--role", "tester",
        "--agent-id", "expired-gc",
    ]) == 0
    capsys.readouterr()
    wt = sandbox["worktrees"] / sandbox["run_dir"].name / "expired-gc"
    set_claim(sandbox, "expired-gc", expires_at=time.time() - 1)

    rc = dw.main(["gc"])
    result = json.loads(capsys.readouterr().out)

    assert rc == 0
    assert str(wt) in result["removed"]
    assert not wt.exists()


def test_gc_does_not_force_remove_terminal_failed_worktree(sandbox, capsys, monkeypatch):
    dw = sandbox["dw"]
    assert dw.main([
        "open", "--task-id", "task:failed-gc", "--role", "tester",
        "--agent-id", "failed-gc",
    ]) == 0
    capsys.readouterr()
    wt = sandbox["worktrees"] / sandbox["run_dir"].name / "failed-gc"
    (wt / "operator-review.txt").write_bytes(b"must survive\n")
    set_claim(sandbox, "failed-gc", state="failed", result_class="policy_failure")

    calls: list[list[str]] = []
    original_git = dw.git

    def recording_git(args, cwd=None, check=True):
        calls.append(args[:])
        return original_git(args, cwd=cwd, check=check)

    monkeypatch.setattr(dw, "git", recording_git)
    rc = dw.main(["gc"])
    result = json.loads(capsys.readouterr().out)

    assert rc == 0
    assert result["removed"] == []
    assert str(wt) in result["kept"]
    assert wt.is_dir()
    assert all("--force" not in args for args in calls)


def test_gc_keeps_unknown_worktree(sandbox, capsys):
    path = registry(sandbox)
    path.write_text('{"version": 2, "claims": {}}', encoding="utf-8")
    wt = make_actual_worktree(sandbox, "unknown")
    (wt / "unreviewed.txt").write_bytes(b"keep me\n")

    rc = sandbox["dw"].main(["gc"])
    result = json.loads(capsys.readouterr().out)

    assert rc == 0
    assert result["removed"] == []
    assert str(wt) in result["kept"]
    assert wt.is_dir()
    (wt / "unreviewed.txt").unlink()
    assert run_git(sandbox["root"], "worktree", "remove", str(wt), check=False).returncode == 0


@pytest.mark.parametrize("registry_content", [None, b'{"version": 2, "claims": {"bad":'])
def test_gc_keeps_worktree_when_registry_is_missing_or_invalid(
    sandbox, capsys, registry_content: bytes | None,
):
    path = registry(sandbox)
    if registry_content is not None:
        path.write_bytes(registry_content)
    before = path.read_bytes() if path.exists() else None
    wt = make_actual_worktree(sandbox, "unsafe")

    rc = sandbox["dw"].main(["gc"])
    result = json.loads(capsys.readouterr().out)

    assert rc == 2
    assert result["removed"] == []
    assert str(wt) in result["kept"]
    assert wt.is_dir()
    if before is None:
        assert not path.exists()
    else:
        assert path.read_bytes() == before
    assert run_git(sandbox["root"], "worktree", "remove", str(wt), check=False).returncode == 0

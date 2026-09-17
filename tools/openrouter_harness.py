#!/usr/bin/env python3
"""Minimal ShortVideo agent harness over raw OpenRouter Chat Completions."""
from __future__ import annotations
import argparse
import fcntl
import json
import os
import sys
from pathlib import Path
from typing import Any

from openrouter_agent import AgentSession, _evict_old_tool_results
from openrouter_client import UsageLedger
from openrouter_config import ROOT, ROLE_PROMPTS, load_policy, role_config
from openrouter_tools import TOOL_SCHEMAS, tool_schema_bytes

def _run_dir_from_env() -> Path:
    raw = os.environ.get("SV_RUN_DIR", "").strip()
    if not raw:
        raise RuntimeError("SV_RUN_DIR is not set; run through tools/run_episode.sh")
    path = Path(raw).resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def finalize_cost(run_dir: Path) -> dict[str, Any]:
    """Patch the existing manifest/index with actual OpenRouter usage.

    This intentionally extends runs/index.jsonl instead of creating a parallel
    accounting database.
    """
    ledger = UsageLedger(run_dir)
    totals = ledger.write_summary()
    manifest_path = run_dir / "manifest.json"
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except ValueError:
            manifest = None
        if isinstance(manifest, dict):
            manifest["openrouter_usage"] = totals
            temp = manifest_path.with_suffix(".json.tmp")
            temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
            os.replace(temp, manifest_path)

    index_path = ROOT / "runs" / "index.jsonl"
    if index_path.is_file():
        with index_path.open("r+", encoding="utf-8") as fh:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
            lines = fh.read().splitlines()
            changed = False
            for i in range(len(lines) - 1, -1, -1):
                try:
                    row = json.loads(lines[i])
                except ValueError:
                    continue
                if row.get("run_id") == run_dir.name:
                    row["openrouter_cost_usd"] = totals["cost_usd"]
                    row["openrouter_prompt_tokens"] = totals["prompt_tokens"]
                    row["openrouter_completion_tokens"] = totals["completion_tokens"]
                    row["openrouter_cached_tokens"] = totals["cached_tokens"]
                    row["openrouter_calls"] = totals["calls"]
                    lines[i] = json.dumps(row, ensure_ascii=False)
                    changed = True
                    break
            if changed:
                fh.seek(0)
                fh.write("\n".join(lines) + "\n")
                fh.truncate()
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
    return totals


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run")
    r.add_argument("--role", choices=["orchestrator", *ROLE_PROMPTS.keys()], required=True)
    r.add_argument("--task-file", type=Path)
    r.add_argument("--task")
    r.add_argument("--workspace", type=Path, default=ROOT)
    r.add_argument("--model")
    r.add_argument("--effort")

    # This subcommand exists only as a recognizable control-plane command
    # string. A model-issued call is intercepted in-process before shell. If a
    # human runs it directly we fail explicitly rather than opening an
    # untracked second orchestration path.
    d = sub.add_parser("internal-delegate")
    d.add_argument("--role", choices=list(ROLE_PROMPTS), required=True)
    d.add_argument("--slug", required=True)
    d.add_argument("--task", required=True)

    f = sub.add_parser("finalize-cost")
    f.add_argument("--run-dir", type=Path)

    s = sub.add_parser("schema-stats")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.cmd == "internal-delegate":
        print(
            "internal-delegate is a harness control-plane command and must be issued "
            "by the orchestrator through its bash tool",
            file=sys.stderr,
        )
        return 2
    if args.cmd == "schema-stats":
        print(json.dumps({
            "tool_count": len(TOOL_SCHEMAS),
            "tool_schema_bytes": tool_schema_bytes(),
            "tools": [x["function"]["name"] for x in TOOL_SCHEMAS],
        }, ensure_ascii=False, indent=2))
        return 0
    if args.cmd == "finalize-cost":
        run_dir = (args.run_dir or _run_dir_from_env()).resolve()
        print(json.dumps(finalize_cost(run_dir), ensure_ascii=False, indent=2))
        return 0

    if bool(args.task_file) == bool(args.task):
        print("provide exactly one of --task-file or --task", file=sys.stderr)
        return 2
    task = (
        args.task_file.read_text(encoding="utf-8")
        if args.task_file
        else str(args.task)
    )
    run_dir = _run_dir_from_env()
    policy = load_policy()
    cfg = role_config(args.role, policy)
    model = args.model or cfg["model"]
    effort = args.effort or cfg["effort"]
    session = AgentSession(
        role=args.role,
        task=task,
        workspace=args.workspace,
        run_dir=run_dir,
        model=model,
        effort=effort,
        sandbox_policy=cfg["sandbox"],
        vision_model=cfg["vision_model"],
        policy=policy,
    )
    try:
        result = session.run()
    finally:
        session.close()
    print(result.text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

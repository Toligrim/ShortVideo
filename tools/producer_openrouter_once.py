#!/usr/bin/env python3
"""Manual one-shot OpenRouter producer for parity/staging runs.

Production cron remains pinned to producer_scheduler.py's Codex constants.
This command reuses its deterministic slug/prompt fabric but explicitly selects
the new runner.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

import producer_scheduler as sched

ROOT = Path(__file__).resolve().parent.parent
MODEL = "deepseek/deepseek-v4-flash-0731"
EFFORT = "high"
TIMEOUT_MIN = sched.TIMEOUT_MIN


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--slug")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--now", type=int, default=None)
    args = p.parse_args(argv)

    now = args.now if args.now is not None else int(time.time())
    slug = args.slug or sched.make_slug(now, ROOT / "episodes")
    prompt = sched.build_prompt(ROOT, slug, sched.PROMPT_TOPIC_LABEL)
    # sched.build_prompt() embeds an absolute filesystem path to the skill
    # file (fine for Codex's unrestricted read access). The OpenRouter
    # harness's read_file only accepts workspace-relative paths, so an
    # unpatched prompt sends the orchestrator on a repeated
    # path_outside_workspace loop trying to read its own pipeline
    # instructions - staging incident 2026-09-17, burned the full
    # MAX_AGENT_STEPS budget without ever delegating. Rewrite it to the
    # equivalent relative path before handing the prompt to the harness.
    skill_path_abs = str(ROOT / ".claude" / "skills" / "produce" / "SKILL.md")
    skill_path_rel = ".claude/skills/produce/SKILL.md"
    if skill_path_abs not in prompt:
        raise RuntimeError(
            "producer_scheduler.build_prompt() no longer embeds the expected "
            f"absolute skill path {skill_path_abs!r} - update skill_path_abs/"
            "skill_path_rel above to match its current output."
        )
    prompt = prompt.replace(skill_path_abs, skill_path_rel)
    command_preview = [
        str(ROOT / "tools" / "run_episode.sh"),
        "--topic", sched.PROMPT_TOPIC_LABEL,
        "--slug", slug,
        "--runner", "openrouter",
        "--model", MODEL,
        "--effort", EFFORT,
        "--prompt-file", "<temporary-prompt>",
        "--timeout-min", str(TIMEOUT_MIN),
    ]
    if args.dry_run:
        print(json.dumps({
            "slug": slug,
            "runner": "openrouter",
            "model": MODEL,
            "effort": EFFORT,
            "timeout_min": TIMEOUT_MIN,
            "command": command_preview,
            "prompt_chars": len(prompt),
            "production_scheduler_unchanged": {
                "runner": sched.RUNNER,
                "model": sched.MODEL,
                "effort": sched.EFFORT,
            },
        }, ensure_ascii=False, indent=2))
        return 0

    if not os.environ.get("SHORTVIDEO_PUBLISH_STATE_DIR", "").strip():
        print("SHORTVIDEO_PUBLISH_STATE_DIR must be set to the live approval store", flush=True)
        return 4

    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", suffix=".md", prefix="shortvideo-openrouter-", delete=False
    ) as fh:
        fh.write(prompt)
        prompt_path = Path(fh.name)
    try:
        cmd = [
            str(ROOT / "tools" / "run_episode.sh"),
            "--topic", sched.PROMPT_TOPIC_LABEL,
            "--slug", slug,
            "--runner", "openrouter",
            "--model", MODEL,
            "--effort", EFFORT,
            "--prompt-file", str(prompt_path),
            "--timeout-min", str(TIMEOUT_MIN),
        ]
        return subprocess.run(cmd, cwd=str(ROOT)).returncode
    finally:
        prompt_path.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())

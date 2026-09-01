#!/usr/bin/env python3
"""Проверка: ничего ценного не осталось untracked-файлом в рабочем дереве.

Требование 1 из docs/agent-safety-architecture.md, §5.3: не «в git должно
быть вообще всё» (буквально невыполнимо — видео/аудио одни весят гигабайты),
а инвариант, который сохраняет смысл требования целиком:

    Ни один ценный файл никогда не существует ТОЛЬКО как untracked-файл
    в рабочем дереве.

Именно это свойство было нарушено в инциденте auto-20260831-164055 (разбор —
corrections/git-reset-clean-incident/REPORT.md): tools/pipeline_log.py, без
которого конвейер не может стартовать ни один эпизод, неделями лежал
untracked — и его снесло вместе со всем остальным одной командой одного
делегата. Если бы эта проверка уже существовала и вызывалась хотя бы раз в
прогон, находка случилась бы за недели до инцидента, а не после него.

Уровень A (§5.3 плана) — код, промпты, схемы, episodes/*.json, драфты,
метаданные, runs/**/*.jsonl и производные, corrections/, docs/, deploy/ —
не имеет права быть untracked дольше одного шага конвейера. Уровни B
(видео/аудио — идут в R2 по указателю, не сюда) и C (node_modules/venv и
т.п. — не коммитятся вовсе, воспроизводимы) этой проверкой не затрагиваются.

    repo_guard.py check [--warn-only] [--json]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Директории целиком — любой untracked-файл внутри них уровня A.
LEVEL_A_DIRS = ("tools/", "video/src/", ".claude/", "schema/", "corrections/",
                "docs/", "deploy/")

# Внутри остальных директорий — только конкретные виды файлов.
LEVEL_A_SUFFIXES_RUNS = (".jsonl", "manifest.json", "STORY.md", "session.json",
                         "index.json", "delegations.json")


def is_level_a(rel_path: str) -> bool:
    if rel_path.startswith(LEVEL_A_DIRS):
        return True
    if rel_path.startswith("episodes/"):
        # episodes/*.json, episodes/*.metadata.json, episodes/drafts/*.json —
        # ролик и его метаданные, но не двоичные артефакты (их тут нет).
        return rel_path.endswith(".json")
    if rel_path.startswith("runs/"):
        # rollout.jsonl уже в .gitignore (§4.8) — сюда он не попадёт, `git
        # status` его вообще не покажет как untracked без --ignored.
        return rel_path.endswith(LEVEL_A_SUFFIXES_RUNS)
    return False


def untracked_paths(root: Path) -> list[str]:
    """Untracked-файлы (не директории — git и так разворачивает их до листьев)."""
    proc = subprocess.run(
        ["git", "status", "--porcelain=v1", "--untracked-files=all"],
        cwd=root, capture_output=True, text=True, check=True,
    )
    paths = []
    for line in proc.stdout.splitlines():
        if not line.startswith("?? "):
            continue
        paths.append(line[3:].strip())
    return paths


def cmd_check(args: argparse.Namespace) -> int:
    violations = sorted(p for p in untracked_paths(ROOT) if is_level_a(p))

    if args.json:
        print(json.dumps({"violations": violations, "clean": not violations},
                         ensure_ascii=False, indent=1))
    elif violations:
        print(f"repo_guard: {len(violations)} untracked-файл(ов) уровня A "
              "(должны быть в git, не должны существовать только на диске):",
              file=sys.stderr)
        for p in violations:
            print(f"  {p}", file=sys.stderr)
    else:
        print("repo_guard: чисто — ни одного untracked-файла уровня A",
              file=sys.stderr)

    if not violations:
        return 0
    if args.warn_only:
        return 0
    return 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("check", help="проверить, что нет untracked-файлов уровня A")
    c.add_argument("--warn-only", action="store_true",
                   help="только напечатать находки, код выхода всегда 0 (для обкатки)")
    c.add_argument("--json", action="store_true", help="машиночитаемый вывод")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.cmd == "check":
        return cmd_check(args)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

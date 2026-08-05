#!/usr/bin/env python3
"""Prepare and inspect approval-gated social publication requests.

The ``bot`` command is the only Telegram network entry point.  It delivers
immutable review cards and records human approvals; it never publishes a
YouTube or Instagram target itself.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

from publishing.config import PublishingConfig
from publishing.db import PublishingStore, StoreError
from publishing.metadata import MetadataError, load_metadata, metadata_sha256
from publishing.models import ExecutionMode, Publication, PublicationTarget
from publishing.preflight import PreflightError
from publishing.review import ReviewError, prepare_review
from publishing.telegram import TelegramApprovalError
from telegram_bot import TelegramError


def _config(args: argparse.Namespace) -> PublishingConfig:
    return PublishingConfig.from_environment(state_dir=getattr(args, "state_dir", None))


def _publication_json(publication: Publication, targets: list[PublicationTarget]) -> dict[str, Any]:
    return {
        "id": publication.id,
        "slug": publication.slug,
        "state": publication.state.value,
        "execution_mode": publication.execution_mode.value,
        "asset_sha256": publication.asset_sha256,
        "metadata_sha256": publication.metadata_sha256,
        "approval_fingerprint": publication.approval_fingerprint,
        "created_at": publication.created_at,
        "approved_at": publication.approved_at,
        "targets": [
            {
                "id": target.id,
                "platform": target.platform,
                "state": target.state.value,
                "attempts": target.attempts,
                "external_url": target.external_url,
            }
            for target in targets
        ],
    }


def _print_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--state-dir",
        help="local state directory; default is var/publisher or SHORTVIDEO_PUBLISH_STATE_DIR",
    )

    sub.add_parser("init-db", parents=[common], help="create or migrate the local SQLite store")

    validate = sub.add_parser("validate-metadata", parents=[common], help="validate publish metadata")
    validate.add_argument("metadata", type=Path)
    validate.add_argument("--json", action="store_true", help="emit machine-readable output")

    review = sub.add_parser("review", parents=[common], help="prepare a local review request; no network I/O")
    review.add_argument("--slug", required=True)
    review.add_argument("--video", required=True, type=Path)
    review.add_argument("--metadata", required=True, type=Path)
    review.add_argument(
        "--mode",
        choices=[mode.value for mode in ExecutionMode],
        default=ExecutionMode.DRY_RUN.value,
        help="execution mode captured by approval; defaults to dry-run",
    )

    status = sub.add_parser("status", parents=[common], help="show durable publication state")
    selector = status.add_mutually_exclusive_group()
    selector.add_argument("--publication-id")
    selector.add_argument("--slug")
    status.add_argument("--json", action="store_true", help="emit machine-readable output")

    bot = sub.add_parser("bot", parents=[common], help="run Telegram approval long-polling")
    bot.add_argument("--once", action="store_true", help="deliver/poll one cycle, then exit")
    bot.add_argument("--timeout", type=int, default=25, help="getUpdates long-poll timeout in seconds")
    return parser


def _status(store: PublishingStore, args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.publication_id:
        publication = store.get_publication(args.publication_id)
        publications = [publication] if publication is not None else []
    else:
        publications = store.list_publications(slug=args.slug)
    return [
        _publication_json(publication, store.list_targets(publication.id))
        for publication in publications
    ]


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        config = _config(args)
        if args.command == "init-db":
            config.ensure_directories()
            PublishingStore(config.database_path)
            print(f"SQLite store ready: {config.database_path}")
        elif args.command == "validate-metadata":
            metadata = load_metadata(args.metadata)
            output = {"slug": metadata["slug"], "metadata_sha256": metadata_sha256(metadata)}
            if args.json:
                _print_json(output)
            else:
                print(f"OK: {output['slug']} metadata_sha256={output['metadata_sha256']}")
        elif args.command == "review":
            review = prepare_review(
                slug=args.slug,
                video_path=args.video,
                metadata_path=args.metadata,
                config=config,
                execution_mode=args.mode,
            )
            _print_json(
                {
                    "publication_id": review.publication.id,
                    "slug": review.publication.slug,
                    "state": review.publication.state.value,
                    "execution_mode": review.publication.execution_mode.value,
                    "asset_sha256": review.asset.sha256,
                    "metadata_sha256": review.metadata.sha256,
                }
            )
        elif args.command == "status":
            output = _status(PublishingStore(config.database_path), args)
            if args.json:
                _print_json(output)
            else:
                for publication in output:
                    print(
                        f"{publication['id']} {publication['slug']} "
                        f"{publication['state']} ({publication['execution_mode']})"
                    )
        elif args.command == "bot":
            # Keep the transport import inside this explicitly networked
            # command, so validation/review/status remain local-only.
            from publishing.telegram import TelegramApprovalSettings, TelegramReviewService
            from telegram_bot import get_api

            config.ensure_directories()
            service = TelegramReviewService(
                store=PublishingStore(config.database_path),
                api=get_api(),
                settings=TelegramApprovalSettings.from_environment(),
            )
            if args.once:
                service.run_once(timeout=args.timeout)
            else:
                service.run_forever(timeout=args.timeout)
        else:  # argparse keeps this unreachable; retain a safe failure mode.
            raise StoreError(f"unsupported command: {args.command}")
    except (MetadataError, PreflightError, ReviewError, StoreError, TelegramApprovalError, TelegramError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

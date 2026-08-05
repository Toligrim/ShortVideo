#!/usr/bin/env python3
"""Prepare and inspect approval-gated social publication requests.

The ``bot`` command is the only Telegram approval entry point.  It delivers
immutable review cards and records human approvals; it never publishes a
YouTube or Instagram target itself.  The worker and explicit
``youtube-authorize`` command are separate network entry points.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
from typing import Any

from publishing.adapters.youtube import (
    YouTubeConfigurationError,
    YouTubeLiveAdapterFactory,
    YouTubeOAuthError,
    YouTubeOAuthSettings,
    authorize_with_loopback,
    youtube_doctor,
)
from publishing.config import PublishingConfig
from publishing.db import PublishingStore, StoreError
from publishing.metadata import MetadataError, load_metadata, metadata_sha256
from publishing.models import ExecutionMode, Publication, PublicationTarget
from publishing.preflight import PreflightError
from publishing.review import ReviewError, prepare_review
from publishing.telegram import TelegramApprovalError
from publishing.worker import PublishWorker, PublishWorkerError
from telegram_bot import TelegramError


def _config(args: argparse.Namespace) -> PublishingConfig:
    return PublishingConfig.from_environment(state_dir=getattr(args, "state_dir", None))


_STATUS_URL_RE = re.compile(r"https?://[^\s'\"<>]+", re.IGNORECASE)
_STATUS_BEARER_RE = re.compile(r"(?i)\bbearer\s+[^\s]+")
_STATUS_SECRET_ASSIGNMENT_RE = re.compile(
    r"(?i)([\"']?(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|"
    r"code[_-]?verifier|authorization[_-]?code|upload_id)[\"']?\s*(?:=|:)\s*)"
    r"(?:[\"'][^\"']*[\"']|[^\s,;}\]]+)"
)


def _safe_status_error_detail(value: str | None, session_id: str | None) -> str | None:
    if value is None:
        return None
    safe = value
    if isinstance(session_id, str) and session_id:
        safe = safe.replace(session_id, "[redacted]")
    safe = _STATUS_BEARER_RE.sub("Bearer [redacted]", safe)
    safe = _STATUS_SECRET_ASSIGNMENT_RE.sub(r"\1[redacted]", safe)
    return _STATUS_URL_RE.sub("[redacted-url]", safe)


def _publication_json(publication: Publication, targets: list[PublicationTarget]) -> dict[str, Any]:
    return {
        "id": publication.id,
        "slug": publication.slug,
        "state": publication.state.value,
        "execution_mode": publication.execution_mode.value,
        "asset_sha256": publication.asset_sha256,
        "metadata_sha256": publication.metadata_sha256,
        "approval_fingerprint": publication.approval_fingerprint,
        "status_revision": publication.status_revision,
        "created_at": publication.created_at,
        "approved_at": publication.approved_at,
        "targets": [
            {
                "id": target.id,
                "platform": target.platform,
                "state": target.state.value,
                "attempts": target.attempts,
                "next_attempt_at": target.next_attempt_at,
                "dispatch_generation": target.dispatch_generation,
                # A provider resumable-session URI is a bearer-like upload
                # capability.  Keep it in the fenced target row only; status
                # output is routinely copied into terminals and logs.
                "has_resumable_session": target.resumable_session_verified,
                "resumable_phase": target.resumable_phase if target.resumable_session_verified else None,
                "external_media_id": target.external_media_id,
                "external_url": target.external_url,
                "last_error_code": target.last_error_code,
                "last_error_detail": _safe_status_error_detail(
                    target.last_error_detail,
                    target.external_session_id,
                ),
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

    worker = sub.add_parser("worker", parents=[common], help="run durable platform publish jobs")
    worker.add_argument("--once", action="store_true", help="drain currently due target.publish jobs, then exit")
    worker.add_argument("--worker-id", help="stable diagnostic lease owner ID")
    worker.add_argument("--max-attempts", type=int, default=3, help="maximum automatic attempts per dispatch")
    worker.add_argument("--lease-seconds", type=int, default=120, help="lease duration for each target job")
    worker.add_argument("--idle-seconds", type=float, default=1.0, help="idle delay in forever mode")

    doctor = sub.add_parser("doctor", parents=[common], help="validate local live-provider configuration")
    doctor.add_argument("provider", choices=["youtube"])

    authorize = sub.add_parser(
        "youtube-authorize",
        parents=[common],
        help="explicitly run installed-app YouTube OAuth with a loopback callback",
    )
    authorize.add_argument(
        "--timeout-seconds",
        type=int,
        default=300,
        help="how long to wait for the browser callback; browser is never opened automatically",
    )

    retry = sub.add_parser("retry", parents=[common], help="explicitly requeue one failed target")
    retry_selector = retry.add_mutually_exclusive_group(required=True)
    retry_selector.add_argument("--publication-id")
    retry_selector.add_argument("--slug")
    retry.add_argument("--target", required=True, choices=["youtube", "instagram"])

    reconcile = sub.add_parser("reconcile", parents=[common], help="resolve one ambiguous target explicitly")
    reconcile_selector = reconcile.add_mutually_exclusive_group(required=True)
    reconcile_selector.add_argument("--publication-id")
    reconcile_selector.add_argument("--slug")
    reconcile.add_argument("--target", required=True, choices=["youtube", "instagram"])
    reconcile.add_argument("--outcome", required=True, choices=["mark-published", "requeue"])
    reconcile.add_argument("--external-id", help="provider media ID for mark-published")
    reconcile.add_argument("--external-url", help="provider URL for mark-published")
    reconcile.add_argument("--external-session-id", help="optional provider correlation/session ID")
    reconcile.add_argument(
        "--confirm-not-published",
        action="store_true",
        help="required for requeue after an operator confirmed no external publish happened",
    )
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


def _selected_target(store: PublishingStore, args: argparse.Namespace) -> tuple[Publication, PublicationTarget]:
    if args.publication_id:
        publication = store.get_publication(args.publication_id)
        if publication is None:
            raise StoreError(f"unknown publication ID: {args.publication_id}")
    else:
        publications = store.list_publications(slug=args.slug)
        if not publications:
            raise StoreError(f"no publication matches slug: {args.slug}")
        if len(publications) != 1:
            raise StoreError(
                f"slug {args.slug!r} matches {len(publications)} publications; select --publication-id explicitly"
            )
        publication = publications[0]
    for target in store.list_targets(publication.id):
        if target.platform == args.target:
            return publication, target
    raise StoreError(f"publication {publication.id} has no {args.target} target")


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
        elif args.command == "worker":
            config.ensure_directories()
            worker = PublishWorker(
                store=PublishingStore(config.database_path),
                worker_id=args.worker_id,
                adapter_factory=YouTubeLiveAdapterFactory(config.state_dir),
                max_attempts=args.max_attempts,
                lease_seconds=args.lease_seconds,
            )
            if args.once:
                results = []
                while True:
                    result = worker.run_once()
                    if result is None:
                        break
                    results.append(
                        {
                            "outbox_id": result.outbox_id,
                            "target_id": result.target_id,
                            "outcome": result.outcome,
                            "detail": result.detail,
                        }
                    )
                _print_json(results)
            else:
                worker.run_forever(idle_seconds=args.idle_seconds)
        elif args.command == "doctor":
            if args.provider == "youtube":
                settings = YouTubeOAuthSettings.from_environment(
                    state_dir=config.state_dir,
                    require_token_file=True,
                )
                _print_json(youtube_doctor(settings))
            else:  # argparse keeps this unreachable.
                raise StoreError(f"unsupported doctor provider: {args.provider}")
        elif args.command == "youtube-authorize":
            settings = YouTubeOAuthSettings.from_environment(
                state_dir=config.state_dir,
                require_token_file=False,
            )
            authorize_with_loopback(settings, timeout_seconds=args.timeout_seconds)
            _print_json({"provider": "youtube", "authorized": True})
        elif args.command == "retry":
            store = PublishingStore(config.database_path)
            publication, target = _selected_target(store, args)
            updated = store.retry_failed_target(target.id)
            _print_json(
                {
                    "publication_id": publication.id,
                    "target": updated.platform,
                    "state": updated.state.value,
                    "dispatch_generation": updated.dispatch_generation,
                }
            )
        elif args.command == "reconcile":
            if args.outcome == "mark-published" and (not args.external_id or not args.external_url):
                raise StoreError("mark-published requires --external-id and --external-url")
            if args.outcome == "mark-published" and args.confirm_not_published:
                raise StoreError("mark-published must not include --confirm-not-published")
            if args.outcome == "requeue" and not args.confirm_not_published:
                raise StoreError("requeue requires --confirm-not-published")
            if args.outcome == "requeue" and (
                args.external_id or args.external_url or args.external_session_id
            ):
                raise StoreError("requeue must not include external publication identifiers")
            store = PublishingStore(config.database_path)
            publication, target = _selected_target(store, args)
            updated = store.reconcile_target(
                target.id,
                outcome=args.outcome,
                external_media_id=args.external_id,
                external_url=args.external_url,
                external_session_id=args.external_session_id,
                confirmed_absent=args.confirm_not_published,
            )
            _print_json(
                {
                    "publication_id": publication.id,
                    "target": updated.platform,
                    "state": updated.state.value,
                    "dispatch_generation": updated.dispatch_generation,
                    "external_media_id": updated.external_media_id,
                    "external_url": updated.external_url,
                }
            )
        else:  # argparse keeps this unreachable; retain a safe failure mode.
            raise StoreError(f"unsupported command: {args.command}")
    except (
        MetadataError,
        PreflightError,
        ReviewError,
        StoreError,
        TelegramApprovalError,
        TelegramError,
        PublishWorkerError,
        YouTubeConfigurationError,
        YouTubeOAuthError,
        OSError,
    ) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

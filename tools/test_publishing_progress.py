from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import pipeline_log
import publish as publish_cli
from publishing.db import PublishingStore
from publishing.progress import (
    ProgressCardSync,
    PROMPT_TOPIC_PLACEHOLDER,
    read_events,
    reduce_events,
    render,
)
import publishing.progress as progress_module
from telegram_bot import TelegramError


class ProgressClock:
    def __init__(self):
        self.current = datetime(2099, 1, 1, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.current

    def advance(self, seconds: int) -> None:
        self.current += timedelta(seconds=seconds)


class FakeProgressApi:
    def __init__(self):
        self.calls: list[dict[str, object]] = []
        self.next_send_error: BaseException | None = None
        self.next_edit_error: BaseException | None = None

    def send_message(self, chat_id, text, *, parse_mode=None):
        self.calls.append(
            {
                "method": "send_message",
                "chat_id": chat_id,
                "text": text,
                "parse_mode": parse_mode,
            }
        )
        if self.next_send_error is not None:
            error = self.next_send_error
            self.next_send_error = None
            raise error
        return {"message_id": 700}

    def edit_message_text(self, chat_id, message_id, text, *, parse_mode=None):
        self.calls.append(
            {
                "method": "edit_message_text",
                "chat_id": chat_id,
                "message_id": message_id,
                "text": text,
                "parse_mode": parse_mode,
            }
        )
        if self.next_edit_error is not None:
            error = self.next_edit_error
            self.next_edit_error = None
            raise error
        return {"message_id": message_id}

    @property
    def sends(self) -> list[dict[str, object]]:
        return [call for call in self.calls if call["method"] == "send_message"]

    @property
    def edits(self) -> list[dict[str, object]]:
        return [call for call in self.calls if call["method"] == "edit_message_text"]


class ProgressCardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.runs = self.root / "runs"
        self.runs.mkdir()
        self.project_root = self.root / "project"
        (self.project_root / "episodes" / "drafts").mkdir(parents=True)
        self.run_id = "run-progress-1"
        self.run_dir = self.runs / self.run_id
        self.run_dir.mkdir()
        (self.runs / ".current").write_text(self.run_id, encoding="utf-8")
        self.store = PublishingStore(self.root / "publisher.sqlite3")
        self.api = FakeProgressApi()
        self.clock = ProgressClock()

        self.runs_patch = patch.object(pipeline_log, "RUNS", self.runs)
        self.runs_patch.start()
        self.addCleanup(self.runs_patch.stop)
        self.env_patch = patch.dict(os.environ, {"SV_RUN_ID": "", "SV_RUN_DIR": ""}, clear=False)
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        self.root_patch = patch.object(progress_module, "ROOT", self.project_root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)

    @staticmethod
    def event(kind: str, seq: int, **fields: object) -> dict[str, object]:
        return {
            "seq": seq,
            "ts": f"2099-01-01T00:00:{seq:02d}.000Z",
            "kind": kind,
            **fields,
        }

    def write_events(self, events: list[dict[str, object]], *, trailing: bytes = b"") -> None:
        data = "\n".join(json.dumps(event, ensure_ascii=False) for event in events).encode("utf-8")
        if events:
            data += b"\n"
        (self.run_dir / "events.jsonl").write_bytes(data + trailing)

    def sync(self, api=None) -> ProgressCardSync:
        observer = ProgressCardSync(
            store=self.store,
            api=api or self.api,
            chat_id="-100001",
            clock=self.clock,
        )
        observer.sync()
        return observer

    def run_start(self, *, topic: str | None = "Алгоритмы") -> dict[str, object]:
        return self.event("run_start", 1, slug="progress-topic", topic=topic)

    def test_run_start_sends_once_and_persists_message_id(self):
        self.write_events([self.run_start()])
        self.sync()

        self.assertEqual(len(self.api.sends), 1)
        stored = json.loads(self.store.get_bot_state(f"telegram_progress:{self.run_id}"))
        self.assertEqual(stored["message_id"], 700)
        self.assertIsNotNone(stored["last_render_hash"])
        self.assertIsNone(stored["next_attempt_at"])

    def test_unchanged_events_use_semantic_hash_without_telegram_call(self):
        self.write_events([self.run_start()])
        self.sync()
        calls = len(self.api.calls)

        self.sync()

        self.assertEqual(len(self.api.calls), calls)

    def test_stage_change_edits_existing_message_after_throttle_window(self):
        self.write_events([self.run_start()])
        self.sync()
        self.write_events([self.run_start(), self.event("stage_start", 2, stage="critic")])
        self.clock.advance(4)

        self.sync()

        self.assertEqual(len(self.api.sends), 1)
        self.assertEqual(len(self.api.edits), 1)
        self.assertEqual(self.api.edits[0]["message_id"], 700)
        self.assertIn("Критик", self.api.edits[0]["text"])

    def test_noise_events_do_not_change_render_or_hash(self):
        significant = [self.run_start(), self.event("stage_start", 2, stage="render")]
        before = reduce_events(self.run_id, significant)
        before_text = render(before)
        before_hash = hashlib.sha256(before_text.encode("utf-8")).hexdigest()
        noise = [
            self.event("delegation_claim", 3, reason="ignored reason", worktree_path="/home/secret"),
            self.event("mcp_request_started", 4, argv=["secret-token"]),
            self.event("snapshot", 5, path="/home/secret"),
            self.event("cmd", 6, stderr_tail="secret output"),
        ]

        after_text = render(reduce_events(self.run_id, significant + noise))

        self.assertEqual(after_text, before_text)
        self.assertEqual(hashlib.sha256(after_text.encode("utf-8")).hexdigest(), before_hash)

        self.write_events(significant)
        self.sync()
        self.write_events(significant + noise)
        self.clock.advance(4)
        self.sync()
        self.assertEqual(len(self.api.edits), 0)

    def test_restarted_observer_reuses_persisted_message_id(self):
        self.write_events([self.run_start()])
        self.sync()
        self.write_events([self.run_start(), self.event("stage_start", 2, stage="publish")])
        self.clock.advance(4)
        restarted_api = FakeProgressApi()

        self.sync(restarted_api)

        self.assertEqual(restarted_api.sends, [])
        self.assertEqual(len(restarted_api.edits), 1)
        self.assertEqual(restarted_api.edits[0]["message_id"], 700)

    def test_delegate_failure_is_rendered_without_quarantine_when_unconfirmed_missing(self):
        events = [
            self.run_start(),
            self.event(
                "delegate_requested",
                2,
                actor="scriptwriter-deadbeef",
                task_id="scriptwriter:progress-topic",
                role="scriptwriter",
                infrastructure_attempt=1,
                semantic_attempt=0,
            ),
            self.event(
                "delegate_result_classified",
                3,
                actor="scriptwriter-deadbeef",
                task_id="scriptwriter:progress-topic",
                role="scriptwriter",
                result_class="infrastructure_failure",
                error_code="delegate_startup_timeout",
                infrastructure_attempt=1,
                semantic_attempt=0,
            ),
        ]

        text = render(reduce_events(self.run_id, events))

        self.assertIn("infrastructure_failure", text)
        self.assertIn("delegate_startup_timeout", text)
        self.assertIn("попытки", text)
        self.assertNotIn("Termination не подтверждён", text)

    def test_quarantine_clears_only_for_matching_termination_confirmation(self):
        events = [
            self.run_start(),
            self.event(
                "delegate_result_classified",
                2,
                actor="worker-12345678",
                task_id="task-1",
                role="scriptwriter",
                result_class="infrastructure_failure",
                error_code="delegate_startup_timeout",
                termination_unconfirmed=True,
            ),
        ]
        quarantined = render(reduce_events(self.run_id, events))
        confirmed = render(
            reduce_events(
                self.run_id,
                events
                + [
                    self.event(
                        "delegate_termination_confirmed",
                        3,
                        actor="worker-12345678",
                        task_id="task-1",
                        role="scriptwriter",
                    )
                ],
            )
        )

        self.assertIn("☣️", quarantined)
        self.assertNotIn("☣️", confirmed)

    def test_circuit_breaker_denial_is_rendered(self):
        text = render(
            reduce_events(
                self.run_id,
                [
                    self.run_start(),
                    self.event(
                        "delegation_denied",
                        2,
                        actor="scriptwriter-next",
                        task_id="scriptwriter:progress-topic",
                        role="scriptwriter",
                        detail="infrastructure_circuit_open",
                        error_code="infrastructure_circuit_open",
                    ),
                ],
            )
        )

        self.assertIn("Circuit breaker", text)
        self.assertIn("infrastructure_circuit_open", text)

    def test_placeholder_topic_is_replaced_by_draft_title_and_malformed_drafts_are_safe(self):
        placeholder_events = [self.run_start(topic=PROMPT_TOPIC_PLACEHOLDER)]
        pending = render(reduce_events(self.run_id, placeholder_events))
        self.assertIn("выбирается сценаристом", pending)
        self.assertNotIn(PROMPT_TOPIC_PLACEHOLDER, pending)

        draft_path = self.project_root / "episodes" / "drafts" / "progress-topic.draft.json"
        draft_path.write_text(json.dumps({"title": "Безопасная тема"}), encoding="utf-8")
        titled = render(
            reduce_events(
                self.run_id,
                placeholder_events + [self.event("worktree_closed", 2, actor="scriptwriter-a1")],
            )
        )
        self.assertIn("Безопасная тема", titled)
        self.assertNotIn("выбирается сценаристом", titled)

        for malformed in ("{not-json", json.dumps({"description": "no title"})):
            draft_path.write_text(malformed, encoding="utf-8")
            still_pending = render(
                reduce_events(
                    self.run_id,
                    placeholder_events + [self.event("worktree_closed", 2, actor="scriptwriter-a1")],
                )
            )
            self.assertIn("выбирается сценаристом", still_pending)

    def test_publication_created_finalizes_card_and_future_events_are_silent(self):
        self.write_events([self.run_start()])
        self.sync()
        self.write_events(
            [
                self.run_start(),
                self.event("publication_created", 2, publication_id="publication-1", slug="progress-topic"),
            ]
        )
        self.clock.advance(4)
        self.sync()
        self.assertEqual(len(self.api.edits), 1)
        stored = json.loads(self.store.get_bot_state(f"telegram_progress:{self.run_id}"))
        self.assertTrue(stored["terminal"])
        final_calls = len(self.api.calls)

        self.write_events(
            [
                self.run_start(),
                self.event("publication_created", 2, publication_id="publication-1", slug="progress-topic"),
                self.event("run_end", 3, status="failed", result_class="semantic_failure", error_code="late"),
                self.event("stage_start", 4, stage="publish"),
            ]
        )
        self.clock.advance(4)
        self.sync()

        self.assertEqual(len(self.api.calls), final_calls)

    def test_failed_run_without_publication_gets_terminal_edit_and_stays_silent(self):
        self.write_events([self.run_start()])
        self.sync()
        self.write_events(
            [
                self.run_start(),
                self.event(
                    "run_end",
                    2,
                    status="failed",
                    result_class="semantic_failure",
                    error_code="critic_rejected",
                ),
            ]
        )
        self.clock.advance(4)
        self.sync()

        self.assertEqual(len(self.api.edits), 1)
        self.assertIn("Прогон завершён с ошибкой", self.api.edits[0]["text"])
        self.assertIn("critic_rejected", self.api.edits[0]["text"])
        stored = json.loads(self.store.get_bot_state(f"telegram_progress:{self.run_id}"))
        self.assertTrue(stored["terminal"])
        calls = len(self.api.calls)
        self.clock.advance(4)
        self.sync()
        self.assertEqual(len(self.api.calls), calls)

    def test_edit_error_preserves_hash_and_retries_after_fixed_backoff(self):
        self.write_events([self.run_start()])
        self.sync()
        old_state = json.loads(self.store.get_bot_state(f"telegram_progress:{self.run_id}"))
        self.write_events([self.run_start(), self.event("stage_start", 2, stage="critic")])
        self.clock.advance(4)
        self.api.next_edit_error = TelegramError("Telegram API: 429 Too Many Requests")

        self.sync()

        failed_state = json.loads(self.store.get_bot_state(f"telegram_progress:{self.run_id}"))
        self.assertEqual(failed_state["message_id"], old_state["message_id"])
        self.assertEqual(failed_state["last_render_hash"], old_state["last_render_hash"])
        self.assertEqual(failed_state["last_edit_at"], old_state["last_edit_at"])
        self.assertFalse(failed_state["terminal"])
        self.assertIsNotNone(failed_state["next_attempt_at"])
        calls_after_failure = len(self.api.calls)

        self.clock.advance(29)
        self.sync()
        self.assertEqual(len(self.api.calls), calls_after_failure)
        self.clock.advance(1)
        self.sync()
        self.assertEqual(len(self.api.edits), 2)
        self.assertEqual(self.api.edits[-1]["message_id"], old_state["message_id"])

    def test_realistic_429_description_gets_rate_limit_backoff_not_generic_backoff(self):
        # tools/telegram_bot.py never forwards the HTTP status code, only
        # Telegram's own description text, and a genuine 429 response reads
        # like "Too Many Requests: retry after 5" — no literal "429" digits
        # anywhere in it. A detector keyed only on the substring "429" never
        # matches this real shape and silently always falls back to the
        # generic 10s backoff instead of the intended 30s.
        self.write_events([self.run_start()])
        self.sync()
        self.write_events([self.run_start(), self.event("stage_start", 2, stage="critic")])
        self.clock.advance(4)
        self.api.next_edit_error = TelegramError("Telegram API: Too Many Requests: retry after 5")

        self.sync()

        calls_after_failure = len(self.api.calls)
        self.clock.advance(10)
        self.sync()
        self.assertEqual(
            len(self.api.calls), calls_after_failure,
            "10s generic backoff must not be enough to retry a real 429",
        )
        self.clock.advance(20)
        self.sync()
        self.assertEqual(len(self.api.edits), 2)

    def test_long_card_is_truncated_to_telegram_message_limit(self):
        events = [self.run_start()]
        # Enough completed stages to push the rendered card past Telegram's
        # 4096-character sendMessage/editMessageText limit.
        for i in range(400):
            events.append(self.event("stage_start", 2 + 2 * i, stage="critic"))
            events.append(self.event("stage_end", 3 + 2 * i, stage="critic", status="ok"))
        self.write_events(events)

        self.sync()

        sent_text = self.api.sends[0]["text"]
        self.assertLessEqual(len(sent_text), 4096)
        self.assertTrue(sent_text.endswith("…"))

    def test_timestamps_render_in_msk_not_utc(self):
        # run_start's ts fixture is "2099-01-01T00:00:01.000Z" (UTC) -> the
        # card must show local Moscow time (UTC+3): 03:00:01, not 00:00:01.
        text = render(reduce_events(self.run_id, [self.run_start()]))
        self.assertIn("03:00:01 MSK", text)
        self.assertNotIn("00:00:01 UTC", text)
        self.assertNotIn("UTC", text)

    def test_renderer_never_exposes_forbidden_event_fields(self):
        text = render(
            reduce_events(
                self.run_id,
                [
                    self.run_start(),
                    self.event(
                        "delegate_requested",
                        2,
                        actor="worker-abc",
                        task_id="task-1",
                        role="critic",
                        infrastructure_attempt=1,
                        semantic_attempt=1,
                        worktree_path="/home/toligrim/private-worktree",
                        reason="SECRET_FREE_FORM_REASON",
                    ),
                ],
            )
        )

        self.assertNotIn("worktree_path", text)
        self.assertNotIn("/home/toligrim/private-worktree", text)
        self.assertNotIn("SECRET_FREE_FORM_REASON", text)

    def test_missing_current_run_is_a_noop(self):
        (self.runs / ".current").unlink()

        self.sync()

        self.assertEqual(self.api.calls, [])

    def test_reader_skips_truncated_last_json_line(self):
        self.write_events(
            [self.run_start()],
            trailing=b'{"seq":2,"kind":"stage_start","stage":"critic"',
        )

        events = read_events(self.run_dir)
        state = reduce_events(self.run_id, events)

        self.assertEqual(len(events), 1)
        self.assertEqual(state.slug, "progress-topic")
        self.assertIsNone(state.current_stage)

    def test_review_emits_publication_created_telemetry_without_creating_a_run(self):
        review = SimpleNamespace(
            publication=SimpleNamespace(
                id="publication-1",
                slug="progress-topic",
                state=SimpleNamespace(value="review_pending"),
                execution_mode=SimpleNamespace(value="dry-run"),
            ),
            asset=SimpleNamespace(sha256="asset-sha"),
            metadata=SimpleNamespace(sha256="metadata-sha"),
        )
        with patch.object(publish_cli, "_config", return_value=object()), patch.object(
            publish_cli, "_check_overlaps"
        ), patch.object(publish_cli, "prepare_review", return_value=review), patch.object(
            pipeline_log, "current_run_id", return_value=self.run_id
        ), patch.object(pipeline_log, "run_dir_for", return_value=self.run_dir), patch.object(
            pipeline_log, "append_event"
        ) as append_event:
            result = publish_cli.main(
                [
                    "review",
                    "--slug",
                    "progress-topic",
                    "--video",
                    "asset.mp4",
                    "--metadata",
                    "metadata.json",
                ]
            )

        self.assertEqual(result, 0)
        append_event.assert_called_once_with(
            self.run_dir,
            {
                "kind": "publication_created",
                "publication_id": "publication-1",
                "slug": "progress-topic",
            },
        )


if __name__ == "__main__":
    unittest.main()

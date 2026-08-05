import json
import os
from hashlib import sha256
from pathlib import Path
import tempfile
import unittest

from publishing.metadata import (
    MetadataError,
    PUBLISH_SCHEMA_PATH,
    canonical_json_bytes,
    load_metadata,
    metadata_sha256,
    parse_metadata_bytes,
    verify_metadata_snapshot,
    write_metadata_snapshot,
)


VALID_METADATA = {
    "schema_version": 1,
    "slug": "hash-tables",
    "targets": {
        "youtube": {
            "title": "Почему хеш-таблицы не ломаются",
            "description": "Коллизия — не поломка.",
            "tags": ["алгоритмы", "хеш-таблицы"],
            "category_id": "28",
            "privacy_status": "public",
            "made_for_kids": False,
            "contains_synthetic_media": True,
            "notify_subscribers": False,
        },
        "instagram": {
            "caption": "Коллизия — не поломка.",
            "share_to_feed": True,
        },
    },
}


class PublishingMetadataTests(unittest.TestCase):
    def test_schema_file_is_valid_json_and_declares_strict_root(self):
        schema = json.loads(PUBLISH_SCHEMA_PATH.read_text(encoding="utf-8"))
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(schema["properties"]["schema_version"]["const"], 1)

    def test_canonical_hash_does_not_depend_on_key_order(self):
        reversed_order = {
            "targets": {
                "instagram": VALID_METADATA["targets"]["instagram"],
                "youtube": VALID_METADATA["targets"]["youtube"],
            },
            "slug": "hash-tables",
            "schema_version": 1,
        }
        self.assertEqual(canonical_json_bytes(VALID_METADATA), canonical_json_bytes(reversed_order))
        self.assertEqual(metadata_sha256(VALID_METADATA), metadata_sha256(reversed_order))
        self.assertNotIn(b"\n", canonical_json_bytes(VALID_METADATA))

    def test_duplicate_key_at_any_depth_is_rejected(self):
        raw = b'''{
          "schema_version": 1,
          "slug": "hash-tables",
          "targets": {
            "instagram": {"caption": "one", "caption": "two", "share_to_feed": true}
          }
        }'''
        with self.assertRaisesRegex(MetadataError, "duplicate JSON key"):
            parse_metadata_bytes(raw)

    def test_nonstandard_json_constants_are_rejected(self):
        raw = b'''{
          "schema_version": 1,
          "slug": "hash-tables",
          "targets": {"instagram": {"caption": "ok", "share_to_feed": true}},
          "ignored": NaN
        }'''
        with self.assertRaisesRegex(MetadataError, "non-standard JSON constant"):
            parse_metadata_bytes(raw)

    def test_contract_rejects_unknown_key_and_wrong_boolean_type(self):
        bad = json.loads(json.dumps(VALID_METADATA))
        bad["targets"]["youtube"]["surprise"] = "not reviewed"
        with self.assertRaisesRegex(MetadataError, "unknown keys"):
            canonical_json_bytes(bad)

        bad = json.loads(json.dumps(VALID_METADATA))
        bad["targets"]["instagram"]["share_to_feed"] = 1
        with self.assertRaisesRegex(MetadataError, "expected boolean"):
            canonical_json_bytes(bad)

        bad = json.loads(json.dumps(VALID_METADATA))
        bad["schema_version"] = 1.0
        with self.assertRaisesRegex(MetadataError, "expected integer 1"):
            canonical_json_bytes(bad)

    def test_load_rejects_noncanonical_semantics_but_accepts_whitespace(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "metadata.json"
            path.write_text(json.dumps(VALID_METADATA, ensure_ascii=False, indent=2), encoding="utf-8")
            self.assertEqual(load_metadata(path)["slug"], "hash-tables")

            path.write_text("[]", encoding="utf-8")
            with self.assertRaisesRegex(MetadataError, "root must be an object"):
                load_metadata(path)

    def test_snapshot_is_content_addressed_idempotent_and_detects_mutation(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp) / "snapshots"
            first = write_metadata_snapshot(VALID_METADATA, directory)
            second = write_metadata_snapshot(VALID_METADATA, directory)
            self.assertEqual(first, second)
            self.assertEqual(first.path.name, f"{metadata_sha256(VALID_METADATA)}.json")
            self.assertEqual(first.path.read_bytes(), canonical_json_bytes(VALID_METADATA))
            self.assertEqual(verify_metadata_snapshot(first.path, first.sha256)["slug"], "hash-tables")

            os.chmod(first.path, 0o644)
            first.path.write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(MetadataError, "collision or mutation"):
                write_metadata_snapshot(VALID_METADATA, directory)

    def test_verify_rejects_reformatted_or_wrong_hash_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "reformatted.json"
            raw = json.dumps(VALID_METADATA, ensure_ascii=False, indent=2).encode("utf-8")
            path.write_bytes(raw)
            with self.assertRaisesRegex(MetadataError, "not canonical"):
                verify_metadata_snapshot(path, sha256(raw).hexdigest())
            with self.assertRaisesRegex(MetadataError, "hash mismatch"):
                verify_metadata_snapshot(path, "0" * 64)


if __name__ == "__main__":
    unittest.main()

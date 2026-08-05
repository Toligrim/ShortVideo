"""Strict publication metadata parsing and immutable canonical snapshots."""
from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import tempfile
from typing import Any, NoReturn


ROOT = Path(__file__).resolve().parents[2]
PUBLISH_SCHEMA_PATH = ROOT / "schema" / "publish.schema.json"
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class MetadataError(ValueError):
    """Raised when publication metadata is malformed or unsafe to approve."""


@dataclass(frozen=True)
class MetadataSnapshot:
    path: Path
    sha256: str
    byte_count: int


def _fail(message: str) -> NoReturn:
    raise MetadataError(message)


def _no_duplicate_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            _fail(f"duplicate JSON key: {key!r}")
        result[key] = value
    return result


def _reject_nonstandard_constant(value: str) -> NoReturn:
    _fail(f"non-standard JSON constant: {value}")


def parse_metadata_bytes(raw: bytes, *, source: str = "metadata") -> dict[str, Any]:
    """Decode UTF-8 JSON while rejecting duplicate keys at every nesting level."""
    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_no_duplicate_object,
            parse_constant=_reject_nonstandard_constant,
        )
    except UnicodeDecodeError as exc:
        raise MetadataError(f"{source}: expected UTF-8 JSON") from exc
    except json.JSONDecodeError as exc:
        raise MetadataError(f"{source}: invalid JSON: {exc.msg}") from exc
    if not isinstance(value, dict):
        _fail(f"{source}: root must be an object")
    validate_metadata(value)
    return value


def load_metadata(path: Path | str) -> dict[str, Any]:
    source = Path(path)
    try:
        raw = source.read_bytes()
    except OSError as exc:
        raise MetadataError(f"cannot read metadata {source}: {exc.strerror or exc}") from exc
    return parse_metadata_bytes(raw, source=str(source))


def _expect_object(value: Any, location: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        _fail(f"{location}: expected object")
    return value


def _expect_keys(value: dict[str, Any], location: str, required: set[str]) -> None:
    if any(not isinstance(key, str) for key in value):
        _fail(f"{location}: object keys must be strings")
    missing = required - value.keys()
    unknown = value.keys() - required
    if missing:
        _fail(f"{location}: missing required keys: {', '.join(sorted(missing))}")
    if unknown:
        _fail(f"{location}: unknown keys: {', '.join(sorted(unknown))}")


def _expect_string(value: Any, location: str, *, minimum: int = 0, maximum: int) -> str:
    if not isinstance(value, str):
        _fail(f"{location}: expected string")
    if not minimum <= len(value) <= maximum:
        _fail(f"{location}: expected length {minimum}..{maximum}")
    return value


def _expect_bool(value: Any, location: str) -> None:
    if not isinstance(value, bool):
        _fail(f"{location}: expected boolean")


def _validate_youtube(value: Any) -> None:
    location = "targets.youtube"
    target = _expect_object(value, location)
    required = {
        "title",
        "description",
        "tags",
        "category_id",
        "privacy_status",
        "made_for_kids",
        "contains_synthetic_media",
        "notify_subscribers",
    }
    _expect_keys(target, location, required)
    _expect_string(target["title"], f"{location}.title", minimum=1, maximum=100)
    _expect_string(target["description"], f"{location}.description", maximum=5000)
    category_id = _expect_string(target["category_id"], f"{location}.category_id", minimum=1, maximum=3)
    if not category_id.isascii() or not category_id.isdigit():
        _fail(f"{location}.category_id: expected 1..3 ASCII digits")
    if target["privacy_status"] not in {"private", "unlisted", "public"}:
        _fail(f"{location}.privacy_status: expected private, unlisted, or public")
    for key in ("made_for_kids", "contains_synthetic_media", "notify_subscribers"):
        _expect_bool(target[key], f"{location}.{key}")
    tags = target["tags"]
    if not isinstance(tags, list) or len(tags) > 15:
        _fail(f"{location}.tags: expected an array with at most 15 entries")
    seen: set[str] = set()
    for index, tag in enumerate(tags):
        tag = _expect_string(tag, f"{location}.tags[{index}]", minimum=1, maximum=100)
        if tag in seen:
            _fail(f"{location}.tags: duplicate tag {tag!r}")
        seen.add(tag)


def _validate_instagram(value: Any) -> None:
    location = "targets.instagram"
    target = _expect_object(value, location)
    _expect_keys(target, location, {"caption", "share_to_feed"})
    _expect_string(target["caption"], f"{location}.caption", maximum=2200)
    _expect_bool(target["share_to_feed"], f"{location}.share_to_feed")


def validate_metadata(metadata: Any) -> None:
    """Validate the runtime contract without depending on a third-party validator."""
    root = _expect_object(metadata, "metadata")
    _expect_keys(root, "metadata", {"schema_version", "slug", "targets"})
    if (
        not isinstance(root["schema_version"], int)
        or isinstance(root["schema_version"], bool)
        or root["schema_version"] != 1
    ):
        _fail("metadata.schema_version: expected integer 1")
    slug = _expect_string(root["slug"], "metadata.slug", minimum=1, maximum=80)
    if not SLUG_RE.fullmatch(slug):
        _fail("metadata.slug: expected lowercase kebab-case")
    targets = _expect_object(root["targets"], "metadata.targets")
    if not targets:
        _fail("metadata.targets: at least one target is required")
    unknown = set(targets) - {"youtube", "instagram"}
    if unknown:
        _fail(f"metadata.targets: unknown targets: {', '.join(sorted(unknown))}")
    if "youtube" in targets:
        _validate_youtube(targets["youtube"])
    if "instagram" in targets:
        _validate_instagram(targets["instagram"])


def canonical_json_bytes(metadata: Any) -> bytes:
    """Return the sole byte representation covered by an approval hash."""
    validate_metadata(metadata)
    try:
        return json.dumps(
            metadata,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise MetadataError(f"metadata cannot be canonicalized: {exc}") from exc


def metadata_sha256(metadata: Any) -> str:
    return sha256(canonical_json_bytes(metadata)).hexdigest()


def write_metadata_snapshot(metadata: Any, destination: Path | str) -> MetadataSnapshot:
    """Create a content-addressed snapshot without ever overwriting one.

    A pre-existing path is accepted only when it already contains the exact
    canonical bytes. This keeps repeated review preparation idempotent and
    detects accidental or hostile mutation of an approved snapshot.
    """
    data = canonical_json_bytes(metadata)
    digest = sha256(data).hexdigest()
    directory = Path(destination)
    directory.mkdir(parents=True, exist_ok=True)
    final_path = directory / f"{digest}.json"

    try:
        existing = final_path.read_bytes()
    except FileNotFoundError:
        existing = None
    except OSError as exc:
        raise MetadataError(f"cannot inspect metadata snapshot {final_path}: {exc}") from exc
    if existing is not None:
        if existing != data:
            _fail(f"metadata snapshot collision or mutation: {final_path}")
        return MetadataSnapshot(final_path, digest, len(data))

    temp_path: Path | None = None
    try:
        fd, temp_name = tempfile.mkstemp(prefix=f".{digest}.", suffix=".tmp", dir=directory)
        temp_path = Path(temp_name)
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temp_path, 0o444)
        try:
            # link() is atomic and, unlike replace(), never overwrites a
            # concurrent writer's immutable content-addressed snapshot.
            os.link(temp_path, final_path)
        except FileExistsError:
            existing = final_path.read_bytes()
            if existing != data:
                _fail(f"metadata snapshot collision or mutation: {final_path}")
        finally:
            temp_path.unlink(missing_ok=True)
            temp_path = None
    except OSError as exc:
        raise MetadataError(f"cannot write metadata snapshot {final_path}: {exc}") from exc
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
    return MetadataSnapshot(final_path, digest, len(data))


def verify_metadata_snapshot(path: Path | str, expected_sha256: str) -> dict[str, Any]:
    """Verify both byte-level immutability and semantic strictness on reuse."""
    snapshot_path = Path(path)
    try:
        raw = snapshot_path.read_bytes()
    except OSError as exc:
        raise MetadataError(f"cannot read metadata snapshot {snapshot_path}: {exc}") from exc
    actual = sha256(raw).hexdigest()
    if actual != expected_sha256:
        _fail(f"metadata snapshot hash mismatch: expected {expected_sha256}, got {actual}")
    metadata = parse_metadata_bytes(raw, source=str(snapshot_path))
    if canonical_json_bytes(metadata) != raw:
        _fail(f"metadata snapshot is not canonical: {snapshot_path}")
    return metadata

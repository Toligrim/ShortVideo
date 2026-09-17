#!/usr/bin/env python3
from __future__ import annotations

import contextlib
import hashlib
import json
import os
import re
import tempfile
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterator

try:
    import fcntl
except ImportError:  # pragma: no cover - Raspberry Pi/Linux has fcntl
    fcntl = None

DEFAULT_TTL_SECONDS = 20 * 60
SEARCH_LIMIT_BUCKETS = (5, 10)
SEARCH_LOCK_SHARDS = 64
MAX_SEARCH_FILES = 512
MAX_EXTRACT_INDEX_ENTRIES = 500
MAX_STORED_TEXT_CHARS = 2_000_000
MODEL_CACHE_PREFIX = "@web-cache/"


def cache_root() -> Path:
    configured = os.environ.get("SHORTVIDEO_WEB_CACHE_DIR", "").strip()
    root = Path(configured).expanduser() if configured else Path.home() / ".cache" / "shortvideo" / "openrouter-web"
    root = root.resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    return root


def ttl_seconds() -> float:
    raw = os.environ.get("SHORTVIDEO_WEB_CACHE_TTL_SECONDS", "").strip()
    if not raw:
        return float(DEFAULT_TTL_SECONDS)
    try:
        value = float(raw)
    except ValueError:
        return float(DEFAULT_TTL_SECONDS)
    return max(60.0, min(value, 24 * 60 * 60.0))


def normalize_query(query: str) -> str:
    return re.sub(r"\s+", " ", (query or "").strip().casefold())


def bucket_limit(limit: int) -> int:
    return next((bucket for bucket in SEARCH_LIMIT_BUCKETS if limit <= bucket), SEARCH_LIMIT_BUCKETS[-1])


def _deep_copy(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False))


def _atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(temp_name, path)
    finally:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass


def _atomic_write_json(path: Path, value: Any) -> None:
    _atomic_write_text(path, json.dumps(value, ensure_ascii=False, separators=(",", ":")))


def _digest(parts: tuple[Any, ...]) -> str:
    raw = json.dumps(parts, ensure_ascii=False, sort_keys=False, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@contextlib.contextmanager
def _process_lock(path: Path) -> Iterator[None]:
    """Best-effort inter-process lock; atomic replace remains the corruption boundary."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a+", encoding="utf-8") as fh:
        if fcntl is not None:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            if fcntl is not None:
                fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


def model_path_for(path: Path, root: Path | None = None) -> str:
    root = (root or cache_root()).resolve()
    resolved = path.resolve()
    rel = resolved.relative_to(root)
    return MODEL_CACHE_PREFIX + rel.as_posix()


def resolve_model_cache_path(raw: str, root: Path | None = None) -> Path:
    if not raw.startswith(MODEL_CACHE_PREFIX):
        raise ValueError("not a web-cache model path")
    root = (root or cache_root()).resolve()
    rel = raw[len(MODEL_CACHE_PREFIX):]
    if not rel or "\x00" in rel:
        raise ValueError("invalid web-cache path")
    rel_path = Path(rel)
    if not rel_path.parts or rel_path.parts[0] not in {"pages", "extract"}:
        raise ValueError("web-cache path is not a model-readable page")
    candidate = (root / rel_path).resolve()
    candidate.relative_to(root)
    return candidate


@dataclass
class _Flight:
    event: threading.Event = field(default_factory=threading.Event)
    result: Any = None
    error: BaseException | None = None


class SearchMemo:
    """TTL search memo with disk reuse and thread/process single-flight coalescing.

    Threads in one harness process share an exact-key in-memory flight. Separate
    delegate processes additionally serialize through a fixed set of advisory
    lock shards. The bounded shard set avoids one lock file per query forever;
    after acquiring a shard a waiter rechecks disk cache before making network
    I/O, so an identical query completed by another process is reused.
    """

    MAX_ACTIVE_FLIGHTS = 256

    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or cache_root()).resolve()
        self.search_dir = self.root / "search"
        self.search_dir.mkdir(parents=True, exist_ok=True)
        self.flight_lock_dir = self.root / "search-locks"
        self.flight_lock_dir.mkdir(parents=True, exist_ok=True)
        self._store: dict[tuple[str, str, int], tuple[float, dict[str, Any]]] = {}
        self._lock = threading.Lock()
        self._flights: dict[tuple[str, str, int], _Flight] = {}

    @staticmethod
    def key(provider: str, query: str, limit: int) -> tuple[str, str, int]:
        return provider, normalize_query(query), bucket_limit(limit)

    def _disk_path(self, key: tuple[str, str, int]) -> Path:
        return self.search_dir / f"{_digest(key)}.json"

    def _flight_lock_path(self, key: tuple[str, str, int]) -> Path:
        shard = int(_digest(key)[:8], 16) % SEARCH_LOCK_SHARDS
        return self.flight_lock_dir / f"{shard:02d}.lock"

    def lookup(self, provider: str, query: str, limit: int) -> dict[str, Any] | None:
        key = self.key(provider, query, limit)
        now_mono = time.monotonic()
        with self._lock:
            hit = self._store.get(key)
            if hit is not None:
                if now_mono < hit[0]:
                    return _deep_copy(hit[1])
                self._store.pop(key, None)
        path = self._disk_path(key)
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            expires_at = float(payload.get("expires_at", 0)) if isinstance(payload, dict) else 0.0
            remaining = expires_at - time.time()
            if not isinstance(payload, dict) or remaining <= 0:
                path.unlink(missing_ok=True)
                return None
            response = payload.get("response")
            if not isinstance(response, dict) or not response.get("ok"):
                return None
        except Exception:
            return None
        # Preserve the original disk expiry. A disk hit late in the TTL window
        # must not acquire a fresh full in-memory TTL and outlive expires_at.
        with self._lock:
            self._store[key] = (time.monotonic() + remaining, _deep_copy(response))
        return _deep_copy(response)

    def store(self, provider: str, query: str, limit: int, response: dict[str, Any]) -> None:
        if not isinstance(response, dict) or not response.get("ok"):
            return
        key = self.key(provider, query, limit)
        copied = _deep_copy(response)
        with self._lock:
            now = time.monotonic()
            self._store = {k: v for k, v in self._store.items() if now < v[0]}
            self._store[key] = (now + ttl_seconds(), copied)
        _atomic_write_json(
            self._disk_path(key),
            {"expires_at": time.time() + ttl_seconds(), "response": copied},
        )
        self._prune_disk()

    def _prune_disk(self) -> None:
        try:
            files = sorted(self.search_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
            for path in files[MAX_SEARCH_FILES:]:
                path.unlink(missing_ok=True)
        except OSError:
            pass

    def _run_process_flight(
        self,
        key: tuple[str, str, int],
        provider: str,
        query: str,
        limit: int,
        fn: Callable[[], Any],
    ) -> Any:
        if fcntl is None:
            return fn()
        with _process_lock(self._flight_lock_path(key)):
            # Another harness/delegate process may have completed this exact
            # request while we waited on the shard. Recheck disk cache only
            # after taking the process lock, before any network call.
            hit = self.lookup(provider, query, limit)
            if hit is not None:
                return hit
            return fn()

    def singleflight(self, provider: str, query: str, limit: int, fn: Callable[[], Any]) -> Any:
        key = self.key(provider, query, limit)
        with self._lock:
            flight = self._flights.get(key)
            if flight is None and len(self._flights) < self.MAX_ACTIVE_FLIGHTS:
                flight = _Flight()
                self._flights[key] = flight
                leader = True
            elif flight is None:
                leader = True
                flight = None
            else:
                leader = False
        if flight is None:
            return self._run_process_flight(key, provider, query, limit, fn)
        if not leader:
            flight.event.wait()
            if flight.error is not None:
                raise flight.error
            return _deep_copy(flight.result)
        try:
            result = self._run_process_flight(key, provider, query, limit, fn)
            flight.result = _deep_copy(result)
            return result
        except BaseException as exc:
            flight.error = exc
            raise
        finally:
            flight.event.set()
            with self._lock:
                self._flights.pop(key, None)

    def clear_memory(self) -> None:
        with self._lock:
            self._store.clear()
            self._flights.clear()


class ExtractDiskCache:
    INDEX = "extract-index.json"

    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or cache_root()).resolve()
        self.extract_dir = self.root / "extract"
        self.extract_dir.mkdir(parents=True, exist_ok=True)
        self.index_path = self.root / self.INDEX
        self.lock_path = self.root / ".extract-index.lock"
        self._lock = threading.Lock()

    @staticmethod
    def key(url: str, mode: str, provider: str = "shortvideo") -> str:
        return _digest((url, mode, provider))[:32]

    def _load_index(self) -> dict[str, Any]:
        try:
            value = json.loads(self.index_path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except Exception:
            return {}

    def _save_index(self, index: dict[str, Any]) -> None:
        if len(index) > MAX_EXTRACT_INDEX_ENTRIES:
            newest = sorted(
                index.items(), key=lambda item: float(item[1].get("fetched_at", 0)), reverse=True
            )
            index = dict(newest[:MAX_EXTRACT_INDEX_ENTRIES])
        _atomic_write_json(self.index_path, index)

    def get(self, url: str, mode: str, provider: str = "shortvideo") -> dict[str, Any] | None:
        key = self.key(url, mode, provider)
        with self._lock, _process_lock(self.lock_path):
            entry = self._load_index().get(key)
        if not isinstance(entry, dict):
            return None
        try:
            fetched_at = float(entry.get("fetched_at", 0))
        except (TypeError, ValueError):
            return None
        if time.time() - fetched_at >= ttl_seconds():
            return None
        try:
            rel = str(entry["file"])
            path = (self.root / rel).resolve()
            path.relative_to(self.root)
            content = path.read_text(encoding="utf-8")
        except Exception:
            return None
        meta = entry.get("meta") if isinstance(entry.get("meta"), dict) else {}
        return {
            "content": content,
            "meta": _deep_copy(meta),
            "model_path": model_path_for(path, self.root),
            "cached": True,
        }

    def put(
        self,
        url: str,
        mode: str,
        content: str,
        meta: dict[str, Any],
        provider: str = "shortvideo",
    ) -> str | None:
        if not content or len(content) > MAX_STORED_TEXT_CHARS:
            return None
        key = self.key(url, mode, provider)
        rel = Path("extract") / f"{key}.md"
        path = self.root / rel
        with self._lock, _process_lock(self.lock_path):
            # Keep the content version and its index metadata under one cross-process
            # critical section. Atomic replace prevents torn files; the lock prevents
            # two writers for the same cache key from publishing mismatched metadata.
            _atomic_write_text(path, content)
            index = self._load_index()
            index[key] = {
                "url": url,
                "mode": mode,
                "provider": provider,
                "file": rel.as_posix(),
                "fetched_at": time.time(),
                "meta": _deep_copy(meta),
            }
            self._save_index(index)
        return model_path_for(path, self.root)

    def spill(self, url: str, mode: str, content: str) -> dict[str, Any]:
        digest = self.key(url, mode, "spill")
        rel = Path("pages") / f"{digest}.md"
        path = self.root / rel
        total = len(content)
        complete = total <= MAX_STORED_TEXT_CHARS
        stored = content
        if not complete:
            stored = content[:MAX_STORED_TEXT_CHARS] + (
                f"\n\n[STORED COPY CAPPED: showing first {MAX_STORED_TEXT_CHARS} of {total} clean characters. "
                "Fetch a more specific URL for omitted content.]"
            )
        _atomic_write_text(path, stored)
        return {
            "model_path": model_path_for(path, self.root),
            "stored_chars": min(total, MAX_STORED_TEXT_CHARS),
            "total_chars": total,
            "complete": complete,
        }

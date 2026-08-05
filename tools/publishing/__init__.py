"""Durable, approval-gated social publishing primitives.

The package deliberately contains no platform side effects in the first stage.
Future workers and adapters build on its metadata snapshots and SQLite store.
"""

from .db import PublishingStore
from .metadata import MetadataError, MetadataSnapshot, load_metadata, metadata_sha256

__all__ = [
    "MetadataError",
    "MetadataSnapshot",
    "PublishingStore",
    "load_metadata",
    "metadata_sha256",
]

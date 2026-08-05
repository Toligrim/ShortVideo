"""Durable, approval-gated social publishing primitives.

Provider effects are isolated behind the fenced worker/adapters contract; the
built-in dry-run adapter remains entirely local.
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

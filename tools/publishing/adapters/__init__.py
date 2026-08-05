"""Platform adapter contracts.

Concrete live providers intentionally do not exist yet.  The worker can only
use the deterministic local dry-run adapter until a provider implementation
can meet this package's idempotency and reconciliation contract.
"""

from .base import (
    AdapterFactory,
    AmbiguousPublishError,
    PermanentPublishError,
    PublishAdapter,
    PublishRequest,
    PublishResult,
    RetryablePublishError,
)
from .dry_run import DryRunAdapter

__all__ = [
    "AdapterFactory",
    "AmbiguousPublishError",
    "DryRunAdapter",
    "PermanentPublishError",
    "PublishAdapter",
    "PublishRequest",
    "PublishResult",
    "RetryablePublishError",
]

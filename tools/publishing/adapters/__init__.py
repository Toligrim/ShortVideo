"""Platform adapter contracts.

The YouTube adapter implements the resumable-session and OAuth contract.
Instagram intentionally remains unavailable in live mode until it can meet the
same idempotency and reconciliation guarantees.
"""

from .base import (
    AdapterFactory,
    AmbiguousPublishError,
    PermanentPublishError,
    PublishAdapter,
    PublishRequest,
    PublishResult,
    ResumableSessionCheckpoint,
    ResumableSessionCapableFactory,
    RetryablePublishError,
)
from .dry_run import DryRunAdapter
from .youtube import (
    YouTubeConfigurationError,
    YouTubeLiveAdapterFactory,
    YouTubeOAuthError,
    YouTubeOAuthSettings,
    YouTubeResumableAdapter,
)

__all__ = [
    "AdapterFactory",
    "AmbiguousPublishError",
    "DryRunAdapter",
    "PermanentPublishError",
    "PublishAdapter",
    "PublishRequest",
    "PublishResult",
    "ResumableSessionCheckpoint",
    "ResumableSessionCapableFactory",
    "RetryablePublishError",
    "YouTubeConfigurationError",
    "YouTubeLiveAdapterFactory",
    "YouTubeOAuthError",
    "YouTubeOAuthSettings",
    "YouTubeResumableAdapter",
]

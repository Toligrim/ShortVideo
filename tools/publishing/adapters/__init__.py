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
from .live import CombinedLiveAdapterFactory, instagram_doctor
from .instagram import InstagramConfigurationError, InstagramReelsAdapter, InstagramSettings
from .r2 import R2Config, R2TemporaryMedia
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
    "CombinedLiveAdapterFactory",
    "instagram_doctor",
    "InstagramConfigurationError",
    "InstagramReelsAdapter",
    "InstagramSettings",
    "PermanentPublishError",
    "PublishAdapter",
    "PublishRequest",
    "PublishResult",
    "ResumableSessionCheckpoint",
    "ResumableSessionCapableFactory",
    "RetryablePublishError",
    "R2Config",
    "R2TemporaryMedia",
    "YouTubeConfigurationError",
    "YouTubeLiveAdapterFactory",
    "YouTubeOAuthError",
    "YouTubeOAuthSettings",
    "YouTubeResumableAdapter",
]

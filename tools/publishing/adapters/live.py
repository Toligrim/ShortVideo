"""Safe composition of the live platform adapters.

Construction stays lazy: a YouTube-only job never needs Instagram/R2
credentials, and local validation never instantiates an R2 client.
"""
from __future__ import annotations

from pathlib import Path
from typing import Callable

from .base import PermanentPublishError, PublishAdapter
from .instagram import InstagramConfigurationError, InstagramReelsAdapter, InstagramSettings
from .r2 import R2ConfigurationError, R2TemporaryMedia, R2Config
from .youtube import YouTubeLiveAdapterFactory
from ..security import PrivatePathError, absolute_path


class CombinedLiveAdapterFactory:
    """Choose a configured live adapter without coupling provider credentials."""

    def __init__(self, state_dir: Path | str, *, youtube_factory: Callable[[str], PublishAdapter] | None = None):
        self.state_dir = absolute_path(state_dir)
        self._youtube = youtube_factory or YouTubeLiveAdapterFactory(self.state_dir)

    def supports_resumable_session(self, platform: str) -> bool:
        return platform == "youtube"

    def supports_instagram_checkpoint(self, platform: str) -> bool:
        return platform == "instagram"

    def __call__(self, platform: str) -> PublishAdapter:
        if platform == "youtube":
            return self._youtube(platform)
        if platform != "instagram":
            raise PermanentPublishError("live_adapter_unavailable", "no live adapter is configured for this platform")
        try:
            settings = InstagramSettings.from_environment(state_dir=self.state_dir)
            r2 = R2TemporaryMedia(R2Config.from_environment())
            return InstagramReelsAdapter(settings, r2)
        except (InstagramConfigurationError, R2ConfigurationError, PrivatePathError):
            raise PermanentPublishError(
                "instagram_configuration_invalid",
                "Instagram live adapter is not configured safely",
            ) from None


def instagram_doctor(*, state_dir: Path | str) -> dict[str, object]:
    """Validate only local Instagram/R2 configuration; never create a client."""
    try:
        settings = InstagramSettings.from_environment(state_dir=state_dir)
        settings.read_access_token()
        R2Config.from_environment()
    except (InstagramConfigurationError, R2ConfigurationError, PrivatePathError):
        raise PermanentPublishError(
            "instagram_configuration_invalid", "Instagram live adapter is not configured safely"
        ) from None
    return {
        "provider": "instagram",
        "access_token_configured": True,
        "r2_configured": True,
        "api_version": settings.api_version,
    }

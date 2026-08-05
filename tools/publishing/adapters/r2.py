"""Temporary, opaque R2 objects used by providers that fetch a public URL.

The helper deliberately contains no publishing policy.  It uploads one
immutable local asset, returns a short-lived presigned GET capability, and
can remove exactly that object once the provider no longer needs it.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import os
from pathlib import Path
import re
import stat
from typing import Any, Callable, Mapping, Protocol
from urllib.parse import urlsplit

from ..security import PrivatePathError, absolute_path, reject_symlink_chain


_ACCOUNT_ID_RE = re.compile(r"^[0-9a-fA-F]{32}$")
_BUCKET_RE = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
MIN_TTL_SECONDS = 60
MAX_TTL_SECONDS = 24 * 60 * 60


class R2ConfigurationError(RuntimeError):
    """R2 configuration is absent or unsafe; messages never include secrets."""


class R2AssetError(RuntimeError):
    """The requested immutable upload asset cannot safely be staged."""


class R2OperationError(RuntimeError):
    """A runtime R2 client operation failed without exposing provider details."""


class R2Client(Protocol):
    def upload_file(self, Filename: str, Bucket: str, Key: str, ExtraArgs: Mapping[str, Any]) -> None: ...

    def generate_presigned_url(
        self, ClientMethod: str, Params: Mapping[str, str], ExpiresIn: int, HttpMethod: str
    ) -> str: ...

    def delete_object(self, *, Bucket: str, Key: str) -> Any: ...


@dataclass(frozen=True)
class R2Config:
    account_id: str
    bucket: str
    access_key_id: str = field(repr=False)
    secret_access_key: str = field(repr=False)
    ttl_seconds: int = 900

    @classmethod
    def from_environment(cls, environment: Mapping[str, str] | None = None) -> "R2Config":
        source = os.environ if environment is None else environment
        def required(name: str) -> str:
            value = str(source.get(name, "")).strip()
            if not value:
                raise R2ConfigurationError("R2 configuration is incomplete")
            return value

        raw_ttl = str(source.get("SHORTVIDEO_R2_TTL", "900")).strip()
        try:
            ttl = int(raw_ttl)
        except ValueError as exc:
            raise R2ConfigurationError("R2 TTL must be an integer") from exc
        config = cls(
            account_id=required("SHORTVIDEO_R2_ACCOUNT_ID"),
            bucket=required("SHORTVIDEO_R2_BUCKET"),
            access_key_id=required("SHORTVIDEO_R2_ACCESS_KEY_ID"),
            secret_access_key=required("SHORTVIDEO_R2_SECRET_ACCESS_KEY"),
            ttl_seconds=ttl,
        )
        config.validate()
        return config

    @property
    def endpoint_url(self) -> str:
        return f"https://{self.account_id}.r2.cloudflarestorage.com"

    def validate(self) -> None:
        if not _ACCOUNT_ID_RE.fullmatch(self.account_id):
            raise R2ConfigurationError("R2 account ID is invalid")
        if not _BUCKET_RE.fullmatch(self.bucket) or ".." in self.bucket:
            raise R2ConfigurationError("R2 bucket name is invalid")
        if not self.access_key_id or not self.secret_access_key:
            raise R2ConfigurationError("R2 configuration is incomplete")
        if not MIN_TTL_SECONDS <= self.ttl_seconds <= MAX_TTL_SECONDS:
            raise R2ConfigurationError("R2 TTL is outside the allowed range")


@dataclass(frozen=True)
class StagedMedia:
    object_key: str
    signed_url: str = field(repr=False)
    expires_at: datetime


def _r2_client(config: R2Config) -> R2Client:
    try:
        import boto3
    except ImportError as exc:
        raise R2ConfigurationError("R2 support requires the optional boto3 dependency") from exc
    return boto3.client(
        "s3",
        endpoint_url=config.endpoint_url,
        region_name="auto",
        aws_access_key_id=config.access_key_id,
        aws_secret_access_key=config.secret_access_key,
    )


class R2TemporaryMedia:
    """Stage immutable MP4s under opaque, approval-derived R2 object names."""

    def __init__(self, config: R2Config, *, client: R2Client | None = None, client_factory: Callable[[R2Config], R2Client] = _r2_client):
        config.validate()
        self._config = config
        self._client = client
        self._client_factory = client_factory

    def _get_client(self) -> R2Client:
        if self._client is None:
            try:
                self._client = self._client_factory(self._config)
            except R2ConfigurationError:
                raise
            except Exception:
                raise R2OperationError("R2 client cannot be initialized") from None
        return self._client

    def _validate_signed_url(self, signed_url: object) -> str:
        if not isinstance(signed_url, str):
            raise R2OperationError("R2 did not return a secure temporary media URL")
        try:
            parsed = urlsplit(signed_url)
            port = parsed.port
        except ValueError:
            raise R2OperationError("R2 did not return a secure temporary media URL") from None
        expected = f"{self._config.account_id.lower()}.r2.cloudflarestorage.com"
        bucket_expected = f"{self._config.bucket.lower()}.{expected}"
        if (
            parsed.scheme != "https"
            or parsed.username is not None
            or parsed.password is not None
            or parsed.hostname is None
            or parsed.hostname.lower() not in {expected, bucket_expected}
            or port not in {None, 443}
            or parsed.fragment
        ):
            raise R2OperationError("R2 did not return a secure temporary media URL")
        return signed_url

    @staticmethod
    def object_key(*, publication_id: str, target_id: str, asset_sha256: str) -> str:
        if not _IDENTIFIER_RE.fullmatch(publication_id) or not _IDENTIFIER_RE.fullmatch(target_id):
            raise R2AssetError("publication or target identifier is invalid")
        digest = asset_sha256.lower()
        if not _SHA256_RE.fullmatch(digest):
            raise R2AssetError("asset digest is invalid")
        return f"temporary-media/{publication_id}/{target_id}/{digest}.mp4"

    @staticmethod
    def _validate_asset(path: Path | str, expected_sha256: str) -> Path:
        asset = absolute_path(path)
        try:
            reject_symlink_chain(asset, label="temporary media asset")
            info = asset.lstat()
        except (OSError, PrivatePathError) as exc:
            raise R2AssetError("temporary media asset cannot be inspected") from exc
        if not stat.S_ISREG(info.st_mode):
            raise R2AssetError("temporary media asset must be a regular file")
        digest = sha256()
        try:
            with asset.open("rb") as handle:
                for block in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(block)
        except OSError as exc:
            raise R2AssetError("temporary media asset cannot be read") from exc
        if digest.hexdigest() != expected_sha256.lower():
            raise R2AssetError("temporary media asset digest does not match approval")
        return asset

    def stage(self, *, publication_id: str, target_id: str, asset_path: Path | str, asset_sha256: str) -> StagedMedia:
        key = self.object_key(publication_id=publication_id, target_id=target_id, asset_sha256=asset_sha256)
        asset = self._validate_asset(asset_path, asset_sha256)
        client = self._get_client()
        try:
            client.upload_file(
                str(asset), self._config.bucket, key,
                ExtraArgs={"ContentType": "video/mp4", "Metadata": {"sha256": asset_sha256.lower()}},
            )
            signed_url = client.generate_presigned_url(
                "get_object", {"Bucket": self._config.bucket, "Key": key},
                self._config.ttl_seconds, "GET",
            )
        except Exception:
            raise R2OperationError("R2 temporary media operation failed") from None
        return StagedMedia(key, self._validate_signed_url(signed_url), datetime.now(timezone.utc) + timedelta(seconds=self._config.ttl_seconds))

    def cleanup(self, object_key: str) -> None:
        if not isinstance(object_key, str) or not object_key.startswith("temporary-media/"):
            raise R2AssetError("temporary media object key is invalid")
        try:
            self._get_client().delete_object(Bucket=self._config.bucket, Key=object_key)
        except Exception:
            raise R2OperationError("R2 temporary media cleanup failed") from None

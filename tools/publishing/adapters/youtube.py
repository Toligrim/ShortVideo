"""Fail-closed YouTube Shorts adapter using OAuth and resumable uploads.

This module intentionally uses a very small injectable HTTP layer instead of
an SDK.  The protocol is based on the official YouTube Data API resumable
upload guide and Google installed-app OAuth documentation.  It never logs an
access token, refresh token, client secret, authorization code, or resumable
session URI.
"""
from __future__ import annotations

from base64 import urlsafe_b64encode
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import stat
import tempfile
import threading
import time
from typing import Any, Callable, Mapping, Protocol
from urllib.parse import parse_qs, urlencode, urlparse, urlsplit

from .base import (
    AmbiguousPublishError,
    PermanentPublishError,
    PublishRequest,
    PublishResult,
    ResumableSessionCheckpoint,
    RetryablePublishError,
)
from ..security import (
    PrivatePathError,
    absolute_path,
    ensure_private_directory,
    ensure_private_regular_file,
    reject_symlink_chain,
)


YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload"
YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly"
YOUTUBE_REQUIRED_SCOPES = f"{YOUTUBE_UPLOAD_SCOPE} {YOUTUBE_READONLY_SCOPE}"
OAUTH_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
YOUTUBE_RESUMABLE_INITIATION_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos"
YOUTUBE_VIDEOS_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos"
YOUTUBE_SESSION_HOSTS = frozenset({"www.googleapis.com", "youtube.googleapis.com", "upload.youtube.com"})
DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024
MIN_CHUNK_SIZE = 256 * 1024
LEASE_SAFETY_MARGIN_SECONDS = 5.0
DEFAULT_PROCESSING_SLA_SECONDS = 45 * 60
DEFAULT_PROCESSING_POLL_INTERVAL_SECONDS = 30
DEFAULT_STATUS_PROBE_MAX_ATTEMPTS = 3
DEFAULT_STATUS_PROBE_BASE_BACKOFF_SECONDS = 1.0
DEFAULT_STATUS_PROBE_MAX_BACKOFF_SECONDS = 8.0
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
RANGE_RE = re.compile(r"^(?:bytes=)?(\d+)-(\d+)$")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _canonical_timestamp(value: object) -> str | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _safe_exception_class(exc: BaseException) -> str:
    """Return only a bounded exception type, never exception text."""
    candidate = exc
    # RequestsHttpTransport wraps optional-library exceptions in OSError.  The
    # cause's type still gives operators useful diagnostics without exposing a
    # URL, token, or provider error body.
    if type(exc) is OSError and exc.__cause__ is not None:
        candidate = exc.__cause__
    name = candidate.__class__.__name__
    return re.sub(r"[^A-Za-z0-9_.-]", "_", name)[:80] or "OSError"


def _duration_is_strictly_zero(value: object) -> bool:
    """Recognize the ISO-8601 zero duration returned by ``contentDetails``."""
    if not isinstance(value, str):
        return False
    match = re.fullmatch(
        r"P(?:(?P<days>\d+(?:\.\d+)?)D)?T"
        r"(?:(?P<hours>\d+(?:\.\d+)?)H)?"
        r"(?:(?P<minutes>\d+(?:\.\d+)?)M)?"
        r"(?:(?P<seconds>\d+(?:\.\d+)?)S)?",
        value,
    )
    if match is None:
        return False
    return all(float(match.group(name) or 0) == 0 for name in ("days", "hours", "minutes", "seconds"))


class YouTubeConfigurationError(RuntimeError):
    """A local OAuth configuration is unsafe or incomplete."""


class YouTubeOAuthError(RuntimeError):
    """A token endpoint outcome that contains no secret response content."""

    def __init__(self, code: str, detail: str, *, retryable: bool, retry_after_seconds: int | None = None):
        super().__init__(detail)
        self.code = code
        self.retryable = retryable
        self.retry_after_seconds = retry_after_seconds


@dataclass(frozen=True)
class HttpResponse:
    status_code: int
    headers: Mapping[str, str]
    body: bytes = b""


class HttpTransport(Protocol):
    """Small HTTP seam used by the adapter and all no-network tests."""

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str],
        body: bytes,
        timeout: float,
    ) -> HttpResponse:
        """Execute one non-redirecting HTTP request or raise ``OSError``."""


@dataclass(frozen=True)
class YouTubeProcessingResult(PublishResult):
    """A known video resource that still needs a later processing poll."""

    processing_status: str = "processing"
    processing_started_at: str = ""
    processing_age_seconds: int = 0
    next_poll_after_seconds: int = DEFAULT_PROCESSING_POLL_INTERVAL_SECONDS
    poll_error_code: str | None = None
    processing_failure_reason: str | None = None
    transport_diagnostics: tuple[Mapping[str, object], ...] = ()


class RequestsHttpTransport:
    """Production transport with redirects disabled for bearer-like session URLs."""

    # ``requests`` timeouts are socket-idle timeouts rather than a total
    # response deadline.  The adapter therefore keeps its durable lease alive
    # in a watchdog while one of these calls is still in progress.
    requires_lease_watchdog = True

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str],
        body: bytes,
        timeout: float,
    ) -> HttpResponse:
        try:
            import requests

            response = requests.request(
                method,
                url,
                headers=dict(headers),
                data=body,
                timeout=timeout,
                allow_redirects=False,
            )
        except OSError:
            raise
        except Exception as exc:  # requests is optional until a live command actually runs.
            raise OSError("YouTube HTTP transport failed") from exc
        return HttpResponse(
            status_code=int(response.status_code),
            headers={str(key): str(value) for key, value in response.headers.items()},
            body=bytes(response.content),
        )


def _header(response: HttpResponse, name: str) -> str | None:
    wanted = name.lower()
    for key, value in response.headers.items():
        if str(key).lower() == wanted:
            return str(value)
    return None


def _json_object(raw: bytes, *, error: str) -> dict[str, Any]:
    try:
        decoded = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(error) from exc
    if not isinstance(decoded, dict):
        raise ValueError(error)
    return decoded


def _required_text(value: object, *, error: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise YouTubeConfigurationError(error)
    return value.strip()


def _has_required_youtube_scopes(value: object) -> bool:
    """Require exactly the least-privilege scopes needed for upload and polling."""
    return isinstance(value, str) and set(value.split()) == {
        YOUTUBE_UPLOAD_SCOPE,
        YOUTUBE_READONLY_SCOPE,
    }


def _is_within(path: Path, directory: Path) -> bool:
    try:
        path.relative_to(directory)
    except ValueError:
        return False
    return True


def _external_secret_path(raw: str, *, state_dir: Path, label: str) -> Path:
    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        raise YouTubeConfigurationError(f"{label} must be an absolute path outside the publish state directory")
    candidate = absolute_path(candidate)
    try:
        reject_symlink_chain(candidate, label=label)
    except PrivatePathError as exc:
        raise YouTubeConfigurationError(str(exc)) from exc
    resolved = candidate.resolve(strict=False)
    if _is_within(resolved, state_dir):
        raise YouTubeConfigurationError(f"{label} must be outside the publish state directory")
    return resolved


def _require_secure_regular_file(path: Path, *, label: str) -> None:
    try:
        info = path.lstat()
    except OSError as exc:
        raise YouTubeConfigurationError(f"cannot read {label}") from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise YouTubeConfigurationError(f"{label} must be a regular non-symlink file")
    if info.st_uid != os.geteuid():
        raise YouTubeConfigurationError(f"{label} must be owned by the current user")
    if stat.S_IMODE(info.st_mode) & 0o077:
        raise YouTubeConfigurationError(f"{label} permissions must be owner-only (0600 or stricter)")


def _read_secure_json(path: Path, *, label: str) -> dict[str, Any]:
    _require_secure_regular_file(path, label=label)
    try:
        return _json_object(path.read_bytes(), error=f"{label} is not a JSON object")
    except OSError as exc:
        raise YouTubeConfigurationError(f"cannot read {label}") from exc
    except ValueError as exc:
        raise YouTubeConfigurationError(str(exc)) from exc


@dataclass(frozen=True)
class YouTubeOAuthSettings:
    """Secrets are sourced from environment or owner-only external files only."""

    client_id: str
    client_secret: str | None = field(repr=False)
    token_file: Path
    state_dir: Path

    @classmethod
    def from_environment(
        cls,
        *,
        state_dir: Path | str,
        require_token_file: bool = True,
        environ: Mapping[str, str] | None = None,
    ) -> "YouTubeOAuthSettings":
        environment = os.environ if environ is None else environ
        resolved_state_dir = absolute_path(state_dir)
        try:
            reject_symlink_chain(resolved_state_dir, label="publisher state directory")
        except PrivatePathError as exc:
            raise YouTubeConfigurationError(str(exc)) from exc
        client_file_raw = str(environment.get("SHORTVIDEO_YOUTUBE_CLIENT_SECRETS_FILE", "")).strip()
        client_id_raw = str(environment.get("SHORTVIDEO_YOUTUBE_CLIENT_ID", "")).strip()
        client_secret_raw = str(environment.get("SHORTVIDEO_YOUTUBE_CLIENT_SECRET", "")).strip()
        if client_file_raw:
            if client_id_raw or client_secret_raw:
                raise YouTubeConfigurationError(
                    "set either SHORTVIDEO_YOUTUBE_CLIENT_SECRETS_FILE or direct YouTube client environment values"
                )
            client_file = _external_secret_path(
                client_file_raw,
                state_dir=resolved_state_dir,
                label="YouTube client-secrets file",
            )
            client_payload = _read_secure_json(client_file, label="YouTube client-secrets file")
            installed = client_payload.get("installed")
            if not isinstance(installed, Mapping):
                raise YouTubeConfigurationError(
                    "YouTube client-secrets file must contain an installed-app configuration"
                )
            client_id = _required_text(installed.get("client_id"), error="YouTube installed client_id is missing")
            secret_value = installed.get("client_secret")
            client_secret = secret_value.strip() if isinstance(secret_value, str) and secret_value.strip() else None
        else:
            client_id = _required_text(client_id_raw, error="SHORTVIDEO_YOUTUBE_CLIENT_ID is required")
            client_secret = client_secret_raw or None

        token_file_raw = str(environment.get("SHORTVIDEO_YOUTUBE_TOKEN_FILE", "")).strip()
        if not token_file_raw:
            raise YouTubeConfigurationError("SHORTVIDEO_YOUTUBE_TOKEN_FILE is required")
        token_file = _external_secret_path(
            token_file_raw,
            state_dir=resolved_state_dir,
            label="YouTube token file",
        )
        try:
            ensure_private_directory(token_file.parent, label="YouTube token-file parent directory")
        except PrivatePathError as exc:
            raise YouTubeConfigurationError(str(exc)) from exc
        if token_file.exists():
            try:
                ensure_private_regular_file(token_file, label="YouTube token file", create=False)
            except PrivatePathError as exc:
                raise YouTubeConfigurationError(str(exc)) from exc
        elif require_token_file:
            raise YouTubeConfigurationError("YouTube token file does not exist; run youtube-authorize explicitly")
        if token_file.exists() and require_token_file:
            _load_refresh_token_material(token_file)
        return cls(
            client_id=client_id,
            client_secret=client_secret,
            token_file=token_file,
            state_dir=resolved_state_dir,
        )


def _load_refresh_token_material(path: Path) -> tuple[str, str]:
    try:
        secure_path = ensure_private_regular_file(path, label="YouTube token file", create=False)
    except PrivatePathError as exc:
        raise YouTubeConfigurationError(str(exc)) from exc
    payload = _read_secure_json(secure_path, label="YouTube token file")
    refresh_token = payload.get("refresh_token")
    scope = payload.get("scope")
    if not isinstance(refresh_token, str) or not refresh_token.strip():
        raise YouTubeConfigurationError("YouTube token file has no refresh token")
    if not _has_required_youtube_scopes(scope):
        raise YouTubeConfigurationError(
            "YouTube token file must grant exactly youtube.upload and youtube.readonly scopes"
        )
    return refresh_token.strip(), scope


def _validated_token_file_location(settings: YouTubeOAuthSettings) -> Path:
    """Apply the external-token boundary even for directly built settings."""
    token_file = absolute_path(settings.token_file)
    state_dir = absolute_path(settings.state_dir)
    try:
        reject_symlink_chain(state_dir, label="publisher state directory")
        reject_symlink_chain(token_file, label="YouTube token file")
    except PrivatePathError as exc:
        raise YouTubeConfigurationError(str(exc)) from exc
    if _is_within(token_file, state_dir):
        raise YouTubeConfigurationError("YouTube token file must remain outside the publish state directory")
    return token_file


def save_refresh_token(settings: YouTubeOAuthSettings, *, refresh_token: str, scope: str) -> None:
    """Atomically persist only the refresh token, never a short-lived access token."""
    if not isinstance(refresh_token, str) or not refresh_token.strip():
        raise YouTubeConfigurationError("refusing to store an empty YouTube refresh token")
    if not _has_required_youtube_scopes(scope):
        raise YouTubeConfigurationError(
            "refusing to store a token without exactly youtube.upload and youtube.readonly scopes"
        )
    token_file = _validated_token_file_location(settings)
    try:
        reject_symlink_chain(token_file, label="YouTube token file")
        ensure_private_directory(token_file.parent, label="YouTube token-file parent directory")
    except PrivatePathError as exc:
        raise YouTubeConfigurationError(str(exc)) from exc
    try:
        # Pre-create at 0600 (rather than allowing replace() to target a
        # symlink), then atomically replace it with a mode-0600 temp file.
        ensure_private_regular_file(token_file, label="YouTube token file", create=True)
    except PrivatePathError as exc:
        raise YouTubeConfigurationError(str(exc)) from exc
    payload = json.dumps(
        {"refresh_token": refresh_token.strip(), "scope": YOUTUBE_REQUIRED_SCOPES},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    temp_path: Path | None = None
    try:
        descriptor, raw_temp_path = tempfile.mkstemp(prefix=".shortvideo-youtube-token-", dir=token_file.parent)
        temp_path = Path(raw_temp_path)
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, token_file)
        temp_path = None
        ensure_private_regular_file(token_file, label="YouTube token file", create=False)
        directory_descriptor = os.open(token_file.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    except (OSError, PrivatePathError) as exc:
        raise YouTubeConfigurationError("cannot write YouTube token file") from exc
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


@dataclass(frozen=True)
class OAuthTokenResponse:
    access_token: str = field(repr=False)
    refresh_token: str | None = field(repr=False)
    scope: str | None


class YouTubeOAuthClient:
    """Minimal installed-app OAuth exchange and refresh client."""

    def __init__(self, settings: YouTubeOAuthSettings, *, transport: HttpTransport):
        self.settings = settings
        self.token_file = _validated_token_file_location(settings)
        self.transport = transport
        self._access_token: str | None = None

    def access_token(self) -> str:
        if self._access_token is None:
            return self.refresh_access_token()
        return self._access_token

    def refresh_access_token(self) -> str:
        refresh_token, stored_scope = _load_refresh_token_material(self.token_file)
        fields: dict[str, str] = {
            "client_id": self.settings.client_id,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
        if self.settings.client_secret:
            fields["client_secret"] = self.settings.client_secret
        token = self._request_token(fields, require_scope=False)
        if token.refresh_token is not None:
            save_refresh_token(
                self.settings,
                refresh_token=token.refresh_token,
                scope=token.scope or stored_scope,
            )
        self._access_token = token.access_token
        return token.access_token

    def exchange_authorization_code(
        self,
        *,
        code: str,
        redirect_uri: str,
        code_verifier: str,
    ) -> None:
        if not isinstance(code, str) or not code.strip():
            raise YouTubeConfigurationError("authorization callback did not contain a code")
        fields: dict[str, str] = {
            "client_id": self.settings.client_id,
            "code": code.strip(),
            "code_verifier": code_verifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }
        if self.settings.client_secret:
            fields["client_secret"] = self.settings.client_secret
        token = self._request_token(fields, require_scope=True)
        if token.refresh_token is None:
            raise YouTubeConfigurationError("authorization response did not include a refresh token")
        assert token.scope is not None
        save_refresh_token(self.settings, refresh_token=token.refresh_token, scope=token.scope)
        self._access_token = token.access_token

    def _request_token(self, fields: Mapping[str, str], *, require_scope: bool) -> OAuthTokenResponse:
        body = urlencode(fields).encode("ascii")
        try:
            response = self.transport.request(
                "POST",
                OAUTH_TOKEN_ENDPOINT,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Content-Length": str(len(body)),
                },
                body=body,
                timeout=30.0,
            )
        except OSError as exc:
            raise YouTubeOAuthError(
                "youtube_oauth_unavailable",
                "YouTube authorization service is temporarily unavailable",
                retryable=True,
            ) from exc
        retry_after = _retry_after_seconds(response)
        if response.status_code == 429 or 500 <= response.status_code <= 599:
            raise YouTubeOAuthError(
                "youtube_oauth_unavailable",
                "YouTube authorization service is temporarily unavailable",
                retryable=True,
                retry_after_seconds=retry_after,
            )
        if response.status_code != 200:
            raise YouTubeOAuthError(
                "youtube_authorization_required",
                "YouTube authorization was rejected; run youtube-authorize explicitly",
                retryable=False,
            )
        try:
            payload = _json_object(response.body, error="OAuth token response is malformed")
        except ValueError as exc:
            raise YouTubeOAuthError(
                "youtube_oauth_malformed_response",
                "YouTube authorization service returned an invalid response",
                retryable=False,
            ) from exc
        access_token = payload.get("access_token")
        if not isinstance(access_token, str) or not access_token.strip():
            raise YouTubeOAuthError(
                "youtube_oauth_malformed_response",
                "YouTube authorization service returned an invalid response",
                retryable=False,
            )
        scope = payload.get("scope")
        if scope is not None and not _has_required_youtube_scopes(scope):
            raise YouTubeOAuthError(
                "youtube_scope_not_granted",
                "YouTube authorization did not grant the required upload and readonly scopes",
                retryable=False,
            )
        if require_scope and not isinstance(scope, str):
            raise YouTubeOAuthError(
                "youtube_scope_not_granted",
                "YouTube authorization response did not prove the required upload and readonly scopes",
                retryable=False,
            )
        refresh = payload.get("refresh_token")
        if refresh is not None and (not isinstance(refresh, str) or not refresh.strip()):
            raise YouTubeOAuthError(
                "youtube_oauth_malformed_response",
                "YouTube authorization service returned an invalid response",
                retryable=False,
            )
        return OAuthTokenResponse(
            access_token=access_token.strip(),
            refresh_token=refresh.strip() if isinstance(refresh, str) else None,
            scope=scope if isinstance(scope, str) else None,
        )


@dataclass(frozen=True)
class AuthorizationRequest:
    url: str
    state: str = field(repr=False)
    redirect_uri: str
    code_verifier: str = field(repr=False)


def _validate_loopback_redirect_uri(redirect_uri: str) -> None:
    parsed = urlparse(redirect_uri)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "::1"} or parsed.port is None:
        raise YouTubeConfigurationError("YouTube installed-app authorization requires an explicit loopback redirect URI")


def build_authorization_request(
    settings: YouTubeOAuthSettings,
    *,
    redirect_uri: str,
) -> AuthorizationRequest:
    """Build (but never open) a desktop loopback OAuth URL with PKCE S256."""
    _validate_loopback_redirect_uri(redirect_uri)
    verifier = urlsafe_b64encode(secrets.token_bytes(64)).decode("ascii").rstrip("=")
    challenge = urlsafe_b64encode(sha256(verifier.encode("ascii")).digest()).decode("ascii").rstrip("=")
    state = secrets.token_urlsafe(32)
    query = urlencode(
        {
            "client_id": settings.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": YOUTUBE_REQUIRED_SCOPES,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": state,
            "access_type": "offline",
            "prompt": "consent",
        }
    )
    return AuthorizationRequest(
        url=f"{OAUTH_AUTHORIZATION_ENDPOINT}?{query}",
        state=state,
        redirect_uri=redirect_uri,
        code_verifier=verifier,
    )


def authorize_with_loopback(
    settings: YouTubeOAuthSettings,
    *,
    timeout_seconds: int = 300,
    transport: HttpTransport | None = None,
    emit: Callable[[str], None] = print,
) -> None:
    """Run only after an explicit CLI command; never launch a browser itself."""
    if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, int) or timeout_seconds < 1:
        raise YouTubeConfigurationError("authorization timeout must be a positive integer")
    received: dict[str, str] = {}

    class CallbackHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - framework method name.
            parsed = urlsplit(self.path)
            values = parse_qs(parsed.query, keep_blank_values=True)
            if parsed.path != "/oauth2/callback" or values.get("state", [None])[0] != request.state:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Authorization request did not match this command.")
                return
            if "error" in values:
                received["error"] = "authorization was denied or failed in the browser"
            else:
                code = values.get("code", [None])[0]
                if isinstance(code, str) and code:
                    received["code"] = code
                else:
                    received["error"] = "authorization callback did not contain a code"
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Authorization received. You may return to the terminal.")

        def log_message(self, _format: str, *_args: object) -> None:
            # Default HTTP-server logging would expose the callback code.
            return

    server = HTTPServer(("127.0.0.1", 0), CallbackHandler)
    try:
        redirect_uri = f"http://127.0.0.1:{server.server_port}/oauth2/callback"
        request = build_authorization_request(settings, redirect_uri=redirect_uri)
        emit("Open this URL in a browser to authorize YouTube. Codex will not open it automatically:")
        emit(request.url)
        deadline = time.monotonic() + timeout_seconds
        while not received and time.monotonic() < deadline:
            server.timeout = min(1.0, max(0.05, deadline - time.monotonic()))
            server.handle_request()
        if "code" not in received:
            raise YouTubeConfigurationError(received.get("error", "YouTube authorization timed out"))
        oauth = YouTubeOAuthClient(settings, transport=transport or RequestsHttpTransport())
        oauth.exchange_authorization_code(
            code=received["code"],
            redirect_uri=request.redirect_uri,
            code_verifier=request.code_verifier,
        )
    finally:
        server.server_close()


def youtube_doctor(settings: YouTubeOAuthSettings) -> dict[str, object]:
    """Local-only credential validation without reading values into output."""
    _load_refresh_token_material(_validated_token_file_location(settings))
    return {
        "provider": "youtube",
        "oauth_client_configured": True,
        "refresh_token_configured": True,
        "scope": YOUTUBE_REQUIRED_SCOPES,
    }


def _retry_after_seconds(response: HttpResponse) -> int | None:
    value = _header(response, "Retry-After")
    if value is None:
        return None
    value = value.strip()
    if value.isdigit():
        return int(value)
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        return None
    if parsed.tzinfo is None:
        return None
    seconds = int((parsed.astimezone(timezone.utc) - datetime.now(timezone.utc)).total_seconds())
    return max(0, seconds)


class _LeaseWatchdog:
    """Renew one worker fence while a production HTTP call is blocked."""

    def __init__(self, heartbeat: Callable[[], bool], *, interval_seconds: float):
        self._heartbeat = heartbeat
        self._interval_seconds = interval_seconds
        self._stop = threading.Event()
        self.failed = False
        self._thread = threading.Thread(target=self._run, daemon=True, name="youtube-lease-watchdog")

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=self._interval_seconds + 6.0)
        if self._thread.is_alive():
            # A wedged renewal cannot prove this worker still owns the fence.
            self.failed = True

    def _run(self) -> None:
        # Renew immediately, then repeatedly.  ``requests`` may receive a
        # never-ending trickle of bytes, so waiting for its socket timeout is
        # not sufficient to keep another worker from reclaiming the job.
        while not self._stop.is_set():
            try:
                if not self._heartbeat():
                    self.failed = True
                    return
            except Exception:
                self.failed = True
                return
            if self._stop.wait(self._interval_seconds):
                return


class YouTubeResumableAdapter:
    """Resumable ``videos.insert`` upload adapter for one approved YouTube target."""

    resumable_session_capable = True

    def __init__(
        self,
        settings: YouTubeOAuthSettings,
        *,
        transport: HttpTransport | None = None,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        timeout_seconds: float = 60.0,
        status_probe_max_attempts: int = DEFAULT_STATUS_PROBE_MAX_ATTEMPTS,
        status_probe_base_backoff_seconds: float = DEFAULT_STATUS_PROBE_BASE_BACKOFF_SECONDS,
        status_probe_max_backoff_seconds: float = DEFAULT_STATUS_PROBE_MAX_BACKOFF_SECONDS,
        processing_sla_seconds: float = DEFAULT_PROCESSING_SLA_SECONDS,
        processing_poll_interval_seconds: float = DEFAULT_PROCESSING_POLL_INTERVAL_SECONDS,
        sleep: Callable[[float], None] | None = None,
        clock: Callable[[], str | datetime] | None = None,
    ):
        if (
            isinstance(chunk_size, bool)
            or not isinstance(chunk_size, int)
            or chunk_size < MIN_CHUNK_SIZE
            or chunk_size % MIN_CHUNK_SIZE
        ):
            raise YouTubeConfigurationError("YouTube chunk size must be a positive multiple of 256 KiB")
        if timeout_seconds <= 0:
            raise YouTubeConfigurationError("YouTube HTTP timeout must be positive")
        if (
            isinstance(status_probe_max_attempts, bool)
            or not isinstance(status_probe_max_attempts, int)
            or status_probe_max_attempts < 1
        ):
            raise YouTubeConfigurationError("YouTube status-probe attempts must be positive")
        if (
            status_probe_base_backoff_seconds <= 0
            or status_probe_max_backoff_seconds < status_probe_base_backoff_seconds
        ):
            raise YouTubeConfigurationError("YouTube status-probe backoff bounds are invalid")
        if processing_sla_seconds <= 0 or processing_poll_interval_seconds <= 0:
            raise YouTubeConfigurationError("YouTube processing SLA and poll interval must be positive")
        self.settings = settings
        self.transport = transport or RequestsHttpTransport()
        self.oauth = YouTubeOAuthClient(settings, transport=self.transport)
        self.chunk_size = chunk_size
        self.timeout_seconds = timeout_seconds
        self.status_probe_max_attempts = status_probe_max_attempts
        self.status_probe_base_backoff_seconds = status_probe_base_backoff_seconds
        self.status_probe_max_backoff_seconds = status_probe_max_backoff_seconds
        self.processing_sla_seconds = processing_sla_seconds
        self.processing_poll_interval_seconds = processing_poll_interval_seconds
        self.sleep = sleep or time.sleep
        self.clock = clock or _utc_now

    def publish(self, request: PublishRequest) -> PublishResult:
        if request.platform != "youtube":
            raise PermanentPublishError(
                "youtube_platform_mismatch",
                "YouTube adapter received a non-YouTube target",
            )
        session_uri = request.existing_external_session_id
        final_checkpoint = (
            request.resumable_checkpoint is not None
            and request.resumable_checkpoint.phase == "final_chunk_inflight"
        )
        try:
            self._validate_lease_budget(request)
            target = self._target_metadata(request)
            expected_privacy_status = target["privacy_status"]
            known_video_id = self._known_processing_video_id(request)
            if known_video_id is not None:
                return self._poll_processing(
                    request,
                    video_id=known_video_id,
                    session_uri=session_uri,
                    expected_privacy_status=expected_privacy_status,
                    processing_started_at=getattr(request, "_youtube_processing_started_at", None),
                )
            total_bytes = request.asset_path.stat().st_size
            if total_bytes < 1:
                raise PermanentPublishError("youtube_empty_asset", "approved video asset is empty")
            mime_type = self._mime_type_for(request.asset_path)
            if session_uri is not None:
                return self._resume(
                    request,
                    session_uri,
                    total_bytes,
                    mime_type,
                    expected_privacy_status,
                )
            return self._initiate(request, total_bytes, mime_type, target)
        except OSError as exc:
            if final_checkpoint:
                raise AmbiguousPublishError(
                    "youtube_final_chunk_outcome_unknown",
                    "YouTube final upload outcome could not be confirmed safely",
                    external_session_id=session_uri,
                ) from exc
            raise PermanentPublishError("youtube_asset_unreadable", "approved video asset cannot be read") from exc
        except PermanentPublishError as exc:
            if final_checkpoint and not (
                exc.code.startswith("youtube_processing_")
                or getattr(exc, "youtube_processing_event", None) is not None
            ):
                raise AmbiguousPublishError(
                    "youtube_final_chunk_outcome_unknown",
                    "YouTube final upload outcome could not be confirmed safely",
                    external_session_id=session_uri,
                ) from exc
            raise
        except YouTubeConfigurationError as exc:
            if final_checkpoint:
                raise AmbiguousPublishError(
                    "youtube_final_chunk_outcome_unknown",
                    "YouTube final upload outcome could not be confirmed safely",
                    external_session_id=session_uri,
                ) from exc
            raise PermanentPublishError(
                "youtube_configuration_invalid",
                "YouTube live adapter is not configured safely",
                external_session_id=session_uri,
            ) from exc
        except YouTubeOAuthError as exc:
            if exc.retryable:
                raise RetryablePublishError(
                    exc.code,
                    "YouTube authorization service is temporarily unavailable",
                    external_session_id=session_uri,
                    retry_after_seconds=exc.retry_after_seconds,
                ) from exc
            if final_checkpoint:
                raise AmbiguousPublishError(
                    "youtube_final_chunk_outcome_unknown",
                    "YouTube final upload outcome could not be confirmed safely",
                    external_session_id=session_uri,
                ) from exc
            raise PermanentPublishError(
                exc.code,
                "YouTube authorization is not usable; run youtube-authorize explicitly",
                external_session_id=session_uri,
            ) from exc

    @staticmethod
    def _mime_type_for(path: Path) -> str:
        mime_type, _encoding = mimetypes.guess_type(path.name)
        if not isinstance(mime_type, str) or not mime_type.startswith("video/"):
            return "application/octet-stream"
        return mime_type

    def _initiate(
        self,
        request: PublishRequest,
        total_bytes: int,
        mime_type: str,
        target: Mapping[str, Any],
    ) -> PublishResult:
        body = json.dumps(
            {
                "snippet": {
                    "title": target["title"],
                    "description": target["description"],
                    "tags": target["tags"],
                    "categoryId": target["category_id"],
                },
                "status": {
                    "privacyStatus": target["privacy_status"],
                    "selfDeclaredMadeForKids": target["made_for_kids"],
                    "containsSyntheticMedia": target["contains_synthetic_media"],
                },
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        query = urlencode(
            {
                "uploadType": "resumable",
                "part": "snippet,status",
                "notifySubscribers": "true" if target["notify_subscribers"] else "false",
            }
        )
        try:
            response = self._authorized_request(
                request,
                method="POST",
                url=f"{YOUTUBE_RESUMABLE_INITIATION_ENDPOINT}?{query}",
                headers={
                    "Content-Type": "application/json; charset=UTF-8",
                    "Content-Length": str(len(body)),
                    "X-Upload-Content-Length": str(total_bytes),
                    "X-Upload-Content-Type": mime_type,
                },
                body=body,
                session_uri=None,
            )
        except OSError as exc:
            raise AmbiguousPublishError(
                "youtube_initiation_ambiguous",
                "YouTube upload-session initiation outcome is unknown",
            ) from exc
        if response.status_code in {200, 201}:
            session_uri = _header(response, "Location")
            if session_uri is None or not self._valid_session_uri(session_uri):
                raise AmbiguousPublishError(
                    "youtube_initiation_ambiguous",
                    "YouTube upload session was not returned safely",
                )
            checkpoint = ResumableSessionCheckpoint(
                session_uri=session_uri,
                asset_sha256=request.asset_sha256,
                approval_fingerprint=request.approval_fingerprint,
                total_bytes=total_bytes,
                mime_type=mime_type,
                offset=0,
                phase="session_recorded",
            )
            if request.record_target_processing is None or not request.record_target_processing(checkpoint):
                raise AmbiguousPublishError(
                    "youtube_session_not_durable",
                    "YouTube upload session could not be durably recorded before media upload",
                )
            return self._upload_from_offset(
                request,
                session_uri,
                total_bytes,
                mime_type,
                target["privacy_status"],
                0,
            )
        if response.status_code == 429:
            raise RetryablePublishError(
                "youtube_rate_limited",
                "YouTube rate limit requires a later retry",
                retry_after_seconds=_retry_after_seconds(response),
            )
        if 500 <= response.status_code <= 599:
            # No Location means a server-side initiation failure can have
            # created a session invisibly. Never initiate a second one.
            raise AmbiguousPublishError(
                "youtube_initiation_ambiguous",
                "YouTube upload-session initiation outcome is unknown",
            )
        if response.status_code == 401:
            raise PermanentPublishError(
                "youtube_unauthorized",
                "YouTube authorization was rejected after one refresh",
            )
        if 400 <= response.status_code <= 499:
            raise PermanentPublishError("youtube_initiation_rejected", "YouTube rejected upload metadata")
        raise AmbiguousPublishError(
            "youtube_initiation_ambiguous",
            "YouTube upload-session initiation returned an unexpected response",
        )

    def _resume(
        self,
        request: PublishRequest,
        session_uri: str,
        total_bytes: int,
        mime_type: str,
        expected_privacy_status: str,
    ) -> PublishResult:
        checkpoint = request.resumable_checkpoint
        if (
            checkpoint is None
            or checkpoint.session_uri != session_uri
            or checkpoint.asset_sha256 != request.asset_sha256
            or checkpoint.approval_fingerprint != request.approval_fingerprint
            or checkpoint.total_bytes != total_bytes
            or checkpoint.mime_type != mime_type
            or checkpoint.phase not in {"session_recorded", "uploading", "resuming", "final_chunk_inflight"}
            or not 0 <= checkpoint.offset <= total_bytes
            or not self._valid_session_uri(session_uri)
        ):
            raise AmbiguousPublishError(
                "youtube_resume_checkpoint_invalid",
                "stored YouTube resumable checkpoint cannot be safely resumed",
                external_session_id=session_uri,
            )
        response, diagnostics = self._probe_session(
            request,
            session_uri=session_uri,
            total_bytes=total_bytes,
            final_uncertain=checkpoint.phase == "final_chunk_inflight",
        )
        return self._handle_session_probe(
            request,
            session_uri=session_uri,
            total_bytes=total_bytes,
            mime_type=mime_type,
            expected_privacy_status=expected_privacy_status,
            response=response,
            diagnostics=diagnostics,
            final_uncertain=checkpoint.phase == "final_chunk_inflight",
        )

    def _probe_session(
        self,
        request: PublishRequest,
        *,
        session_uri: str,
        total_bytes: int,
        final_uncertain: bool,
    ) -> tuple[HttpResponse, list[Mapping[str, object]]]:
        """Probe one resumable session, retrying only transient probe outcomes."""
        diagnostics: list[Mapping[str, object]] = []
        for attempt in range(1, self.status_probe_max_attempts + 1):
            started = time.monotonic()
            try:
                response = self._authorized_request(
                    request,
                    method="PUT",
                    url=session_uri,
                    headers={"Content-Length": "0", "Content-Range": f"bytes */{total_bytes}"},
                    body=b"",
                    session_uri=session_uri,
                )
            except OSError as exc:
                self._capture_diagnostic(
                    request,
                    diagnostics,
                    session_uri=session_uri,
                    stage="resumable_status_probe",
                    started=started,
                    attempt=attempt,
                    exc=exc,
                )
                if attempt < self.status_probe_max_attempts:
                    self._sleep_probe_retry(attempt, None)
                    continue
                if final_uncertain:
                    error = AmbiguousPublishError(
                        "youtube_final_chunk_outcome_unknown",
                        "YouTube final upload outcome could not be confirmed after status-probe retries",
                        external_session_id=session_uri,
                    )
                    self._attach_diagnostics(error, diagnostics)
                    raise error from exc
                error = RetryablePublishError(
                    "youtube_resume_probe_unavailable",
                    "YouTube upload session can be retried safely",
                    external_session_id=session_uri,
                )
                self._attach_diagnostics(error, diagnostics)
                raise error from exc
            except (YouTubeConfigurationError, YouTubeOAuthError) as exc:
                # A credential/configuration failure cannot establish what a
                # final PUT did.  Never turn that uncertainty into a fresh
                # upload.  Retryable OAuth errors get the same bounded probe
                # treatment as transport errors.
                retryable_oauth = isinstance(exc, YouTubeOAuthError) and exc.retryable
                if retryable_oauth and attempt < self.status_probe_max_attempts:
                    self._sleep_probe_retry(attempt, exc.retry_after_seconds)
                    continue
                if final_uncertain:
                    error = AmbiguousPublishError(
                        "youtube_final_chunk_outcome_unknown",
                        "YouTube final upload outcome could not be confirmed after status-probe retries",
                        external_session_id=session_uri,
                    )
                    raise error from exc
                raise

            retry_after = _retry_after_seconds(response)
            if response.status_code == 429 or 500 <= response.status_code <= 599:
                self._capture_diagnostic(
                    request,
                    diagnostics,
                    session_uri=session_uri,
                    stage="resumable_status_probe",
                    started=started,
                    attempt=attempt,
                    http_status=response.status_code,
                )
                if attempt < self.status_probe_max_attempts:
                    self._sleep_probe_retry(attempt, retry_after)
                    continue
                if final_uncertain:
                    error = AmbiguousPublishError(
                        "youtube_final_chunk_outcome_unknown",
                        "YouTube final upload outcome could not be confirmed after status-probe retries",
                        external_session_id=session_uri,
                    )
                    self._attach_diagnostics(error, diagnostics)
                    raise error
                error = RetryablePublishError(
                    "youtube_resume_probe_unavailable",
                    "YouTube upload session can be retried safely",
                    external_session_id=session_uri,
                    retry_after_seconds=retry_after,
                )
                self._attach_diagnostics(error, diagnostics)
                raise error
            return response, diagnostics
        raise AssertionError("status-probe loop did not return")

    def _sleep_probe_retry(self, attempt: int, retry_after: int | None) -> None:
        exponential = min(
            self.status_probe_max_backoff_seconds,
            self.status_probe_base_backoff_seconds * (2 ** (attempt - 1)),
        )
        self.sleep(max(exponential, float(retry_after or 0)))

    def _handle_session_probe(
        self,
        request: PublishRequest,
        *,
        session_uri: str,
        total_bytes: int,
        mime_type: str,
        expected_privacy_status: str,
        response: HttpResponse,
        diagnostics: list[Mapping[str, object]],
        final_uncertain: bool,
    ) -> PublishResult:
        if response.status_code in {200, 201}:
            try:
                result = self._result_from_success(response, session_uri, expected_privacy_status)
                return self._post_upload_processing(request, result, expected_privacy_status, diagnostics)
            except (PermanentPublishError, AmbiguousPublishError) as exc:
                self._attach_diagnostics(exc, diagnostics)
                raise
        if response.status_code == 308:
            try:
                offset = self._offset_from_308(response, total_bytes, session_uri)
            except AmbiguousPublishError as exc:
                self._attach_diagnostics(exc, diagnostics)
                raise
            if offset >= total_bytes:
                error = AmbiguousPublishError(
                    "youtube_completion_unknown",
                    "YouTube reported all bytes without a final video response",
                    external_session_id=session_uri,
                )
                self._attach_diagnostics(error, diagnostics)
                raise error
            try:
                self._record_progress(request, offset, "resuming", session_uri)
            except AmbiguousPublishError as exc:
                self._attach_diagnostics(exc, diagnostics)
                raise
            retry_after = _retry_after_seconds(response)
            if retry_after is not None:
                error = RetryablePublishError(
                    "youtube_retry_after",
                    "YouTube requested a later resumable-upload retry",
                    external_session_id=session_uri,
                    retry_after_seconds=retry_after,
                )
                self._attach_diagnostics(error, diagnostics)
                raise error
            return self._upload_from_offset(
                request,
                session_uri,
                total_bytes,
                mime_type,
                expected_privacy_status,
                offset,
                diagnostics=diagnostics,
            )
        if response.status_code == 404 and final_uncertain:
            error = AmbiguousPublishError(
                "youtube_final_chunk_session_expired",
                "YouTube session expired after an uncertain final upload chunk",
                external_session_id=session_uri,
            )
            self._attach_diagnostics(error, diagnostics)
            raise error
        if final_uncertain and 400 <= response.status_code <= 499:
            error = AmbiguousPublishError(
                "youtube_final_chunk_outcome_unknown",
                "YouTube final upload outcome could not be confirmed safely",
                external_session_id=session_uri,
            )
            self._attach_diagnostics(error, diagnostics)
            raise error
        try:
            self._raise_upload_response(response, session_uri=session_uri, context="resume probe")
        except (PermanentPublishError, AmbiguousPublishError, RetryablePublishError) as exc:
            self._attach_diagnostics(exc, diagnostics)
            raise
        raise AssertionError("unreachable")

    def _upload_from_offset(
        self,
        request: PublishRequest,
        session_uri: str,
        total_bytes: int,
        mime_type: str,
        expected_privacy_status: str,
        offset: int,
        *,
        diagnostics: list[Mapping[str, object]] | None = None,
    ) -> PublishResult:
        upload_diagnostics = diagnostics if diagnostics is not None else []
        try:
            handle = request.asset_path.open("rb")
        except OSError as exc:
            raise PermanentPublishError(
                "youtube_asset_unreadable",
                "approved video asset cannot be read",
                external_session_id=session_uri,
            ) from exc
        with handle:
            while offset < total_bytes:
                length = min(self.chunk_size, total_bytes - offset)
                handle.seek(offset)
                body = handle.read(length)
                if len(body) != length:
                    raise PermanentPublishError(
                        "youtube_asset_changed",
                        "approved video asset changed during upload",
                        external_session_id=session_uri,
                    )
                end = offset + length - 1
                phase = "final_chunk_inflight" if end == total_bytes - 1 else "uploading"
                self._record_progress(request, offset, phase, session_uri)
                chunk_started = time.monotonic()
                try:
                    response = self._authorized_request(
                        request,
                        method="PUT",
                        url=session_uri,
                        headers={
                            "Content-Length": str(length),
                            "Content-Type": mime_type,
                            "Content-Range": f"bytes {offset}-{end}/{total_bytes}",
                        },
                        body=body,
                        session_uri=session_uri,
                    )
                except OSError as exc:
                    self._capture_diagnostic(
                        request,
                        upload_diagnostics,
                        session_uri=session_uri,
                        stage="final_chunk_upload" if end == total_bytes - 1 else "upload_chunk",
                        started=chunk_started,
                        attempt=1,
                        exc=exc,
                    )
                    if end == total_bytes - 1:
                        return self._recover_final_chunk_outcome(
                            request,
                            session_uri=session_uri,
                            total_bytes=total_bytes,
                            mime_type=mime_type,
                            expected_privacy_status=expected_privacy_status,
                            diagnostics=upload_diagnostics,
                            cause=exc,
                        )
                    error = RetryablePublishError(
                        "youtube_upload_unavailable",
                        "YouTube upload session can be retried safely",
                        external_session_id=session_uri,
                    )
                    self._attach_diagnostics(error, upload_diagnostics)
                    raise error from exc
                if response.status_code in {200, 201}:
                    if end != total_bytes - 1:
                        error = AmbiguousPublishError(
                            "youtube_early_success_response",
                            "YouTube reported success before the approved file was fully sent",
                            external_session_id=session_uri,
                        )
                        self._attach_diagnostics(error, upload_diagnostics)
                        raise error
                    try:
                        result = self._result_from_success(response, session_uri, expected_privacy_status)
                        return self._post_upload_processing(
                            request,
                            result,
                            expected_privacy_status,
                            upload_diagnostics,
                        )
                    except (PermanentPublishError, AmbiguousPublishError) as exc:
                        self._attach_diagnostics(exc, upload_diagnostics)
                        raise
                if response.status_code == 308:
                    try:
                        next_offset = self._offset_from_308(response, total_bytes, session_uri)
                    except AmbiguousPublishError as exc:
                        self._attach_diagnostics(exc, upload_diagnostics)
                        raise
                    if next_offset > end + 1:
                        error = AmbiguousPublishError(
                            "youtube_invalid_resume_range",
                            "YouTube returned an impossible resumable-upload range",
                            external_session_id=session_uri,
                        )
                        self._attach_diagnostics(error, upload_diagnostics)
                        raise error
                    # A 308 that confirms every byte of the final chunk but
                    # omits the required video resource leaves completion
                    # unknown.  Preserve the pre-send final-chunk marker so
                    # a later vanished session remains reconciliation-only.
                    progress_phase = (
                        "final_chunk_inflight"
                        if end == total_bytes - 1 and next_offset >= total_bytes
                        else "uploading"
                    )
                    self._record_progress(request, next_offset, progress_phase, session_uri)
                    if next_offset >= total_bytes:
                        error = AmbiguousPublishError(
                            "youtube_completion_unknown",
                            "YouTube reported all bytes without a final video response",
                            external_session_id=session_uri,
                        )
                        self._attach_diagnostics(error, upload_diagnostics)
                        raise error
                    retry_after = _retry_after_seconds(response)
                    if retry_after is not None:
                        error = RetryablePublishError(
                            "youtube_retry_after",
                            "YouTube requested a later resumable-upload retry",
                            external_session_id=session_uri,
                            retry_after_seconds=retry_after,
                        )
                        self._attach_diagnostics(error, upload_diagnostics)
                        raise error
                    if next_offset <= offset:
                        error = RetryablePublishError(
                            "youtube_resume_stalled",
                            "YouTube did not confirm upload progress; session can be retried safely",
                            external_session_id=session_uri,
                            retry_after_seconds=_retry_after_seconds(response),
                        )
                        self._attach_diagnostics(error, upload_diagnostics)
                        raise error
                    offset = next_offset
                    continue
                try:
                    self._raise_upload_response(response, session_uri=session_uri, context="upload chunk")
                except (PermanentPublishError, AmbiguousPublishError, RetryablePublishError) as exc:
                    self._attach_diagnostics(exc, upload_diagnostics)
                    raise
        raise AssertionError("unreachable")

    def _recover_final_chunk_outcome(
        self,
        request: PublishRequest,
        *,
        session_uri: str,
        total_bytes: int,
        mime_type: str,
        expected_privacy_status: str,
        diagnostics: list[Mapping[str, object]],
        cause: OSError,
    ) -> PublishResult:
        """Resolve an uncertain final PUT before any retry can send bytes."""
        try:
            response, probe_diagnostics = self._probe_session(
                request,
                session_uri=session_uri,
                total_bytes=total_bytes,
                final_uncertain=True,
            )
        except (PermanentPublishError, AmbiguousPublishError, RetryablePublishError) as exc:
            self._attach_diagnostics(exc, diagnostics)
            raise exc from cause
        diagnostics.extend(probe_diagnostics)
        try:
            return self._handle_session_probe(
                request,
                session_uri=session_uri,
                total_bytes=total_bytes,
                mime_type=mime_type,
                expected_privacy_status=expected_privacy_status,
                response=response,
                diagnostics=diagnostics,
                final_uncertain=True,
            )
        except (PermanentPublishError, AmbiguousPublishError, RetryablePublishError) as exc:
            self._attach_diagnostics(exc, diagnostics)
            raise exc from cause

    @staticmethod
    def _known_processing_video_id(request: PublishRequest) -> str | None:
        value = getattr(request, "_youtube_existing_external_media_id", None)
        if value is None:
            return None
        if not isinstance(value, str) or not VIDEO_ID_RE.fullmatch(value.strip()):
            raise AmbiguousPublishError(
                "youtube_processing_reference_invalid",
                "stored YouTube processing video reference is invalid",
            )
        return value.strip()

    def _post_upload_processing(
        self,
        request: PublishRequest,
        result: PublishResult,
        expected_privacy_status: str,
        diagnostics: list[Mapping[str, object]],
    ) -> PublishResult:
        try:
            polled = self._poll_processing(
                request,
                video_id=result.external_media_id,
                session_uri=result.external_session_id,
                expected_privacy_status=expected_privacy_status,
                processing_started_at=getattr(request, "_youtube_processing_started_at", None),
            )
        except (PermanentPublishError, AmbiguousPublishError, RetryablePublishError) as exc:
            self._attach_diagnostics(exc, diagnostics)
            raise
        return self._attach_diagnostics(polled, diagnostics)

    def _poll_processing(
        self,
        request: PublishRequest,
        *,
        video_id: str,
        session_uri: str | None,
        expected_privacy_status: str,
        processing_started_at: object,
    ) -> PublishResult:
        """Poll the known video resource once; pending work is worker-scheduled."""
        if not VIDEO_ID_RE.fullmatch(video_id):
            raise AmbiguousPublishError(
                "youtube_processing_reference_invalid",
                "YouTube processing video reference is invalid",
                external_session_id=session_uri,
            )
        now = self._request_now(request)
        started_at = _canonical_timestamp(processing_started_at) or now
        age_seconds = self._processing_age_seconds(now, started_at)
        video_url = f"https://www.youtube.com/shorts/{video_id}"
        diagnostics: list[Mapping[str, object]] = []
        last_retry_after: int | None = None
        query = urlencode({"part": "processingDetails,contentDetails,status", "id": video_id})
        for attempt in range(1, self.status_probe_max_attempts + 1):
            started = time.monotonic()
            try:
                response = self._authorized_request(
                    request,
                    method="GET",
                    url=f"{YOUTUBE_VIDEOS_ENDPOINT}?{query}",
                    headers={"Accept": "application/json", "Content-Length": "0"},
                    body=b"",
                    session_uri=session_uri,
                )
            except OSError as exc:
                self._capture_diagnostic(
                    request,
                    diagnostics,
                    session_uri=session_uri,
                    stage="processing_status_poll",
                    started=started,
                    attempt=attempt,
                    exc=exc,
                )
                if attempt < self.status_probe_max_attempts:
                    self._sleep_probe_retry(attempt, None)
                    continue
                return self._processing_pending_or_stuck(
                    video_id=video_id,
                    session_uri=session_uri,
                    started_at=started_at,
                    age_seconds=age_seconds,
                    diagnostics=diagnostics,
                    poll_error_code="youtube_processing_poll_unavailable",
                )
            except YouTubeConfigurationError as exc:
                error = PermanentPublishError(
                    "youtube_processing_configuration_invalid",
                    "YouTube processing status cannot be authenticated safely",
                    external_session_id=session_uri,
                    external_media_id=video_id,
                    external_url=video_url,
                )
                self._mark_processing_event(
                    error,
                    event_type="youtube_processing_failed",
                    video_id=video_id,
                    started_at=started_at,
                    age_seconds=age_seconds,
                    reason="configuration_invalid",
                )
                self._raise_processing_error(error, diagnostics, exc)
            except YouTubeOAuthError as exc:
                if exc.retryable and attempt < self.status_probe_max_attempts:
                    self._sleep_probe_retry(attempt, exc.retry_after_seconds)
                    last_retry_after = exc.retry_after_seconds
                    continue
                if exc.retryable:
                    return self._processing_pending_or_stuck(
                        video_id=video_id,
                        session_uri=session_uri,
                        started_at=started_at,
                        age_seconds=age_seconds,
                        diagnostics=diagnostics,
                        poll_error_code="youtube_processing_poll_unavailable",
                        retry_after=last_retry_after,
                    )
                error = PermanentPublishError(
                    "youtube_processing_unauthorized",
                    "YouTube processing status authorization was rejected",
                    external_session_id=session_uri,
                    external_media_id=video_id,
                    external_url=video_url,
                )
                self._mark_processing_event(
                    error,
                    event_type="youtube_processing_failed",
                    video_id=video_id,
                    started_at=started_at,
                    age_seconds=age_seconds,
                    reason="unauthorized",
                )
                self._raise_processing_error(error, diagnostics, exc)

            retry_after = _retry_after_seconds(response)
            if response.status_code == 429 or 500 <= response.status_code <= 599:
                self._capture_diagnostic(
                    request,
                    diagnostics,
                    session_uri=session_uri,
                    stage="processing_status_poll",
                    started=started,
                    attempt=attempt,
                    http_status=response.status_code,
                )
                last_retry_after = retry_after
                if attempt < self.status_probe_max_attempts:
                    self._sleep_probe_retry(attempt, retry_after)
                    continue
                return self._processing_pending_or_stuck(
                    video_id=video_id,
                    session_uri=session_uri,
                    started_at=started_at,
                    age_seconds=age_seconds,
                    diagnostics=diagnostics,
                    poll_error_code="youtube_processing_poll_unavailable",
                    retry_after=last_retry_after,
                )
            if response.status_code == 404:
                error = AmbiguousPublishError(
                    "youtube_processing_video_not_found",
                    "YouTube processing video resource is no longer available",
                    external_session_id=session_uri,
                    external_media_id=video_id,
                    external_url=video_url,
                )
                self._mark_processing_event(
                    error,
                    event_type="youtube_processing_video_not_found",
                    video_id=video_id,
                    started_at=started_at,
                    age_seconds=age_seconds,
                )
                self._raise_processing_error(error, diagnostics)
            if response.status_code != 200:
                error = AmbiguousPublishError(
                    "youtube_processing_state_unknown",
                    "YouTube processing status returned an unexpected response",
                    external_session_id=session_uri,
                    external_media_id=video_id,
                    external_url=video_url,
                )
                self._mark_processing_event(
                    error,
                    event_type="youtube_processing_state_unknown",
                    video_id=video_id,
                    started_at=started_at,
                    age_seconds=age_seconds,
                )
                self._raise_processing_error(error, diagnostics)
            try:
                payload = _json_object(response.body, error="YouTube processing response is malformed")
                items = payload.get("items")
                item = next(
                    value for value in items
                    if isinstance(value, Mapping) and value.get("id") == video_id
                ) if isinstance(items, list) else None
                details = item.get("processingDetails") if isinstance(item, Mapping) else None
                status_value = details.get("processingStatus") if isinstance(details, Mapping) else None
            except (StopIteration, ValueError) as exc:
                error = AmbiguousPublishError(
                    "youtube_processing_state_unknown",
                    "YouTube processing status response is malformed or incomplete",
                    external_session_id=session_uri,
                    external_media_id=video_id,
                    external_url=video_url,
                )
                self._mark_processing_event(
                    error,
                    event_type="youtube_processing_state_unknown",
                    video_id=video_id,
                    started_at=started_at,
                    age_seconds=age_seconds,
                )
                self._raise_processing_error(error, diagnostics, exc)

            if status_value == "processing":
                if age_seconds > self.processing_sla_seconds:
                    error = AmbiguousPublishError(
                        "youtube_processing_stuck",
                        f"YouTube video processing exceeded the {int(self.processing_sla_seconds)} second SLA",
                        external_session_id=session_uri,
                        external_media_id=video_id,
                        external_url=video_url,
                    )
                    self._mark_processing_event(
                        error,
                        event_type="youtube_processing_stuck",
                        video_id=video_id,
                        started_at=started_at,
                        age_seconds=age_seconds,
                    )
                    self._raise_processing_error(error, diagnostics)
                return self._processing_pending(
                    video_id=video_id,
                    session_uri=session_uri,
                    started_at=started_at,
                    age_seconds=age_seconds,
                    diagnostics=diagnostics,
                )
            if status_value == "succeeded":
                status = item.get("status") if isinstance(item, Mapping) else None
                actual_privacy = status.get("privacyStatus") if isinstance(status, Mapping) else None
                if actual_privacy != expected_privacy_status:
                    error = AmbiguousPublishError(
                        "youtube_privacy_status_mismatch",
                        "YouTube processing completed with an unexpected privacy status",
                        external_session_id=session_uri,
                        external_media_id=video_id,
                        external_url=video_url,
                    )
                    self._mark_processing_event(
                        error,
                        event_type="youtube_processing_invariant_violation",
                        video_id=video_id,
                        started_at=started_at,
                        age_seconds=age_seconds,
                        reason="privacy_status_mismatch",
                    )
                    self._raise_processing_error(error, diagnostics)
                content = item.get("contentDetails") if isinstance(item, Mapping) else None
                if isinstance(content, Mapping) and _duration_is_strictly_zero(content.get("duration")):
                    error = AmbiguousPublishError(
                        "youtube_processing_invariant_violation",
                        "YouTube reported successful processing for a zero-duration video",
                        external_session_id=session_uri,
                        external_media_id=video_id,
                        external_url=video_url,
                    )
                    self._mark_processing_event(
                        error,
                        event_type="youtube_processing_invariant_violation",
                        video_id=video_id,
                        started_at=started_at,
                        age_seconds=age_seconds,
                        reason="zero_duration",
                    )
                    self._raise_processing_error(error, diagnostics)
                return self._attach_diagnostics(
                    PublishResult(video_id, video_url, session_uri),
                    diagnostics,
                )
            if status_value == "failed":
                reason_value = details.get("processingFailureReason") if isinstance(details, Mapping) else None
                reason = self._safe_processing_reason(reason_value)
                error = PermanentPublishError(
                    "youtube_processing_failed",
                    f"YouTube video processing failed ({reason})",
                    external_session_id=session_uri,
                    external_media_id=video_id,
                    external_url=video_url,
                )
                self._mark_processing_event(
                    error,
                    event_type="youtube_processing_failed",
                    video_id=video_id,
                    started_at=started_at,
                    age_seconds=age_seconds,
                    reason=reason,
                )
                self._raise_processing_error(error, diagnostics)
            if status_value == "terminated":
                error = AmbiguousPublishError(
                    "youtube_processing_terminated",
                    "YouTube terminated video processing without a usable result",
                    external_session_id=session_uri,
                    external_media_id=video_id,
                    external_url=video_url,
                )
                self._mark_processing_event(
                    error,
                    event_type="youtube_processing_terminated",
                    video_id=video_id,
                    started_at=started_at,
                    age_seconds=age_seconds,
                )
                self._raise_processing_error(error, diagnostics)
            error = AmbiguousPublishError(
                "youtube_processing_status_unknown",
                "YouTube returned an unknown video processing status",
                external_session_id=session_uri,
                external_media_id=video_id,
                external_url=video_url,
            )
            self._mark_processing_event(
                error,
                event_type="youtube_processing_status_unknown",
                video_id=video_id,
                started_at=started_at,
                age_seconds=age_seconds,
                reason=str(status_value)[:80] if status_value is not None else None,
            )
            self._raise_processing_error(error, diagnostics)
        raise AssertionError("processing poll loop did not return")

    def _processing_pending(
        self,
        *,
        video_id: str,
        session_uri: str | None,
        started_at: str,
        age_seconds: int,
        diagnostics: list[Mapping[str, object]],
        poll_error_code: str | None = None,
        retry_after: int | None = None,
    ) -> YouTubeProcessingResult:
        interval = max(1, int(self.processing_poll_interval_seconds))
        if self.processing_poll_interval_seconds > interval:
            interval += 1
        interval = max(interval, retry_after or 0)
        result = YouTubeProcessingResult(
            external_media_id=video_id,
            external_url=f"https://www.youtube.com/shorts/{video_id}",
            external_session_id=session_uri,
            processing_started_at=started_at,
            processing_age_seconds=age_seconds,
            next_poll_after_seconds=interval,
            poll_error_code=poll_error_code,
            transport_diagnostics=tuple(diagnostics),
        )
        return result

    def _processing_pending_or_stuck(
        self,
        *,
        video_id: str,
        session_uri: str | None,
        started_at: str,
        age_seconds: int,
        diagnostics: list[Mapping[str, object]],
        poll_error_code: str | None = None,
        retry_after: int | None = None,
    ) -> YouTubeProcessingResult:
        if age_seconds > self.processing_sla_seconds:
            error = AmbiguousPublishError(
                "youtube_processing_stuck",
                f"YouTube video processing exceeded the {int(self.processing_sla_seconds)} second SLA",
                external_session_id=session_uri,
                external_media_id=video_id,
                external_url=f"https://www.youtube.com/shorts/{video_id}",
            )
            self._mark_processing_event(
                error,
                event_type="youtube_processing_stuck",
                video_id=video_id,
                started_at=started_at,
                age_seconds=age_seconds,
            )
            self._raise_processing_error(error, diagnostics)
        return self._processing_pending(
            video_id=video_id,
            session_uri=session_uri,
            started_at=started_at,
            age_seconds=age_seconds,
            diagnostics=diagnostics,
            poll_error_code=poll_error_code,
            retry_after=retry_after,
        )

    @staticmethod
    def _processing_age_seconds(now: str, started_at: str) -> int:
        now_value = datetime.fromisoformat(now.replace("Z", "+00:00"))
        start_value = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        return max(0, int((now_value - start_value).total_seconds()))

    def _request_now(self, request: PublishRequest) -> str:
        candidate = getattr(request, "_youtube_now", None)
        if candidate is None:
            candidate = self.clock()
        return _canonical_timestamp(candidate) or _utc_now()

    @staticmethod
    def _safe_processing_reason(value: object) -> str:
        if not isinstance(value, str) or not value:
            return "unspecified"
        safe = re.sub(r"[^A-Za-z0-9_.-]", "_", value)
        return safe[:120] or "unspecified"

    def _raise_processing_error(
        self,
        error: PermanentPublishError | AmbiguousPublishError,
        diagnostics: list[Mapping[str, object]],
        cause: BaseException | None = None,
    ) -> None:
        self._attach_diagnostics(error, diagnostics)
        if cause is None:
            raise error
        raise error from cause

    @staticmethod
    def _mark_processing_event(
        error: BaseException,
        *,
        event_type: str,
        video_id: str,
        started_at: str,
        age_seconds: int,
        reason: str | None = None,
    ) -> None:
        data: dict[str, object] = {
            "event_type": event_type,
            "video_id": video_id,
            "processing_started_at": started_at,
            "processing_age_seconds": age_seconds,
        }
        if reason is not None:
            data["reason"] = reason
        setattr(error, "youtube_processing_event", data)

    @staticmethod
    def _attach_diagnostics(
        value: BaseException | PublishResult,
        diagnostics: list[Mapping[str, object]],
    ) -> BaseException | PublishResult:
        if diagnostics:
            existing = getattr(value, "transport_diagnostics", ())
            merged = list(existing)
            for diagnostic in diagnostics:
                if not any(diagnostic is prior or diagnostic == prior for prior in merged):
                    merged.append(diagnostic)
            object.__setattr__(value, "transport_diagnostics", tuple(merged))
        return value

    def _capture_diagnostic(
        self,
        request: PublishRequest,
        diagnostics: list[Mapping[str, object]],
        *,
        session_uri: str | None,
        stage: str,
        started: float,
        attempt: int,
        exc: BaseException | None = None,
        http_status: int | None = None,
    ) -> None:
        value: dict[str, object] = {
            "exception_class": _safe_exception_class(exc) if exc is not None else "HTTPStatusError",
            "stage": stage,
            "elapsed_seconds": round(max(0.0, time.monotonic() - started), 6),
            "http_status": http_status,
            "attempt": attempt,
            "session_fingerprint": (
                sha256(session_uri.encode("utf-8")).hexdigest()[:16] if session_uri is not None else None
            ),
        }
        diagnostics.append(value)
        callback = getattr(request, "_record_youtube_transport_diagnostic", None)
        if callable(callback):
            try:
                callback(value)
            except Exception:
                # The durable worker will retry recording diagnostics from the
                # result/exception.  A callback failure must not hide the
                # provider outcome or leak a secret through an error path.
                pass

    def _authorized_request(
        self,
        request: PublishRequest,
        *,
        method: str,
        url: str,
        headers: Mapping[str, str],
        body: bytes,
        session_uri: str | None,
    ) -> HttpResponse:
        self._ensure_active(request, session_uri)
        token = self.oauth.access_token()
        # Token refresh itself is network I/O.  Its request can consume the
        # lease, so fence again immediately before the provider request.
        self._ensure_active(request, session_uri)
        response = self._transport_request(request, session_uri, method, url, headers, body, token)
        if response.status_code != 401:
            return response
        # A 401 proves this request was not authorized. Refresh once and
        # retry exactly that request; a second 401 is terminal below.
        self._ensure_active(request, session_uri)
        token = self.oauth.refresh_access_token()
        self._ensure_active(request, session_uri)
        return self._transport_request(request, session_uri, method, url, headers, body, token)

    def _transport_request(
        self,
        request: PublishRequest,
        session_uri: str | None,
        method: str,
        url: str,
        headers: Mapping[str, str],
        body: bytes,
        token: str,
    ) -> HttpResponse:
        full_headers = {"Authorization": f"Bearer {token}", **dict(headers)}
        watchdog = self._request_lease_watchdog(request)
        transport_error: BaseException | None = None
        response: HttpResponse | None = None
        try:
            try:
                response = self.transport.request(
                    method,
                    url,
                    headers=full_headers,
                    body=body,
                    timeout=self.timeout_seconds,
                )
            except BaseException as exc:
                transport_error = exc
        finally:
            if watchdog is not None:
                watchdog.stop()
        if watchdog is not None and watchdog.failed:
            raise AmbiguousPublishError(
                "youtube_lease_lost_during_request",
                "publish lease could not be maintained during a provider request",
                external_session_id=session_uri,
            ) from transport_error
        if transport_error is not None:
            raise transport_error
        assert response is not None
        if isinstance(response.status_code, bool) or not isinstance(response.status_code, int):
            raise OSError("YouTube HTTP transport returned an invalid status")
        return response

    def _request_lease_watchdog(self, request: PublishRequest) -> "_LeaseWatchdog | None":
        if (
            request.heartbeat is None
            or request.lease_seconds is None
            or getattr(self.transport, "requires_lease_watchdog", False) is not True
        ):
            return None
        interval = max(0.25, min(5.0, request.lease_seconds / 3.0))
        watchdog = _LeaseWatchdog(request.heartbeat, interval_seconds=interval)
        watchdog.start()
        return watchdog

    @staticmethod
    def _target_metadata(request: PublishRequest) -> Mapping[str, Any]:
        targets = request.metadata.get("targets") if isinstance(request.metadata, Mapping) else None
        target = targets.get("youtube") if isinstance(targets, Mapping) else None
        if not isinstance(target, Mapping):
            raise PermanentPublishError("youtube_metadata_missing", "approved YouTube metadata is missing")
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
        if set(target) != required:
            raise PermanentPublishError("youtube_metadata_invalid", "approved YouTube metadata is invalid")
        if (
            not isinstance(target["title"], str)
            or not isinstance(target["description"], str)
            or not isinstance(target["tags"], list)
            or not isinstance(target["category_id"], str)
            or not isinstance(target["privacy_status"], str)
            or any(not isinstance(target[key], bool) for key in required & {"made_for_kids", "contains_synthetic_media", "notify_subscribers"})
        ):
            raise PermanentPublishError("youtube_metadata_invalid", "approved YouTube metadata is invalid")
        return target

    @staticmethod
    def _valid_session_uri(value: str) -> bool:
        try:
            parsed = urlparse(value)
            port = parsed.port
        except ValueError:
            return False
        return (
            parsed.scheme == "https"
            and parsed.hostname in YOUTUBE_SESSION_HOSTS
            and port in {None, 443}
            and parsed.username is None
            and parsed.password is None
            and not parsed.fragment
            and parsed.path.startswith("/upload/")
            and bool(parsed.query)
        )

    def _validate_lease_budget(self, request: PublishRequest) -> None:
        """Reject a lease that could expire during one bounded HTTP call."""
        if request.lease_seconds is None:
            return
        if (
            isinstance(request.lease_seconds, bool)
            or not isinstance(request.lease_seconds, int)
            or request.lease_seconds <= self.timeout_seconds + LEASE_SAFETY_MARGIN_SECONDS
        ):
            raise PermanentPublishError(
                "youtube_lease_too_short",
                "YouTube publish lease is shorter than one bounded provider request",
            )

    def _ensure_active(self, request: PublishRequest, session_uri: str | None) -> None:
        try:
            if request.cancellation_requested is not None and request.cancellation_requested():
                raise PermanentPublishError(
                    "publish_cancelled",
                    "publish was cancelled before the next provider request",
                    external_session_id=session_uri,
                )
            if request.heartbeat is not None and not request.heartbeat():
                raise AmbiguousPublishError(
                    "youtube_lease_lost",
                    "publish lease was lost before the next provider request",
                    external_session_id=session_uri,
                )
        except (PermanentPublishError, AmbiguousPublishError):
            raise
        except Exception as exc:
            raise AmbiguousPublishError(
                "youtube_lease_unknown",
                "publish lease could not be verified before the next provider request",
                external_session_id=session_uri,
            ) from exc

    @staticmethod
    def _offset_from_308(response: HttpResponse, total_bytes: int, session_uri: str) -> int:
        value = _header(response, "Range")
        if value is None:
            # The documented representation of an empty resumable session.
            return 0
        match = RANGE_RE.fullmatch(value.strip())
        if match is None:
            raise AmbiguousPublishError(
                "youtube_invalid_resume_range",
                "YouTube returned a malformed resumable-upload range",
                external_session_id=session_uri,
            )
        first, last = (int(match.group(1)), int(match.group(2)))
        if first != 0 or last < first or last >= total_bytes:
            raise AmbiguousPublishError(
                "youtube_invalid_resume_range",
                "YouTube returned an impossible resumable-upload range",
                external_session_id=session_uri,
            )
        return last + 1

    @staticmethod
    def _result_from_success(
        response: HttpResponse,
        session_uri: str,
        expected_privacy_status: str,
    ) -> PublishResult:
        try:
            payload = _json_object(response.body, error="YouTube success response is malformed")
        except ValueError as exc:
            raise AmbiguousPublishError(
                "youtube_malformed_success_response",
                "YouTube upload may have completed but returned an invalid response",
                external_session_id=session_uri,
            ) from exc
        video_id = payload.get("id")
        if not isinstance(video_id, str) or not VIDEO_ID_RE.fullmatch(video_id):
            raise AmbiguousPublishError(
                "youtube_malformed_success_response",
                "YouTube upload may have completed but returned an invalid response",
                external_session_id=session_uri,
            )
        status = payload.get("status")
        actual_privacy_status = status.get("privacyStatus") if isinstance(status, Mapping) else None
        if actual_privacy_status != expected_privacy_status:
            # The resource already exists, including for YouTube projects
            # whose API uploads are force-private.  Do not retry or claim it
            # was published under the approved visibility; require explicit
            # operator reconciliation instead.
            raise AmbiguousPublishError(
                "youtube_privacy_status_mismatch",
                "YouTube created a video but did not confirm the approved privacy status",
                external_session_id=session_uri,
                external_media_id=video_id,
                external_url=f"https://www.youtube.com/shorts/{video_id}",
            )
        return PublishResult(
            external_media_id=video_id,
            external_url=f"https://www.youtube.com/shorts/{video_id}",
            external_session_id=session_uri,
        )

    @staticmethod
    def _record_progress(
        request: PublishRequest,
        offset: int,
        phase: str,
        session_uri: str,
    ) -> None:
        if request.record_target_progress is None or not request.record_target_progress(offset, phase):
            raise AmbiguousPublishError(
                "youtube_progress_not_durable",
                "YouTube upload progress could not be durably recorded before continuing",
                external_session_id=session_uri,
            )

    @staticmethod
    def _raise_upload_response(response: HttpResponse, *, session_uri: str, context: str) -> None:
        retry_after = _retry_after_seconds(response)
        if response.status_code == 429:
            raise RetryablePublishError(
                "youtube_rate_limited",
                "YouTube rate limit requires a later retry",
                external_session_id=session_uri,
                retry_after_seconds=retry_after,
            )
        if 500 <= response.status_code <= 599:
            raise RetryablePublishError(
                "youtube_server_unavailable",
                "YouTube upload session can be retried safely",
                external_session_id=session_uri,
                retry_after_seconds=retry_after,
            )
        if response.status_code == 401:
            raise PermanentPublishError(
                "youtube_unauthorized",
                "YouTube authorization was rejected after one refresh",
                external_session_id=session_uri,
            )
        if response.status_code == 404:
            raise PermanentPublishError(
                "youtube_session_not_found",
                "YouTube resumable upload session is no longer available",
                external_session_id=session_uri,
            )
        if 400 <= response.status_code <= 499:
            raise PermanentPublishError(
                "youtube_upload_rejected",
                "YouTube rejected the approved upload request",
                external_session_id=session_uri,
            )
        raise AmbiguousPublishError(
            "youtube_unexpected_response",
            f"YouTube {context} returned an unexpected response",
            external_session_id=session_uri,
        )


class YouTubeLiveAdapterFactory:
    """CLI factory: YouTube is live; Instagram deliberately remains unavailable."""

    def __init__(
        self,
        state_dir: Path | str,
        *,
        transport_factory: Callable[[], HttpTransport] | None = None,
        status_probe_max_attempts: int = DEFAULT_STATUS_PROBE_MAX_ATTEMPTS,
        status_probe_base_backoff_seconds: float = DEFAULT_STATUS_PROBE_BASE_BACKOFF_SECONDS,
        status_probe_max_backoff_seconds: float = DEFAULT_STATUS_PROBE_MAX_BACKOFF_SECONDS,
        processing_sla_seconds: float = DEFAULT_PROCESSING_SLA_SECONDS,
        processing_poll_interval_seconds: float = DEFAULT_PROCESSING_POLL_INTERVAL_SECONDS,
        sleep: Callable[[float], None] | None = None,
        clock: Callable[[], str | datetime] | None = None,
    ):
        self.state_dir = absolute_path(state_dir)
        self.transport_factory = transport_factory
        self.status_probe_max_attempts = status_probe_max_attempts
        self.status_probe_base_backoff_seconds = status_probe_base_backoff_seconds
        self.status_probe_max_backoff_seconds = status_probe_max_backoff_seconds
        self.processing_sla_seconds = processing_sla_seconds
        self.processing_poll_interval_seconds = processing_poll_interval_seconds
        self.sleep = sleep
        self.clock = clock

    def supports_resumable_session(self, platform: str) -> bool:
        return platform == "youtube"

    def __call__(self, platform: str) -> YouTubeResumableAdapter:
        if platform != "youtube":
            raise PermanentPublishError(
                "live_adapter_unavailable",
                f"no live adapter is configured for {platform}",
            )
        try:
            ensure_private_directory(self.state_dir, label="publisher state directory")
            settings = YouTubeOAuthSettings.from_environment(state_dir=self.state_dir, require_token_file=True)
        except (YouTubeConfigurationError, PrivatePathError) as exc:
            raise PermanentPublishError(
                "youtube_configuration_invalid",
                "YouTube live adapter is not configured safely",
            ) from exc
        return YouTubeResumableAdapter(
            settings,
            transport=self.transport_factory() if self.transport_factory is not None else None,
            status_probe_max_attempts=self.status_probe_max_attempts,
            status_probe_base_backoff_seconds=self.status_probe_base_backoff_seconds,
            status_probe_max_backoff_seconds=self.status_probe_max_backoff_seconds,
            processing_sla_seconds=self.processing_sla_seconds,
            processing_poll_interval_seconds=self.processing_poll_interval_seconds,
            sleep=self.sleep,
            clock=self.clock,
        )

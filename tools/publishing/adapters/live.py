"""Safe composition of the live platform adapters.

Construction stays lazy: a YouTube-only job never needs Instagram/R2
credentials, and local validation never instantiates an R2 client.
"""
from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Callable, Mapping

from .base import PermanentPublishError, PublishAdapter
from .instagram import (
    InstagramConfigurationError,
    InstagramReelsAdapter,
    InstagramSettings,
    _ID_RE,
    _VERSION_RE,
    _read_owner_only_access_token,
    looks_like_configuration_placeholder,
)
from .r2 import (
    MAX_TTL_SECONDS,
    MIN_TTL_SECONDS,
    R2ConfigurationError,
    R2Config,
    R2TemporaryMedia,
    _ACCOUNT_ID_RE,
    _BUCKET_RE,
)
from .youtube import YouTubeLiveAdapterFactory
from ..security import PrivatePathError, absolute_path, reject_symlink_chain


@dataclass(frozen=True)
class _DoctorIssue:
    code: str
    message: str
    guidance: str
    cause: BaseException | None = None

    def as_dict(self) -> dict[str, str]:
        # Keep both names while callers migrate to the explicit reason-code
        # spelling.  Neither field contains an environment value or secret.
        return {
            "code": self.code,
            "reason_code": self.code,
            "message": self.message,
            "guidance": self.guidance,
        }


_ISSUE_DETAILS: dict[str, tuple[str, str]] = {
    "instagram_state_directory_unsafe": (
        "The publisher state directory failed the private-path safety check.",
        "Use a state directory with no symlink components that the current user can inspect.",
    ),
    "instagram_user_id_missing": (
        "SHORTVIDEO_INSTAGRAM_USER_ID is not set.",
        "Set SHORTVIDEO_INSTAGRAM_USER_ID to the real numeric ID of the Professional account.",
    ),
    "instagram_user_id_placeholder": (
        "SHORTVIDEO_INSTAGRAM_USER_ID still contains a placeholder.",
        "Replace the REPLACE_WITH_... template with the real numeric Professional account ID.",
    ),
    "instagram_user_id_invalid": (
        "SHORTVIDEO_INSTAGRAM_USER_ID is not a valid numeric account ID.",
        "Set SHORTVIDEO_INSTAGRAM_USER_ID to digits only, using the Professional account ID.",
    ),
    "instagram_api_version_missing": (
        "SHORTVIDEO_INSTAGRAM_API_VERSION is not set.",
        "Set SHORTVIDEO_INSTAGRAM_API_VERSION to the supported Meta version, for example v22.0.",
    ),
    "instagram_api_version_placeholder": (
        "SHORTVIDEO_INSTAGRAM_API_VERSION still contains a placeholder.",
        "Replace the REPLACE_WITH_... template with the current supported Meta API version, such as v22.0.",
    ),
    "instagram_api_version_invalid": (
        "SHORTVIDEO_INSTAGRAM_API_VERSION does not match the adapter's version format.",
        "Set SHORTVIDEO_INSTAGRAM_API_VERSION to a vNN.0-style value accepted by the adapter.",
    ),
    "instagram_token_path_missing": (
        "The Instagram access-token file setting is not set.",
        "Set the Instagram access-token file environment setting to an absolute path outside the publisher state directory.",
    ),
    "instagram_token_path_placeholder": (
        "SHORTVIDEO_INSTAGRAM_ACCESS_TOKEN_FILE contains an unedited placeholder path.",
        "Replace the template path (including literal /home/USER/... markers) with the real absolute token-file path.",
    ),
    "instagram_token_path_not_absolute": (
        "SHORTVIDEO_INSTAGRAM_ACCESS_TOKEN_FILE is not absolute.",
        "Set it to an absolute path outside the publisher state directory; relative paths are rejected.",
    ),
    "instagram_token_file_missing": (
        "The configured Instagram access-token file does not exist.",
        "Create the token file manually at the configured path, then secure it as an owner-only 0600 file.",
    ),
    "instagram_token_file_unsafe": (
        "The Instagram access-token path or file failed the private-path/owner-only safety checks.",
        "Use a regular file owned by the current user, mode 0600, with no symlink components, outside publisher state.",
    ),
    "instagram_token_file_unreadable": (
        "The Instagram access-token file cannot be read.",
        "Check that the current user can read the regular owner-only file and that it uses UTF-8 text.",
    ),
    "instagram_token_file_empty": (
        "The Instagram access-token file is empty.",
        "Write the real access token manually to the owner-only file; doctor never prints token contents.",
    ),
    "instagram_token_file_invalid": (
        "The Instagram access-token file does not contain one valid single-line token.",
        "Replace its contents manually with one non-empty token line; doctor never prints token contents.",
    ),
    "instagram_http_timeout_invalid": (
        "The Instagram HTTP timeout is invalid.",
        "Use a positive timeout when constructing the Instagram adapter.",
    ),
    "instagram_configuration_check_failed": (
        "An Instagram configuration check failed.",
        "Review the local Instagram settings and rerun `publish.py doctor instagram`.",
    ),
    "r2_configuration_incomplete": (
        "R2 account, bucket, or credentials are missing or still contain placeholders.",
        "Set SHORTVIDEO_R2_ACCOUNT_ID, SHORTVIDEO_R2_BUCKET, SHORTVIDEO_R2_ACCESS_KEY_ID, and SHORTVIDEO_R2_SECRET_ACCESS_KEY to real operator-provided values.",
    ),
    "r2_account_id_invalid": (
        "SHORTVIDEO_R2_ACCOUNT_ID is not a valid R2 account ID.",
        "Set SHORTVIDEO_R2_ACCOUNT_ID to exactly 32 hexadecimal characters.",
    ),
    "r2_bucket_invalid": (
        "SHORTVIDEO_R2_BUCKET is not a valid R2 bucket name.",
        "Set SHORTVIDEO_R2_BUCKET to a valid bucket name accepted by the R2 adapter.",
    ),
    "r2_ttl_invalid": (
        "SHORTVIDEO_R2_TTL is not an integer.",
        "Set SHORTVIDEO_R2_TTL to an integer number of seconds, or omit it for the 900-second default.",
    ),
    "r2_ttl_out_of_range": (
        "SHORTVIDEO_R2_TTL is outside the adapter's allowed range.",
        f"Set SHORTVIDEO_R2_TTL between {MIN_TTL_SECONDS} and {MAX_TTL_SECONDS} seconds.",
    ),
    "r2_configuration_check_failed": (
        "An R2 configuration check failed.",
        "Review the local R2 environment settings and rerun `publish.py doctor instagram`.",
    ),
}


def _issue(
    code: str,
    *,
    cause: BaseException | None = None,
    message: str | None = None,
    guidance: str | None = None,
) -> _DoctorIssue:
    default_message, default_guidance = _ISSUE_DETAILS.get(
        code,
        _ISSUE_DETAILS["instagram_configuration_check_failed"],
    )
    return _DoctorIssue(
        code=code,
        message=message or default_message,
        guidance=guidance or default_guidance,
        cause=cause,
    )


def _safe_issue_cause(code: str) -> BaseException:
    message, _ = _ISSUE_DETAILS.get(
        code,
        _ISSUE_DETAILS["instagram_configuration_check_failed"],
    )
    if code.startswith("r2_"):
        return R2ConfigurationError(message)
    return InstagramConfigurationError(message, reason_code=code)


def _append_issue(
    issues: list[_DoctorIssue],
    code: str,
    *,
    cause: BaseException | None = None,
    message: str | None = None,
    guidance: str | None = None,
) -> None:
    # One reason code is enough for one class of failure.  The checks remain
    # independent, so different codes are all retained in the same pass.
    if any(item.code == code for item in issues):
        return
    issues.append(
        _issue(
            code,
            cause=cause or _safe_issue_cause(code),
            message=message,
            guidance=guidance,
        )
    )


def _reason_code_from_exception(exc: BaseException) -> str:
    if isinstance(exc, InstagramConfigurationError):
        if exc.reason_code:
            return exc.reason_code
        message = str(exc).lower()
        if "timeout" in message:
            return "instagram_http_timeout_invalid"
        if "does not exist" in message:
            return "instagram_token_file_missing"
        if "owner-only" in message or "outside publisher state" in message or "unsafe" in message:
            return "instagram_token_file_unsafe"
        if "cannot be read" in message:
            return "instagram_token_file_unreadable"
        if "empty" in message:
            return "instagram_token_file_empty"
        if "invalid" in message:
            return "instagram_configuration_check_failed"
        return "instagram_configuration_check_failed"
    if isinstance(exc, PrivatePathError):
        return "instagram_token_file_unsafe"
    if isinstance(exc, R2ConfigurationError):
        message = str(exc).lower()
        if "account id" in message and "invalid" in message:
            return "r2_account_id_invalid"
        if "bucket" in message and "invalid" in message:
            return "r2_bucket_invalid"
        if "ttl" in message and "integer" in message:
            return "r2_ttl_invalid"
        if "ttl" in message:
            return "r2_ttl_out_of_range"
        if "incomplete" in message:
            return "r2_configuration_incomplete"
        return "r2_configuration_check_failed"
    return "instagram_configuration_check_failed"


def _configuration_error(issues: list[_DoctorIssue]) -> PermanentPublishError:
    reason_codes = tuple(dict.fromkeys(issue.code for issue in issues))
    lines = [
        "Instagram live adapter is not configured safely.",
        f"reason_codes: {', '.join(reason_codes)}",
    ]
    for item in issues:
        lines.append(f"- {item.code}: {item.message} {item.guidance}")
    error = PermanentPublishError("instagram_configuration_invalid", "\n".join(lines))
    # PublishError deliberately has a small stable constructor.  These
    # additive attributes make the detailed diagnosis machine-readable while
    # retaining its existing high-level code and exception type.
    error.reason_codes = reason_codes
    error.reason_code = reason_codes[0] if reason_codes else None
    error.issues = [issue.as_dict() for issue in issues]
    return error


def _environment_text(source: Mapping[str, str], name: str, default: str = "") -> str:
    return str(source.get(name, default)).strip()


def _collect_instagram_issues(
    state_dir: Path | str,
    source: Mapping[str, str],
) -> tuple[list[_DoctorIssue], InstagramSettings | None]:
    issues: list[_DoctorIssue] = []
    state = absolute_path(state_dir)
    state_safe = True
    try:
        reject_symlink_chain(state, label="publisher state directory")
    except PrivatePathError as exc:
        state_safe = False
        _append_issue(issues, "instagram_state_directory_unsafe", cause=exc)

    user_id = _environment_text(source, "SHORTVIDEO_INSTAGRAM_USER_ID")
    if not user_id:
        _append_issue(issues, "instagram_user_id_missing")
    elif looks_like_configuration_placeholder(user_id):
        _append_issue(issues, "instagram_user_id_placeholder")
    elif not _ID_RE.fullmatch(user_id):
        _append_issue(issues, "instagram_user_id_invalid")

    api_version = _environment_text(source, "SHORTVIDEO_INSTAGRAM_API_VERSION")
    if not api_version:
        _append_issue(issues, "instagram_api_version_missing")
    elif looks_like_configuration_placeholder(api_version):
        _append_issue(issues, "instagram_api_version_placeholder")
    elif not _VERSION_RE.fullmatch(api_version):
        _append_issue(issues, "instagram_api_version_invalid")

    raw_token_path = _environment_text(source, "SHORTVIDEO_INSTAGRAM_ACCESS_TOKEN_FILE")
    token_path: Path | None = None
    token_path_is_absolute = False
    token_boundary_safe = False
    token_path_is_placeholder = False
    if not raw_token_path:
        _append_issue(issues, "instagram_token_path_missing")
    else:
        token_path = absolute_path(raw_token_path)
        token_path_is_absolute = Path(raw_token_path).expanduser().is_absolute()
        token_path_is_placeholder = looks_like_configuration_placeholder(raw_token_path)
        if token_path_is_placeholder:
            _append_issue(issues, "instagram_token_path_placeholder")
        if not token_path_is_absolute:
            _append_issue(issues, "instagram_token_path_not_absolute")
        elif state_safe and not token_path_is_placeholder:
            token_boundary_safe = True
            try:
                reject_symlink_chain(token_path, label="Instagram access-token file")
            except PrivatePathError as exc:
                token_boundary_safe = False
                _append_issue(issues, "instagram_token_file_unsafe", cause=exc)
            if token_boundary_safe:
                try:
                    token_path.relative_to(state)
                except ValueError:
                    pass
                else:
                    token_boundary_safe = False
                    _append_issue(issues, "instagram_token_file_unsafe")

        if token_path_is_placeholder and token_path_is_absolute:
            # The literal template path is safe to inspect only for existence;
            # never read a file selected by an unedited placeholder.
            try:
                token_path.lstat()
            except FileNotFoundError as exc:
                _append_issue(
                    issues,
                    "instagram_token_file_missing",
                    cause=InstagramConfigurationError(
                        "Instagram access-token file does not exist",
                        reason_code="instagram_token_file_missing",
                    ),
                )
            except OSError as exc:
                _append_issue(issues, "instagram_token_file_unreadable", cause=exc)
        elif token_boundary_safe:
            try:
                _read_owner_only_access_token(token_path)
            except InstagramConfigurationError as exc:
                _append_issue(issues, _reason_code_from_exception(exc), cause=exc)

    settings: InstagramSettings | None = None
    if not any(item.code.startswith("instagram_") for item in issues):
        try:
            settings = InstagramSettings.from_environment(state_dir=state, environ=source)
        except (InstagramConfigurationError, PrivatePathError) as exc:
            _append_issue(issues, _reason_code_from_exception(exc), cause=exc)

    return issues, settings


def _collect_r2_issues(source: Mapping[str, str]) -> list[_DoctorIssue]:
    issues: list[_DoctorIssue] = []
    account_id = _environment_text(source, "SHORTVIDEO_R2_ACCOUNT_ID")
    bucket = _environment_text(source, "SHORTVIDEO_R2_BUCKET")
    access_key_id = _environment_text(source, "SHORTVIDEO_R2_ACCESS_KEY_ID")
    secret_access_key = _environment_text(source, "SHORTVIDEO_R2_SECRET_ACCESS_KEY")

    required_fields = (account_id, bucket, access_key_id, secret_access_key)
    if any(not value or looks_like_configuration_placeholder(value) for value in required_fields):
        _append_issue(issues, "r2_configuration_incomplete")
    else:
        if not _ACCOUNT_ID_RE.fullmatch(account_id):
            _append_issue(issues, "r2_account_id_invalid")
        if not _BUCKET_RE.fullmatch(bucket) or ".." in bucket:
            _append_issue(issues, "r2_bucket_invalid")

    raw_ttl = _environment_text(source, "SHORTVIDEO_R2_TTL", "900")
    try:
        ttl = int(raw_ttl)
    except ValueError:
        _append_issue(issues, "r2_ttl_invalid")
    else:
        if not MIN_TTL_SECONDS <= ttl <= MAX_TTL_SECONDS:
            _append_issue(issues, "r2_ttl_out_of_range")

    if not issues:
        try:
            R2Config.from_environment(source)
        except R2ConfigurationError as exc:
            _append_issue(issues, _reason_code_from_exception(exc), cause=exc)
    return issues


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
        except (InstagramConfigurationError, R2ConfigurationError, PrivatePathError) as exc:
            issue = _issue(_reason_code_from_exception(exc), cause=exc)
            error = _configuration_error([issue])
            raise error from exc


def instagram_doctor(
    *,
    state_dir: Path | str,
    environ: Mapping[str, str] | None = None,
) -> dict[str, object]:
    """Validate local Instagram/R2 configuration; never create a client.

    Every local check runs independently.  Invalid configuration is reported
    through one stable ``PermanentPublishError`` carrying all issue codes and
    operator guidance; valid results retain the historical response shape.
    """
    source = os.environ if environ is None else environ
    instagram_issues, settings = _collect_instagram_issues(state_dir, source)
    issues = instagram_issues + _collect_r2_issues(source)
    if issues:
        error = _configuration_error(issues)
        cause = next((item.cause for item in issues if item.cause is not None), None)
        if cause is not None:
            raise error from cause
        raise error
    if settings is None:
        # This is defensive: an empty issue list should always produce a
        # settings object above, but keep the doctor fail-closed if that ever
        # changes.
        error = _configuration_error([_issue("instagram_configuration_check_failed")])
        raise error
    return {
        "provider": "instagram",
        "access_token_configured": True,
        "r2_configured": True,
        "api_version": settings.api_version,
    }

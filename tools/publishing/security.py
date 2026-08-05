"""Small filesystem primitives for private publisher state.

Resumable-upload locations act like bearer capabilities, so the SQLite state
and OAuth refresh-token parent must not be readable or replaceable by another
local account.  These helpers deliberately use lexical absolute paths rather
than ``Path.resolve()``: resolving first would hide a symlink in the supplied
path and weaken the check.
"""
from __future__ import annotations

import os
from pathlib import Path
import stat


class PrivatePathError(RuntimeError):
    """A path intended for secrets/state is unsafe to use."""


def absolute_path(path: Path | str) -> Path:
    """Return an absolute, normalized path without resolving symlinks."""
    return Path(os.path.abspath(os.fspath(Path(path).expanduser())))


def reject_symlink_chain(path: Path | str, *, label: str) -> None:
    """Reject a symlink in any existing component of an absolute path."""
    path = absolute_path(path)
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current /= part
        try:
            info = current.lstat()
        except FileNotFoundError:
            # Descendants cannot exist once this component is absent.
            return
        except OSError as exc:
            raise PrivatePathError(f"cannot inspect {label}") from exc
        if stat.S_ISLNK(info.st_mode):
            raise PrivatePathError(f"{label} must not contain a symlink")


def _require_owned(info: os.stat_result, *, label: str) -> None:
    if info.st_uid != os.geteuid():
        raise PrivatePathError(f"{label} must be owned by the current user")


def ensure_private_directory(path: Path | str, *, label: str) -> Path:
    """Create or tighten one private directory to mode 0700.

    Existing directories owned by this process user are safely tightened.  A
    symlink, non-directory, or foreign-owned endpoint is rejected rather than
    silently followed.  Newly created intermediate components use 0700 too.
    """
    directory = absolute_path(path)
    reject_symlink_chain(directory, label=label)
    try:
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    except OSError as exc:
        raise PrivatePathError(f"cannot create {label}") from exc
    reject_symlink_chain(directory, label=label)
    try:
        info = directory.lstat()
    except OSError as exc:
        raise PrivatePathError(f"cannot inspect {label}") from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise PrivatePathError(f"{label} must be a non-symlink directory")
    _require_owned(info, label=label)
    if stat.S_IMODE(info.st_mode) != 0o700:
        try:
            os.chmod(directory, 0o700)
        except OSError as exc:
            raise PrivatePathError(f"cannot secure {label}") from exc
        try:
            info = directory.lstat()
        except OSError as exc:
            raise PrivatePathError(f"cannot inspect {label}") from exc
        if stat.S_ISLNK(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700:
            raise PrivatePathError(f"cannot secure {label}")
        _require_owned(info, label=label)
    return directory


def ensure_private_regular_file(
    path: Path | str,
    *,
    label: str,
    create: bool = False,
) -> Path:
    """Verify (and optionally safely pre-create) a mode-0600 regular file."""
    file_path = absolute_path(path)
    ensure_private_directory(file_path.parent, label=f"{label} parent directory")
    reject_symlink_chain(file_path, label=label)
    if create:
        try:
            descriptor = os.open(
                file_path,
                os.O_CREAT | os.O_EXCL | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0),
                0o600,
            )
        except FileExistsError:
            pass
        except OSError as exc:
            raise PrivatePathError(f"cannot create {label}") from exc
        else:
            try:
                os.fchmod(descriptor, 0o600)
            finally:
                os.close(descriptor)
    try:
        info = file_path.lstat()
    except OSError as exc:
        raise PrivatePathError(f"cannot inspect {label}") from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise PrivatePathError(f"{label} must be a regular non-symlink file")
    _require_owned(info, label=label)
    if stat.S_IMODE(info.st_mode) != 0o600:
        try:
            os.chmod(file_path, 0o600)
        except OSError as exc:
            raise PrivatePathError(f"cannot secure {label}") from exc
        try:
            info = file_path.lstat()
        except OSError as exc:
            raise PrivatePathError(f"cannot inspect {label}") from exc
        if stat.S_ISLNK(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600:
            raise PrivatePathError(f"cannot secure {label}")
        _require_owned(info, label=label)
    return file_path

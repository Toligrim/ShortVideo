#!/usr/bin/env python3
"""Fail-closed host preflight for the ShortVideo OpenRouter runner."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent


def _runtime_ro_binds() -> list[str]:
    return [p for p in ("/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc", "/opt") if Path(p).exists()]


def _check_bwrap(path: str | None) -> dict:
    result = {"configured": bool(path), "path": path, "smoke_ok": False}
    if not path:
        result["error"] = "bwrap_missing"; return result
    try:
        ver = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=5)
    except OSError as exc:
        result["error"] = f"bwrap_exec_failed:{exc}"; return result
    result["version"] = (ver.stdout or ver.stderr).strip()
    if ver.returncode != 0:
        result["error"] = "bwrap_version_failed"; return result
    with tempfile.TemporaryDirectory(prefix="sv-bwrap-doctor-") as td:
        scratch = Path(td)
        cmd = [path, "--die-with-parent", "--new-session", "--unshare-pid", "--unshare-net", "--proc", "/proc", "--dev", "/dev"]
        for directory in _runtime_ro_binds():
            cmd += ["--ro-bind", directory, directory]
        cmd += ["--bind", str(scratch), "/tmp", "/bin/sh", "-c", "test -w /tmp && test ! -e /tmp/not-created && printf ok"]
        try:
            smoke = subprocess.run(cmd, capture_output=True, text=True, timeout=10, env={"PATH": "/usr/bin:/bin", "HOME": "/tmp", "LANG": "C.UTF-8"})
        except (OSError, subprocess.TimeoutExpired) as exc:
            result["error"] = f"bwrap_smoke_failed:{exc}"; return result
    result["smoke_rc"] = smoke.returncode
    result["smoke_stderr"] = smoke.stderr[-1000:]
    result["smoke_ok"] = smoke.returncode == 0 and smoke.stdout == "ok"
    if not result["smoke_ok"]:
        result["error"] = "bwrap_namespace_denied"
    return result


def _check_searxng() -> dict:
    base = os.environ.get("SEARXNG_URL", "").strip().rstrip("/")
    result = {"configured": bool(base), "url": base or None, "search_ok": False}
    if not base:
        return result
    try:
        import httpx
        with httpx.Client(timeout=httpx.Timeout(8.0, connect=3.0), follow_redirects=False) as client:
            response = client.get(base + "/search", params={"q": "shortvideo doctor", "format": "json", "pageno": 1}, headers={"Accept": "application/json"})
        result["status_code"] = response.status_code
        if response.status_code < 400:
            body = response.json()
            result["search_ok"] = isinstance(body, dict) and isinstance(body.get("results"), list)
            if not result["search_ok"]:
                result["error"] = "searxng_invalid_json_shape"
        else:
            result["error"] = f"searxng_http_{response.status_code}"
    except Exception as exc:
        result["error"] = f"searxng_unreachable:{type(exc).__name__}:{exc}"
    return result


def _check_render_assets() -> dict:
    """The director's tsc/remotion-still/vision loop needs these present and
    correct to actually work in the network-free sandbox: vendored fonts
    (see video/public/fonts/README.md - no fonts.gstatic.com fetch at render
    time) and remotion's own bundled headless-shell binary (no network to
    download it if missing)."""
    fonts_dir = ROOT / "video" / "public" / "fonts"
    result: dict = {"fonts_ok": False, "chrome_headless_shell_ok": False}
    try:
        manifest = json.loads((fonts_dir / "manifest.json").read_text(encoding="utf-8"))
        mismatches = []
        for entry in manifest.get("files", []):
            fpath = fonts_dir / entry["filename"]
            if not fpath.is_file():
                mismatches.append(f"{entry['filename']}:missing")
                continue
            if hashlib.sha256(fpath.read_bytes()).hexdigest() != entry["sha256"]:
                mismatches.append(f"{entry['filename']}:hash_mismatch")
        result["fonts_ok"] = bool(manifest.get("files")) and not mismatches
        if mismatches:
            result["fonts_error"] = ",".join(mismatches)
    except (OSError, ValueError, KeyError) as exc:
        result["fonts_error"] = f"manifest_unreadable:{type(exc).__name__}"

    chrome_dir = ROOT / "video" / "node_modules" / ".remotion" / "chrome-headless-shell"
    result["chrome_headless_shell_ok"] = chrome_dir.is_dir() and any(chrome_dir.iterdir())
    if not result["chrome_headless_shell_ok"]:
        result["chrome_headless_shell_error"] = "chrome_headless_shell_missing"
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args(argv)
    bwrap = os.environ.get("SHORTVIDEO_BWRAP") or shutil.which("bwrap")
    searxng = _check_searxng()
    firecrawl_configured = bool(os.environ.get("FIRECRAWL_API_KEY", "").strip())
    search_available = bool(searxng.get("search_ok") or firecrawl_configured)
    checks = {
        "openrouter_api_key": bool(os.environ.get("OPENROUTER_API_KEY", "").strip()),
        "search_backend": {"ok": search_available, "searxng": searxng, "firecrawl_keyed_fallback_configured": firecrawl_configured},
        "httpx": importlib.util.find_spec("httpx") is not None,
        "trafilatura": importlib.util.find_spec("trafilatura") is not None,
        "git": shutil.which("git") is not None,
        "rg": shutil.which("rg") is not None,
        "node": shutil.which("node") is not None,
        "chromium": bool(os.environ.get("SHORTVIDEO_CHROMIUM") or shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome") or shutil.which("google-chrome-stable")),
        "policy": (ROOT / "tools" / "delegate_policy.json").is_file(),
        "role_prompts": all((ROOT / ".claude" / "agents" / name).is_file() for name in ("scriptwriter.md", "animation-director.md", "critic.md")),
        "bwrap": _check_bwrap(bwrap),
        "render_assets": _check_render_assets(),
    }
    required_ok = checks["openrouter_api_key"] and checks["search_backend"]["ok"] and checks["httpx"] and checks["trafilatura"] and checks["git"] and checks["rg"] and checks["node"] and checks["policy"] and checks["role_prompts"] and checks["bwrap"]["smoke_ok"] and checks["render_assets"]["fonts_ok"] and checks["render_assets"]["chrome_headless_shell_ok"]
    error_class = "ok"
    if not checks["openrouter_api_key"]: error_class = "openrouter_key_missing"
    elif not checks["search_backend"]["ok"]: error_class = "web_search_backend_unavailable"
    elif not checks["httpx"] or not checks["trafilatura"]: error_class = "openrouter_python_dependency_missing"
    elif not checks["bwrap"]["smoke_ok"]: error_class = checks["bwrap"].get("error", "bwrap_unknown_failure")
    elif not checks["render_assets"]["fonts_ok"] or not checks["render_assets"]["chrome_headless_shell_ok"]: error_class = "render_assets_missing"
    elif not all(checks[k] for k in ("git", "rg", "node", "policy", "role_prompts")): error_class = "openrouter_host_dependency_missing"
    print(json.dumps({"ok": required_ok, "error_class": error_class, "checks": checks, "notes": {
        "chromium": "optional until a JS-only web_fetch fallback is needed" if not checks["chromium"] else "available",
        "search": "SearXNG is primary; FIRECRAWL_API_KEY enables an optional keyed fallback. The legacy Exa key is not used.",
        "network": "model shell has no external network; trusted supervisor owns search/fetch HTTP",
    }}, ensure_ascii=False, indent=2))
    return 0 if required_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

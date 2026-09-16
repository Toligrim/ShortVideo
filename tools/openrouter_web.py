#!/usr/bin/env python3
from __future__ import annotations
import contextlib
import gzip
import http.client
import ipaddress
import os
import select
import shutil
import socket
import socketserver
import ssl
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from openrouter_base import (
    MAX_FETCH_BYTES, ToolError, sanitized_child_env,
)

class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, hostname: str, pinned_ip: str, port: int, timeout: float):
        super().__init__(hostname, port=port, timeout=timeout)
        self._pinned_ip = pinned_ip

    def connect(self) -> None:
        self.sock = socket.create_connection((self._pinned_ip, self.port), self.timeout)


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, hostname: str, pinned_ip: str, port: int, timeout: float):
        context = ssl.create_default_context()
        super().__init__(hostname, port=port, timeout=timeout, context=context)
        self._pinned_ip = pinned_ip

    def connect(self) -> None:
        raw = socket.create_connection((self._pinned_ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(raw, server_hostname=self.host)


def _public_ips_for_host(host: str, port: int) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ToolError("dns_failed", f"cannot resolve {host}: {exc}", retryable=True) from exc
    ips: list[str] = []
    for info in infos:
        ip = info[4][0].split("%", 1)[0]
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            continue
        if not addr.is_global:
            raise ToolError(
                "ssrf_blocked",
                f"{host} resolved to non-public address {ip}",
                "web_fetch only accepts public Internet destinations.",
                retryable=False,
            )
        if ip not in ips:
            ips.append(ip)
    if not ips:
        raise ToolError("dns_failed", f"no usable public address for {host}", retryable=True)
    return ips


def _validate_public_url(url: str) -> tuple[str, str, int, str]:
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"}:
        raise ToolError("invalid_url", "only http:// and https:// URLs are allowed", retryable=False)
    if not parts.hostname or parts.username or parts.password:
        raise ToolError("invalid_url", "URL must contain a normal public hostname and no embedded credentials", retryable=False)
    try:
        port = parts.port or (443 if parts.scheme == "https" else 80)
    except ValueError as exc:
        raise ToolError("invalid_url", "invalid URL port", retryable=False) from exc
    if port not in {80, 443}:
        raise ToolError("ssrf_blocked", f"port {port} is not allowed", "Only public HTTP/HTTPS ports 80 and 443 are accepted.", False)
    host = parts.hostname.rstrip(".")
    if host.lower() in {"localhost", "localhost.localdomain"}:
        raise ToolError("ssrf_blocked", "localhost is not allowed", retryable=False)
    path = parts.path or "/"
    if parts.query:
        path += "?" + parts.query
    return parts.scheme, host, port, path


def _fetch_public_bytes(url: str, *, timeout: float = 12.0, redirects: int = 4) -> tuple[str, bytes, str]:
    current = url
    for _ in range(redirects + 1):
        scheme, host, port, path = _validate_public_url(current)
        ips = _public_ips_for_host(host, port)
        last_exc: Exception | None = None
        response = None
        conn = None
        for ip in ips:
            try:
                cls = _PinnedHTTPSConnection if scheme == "https" else _PinnedHTTPConnection
                conn = cls(host, ip, port, timeout)
                conn.request(
                    "GET",
                    path,
                    headers={
                        "Host": host if port in {80, 443} else f"{host}:{port}",
                        "User-Agent": "ShortVideoResearchBot/1.0 (+web_fetch)",
                        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
                        "Accept-Encoding": "gzip",
                        "Connection": "close",
                    },
                )
                response = conn.getresponse()
                break
            except (OSError, ssl.SSLError, http.client.HTTPException) as exc:
                last_exc = exc
                if conn:
                    try:
                        conn.close()
                    except Exception:
                        pass
        if response is None:
            raise ToolError("fetch_failed", f"connection failed: {last_exc}", retryable=True)

        status = response.status
        location = response.getheader("Location")
        content_type = response.getheader("Content-Type") or ""
        encoding = (response.getheader("Content-Encoding") or "").lower()

        if status in {301, 302, 303, 307, 308} and location:
            response.read(1024)
            conn.close()
            current = urljoin(current, location)
            continue
        if status < 200 or status >= 300:
            body = response.read(min(4096, MAX_FETCH_BYTES))
            conn.close()
            raise ToolError(
                "http_error",
                f"HTTP {status} from {current}",
                body.decode("utf-8", errors="replace")[:500] or None,
                retryable=status in {408, 425, 429, 500, 502, 503, 504},
            )

        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = response.read(min(65536, MAX_FETCH_BYTES + 1 - total))
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if total > MAX_FETCH_BYTES:
                conn.close()
                raise ToolError(
                    "response_too_large",
                    f"page exceeds {MAX_FETCH_BYTES} bytes",
                    "Fetch a more specific documentation/article URL.",
                    False,
                )
        conn.close()
        raw = b"".join(chunks)
        if encoding == "gzip":
            try:
                raw = gzip.decompress(raw)
            except OSError as exc:
                raise ToolError("decode_failed", "invalid gzip response", retryable=True) from exc
        return current, raw, content_type

    raise ToolError("redirect_limit", f"more than {redirects} redirects", retryable=False)


def _extract_html(raw: bytes, url: str, content_type: str) -> str:
    if "text/plain" in content_type:
        return raw.decode("utf-8", errors="replace")
    try:
        from trafilatura import extract
    except ImportError as exc:
        raise ToolError(
            "extractor_unavailable",
            "trafilatura is not installed",
            "Install requirements-openrouter.txt.",
            False,
        ) from exc
    html = raw.decode("utf-8", errors="replace")
    text = extract(
        html,
        url=url,
        output_format="markdown",
        include_comments=False,
        include_tables=True,
        include_links=True,
        favor_precision=True,
        deduplicate=True,
    )
    return (text or "").strip()


def _chrome_binary() -> str | None:
    configured = os.environ.get("SHORTVIDEO_CHROMIUM", "").strip()
    if configured and Path(configured).is_file():
        return configured
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable"):
        path = shutil.which(name)
        if path:
            return path
    return None


def _proxy_target_allowed(requested_host: str, requested_port: int, allowed_host: str, allowed_port: int) -> bool:
    return (
        requested_host.rstrip(".").lower() == allowed_host.rstrip(".").lower()
        and requested_port == allowed_port
    )


class _RestrictedBrowserProxy(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, server_address: tuple[str, int], *, allowed_host: str, allowed_port: int, pinned_ip: str) -> None:
        self.allowed_host = allowed_host.rstrip(".").lower()
        self.allowed_port = allowed_port
        self.pinned_ip = pinned_ip
        super().__init__(server_address, _RestrictedBrowserProxyHandler)


class _RestrictedBrowserProxyHandler(socketserver.BaseRequestHandler):
    MAX_HEADER = 64 * 1024

    def _read_header(self) -> bytes:
        data = bytearray()
        self.request.settimeout(5)
        while b"\r\n\r\n" not in data:
            chunk = self.request.recv(4096)
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > self.MAX_HEADER:
                raise ValueError("proxy request header too large")
        return bytes(data)

    @staticmethod
    def _host_port(value: str, default_port: int) -> tuple[str, int]:
        value = value.strip()
        if value.startswith("["):
            close = value.find("]")
            if close < 0:
                raise ValueError("invalid bracketed host")
            host = value[1:close]
            tail = value[close + 1 :]
            port = int(tail[1:]) if tail.startswith(":") else default_port
            return host, port
        if value.count(":") == 1:
            host, raw_port = value.rsplit(":", 1)
            if raw_port.isdigit():
                return host, int(raw_port)
        return value, default_port

    def _allowed(self, host: str, port: int) -> bool:
        server = self.server
        assert isinstance(server, _RestrictedBrowserProxy)
        return _proxy_target_allowed(host, port, server.allowed_host, server.allowed_port)

    def _connect_upstream(self) -> socket.socket:
        server = self.server
        assert isinstance(server, _RestrictedBrowserProxy)
        return socket.create_connection((server.pinned_ip, server.allowed_port), timeout=8)

    @staticmethod
    def _relay(left: socket.socket, right: socket.socket) -> None:
        sockets = [left, right]
        for sock in sockets:
            sock.setblocking(False)
        deadline = time.monotonic() + 20
        while sockets and time.monotonic() < deadline:
            readable, _, exceptional = select.select(sockets, [], sockets, 1.0)
            if exceptional:
                return
            if not readable:
                continue
            for src in list(readable):
                try:
                    data = src.recv(64 * 1024)
                except (BlockingIOError, OSError):
                    return
                if not data:
                    return
                dst = right if src is left else left
                try:
                    dst.sendall(data)
                except OSError:
                    return

    def _deny(self, status: str = "403 Forbidden") -> None:
        with contextlib.suppress(OSError):
            self.request.sendall(
                f"HTTP/1.1 {status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n".encode("ascii")
            )

    def handle(self) -> None:
        try:
            header = self._read_header()
            head, sep, rest = header.partition(b"\r\n\r\n")
            lines = head.split(b"\r\n")
            if not lines:
                return
            first = lines[0].decode("latin-1", errors="replace")
            parts = first.split(" ", 2)
            if len(parts) != 3:
                self._deny("400 Bad Request")
                return
            method, target, version = parts
            if method.upper() == "CONNECT":
                host, port = self._host_port(target, 443)
                if not self._allowed(host, port):
                    self._deny()
                    return
                upstream = self._connect_upstream()
                try:
                    self.request.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                    if rest:
                        upstream.sendall(rest)
                    self._relay(self.request, upstream)
                finally:
                    upstream.close()
                return

            split = urlsplit(target)
            if split.scheme not in {"http", "https"} or not split.hostname:
                self._deny("400 Bad Request")
                return
            default_port = 443 if split.scheme == "https" else 80
            port = split.port or default_port
            if not self._allowed(split.hostname, port):
                self._deny()
                return
            if split.scheme == "https":
                self._deny("400 Bad Request")
                return
            origin_target = split.path or "/"
            if split.query:
                origin_target += "?" + split.query
            rewritten = (
                f"{method} {origin_target} {version}\r\n".encode("latin-1")
                + b"\r\n".join(lines[1:])
                + b"\r\n\r\n"
                + rest
            )
            upstream = self._connect_upstream()
            try:
                upstream.sendall(rewritten)
                self._relay(self.request, upstream)
            finally:
                upstream.close()
        except (OSError, ValueError):
            self._deny("502 Bad Gateway")


@contextlib.contextmanager
def _restricted_browser_proxy(host: str, port: int, ip: str):
    proxy = _RestrictedBrowserProxy(
        ("127.0.0.1", 0),
        allowed_host=host,
        allowed_port=port,
        pinned_ip=ip,
    )
    thread = threading.Thread(target=proxy.serve_forever, daemon=True)
    thread.start()
    try:
        yield int(proxy.server_address[1])
    finally:
        proxy.shutdown()
        proxy.server_close()
        thread.join(timeout=2)


def _chromium_dump_dom(url: str, host: str, ip: str, *, port: int, timeout: int = 20) -> bytes:
    chrome = _chrome_binary()
    if not chrome:
        raise ToolError("js_renderer_unavailable", "headless Chromium was not found", retryable=False)
    env = sanitized_child_env({"HOME": tempfile.mkdtemp(prefix="sv-chrome-")})
    try:
        with _restricted_browser_proxy(host, port, ip) as proxy_port:
            cmd = [
                chrome,
                "--headless=new",
                "--disable-gpu",
                "--disable-background-networking",
                "--disable-component-update",
                "--disable-default-apps",
                "--disable-extensions",
                "--disable-sync",
                "--metrics-recording-only",
                "--no-first-run",
                "--disable-quic",
                f"--proxy-server=http://127.0.0.1:{proxy_port}",
                "--proxy-bypass-list=<-loopback>",
                "--virtual-time-budget=8000",
                "--dump-dom",
                url,
            ]
            proc = subprocess.run(cmd, env=env, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise ToolError("js_render_timeout", f"Chromium exceeded {timeout}s", retryable=True) from exc
    if proc.returncode != 0 or not proc.stdout:
        detail = proc.stderr.decode("utf-8", errors="replace")[-1000:]
        raise ToolError("js_render_failed", detail or f"Chromium exit {proc.returncode}", retryable=True)
    if len(proc.stdout) > MAX_FETCH_BYTES:
        raise ToolError("response_too_large", "rendered DOM exceeds fetch byte budget", retryable=False)
    return proc.stdout

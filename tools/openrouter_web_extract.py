#!/usr/bin/env python3
from __future__ import annotations

import concurrent.futures
import re
from dataclasses import dataclass
from typing import Any

from openrouter_base import DEFAULT_FETCH_CHARS, MAX_FETCH_CHARS, ToolError, _ok
from openrouter_web import _chromium_dump_dom, _extract_html, _fetch_public_bytes, validate_public_url
from openrouter_web_cache import ExtractDiskCache

MAX_BATCH_URLS = 5
EXTRACT_PROVIDER = "shortvideo-static-trafilatura-v2"
_BASE64_MD_IMAGE_RE = re.compile(r"!\[(?P<alt>[^\]]*)\]\(\s*data:image/[^;\s]+;base64,[A-Za-z0-9+/=\s]+\)", re.IGNORECASE)
_BASE64_PAREN_IMAGE_RE = re.compile(r"\(\s*data:image/[^;\s]+;base64,[A-Za-z0-9+/=\s]+\)", re.IGNORECASE)
_BASE64_BARE_IMAGE_RE = re.compile(r"data:image/[^;\s]+;base64,[A-Za-z0-9+/=]+", re.IGNORECASE)


def strip_base64_images(text: str) -> str:
    def md_replace(match: re.Match[str]) -> str:
        alt = (match.group("alt") or "").strip()
        return f"[IMAGE: {alt}]" if alt else "[IMAGE]"
    value = _BASE64_MD_IMAGE_RE.sub(md_replace, text)
    value = _BASE64_PAREN_IMAGE_RE.sub("[IMAGE]", value)
    return _BASE64_BARE_IMAGE_RE.sub("[IMAGE]", value)


def truncate_75_25(content: str, char_limit: int, spill: dict[str, Any] | None = None) -> tuple[str, bool]:
    if len(content) <= char_limit:
        return content, False
    head_budget = int(char_limit * 0.75)
    tail_budget = char_limit - head_budget
    head, tail = content[:head_budget], content[-tail_budget:]
    head_nl = head.rfind("\n")
    if head_nl > head_budget * 0.5:
        head = head[:head_nl]
    tail_nl = tail.find("\n")
    if 0 <= tail_nl < tail_budget * 0.5:
        tail = tail[tail_nl + 1:]
    footer = ["", "-------- [TRUNCATED] --------", f"Showing {len(head)} chars (head) + {len(tail)} chars (tail) of {len(content)} total clean characters."]
    if spill and spill.get("model_path"):
        footer.extend([
            f"Full text saved to: {spill['model_path']}",
            f"Stored copy complete: {'yes' if spill.get('complete') else 'no'}",
            "Use read_file on that @web-cache path with start_line/end_line to page through the omitted middle.",
        ])
    else:
        footer.append("Full text could not be stored; fetch a more specific URL for omitted content.")
    footer.append("-----------------------------")
    return head + "\n\n[... middle omitted — see footer ...]\n\n" + tail + "\n" + "\n".join(footer), True


@dataclass(frozen=True)
class _SafeRequest:
    requested_url: str
    normalized_url: str


class WebExtractor:
    def __init__(self, cache: ExtractDiskCache | None = None) -> None:
        self.cache = cache or ExtractDiskCache()

    @staticmethod
    def _mode(render_js: str) -> str:
        return f"trafilatura-markdown:{render_js}:v2"

    @staticmethod
    def _urls_from_args(args: dict[str, Any]) -> tuple[list[str], bool]:
        has_url = isinstance(args.get("url"), str) and bool(str(args.get("url")).strip())
        has_urls = args.get("urls") is not None
        if has_url and has_urls:
            raise ToolError("invalid_arguments", "pass either url or urls, not both", retryable=False)
        if has_url:
            return [str(args["url"]).strip()], True
        values = args.get("urls")
        if not isinstance(values, list) or not values:
            raise ToolError("invalid_arguments", "web_fetch requires url or a non-empty urls list", retryable=False)
        if len(values) > MAX_BATCH_URLS:
            raise ToolError("invalid_arguments", f"web_fetch accepts at most {MAX_BATCH_URLS} URLs", retryable=False)
        urls = []
        for index, value in enumerate(values):
            if not isinstance(value, str) or not value.strip():
                raise ToolError("invalid_arguments", f"urls[{index}] must be a non-empty string", retryable=False)
            urls.append(value.strip())
        return urls, False

    @staticmethod
    def _char_limit(value: Any) -> int:
        if value is None:
            return DEFAULT_FETCH_CHARS
        if isinstance(value, bool) or not isinstance(value, int):
            raise ToolError("invalid_arguments", "max_chars must be an integer", retryable=False)
        return max(2_000, min(value, MAX_FETCH_CHARS))

    @staticmethod
    def _render_mode(value: Any) -> str:
        mode = str(value or "auto")
        if mode not in {"auto", "never"}:
            raise ToolError("invalid_arguments", "render_js must be 'auto' or 'never'", retryable=False)
        return mode

    def _safety_gate(self, raw: str) -> _SafeRequest:
        normalized, _scheme, _host, _port, _path, _ips = validate_public_url(raw)
        return _SafeRequest(raw, normalized)

    def _fetch_uncached(self, safe: _SafeRequest, render_js: str) -> dict[str, Any]:
        final_url, raw, content_type = _fetch_public_bytes(safe.normalized_url)
        text = strip_base64_images(_extract_html(raw, final_url, content_type))
        used_js = False
        if render_js == "auto" and len(text) < 500 and "text/html" in content_type.lower():
            normalized, _scheme, host, port, _path, ips = validate_public_url(final_url)
            try:
                dom = _chromium_dump_dom(normalized, host, ips[0], port=port)
                rendered = strip_base64_images(_extract_html(dom, normalized, "text/html"))
                if len(rendered) > len(text):
                    text, used_js = rendered, True
            except ToolError:
                pass
        text = text.strip()
        if not text:
            raise ToolError("extraction_empty", "page fetched successfully but no readable text was extracted", "Try a canonical article/documentation URL or another source from web_search.", False)
        return {"requested_url": safe.normalized_url, "url": final_url, "content": text, "content_type": content_type, "rendered_js": used_js}

    def _fetch_many_uncached(self, requests: list[_SafeRequest], render_js: str) -> list[dict[str, Any]]:
        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(MAX_BATCH_URLS, max(1, len(requests))), thread_name_prefix="sv-web") as pool:
            future_map = {pool.submit(self._fetch_uncached, item, render_js): item for item in requests}
            for future in concurrent.futures.as_completed(future_map):
                item = future_map[future]
                try:
                    results.append(future.result())
                except ToolError as exc:
                    results.append({"requested_url": item.normalized_url, "url": item.normalized_url, "error": exc.payload()["error"]})
                except Exception as exc:
                    results.append({"requested_url": item.normalized_url, "url": item.normalized_url, "error": ToolError("fetch_failed", f"{type(exc).__name__}: {exc}", retryable=True).payload()["error"]})
        return results

    @staticmethod
    def associate_results(requested_urls: list[str], results: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        requested, associated = set(requested_urls), {}
        for result in results:
            source = result.get("requested_url")
            if isinstance(source, str) and source in requested and source not in associated:
                associated[source] = result
        return associated

    def _present(self, page: dict[str, Any], mode: str, char_limit: int, cache_hit: bool) -> dict[str, Any]:
        full = str(page["content"])
        spill = self.cache.spill(str(page["requested_url"]), mode, full) if len(full) > char_limit else None
        content, truncated = truncate_75_25(full, char_limit, spill)
        return {
            "requested_url": page["requested_url"], "url": page.get("url") or page["requested_url"], "content": content,
            "content_type": page.get("content_type") or "", "truncated": truncated, "total_chars": len(full),
            "rendered_js": bool(page.get("rendered_js")), "full_text_path": spill.get("model_path") if spill else None,
            "full_text_complete": spill.get("complete") if spill else True, "cache_hit": cache_hit,
        }

    def fetch(self, args: dict[str, Any]) -> dict[str, Any]:
        raw_urls, single = self._urls_from_args(args)
        char_limit, render_js = self._char_limit(args.get("max_chars")), self._render_mode(args.get("render_js"))
        mode = self._mode(render_js)
        safe_requests = [self._safety_gate(raw) for raw in raw_urls]  # SAFETY BEFORE CACHE
        normalized_urls = [item.normalized_url for item in safe_requests]
        pages, cache_hits, misses, miss_names = {}, set(), [], set()
        for item in safe_requests:
            hit = self.cache.get(item.normalized_url, mode, EXTRACT_PROVIDER)
            if hit is None:
                if item.normalized_url not in miss_names:
                    misses.append(item); miss_names.add(item.normalized_url)
                continue
            meta = hit.get("meta") if isinstance(hit.get("meta"), dict) else {}
            pages[item.normalized_url] = {"requested_url": item.normalized_url, "url": meta.get("url") or item.normalized_url, "content": hit["content"], "content_type": meta.get("content_type") or "", "rendered_js": bool(meta.get("rendered_js"))}
            cache_hits.add(item.normalized_url)
        if misses:
            associated = self.associate_results([m.normalized_url for m in misses], self._fetch_many_uncached(misses, render_js))
            for item in misses:
                result = associated.get(item.normalized_url)
                if result is None:
                    result = {"requested_url": item.normalized_url, "url": item.normalized_url, "error": {"type": "fetch_missing_result", "message": "fetch worker returned no reliably associated result for this URL", "retryable": True}}
                pages[item.normalized_url] = result
                if not result.get("error") and result.get("content"):
                    self.cache.put(item.normalized_url, mode, str(result["content"]), {"url": result.get("url") or item.normalized_url, "content_type": result.get("content_type") or "", "rendered_js": bool(result.get("rendered_js"))}, EXTRACT_PROVIDER)
        output = []
        for normalized in normalized_urls:
            page = pages.get(normalized)
            if page is None:
                output.append({"requested_url": normalized, "url": normalized, "error": {"type": "fetch_missing_result", "message": "no fetch result", "retryable": True}, "cache_hit": False})
            elif page.get("error"):
                output.append({"requested_url": normalized, "url": page.get("url") or normalized, "error": page["error"], "cache_hit": False})
            else:
                output.append(self._present(page, mode, char_limit, normalized in cache_hits))
        return _ok(output[0] if single else output, provider=EXTRACT_PROVIDER, batch_size=len(output))

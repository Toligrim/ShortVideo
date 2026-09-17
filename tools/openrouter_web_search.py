#!/usr/bin/env python3
from __future__ import annotations

import os
from typing import Any
from urllib.parse import urljoin

import httpx

from openrouter_base import MAX_SEARCH_RESULTS, ToolError, _ok
from openrouter_web_cache import SearchMemo, bucket_limit


def _score(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def normalize_search_results(raw_results: Any, limit: int) -> list[dict[str, Any]]:
    if not isinstance(raw_results, list):
        raise ToolError("search_invalid_response", "search backend returned a non-list results field", retryable=True)
    rows: list[dict[str, Any]] = []
    for item in raw_results:
        if not isinstance(item, dict):
            continue
        url = item.get("url") or item.get("href")
        if not isinstance(url, str) or not url.strip():
            continue
        rows.append({
            "title": str(item.get("title") or "").strip(),
            "url": url.strip(),
            "description": str(item.get("content") or item.get("description") or item.get("snippet") or "").strip(),
            "score": _score(item.get("score")),
        })
    rows.sort(key=lambda row: row["score"], reverse=True)
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        if row["url"] in seen:
            continue
        seen.add(row["url"])
        row["position"] = len(out) + 1
        out.append(row)
        if len(out) >= limit:
            break
    return out


class WebSearcher:
    """Static ShortVideo search layer: SearXNG primary, optional keyed Firecrawl fallback."""

    def __init__(self, memo: SearchMemo | None = None) -> None:
        self.memo = memo or SearchMemo()

    def _searxng_url(self) -> str:
        return os.environ.get("SEARXNG_URL", "").strip().rstrip("/")

    def _firecrawl_key(self) -> str:
        return os.environ.get("FIRECRAWL_API_KEY", "").strip()

    def backend_identity(self) -> str:
        searx = self._searxng_url() or "none"
        fallback = "firecrawl-keyed" if self._firecrawl_key() else "none"
        return f"searxng:{searx}|fallback:{fallback}"

    def _search_searxng(self, query: str, limit: int) -> list[dict[str, Any]]:
        base = self._searxng_url()
        if not base:
            raise ToolError("search_backend_unconfigured", "SEARXNG_URL is not set", retryable=False)
        try:
            with httpx.Client(timeout=httpx.Timeout(15.0, connect=5.0), follow_redirects=False) as client:
                response = client.get(
                    urljoin(base + "/", "search"),
                    params={"q": query, "format": "json", "pageno": 1},
                    headers={"Accept": "application/json"},
                )
        except httpx.HTTPError as exc:
            raise ToolError("search_transport_error", f"SearXNG request failed: {exc}", retryable=True) from exc
        if response.status_code >= 400:
            raise ToolError(
                "search_http_error",
                f"SearXNG returned HTTP {response.status_code}",
                response.text[:500] or None,
                response.status_code in {408, 425, 429, 500, 502, 503, 504},
            )
        try:
            body = response.json()
        except ValueError as exc:
            raise ToolError("search_invalid_response", "SearXNG did not return JSON", retryable=True) from exc
        if not isinstance(body, dict):
            raise ToolError("search_invalid_response", "SearXNG JSON root is not an object", retryable=True)
        return normalize_search_results(body.get("results"), limit)

    def _search_firecrawl(self, query: str, limit: int) -> list[dict[str, Any]]:
        key = self._firecrawl_key()
        if not key:
            raise ToolError("search_backend_unconfigured", "FIRECRAWL_API_KEY is not set", retryable=False)
        try:
            with httpx.Client(timeout=httpx.Timeout(20.0, connect=5.0), follow_redirects=False) as client:
                response = client.post(
                    "https://api.firecrawl.dev/v2/search",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json={"query": query, "limit": limit},
                )
        except httpx.HTTPError as exc:
            raise ToolError("search_transport_error", f"Firecrawl request failed: {exc}", retryable=True) from exc
        if response.status_code >= 400:
            raise ToolError(
                "search_http_error",
                f"Firecrawl returned HTTP {response.status_code}",
                response.text[:500] or None,
                response.status_code in {408, 425, 429, 500, 502, 503, 504},
            )
        try:
            body = response.json()
        except ValueError as exc:
            raise ToolError("search_invalid_response", "Firecrawl did not return JSON", retryable=True) from exc
        data = body.get("data") if isinstance(body, dict) else None
        if isinstance(data, dict):
            raw = data.get("web") or data.get("results") or []
        else:
            raw = data if isinstance(data, list) else (body.get("results", []) if isinstance(body, dict) else [])
        if isinstance(raw, list):
            decorated: list[dict[str, Any]] = []
            total = len(raw)
            for idx, item in enumerate(raw):
                if isinstance(item, dict):
                    clone = dict(item)
                    clone.setdefault("score", total - idx)
                    decorated.append(clone)
            raw = decorated
        return normalize_search_results(raw, limit)

    def _network_search(self, query: str, bucket: int) -> dict[str, Any]:
        searx_error: ToolError | None = None
        if self._searxng_url():
            try:
                rows = self._search_searxng(query, bucket)
                return _ok(rows, provider="searxng", cache_hit=False, fallback_used=False)
            except ToolError as exc:
                searx_error = exc
        if self._firecrawl_key():
            rows = self._search_firecrawl(query, bucket)
            return _ok(
                rows,
                provider="firecrawl",
                cache_hit=False,
                fallback_used=searx_error is not None,
                primary_error=searx_error.type if searx_error else None,
            )
        if searx_error is not None:
            raise searx_error
        raise ToolError(
            "search_unconfigured",
            "No web search backend is configured",
            "Set SEARXNG_URL. Optionally set FIRECRAWL_API_KEY as a keyed fallback.",
            False,
        )

    @staticmethod
    def _slice(response: dict[str, Any], limit: int, *, cache_hit: bool) -> dict[str, Any]:
        out = {"ok": response.get("ok", False), "data": list(response.get("data") or [])[:limit]}
        meta = dict(response.get("meta") or {})
        meta["cache_hit"] = cache_hit
        out["meta"] = meta
        return out

    def search(self, query: str, limit: int = 5) -> dict[str, Any]:
        query = str(query).strip()
        if len(query) < 2:
            raise ToolError("invalid_arguments", "search query is too short", retryable=False)
        limit = max(1, min(int(limit), MAX_SEARCH_RESULTS))
        bucket = bucket_limit(limit)
        identity = self.backend_identity()
        hit = self.memo.lookup(identity, query, bucket)
        if hit is not None:
            return self._slice(hit, limit, cache_hit=True)

        def leader() -> dict[str, Any]:
            second_hit = self.memo.lookup(identity, query, bucket)
            if second_hit is not None:
                return second_hit
            response = self._network_search(query, bucket)
            self.memo.store(identity, query, bucket, response)
            return response

        response = self.memo.singleflight(identity, query, bucket, leader)
        return self._slice(response, limit, cache_hit=False)

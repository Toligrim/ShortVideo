#!/usr/bin/env python3
from __future__ import annotations
import base64
import fcntl
import json
import os
import time
from pathlib import Path
from typing import Any

import httpx

from openrouter_config import OPENROUTER_URL, MAX_API_RETRIES


def estimate_tokens(value: Any) -> int:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return max(1, (len(raw) + 2) // 3)


class UsageLedger:
    def __init__(self, run_dir: Path) -> None:
        self.run_dir = run_dir
        self.path = run_dir / "openrouter-usage.jsonl"
        self.run_dir.mkdir(parents=True, exist_ok=True)

    def record(self, *, role: str, kind: str, model: str, response: dict[str, Any], session_id: str) -> None:
        usage = response.get("usage") or {}
        rec = {
            "ts": time.time(),
            "role": role,
            "kind": kind,
            "model": response.get("model") or model,
            "session_id": session_id,
            "generation_id": response.get("id"),
            "usage": usage,
            "openrouter_metadata": response.get("openrouter_metadata"),
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as fh:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
            try:
                fh.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")
            finally:
                fcntl.flock(fh.fileno(), fcntl.LOCK_UN)

    def totals(self) -> dict[str, Any]:
        totals = {
            "cost_usd": 0.0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "cached_tokens": 0,
            "cache_write_tokens": 0,
            "reasoning_tokens": 0,
            "calls": 0,
            "by_role": {},
        }
        if not self.path.is_file():
            return totals
        for line in self.path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            u = rec.get("usage") or {}
            role = rec.get("role") or "unknown"
            r = totals["by_role"].setdefault(role, {
                "cost_usd": 0.0, "prompt_tokens": 0, "completion_tokens": 0,
                "cached_tokens": 0, "cache_write_tokens": 0,
                "reasoning_tokens": 0, "calls": 0,
            })
            cost = float(u.get("cost") or 0)
            prompt = int(u.get("prompt_tokens") or 0)
            completion = int(u.get("completion_tokens") or 0)
            pd = u.get("prompt_tokens_details") or {}
            cd = u.get("completion_tokens_details") or {}
            cached = int(pd.get("cached_tokens") or 0)
            cache_write = int(pd.get("cache_write_tokens") or 0)
            reasoning = int(cd.get("reasoning_tokens") or 0)
            for target in (totals, r):
                target["cost_usd"] += cost
                target["prompt_tokens"] += prompt
                target["completion_tokens"] += completion
                target["cached_tokens"] += cached
                target["cache_write_tokens"] += cache_write
                target["reasoning_tokens"] += reasoning
                target["calls"] += 1
        totals["cost_usd"] = round(totals["cost_usd"], 9)
        for r in totals["by_role"].values():
            r["cost_usd"] = round(r["cost_usd"], 9)
        return totals

    def write_summary(self) -> dict[str, Any]:
        totals = self.totals()
        (self.run_dir / "openrouter-cost.json").write_text(
            json.dumps(totals, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        return totals


class OpenRouterClient:
    def __init__(self, *, ledger: UsageLedger, role: str, session_id: str) -> None:
        key = os.environ.get("OPENROUTER_API_KEY", "").strip()
        if not key:
            raise RuntimeError("OPENROUTER_API_KEY is not set")
        self.api_key = key
        self.ledger = ledger
        self.role = role
        self.session_id = session_id
        self.client = httpx.Client(
            timeout=httpx.Timeout(150.0, connect=10.0, read=140.0, write=30.0),
            limits=httpx.Limits(max_connections=8, max_keepalive_connections=4),
        )

    def close(self) -> None:
        self.client.close()

    def _post(self, payload: dict[str, Any], *, kind: str, model: str) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/Toligrim/ShortVideo",
            "X-Title": "ShortVideo OpenRouter Harness",
            "X-OpenRouter-Metadata": "enabled",
        }
        last: Exception | None = None
        for attempt in range(1, MAX_API_RETRIES + 1):
            try:
                resp = self.client.post(OPENROUTER_URL, headers=headers, json=payload)
            except httpx.HTTPError as exc:
                last = exc
                if attempt == MAX_API_RETRIES:
                    break
                time.sleep(min(4, 2 ** (attempt - 1)))
                continue
            if resp.status_code < 400:
                body = resp.json()
                self.ledger.record(
                    role=self.role, kind=kind, model=model,
                    response=body, session_id=self.session_id,
                )
                return body
            retryable = resp.status_code in {408, 409, 425, 429, 500, 502, 503, 504}
            message = resp.text[:2000]
            if not retryable or attempt == MAX_API_RETRIES:
                raise RuntimeError(f"OpenRouter HTTP {resp.status_code}: {message}")
            retry_after = resp.headers.get("Retry-After")
            try:
                delay = min(float(retry_after), 15.0) if retry_after else min(4, 2 ** (attempt - 1))
            except ValueError:
                delay = min(4, 2 ** (attempt - 1))
            time.sleep(delay)
        raise RuntimeError(f"OpenRouter transport failed after retries: {last}")

    def chat(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        effort: str,
        max_completion_tokens: int = 24_000,
        kind: str = "agent",
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": False,
            "session_id": self.session_id,
            "metadata": {"shortvideo_session": self.session_id[:240], "role": self.role},
            # Reliability is the first routing objective for this harness:
            # sort by throughput so OpenRouter prefers a provider with real
            # available capacity over the cheapest one (2026-09-17 staging:
            # sort="price" repeatedly routed to a saturated shared-pool
            # endpoint - is_byok=false, only 1 of 29 endpoints satisfied
            # require_parameters - and 429'd with no fallback candidate left;
            # the account has paid balance, so pay for capacity instead of
            # getting stuck on the cheapest saturated endpoint). Explicit
            # sorting also avoids Auto Exacto silently reprioritizing providers
            # for tool-calling requests; fallback providers remain available.
            "provider": {
                "sort": "throughput",
                "require_parameters": True,
                "allow_fallbacks": True,
            },
            "max_completion_tokens": max_completion_tokens,
            "reasoning": {"effort": effort, "exclude": True},
        }
        if tools is not None:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
            # File/code side effects are deliberately serialized. This keeps
            # tool-result ordering deterministic and avoids write races.
            payload["parallel_tool_calls"] = False
        return self._post(payload, kind=kind, model=model)

    def inspect_image(self, path: Path, model: str) -> str:
        mime = mimetype_for_image(path)
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        messages = [
            {
                "role": "system",
                "content": (
                    "You are the visual inspection backend for a vertical-video animation director. "
                    "Describe only actionable visible facts: composition, clipping/overlap, readability, "
                    "whether the frame actually depicts the intended state/motion, and suspicious visual defects. "
                    "Be concise. Do not invent hidden animation state."
                ),
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Inspect this rendered ShortVideo preview frame."},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{encoded}"}},
                ],
            },
        ]
        body = self.chat(
            model=model,
            messages=messages,
            tools=None,
            effort="low",
            max_completion_tokens=4000,
            kind="vision",
        )
        return str(((body.get("choices") or [{}])[0].get("message") or {}).get("content") or "")


def mimetype_for_image(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(suffix, "application/octet-stream")

#!/usr/bin/env python3
from __future__ import annotations

import json
import multiprocessing
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

import openrouter_base
import openrouter_web
import openrouter_web_cache
import openrouter_web_extract
import openrouter_web_search
from openrouter_base import ToolError, sanitized_child_env
from openrouter_executor import ToolExecutor
from openrouter_web_cache import ExtractDiskCache, SearchMemo
from openrouter_web_extract import WebExtractor, strip_base64_images, truncate_75_25
from openrouter_web_search import WebSearcher, normalize_search_results


def _process_singleflight_worker(root: str, start_event, counter, result_queue) -> None:
    memo = SearchMemo(Path(root))
    provider, query, limit = "p", "same process query", 5
    start_event.wait()

    def network():
        with counter.get_lock():
            counter.value += 1
        time.sleep(0.15)
        response = {"ok": True, "data": ["x"]}
        # Production WebSearcher stores a successful response before returning
        # from the single-flight leader. Mirror that contract here so a second
        # process can observe the completed flight through disk cache.
        memo.store(provider, query, limit, response)
        return response

    try:
        result = memo.singleflight(provider, query, limit, network)
        result_queue.put(("ok", result))
    except BaseException as exc:  # pragma: no cover - surfaced in parent assertion
        result_queue.put(("error", repr(exc)))


def test_exact_eight_tool_surface():
    assert [x["function"]["name"] for x in openrouter_base.TOOL_SCHEMAS] == ["read_file", "write_file", "edit_file", "grep", "glob", "bash", "web_search", "web_fetch"]
    assert set(openrouter_base.TOOL_SCHEMAS[6]["function"]["parameters"]["properties"]) == {"query", "limit"}
    assert set(openrouter_base.TOOL_SCHEMAS[7]["function"]["parameters"]["properties"]) == {"url", "urls", "max_chars", "render_js"}


def test_web_search_normalization_and_score_sorting():
    rows = normalize_search_results([
        {"title":"low","url":"https://low","content":"a","score":0.1},
        {"title":"high","url":"https://high","content":"b","score":"9"},
        {"title":"dup","url":"https://high","content":"c","score":8},
    ], 5)
    assert [r["title"] for r in rows] == ["high", "low"]
    assert [r["position"] for r in rows] == [1, 2]
    assert rows[0]["description"] == "b"


def test_query_normalization_and_limit_bucketing():
    assert openrouter_web_cache.normalize_query("  Latest   NVIDIA\nBlackwell ") == "latest nvidia blackwell"
    assert openrouter_web_cache.bucket_limit(1) == 5
    assert openrouter_web_cache.bucket_limit(5) == 5
    assert openrouter_web_cache.bucket_limit(6) == 10


def test_search_cache_ttl_and_cross_instance(tmp_path, monkeypatch):
    monkeypatch.setattr(openrouter_web_cache, "ttl_seconds", lambda: 0.05)
    one = SearchMemo(tmp_path)
    one.store("p", "Query", 5, {"ok":True,"data":[1]})
    assert SearchMemo(tmp_path).lookup("p", " query ", 3)["data"] == [1]
    time.sleep(0.07)
    assert SearchMemo(tmp_path).lookup("p", "query", 5) is None


def test_search_disk_hit_does_not_extend_original_ttl(tmp_path, monkeypatch):
    monkeypatch.setattr(openrouter_web_cache, "ttl_seconds", lambda: 0.10)
    SearchMemo(tmp_path).store("p", "q", 5, {"ok":True,"data":[1]})
    time.sleep(0.07)
    reader = SearchMemo(tmp_path)
    assert reader.lookup("p", "q", 5)["data"] == [1]
    # Only about 30ms remained on the disk entry when reader loaded it. A disk
    # hit must not reset that to another full 100ms in the in-memory tier.
    time.sleep(0.05)
    assert reader.lookup("p", "q", 5) is None


def test_search_singleflight_coalesces_identical_queries(tmp_path):
    memo, guard, barrier = SearchMemo(tmp_path), threading.Lock(), threading.Barrier(8)
    counter = 0
    def network():
        nonlocal counter
        with guard: counter += 1
        time.sleep(0.05)
        return {"ok":True,"data":["x"]}
    def call():
        barrier.wait(); return memo.singleflight("p", "same query", 5, network)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: call(), range(8)))
    assert counter == 1 and all(r["data"] == ["x"] for r in results) and not memo._flights


@pytest.mark.skipif(openrouter_web_cache.fcntl is None, reason="cross-process search flight uses Linux flock")
def test_search_singleflight_coalesces_across_processes(tmp_path):
    ctx = multiprocessing.get_context("fork" if hasattr(os, "fork") else "spawn")
    start_event = ctx.Event()
    counter = ctx.Value("i", 0)
    result_queue = ctx.Queue()
    processes = [
        ctx.Process(
            target=_process_singleflight_worker,
            args=(str(tmp_path), start_event, counter, result_queue),
        )
        for _ in range(2)
    ]
    for process in processes:
        process.start()
    start_event.set()
    results = [result_queue.get(timeout=5) for _ in processes]
    for process in processes:
        process.join(timeout=5)
        assert not process.is_alive()
        assert process.exitcode == 0
    assert counter.value == 1
    assert all(status == "ok" and payload["data"] == ["x"] for status, payload in results)


def test_search_process_lock_table_is_fixed_and_bounded(tmp_path):
    memo = SearchMemo(tmp_path)
    paths = {
        memo._flight_lock_path(memo.key("provider", f"query {index}", 5)).name
        for index in range(5000)
    }
    assert len(paths) <= openrouter_web_cache.SEARCH_LOCK_SHARDS == 64
    assert all(name.endswith(".lock") for name in paths)


def test_failed_search_not_cached(tmp_path):
    memo = SearchMemo(tmp_path)
    memo.store("p", "q", 5, {"ok":False,"error":{"type":"x"}})
    assert memo.lookup("p", "q", 5) is None


def test_searxng_search_params_and_score_sort(tmp_path, monkeypatch):
    monkeypatch.setenv("SEARXNG_URL", "http://127.0.0.1:8888")
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)
    seen = {}
    class Resp:
        status_code=200; text=""
        def json(self): return {"results":[{"title":"b","url":"https://b","content":"B","score":1},{"title":"a","url":"https://a","content":"A","score":2}]}
    class Client:
        def __init__(self,*a,**kw): pass
        def __enter__(self): return self
        def __exit__(self,*a): pass
        def get(self,url,**kw): seen.update({"url":url,**kw}); return Resp()
    monkeypatch.setattr(openrouter_web_search.httpx, "Client", Client)
    out = WebSearcher(SearchMemo(tmp_path)).search("hello", 2)
    assert seen["params"] == {"q":"hello","format":"json","pageno":1}
    assert [r["url"] for r in out["data"]] == ["https://a","https://b"]
    assert out["meta"]["provider"] == "searxng"


def test_search_uses_keyed_firecrawl_only_as_fallback(tmp_path, monkeypatch):
    monkeypatch.setenv("SEARXNG_URL", "http://searx.invalid"); monkeypatch.setenv("FIRECRAWL_API_KEY", "secret")
    searcher = WebSearcher(SearchMemo(tmp_path))
    monkeypatch.setattr(searcher, "_search_searxng", lambda q,l: (_ for _ in ()).throw(ToolError("down","down",retryable=True)))
    monkeypatch.setattr(searcher, "_search_firecrawl", lambda q,l: [{"title":"fallback","url":"https://f","description":"","score":1,"position":1}])
    out = searcher.search("hello", 1)
    assert out["meta"]["provider"] == "firecrawl" and out["meta"]["fallback_used"] is True


def test_extract_disk_cache_and_key_correctness(tmp_path):
    cache = ExtractDiskCache(tmp_path)
    assert cache.key("https://a","auto","x") != cache.key("https://a","never","x")
    assert cache.key("https://a","auto","x") != cache.key("https://a","auto","y")
    path = cache.put("https://a","auto","full",{"url":"https://a/final"},"x")
    assert path and path.startswith("@web-cache/")
    assert ExtractDiskCache(tmp_path).get("https://a","auto","x")["content"] == "full"


def test_extract_corrupt_index_is_graceful_miss(tmp_path):
    (tmp_path / "extract-index.json").write_text("{broken", encoding="utf-8")
    assert ExtractDiskCache(tmp_path).get("https://a","auto","x") is None


def test_cache_hit_still_runs_safety_gate(tmp_path, monkeypatch):
    cache, mode = ExtractDiskCache(tmp_path), WebExtractor._mode("never")
    cache.put("https://example.com/", mode, "cached", {"url":"https://example.com/"}, openrouter_web_extract.EXTRACT_PROVIDER)
    extractor, count = WebExtractor(cache), [0]
    def gate(raw): count[0] += 1; return openrouter_web_extract._SafeRequest(raw, "https://example.com/")
    monkeypatch.setattr(extractor, "_safety_gate", gate)
    out = extractor.fetch({"url":"https://example.com/","render_js":"never"})
    assert count[0] == 1 and out["data"]["cache_hit"] is True


def test_full_text_spill_and_line_boundary_truncation(tmp_path):
    cache = ExtractDiskCache(tmp_path)
    content = "\n".join(f"line {i} {'x'*90}" for i in range(300))
    spill = cache.spill("https://example.com/", "mode", content)
    rendered, truncated = truncate_75_25(content, 4000, spill)
    assert truncated and "[TRUNCATED]" in rendered and spill["model_path"] in rendered
    head, tail = rendered.split("[... middle omitted — see footer ...]")[:2]
    original_lines = set(content.splitlines())
    assert head.strip().splitlines()[-1] in original_lines and tail.strip().splitlines()[0] in original_lines
    assert openrouter_web_cache.resolve_model_cache_path(spill["model_path"], tmp_path).read_text() == content


def test_truncation_head_tail_ratio_approximately_75_25():
    content = "A"*7500 + "\n" + "B"*2499 + "\n" + "C"*10000
    rendered, truncated = truncate_75_25(content, 10000, None)
    body = rendered.split("-------- [TRUNCATED] --------",1)[0]
    assert truncated and body.count("A") > body.count("C") * 2


def test_base64_image_stripping():
    clean = strip_base64_images("before ![chart](data:image/png;base64," + "A"*10000 + ") after data:image/jpeg;base64," + "B"*5000)
    assert "base64" not in clean and "[IMAGE: chart]" in clean and len(clean) < 200


def test_max_stored_chars_handling(tmp_path, monkeypatch):
    monkeypatch.setattr(openrouter_web_cache, "MAX_STORED_TEXT_CHARS", 100)
    cache = ExtractDiskCache(tmp_path); spill = cache.spill("https://a","m","z"*150)
    assert spill["complete"] is False
    assert "STORED COPY CAPPED" in openrouter_web_cache.resolve_model_cache_path(spill["model_path"], tmp_path).read_text()
    assert cache.put("https://a","m","z"*150,{}) is None


def test_batch_fetch_one_to_five_and_requested_order(tmp_path, monkeypatch):
    extractor = WebExtractor(ExtractDiskCache(tmp_path))
    monkeypatch.setattr(extractor, "_safety_gate", lambda raw: openrouter_web_extract._SafeRequest(raw, raw))
    monkeypatch.setattr(extractor, "_fetch_many_uncached", lambda reqs,mode: [{"requested_url":r.normalized_url,"url":r.normalized_url,"content":r.normalized_url,"content_type":"text/plain","rendered_js":False} for r in reversed(reqs)])
    urls = [f"https://e{i}.com/" for i in range(5)]
    assert [x["requested_url"] for x in extractor.fetch({"urls":urls,"render_js":"never"})["data"]] == urls
    with pytest.raises(ToolError): extractor.fetch({"urls":urls+["https://e6.com/"]})


def test_provider_reorder_and_missing_result_cannot_poison_cache(tmp_path, monkeypatch):
    extractor = WebExtractor(ExtractDiskCache(tmp_path))
    monkeypatch.setattr(extractor, "_safety_gate", lambda raw: openrouter_web_extract._SafeRequest(raw, raw))
    a,b="https://a.com/","https://b.com/"
    monkeypatch.setattr(extractor, "_fetch_many_uncached", lambda reqs,mode:[{"requested_url":b,"url":b,"content":"B","content_type":"text/plain","rendered_js":False},{"requested_url":"https://evil.com/","url":"https://evil.com/","content":"EVIL","content_type":"text/plain","rendered_js":False}])
    out = extractor.fetch({"urls":[a,b],"render_js":"never"})
    assert out["data"][0]["error"]["type"] == "fetch_missing_result" and out["data"][1]["content"] == "B"
    mode=WebExtractor._mode("never")
    assert extractor.cache.get(a,mode,openrouter_web_extract.EXTRACT_PROVIDER) is None
    assert extractor.cache.get(b,mode,openrouter_web_extract.EXTRACT_PROVIDER)["content"] == "B"


@pytest.mark.parametrize("url", ["http://127.0.0.1/","http://localhost/","http://169.254.169.254/","http://100.100.100.200/","http://[::1]/","http://[::ffff:169.254.169.254]/","http://100.64.0.1/","http://10.0.0.1/"])
def test_ssrf_literal_cases_fail_closed(url):
    with pytest.raises(ToolError) as exc: openrouter_web.validate_public_url(url)
    assert exc.value.type == "ssrf_blocked"


@pytest.mark.parametrize("url", ["https://user:pass@example.com/","https://example.com/?api_key=abc","https://example.com/?token=x","https://example.com/?password=p"])
def test_secret_urls_fail_closed(url):
    with pytest.raises(ToolError) as exc: openrouter_web.normalize_url_for_request(url)
    assert exc.value.type == "secret_url_blocked"


def test_idna_normalization(monkeypatch):
    monkeypatch.setattr(openrouter_web, "_public_ips_for_host", lambda h,p:["8.8.8.8"])
    normalized,_,host,_,_,_=openrouter_web.validate_public_url("https://münich.example/тест?q=привет")
    assert host == "xn--mnich-kva.example" and "%D1%82" in normalized


def test_dns_public_hostname_to_private_ip_is_blocked(monkeypatch):
    monkeypatch.setattr(openrouter_web.socket, "getaddrinfo", lambda *a,**k:[(2,1,6,"",("10.0.0.2",443))])
    with pytest.raises(ToolError) as exc: openrouter_web.validate_public_url("https://public.example/")
    assert exc.value.type == "ssrf_blocked"


def test_redirect_public_to_private_is_revalidated(monkeypatch):
    calls=[]
    class Response:
        status=302
        def getheader(self,name): return "http://127.0.0.1/" if name=="Location" else ("text/html" if name=="Content-Type" else "")
        def read(self,n=-1): return b""
    class Conn:
        def close(self): pass
    def validate(url):
        calls.append(url)
        if "127.0.0.1" in url: raise ToolError("ssrf_blocked","blocked",retryable=False)
        return url,"https","public.example",443,"/",["8.8.8.8"]
    monkeypatch.setattr(openrouter_web,"validate_public_url",validate); monkeypatch.setattr(openrouter_web,"_request_once",lambda *a,**kw:(Conn(),Response()))
    with pytest.raises(ToolError) as exc: openrouter_web._fetch_public_bytes("https://public.example/")
    assert exc.value.type == "ssrf_blocked" and len(calls)==2


def test_chromium_origin_isolation():
    assert openrouter_web._proxy_target_allowed("example.com",443,"example.com",443)
    assert not openrouter_web._proxy_target_allowed("localhost",443,"example.com",443)
    assert not openrouter_web._proxy_target_allowed("example.com",80,"example.com",443)


def test_extraction_wall_timeout(monkeypatch):
    monkeypatch.setattr(openrouter_web,"normalize_url_for_request",lambda u:u)
    monkeypatch.setattr(openrouter_web,"validate_public_url",lambda u:(u,"https","e.com",443,"/",["8.8.8.8"]))
    monkeypatch.setattr(openrouter_web.time,"monotonic",lambda:100.0)
    with pytest.raises(ToolError) as exc: openrouter_web._fetch_public_bytes("https://e.com/",wall_timeout=-1)
    assert exc.value.type == "fetch_timeout"


def test_atomic_cache_writes_leave_valid_json(tmp_path):
    cache=SearchMemo(tmp_path)
    for i in range(20): cache.store("p",f"q{i}",5,{"ok":True,"data":[i]})
    assert all(isinstance(json.loads(path.read_text()),dict) for path in (tmp_path/"search").glob("*.json"))


def test_web_fetch_spill_path_readable_via_read_file(tmp_path, monkeypatch):
    workspace,scratch,run_dir,web_cache=(tmp_path/"ws",tmp_path/"scratch",tmp_path/"run",tmp_path/"cache")
    for p in (workspace,scratch,run_dir): p.mkdir()
    monkeypatch.setenv("SHORTVIDEO_WEB_CACHE_DIR",str(web_cache))
    executor=ToolExecutor(workspace=workspace,scratch=scratch,run_dir=run_dir,role="critic",writable=False)
    spill=executor.web_extractor.cache.spill("https://example.com/","m","alpha\nbeta\ngamma")
    assert "alpha" in executor.read_file({"path":spill["model_path"]})["data"]["content"]
    with pytest.raises(ToolError): executor._tool_path(spill["model_path"],allow_tmp=True,for_write=True)


def test_no_secrets_reach_model_controlled_bash(monkeypatch):
    keys=("OPENROUTER_API_KEY","SEARXNG_URL","FIRECRAWL_API_KEY","EXA_API_KEY","GEMINI_API_KEY","TELEGRAM_BOT_TOKEN")
    for key in keys: monkeypatch.setenv(key,"secret")
    child=sanitized_child_env()
    assert all(key not in child for key in keys)

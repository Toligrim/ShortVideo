# Hermes web subsystem attribution

ShortVideo's OpenRouter web subsystem was designed with reference to NousResearch/hermes-agent under the MIT License.

Upstream repository: `NousResearch/hermes-agent`

Reference commit: `f5d192611032025d2757b07ad838921872126182`

Files studied at that commit include:

- `tools/web_tools.py`
- `tools/web_tools_truncate.py`
- `tools/web_result_cache.py`
- `tools/web_tools_extract.py`
- `tools/url_safety.py`
- `plugins/web/searxng/provider.py`
- `plugins/web/firecrawl/provider.py`

Ideas deliberately carried into the ShortVideo-specific implementation include the small `web_search(query, limit)` model interface, separation of search metadata from page extraction, normalized-query TTL caching, bounded single-flight, disk extraction cache, safety-before-cache, line-aware 75/25 truncation with spill-to-disk, base64 image removal, hard extraction timeouts, batch extraction and non-positional result/cache association.

ShortVideo substantially changes the implementation: it has no Hermes plugin/provider registry, CLI config, managed gateway, browser tool, memory system or keyless provider ring. It keeps ShortVideo's stronger DNS pinning, redirect revalidation and restricted Chromium proxy, and exposes no browser tool beyond the existing eight-function surface.

The ShortVideo code is a purpose-built reimplementation rather than a vendored Hermes module. This attribution is retained because the architecture and several algorithms were materially informed by Hermes.

## Upstream MIT License

MIT License

Copyright (c) 2025 Nous Research

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

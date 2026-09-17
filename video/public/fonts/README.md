# Vendored fonts

`@remotion/google-fonts` normally fetches `.woff2` files from `fonts.gstatic.com`
at render time. That is a live CDN dependency on every single render, in
production too — the ShortVideo engine keeps no persistent Chromium profile
(a fresh temp `--user-data-dir` per launch), so there is no disk cache to fall
back on if the fetch fails. On a host whose network has documented flakiness
(see `~/.claude/CLAUDE.md`), that is a real failure mode: a render can die
with no output over a font fetch, minutes into rendering. It's also a hard
requirement for the OpenRouter harness's sandboxed `animation-director` role,
whose bash has no network at all by design (`tools/openrouter_sandbox.py`).

These four files are the exact bytes `fonts.gstatic.com` serves for the
subsets `src/lib/fonts.ts` uses (Montserrat weights 700/800 and JetBrains
Mono weights 400/700 both resolve to one URL per subset — variable fonts).
`manifest.json` records each file's source URL and sha256 for provenance.
`src/lib/fonts.ts` loads them via `@remotion/google-fonts`'s official
`loadFontFromInfo` (`/from-info` subpath export) with the URLs swapped for
`staticFile()` paths — same `unicodeRange`/weight/style metadata as the
CDN-backed loader, so rendered output is expected to be byte-identical.

## Regenerating

If a `@remotion/google-fonts` version bump changes the upstream URLs (font
version bump, e.g. Montserrat v31 -> v32), re-run:

```bash
cd video && node scripts/fetch-fonts.cjs
```

This needs real network and must only ever be run by an operator on the host,
never inside the sandbox and never at render time. It overwrites the `.woff2`
files and `manifest.json` in place; commit the result. `src/lib/fonts.ts`
throws at module load if the font package's declared URLs for the requested
(weight, subset) matrix don't match a locally vendored file, so a stale
vendor copy fails loudly at build time rather than silently reaching for the
CDN.

## Licensing

Both families are SIL Open Font License 1.1 (`OFL-Montserrat.txt`,
`OFL-JetBrainsMono.txt`) — Montserrat by The Montserrat.Git Project Authors,
JetBrains Mono by The JetBrains Mono Project Authors. Redistribution is
permitted under the OFL; the license text ships alongside the vendored files
per its terms.

#!/usr/bin/env node
// Compare identical episode/frame ranges in two source trees using production JPEG/concurrency.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
async function main() {
  const [sourceArg, outArg, episodeId = 'auto-20260910-052001'] = process.argv.slice(2);
  if (!sourceArg || !outArg) throw new Error('usage: benchmark-motion.cjs <video source root> <output directory> [episodeId]');
  const source = path.resolve(sourceArg), out = path.resolve(outArg);
  fs.mkdirSync(out, { recursive: true });
  const { bundle } = require('@remotion/bundler');
  const { selectComposition, openBrowser, renderFrames } = require('@remotion/renderer');
  process.chdir(source);
  const serveUrl = await bundle({ entryPoint: path.join(source, 'src/index.ts'), publicDir: path.join(source, 'public'), onProgress: () => {} });
  const inputProps = { episodeId };
  const composition = await selectComposition({ serveUrl, id: 'Episode', inputProps });
  const browser = await openBrowser({ browser: 'chrome' });
  const ranges = [[600, 659], [1530, 1569]];
  const results = [];
  try {
    for (const frameRange of ranges) {
      const times = [];
      const start = performance.now();
      const outputDir = path.join(out, String(frameRange[0])); fs.mkdirSync(outputDir, { recursive: true });
      await renderFrames({ serveUrl, composition, inputProps, puppeteerInstance: browser, outputDir,
        frameRange, imageFormat: 'jpeg', jpegQuality: 90, concurrency: 3, muted: true,
        onStart: () => {}, onFrameUpdate: (done, frame, ms) => times.push({ frame, ms }), onArtifact: () => {} });
      const wallMs = performance.now() - start;
      const result = { frameRange, wallMs, wallMsPerFrame: wallMs / times.length, frames: times.length, times };
      results.push(result); console.log(JSON.stringify({ frameRange, wallMsPerFrame: result.wallMsPerFrame, frames: times.length }));
    }
  } finally { await browser.close({ silent: true }); }
  fs.writeFileSync(path.join(out, 'benchmark.json'), JSON.stringify({ source, episodeId, concurrency: 3, jpegQuality: 90, results }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

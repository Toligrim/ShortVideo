#!/usr/bin/env node
/** One bundle/browser, bounded stills, repeat hash and DOM artifacts. No full video/TTS. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
require('./register-typescript.cjs');
const { motionAudit } = require('../src/lib/motion/audit.ts');
async function main() {
  const [propsPath, output, frameArg] = process.argv.slice(2);
  if (!propsPath || !output) throw new Error('usage: motion-smoke.cjs <props.json> <output-directory> [frames CSV]');
  const root = path.resolve(__dirname, '..');
  const inputProps = JSON.parse(fs.readFileSync(propsPath, 'utf8'));
  const audit = motionAudit(inputProps.episode, inputProps.metas);
  // One representative triple per scene + overview when no cues; explicit frames override.
  const planned = audit.scenes.flatMap(s => s.triples[0]?.frames ?? s.overview);
  const frames = [...new Set(frameArg ? frameArg.split(',').map(Number) : planned)].slice(0, 24);
  if (!frames.length || frames.some(f => !Number.isInteger(f) || f < 0 || f >= audit.durationInFrames)) throw new Error('Invalid sample frames');
  const out = path.resolve(output); fs.mkdirSync(out, { recursive: true });
  const { bundle } = require('@remotion/bundler');
  const { selectComposition, renderStill, openBrowser } = require('@remotion/renderer');
  process.chdir(root); // Reuse the same local Chromium/cache as the production CLI.
  const bundleStart = performance.now();
  const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), onProgress: () => {} });
  const bundleMs = performance.now() - bundleStart;
  const composition = await selectComposition({ serveUrl, id: 'Episode', inputProps });
  const browser = await openBrowser({ browser: 'chrome' });
  const samples = [];
  try {
    for (const [index, frame] of [...frames, frames[0]].entries()) {
      const name = `${frame}${index === frames.length ? '-repeat' : ''}`;
      const output = path.join(out, `${name}.png`);
      const start = performance.now();
      const artifacts = {};
      await renderStill({ serveUrl, composition, inputProps, frame, output, overwrite: true, puppeteerInstance: browser,
        onArtifact: artifact => {
          if (/^(motion|overlap)-frame-/.test(artifact.filename)) {
            const text = Buffer.isBuffer(artifact.content) ? artifact.content.toString('utf8') : artifact.content;
            artifacts[artifact.filename] = JSON.parse(text);
            fs.writeFileSync(path.join(out, `${name}-${artifact.filename}`), text);
          }
        },
      });
      const ms = performance.now() - start;
      const sha256 = crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');
      samples.push({ frame, name, ms, sha256, artifacts });
      console.log(`frame ${name}: ${Math.round(ms)} ms`);
    }
  } finally { await browser.close({ silent: true }); }
  const deterministic = samples[0].sha256 === samples.at(-1).sha256 && JSON.stringify(samples[0].artifacts) === JSON.stringify(samples.at(-1).artifacts);
  const durations = samples.slice(1, -1).map(s => s.ms).sort((a,b) => a-b);
  const report = { bundleMs, deterministic, medianStillMs: durations[Math.floor(durations.length / 2)] ?? samples[0].ms,
    plannedFrames: planned, renderedFrames: frames, samples };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`deterministic=${deterministic}; median still=${Math.round(report.medianStillMs)} ms; bundle=${Math.round(bundleMs)} ms`);
  const missingActors = samples.flatMap(s => Object.values(s.artifacts).flatMap(a => a.missingActors ?? []));
  if (missingActors.length) console.error(`Motion actors not rendered: ${[...new Set(missingActors)].join(", ")}`);
  if (!deterministic || missingActors.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });

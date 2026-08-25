#!/usr/bin/env node
/**
 * Deterministic pre-delivery gate: renders the same 35%/75% per-scene boundary
 * stills the critic checklist uses, but instead of trusting an LLM to look at
 * them, reads the OverlapProbe artifact each frame emits (real DOM
 * getBoundingClientRect() measurements) and fails loudly on any overlap.
 *
 * Usage: node scripts/check-overlaps.cjs <episodeId>
 * Exit code 0 = clean, 1 = overlaps found, 2 = usage/setup error.
 */
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

async function main() {
  const episodeId = process.argv[2];
  if (!episodeId) {
    console.error("usage: node scripts/check-overlaps.cjs <episodeId>");
    process.exit(2);
  }

  const root = path.resolve(__dirname, "..");
  const metaPath = path.join(root, "public", "episodes", episodeId, "meta.json");
  if (!fs.existsSync(metaPath)) {
    console.error(`meta.json not found: ${metaPath} (run TTS first)`);
    process.exit(2);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));

  const FPS = 30;
  const LEAD_SEC = 0.2;
  const TAIL_SEC = 0.55;
  const TRANSITION_FRAMES = 10;
  const sceneFrames = (m) => Math.ceil((LEAD_SEC + m.duration + TAIL_SEC) * FPS);

  const frames = [];
  let start = 0;
  meta.forEach((m, i) => {
    const len = sceneFrames(m);
    frames.push({ index: i, a: start + Math.round(len * 0.35), b: start + Math.round(len * 0.75) });
    start += len - TRANSITION_FRAMES;
  });

  const { bundle } = require("@remotion/bundler");
  const { selectComposition, renderStill, openBrowser } = require("@remotion/renderer");

  console.log("Bundling...");
  const serveUrl = await bundle({
    entryPoint: path.join(root, "src", "index.ts"),
    onProgress: () => {},
  });

  const composition = await selectComposition({
    serveUrl,
    id: "Episode",
    inputProps: { episodeId },
  });

  const puppeteerInstance = await openBrowser({ browser: "chrome" }).catch(() => openBrowser());
  const tmpOut = path.join(os.tmpdir(), `overlap-check-${episodeId}`);
  fs.mkdirSync(tmpOut, { recursive: true });

  const allPairs = [];
  const frameList = frames.flatMap((f) => [
    { scene: f.index, tag: "a", frame: f.a },
    { scene: f.index, tag: "b", frame: f.b },
  ]);

  for (const { scene, tag, frame } of frameList) {
    let artifactReport = null;
    await renderStill({
      serveUrl,
      composition,
      frame,
      output: path.join(tmpOut, `qc-${scene}-${tag}.png`),
      overwrite: true,
      puppeteerInstance,
      onArtifact: (artifact) => {
        if (artifact.filename.startsWith("overlap-frame-")) {
          const content = Buffer.isBuffer(artifact.content) ? artifact.content.toString("utf8") : artifact.content;
          artifactReport = JSON.parse(content);
        }
      },
    });
    if (artifactReport && artifactReport.pairs.length > 0) {
      for (const p of artifactReport.pairs) {
        allPairs.push({ scene, tag, frame, ...p });
      }
    }
    process.stdout.write(`  scene ${scene}${tag} (frame ${frame}): ${artifactReport ? artifactReport.pairs.length : "?"} overlap(s)\n`);
  }

  await puppeteerInstance.close({ silent: true }).catch(() => {});
  fs.rmSync(tmpOut, { recursive: true, force: true });

  if (allPairs.length === 0) {
    console.log(`OK: no overlaps in ${frameList.length} frames.`);
    process.exit(0);
  }

  console.error(`\nFAIL: ${allPairs.length} overlap(s) found:\n`);
  for (const p of allPairs) {
    console.error(
      `  scene ${p.scene}${p.tag} frame ${p.frame}: "${p.textA}" × "${p.textB}" ` +
        `(${Math.round(p.overlapPct * 100)}% overlap, rectA=${JSON.stringify(p.rectA)}, rectB=${JSON.stringify(p.rectB)})`
    );
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("check-overlaps crashed:", err);
  process.exit(2);
});

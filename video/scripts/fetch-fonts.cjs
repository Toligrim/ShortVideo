#!/usr/bin/env node
// Operator-run provisioning script: downloads the exact woff2 files the
// engine's @remotion/google-fonts subsets resolve to and writes
// public/fonts/manifest.json. Never run at render time or inside the
// OpenRouter sandbox (no network there by design) - this is how
// src/lib/fonts.ts's local vendored copies get (re)populated when a font
// package version bump changes the upstream URLs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');

const OUT_DIR = path.join(__dirname, '..', 'public', 'fonts');

// Mirrors the exact (family, weights, subsets) matrix requested in
// src/lib/fonts.ts. Variable fonts resolve to one URL per subset
// regardless of which weight in that style asks for it.
const REQUESTS = [
  { importName: 'Montserrat', weights: ['700', '800'], subsets: ['cyrillic', 'latin'] },
  { importName: 'JetBrainsMono', weights: ['400', '700'], subsets: ['cyrillic', 'latin'] },
];

function fetchBytes(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchBytes(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = { generatedAt: new Date().toISOString(), files: [] };
  const seenUrls = new Map(); // url -> local filename, so shared variable-font URLs are fetched once

  for (const req of REQUESTS) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const mod = require(`../node_modules/@remotion/google-fonts/dist/cjs/${req.importName}.js`);
    const info = mod.getInfo();
    for (const weight of req.weights) {
      const bySubset = info.fonts.normal[weight];
      if (!bySubset) throw new Error(`${req.importName}: no normal/${weight} in getInfo()`);
      for (const subset of req.subsets) {
        const url = bySubset[subset];
        if (!url) throw new Error(`${req.importName}: no ${subset} subset for weight ${weight}`);
        const slug = `${req.importName.toLowerCase()}-${info.version}-${subset}`;
        const filename = `${slug}.woff2`;
        if (seenUrls.has(url)) continue;
        seenUrls.set(url, filename);
        console.log(`fetching ${url}`);
        const bytes = await fetchBytes(url);
        const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        fs.writeFileSync(path.join(OUT_DIR, filename), bytes);
        manifest.files.push({
          family: info.fontFamily,
          importName: req.importName,
          version: info.version,
          subset,
          filename,
          sourceUrl: url,
          sha256,
          bytes: bytes.length,
        });
        console.log(`  -> ${filename} (${bytes.length} bytes, sha256=${sha256.slice(0, 12)}...)`);
      }
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  console.log(`wrote ${manifest.files.length} font files + manifest.json to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

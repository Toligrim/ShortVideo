#!/usr/bin/env node
// Structural and timing gate, no browser/TTS needed. Render triples with the smoke runner.
require('./register-typescript.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { motionAudit } = require('../src/lib/motion/audit.ts');
const [episodePath, metaPath] = process.argv.slice(2);
if (!episodePath || !metaPath) {
  console.error('usage: node scripts/check-motion.cjs <episode.json> <meta.json>'); process.exit(2);
}
try {
  const episode = JSON.parse(fs.readFileSync(path.resolve(episodePath), 'utf8'));
  const metas = JSON.parse(fs.readFileSync(path.resolve(metaPath), 'utf8'));
  console.log(JSON.stringify(motionAudit(episode, metas), null, 2));
} catch (error) { console.error(`Motion audit: ${error.message}`); process.exit(1); }

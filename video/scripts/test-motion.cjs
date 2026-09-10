require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { anchorFrame, cueFrames } = require('../src/lib/motion/anchors.ts');
const { cameraAt, CAMERA_HOME, cameraPrimitives } = require('../src/lib/motion/camera.ts');
const { entranceAt, actionPrimitives } = require('../src/lib/motion/choreography.ts');
const { transitionStyle, beatBlendFrames, motionTiming } = require('../src/lib/motion/transitions.tsx');
const { sceneFrames, beatWindows } = require('../src/lib/timeline.ts');
const words = [{ text: 'Клю́ч,', start: 0.5, end: 0.8 }, { text: 'ключ', start: 1.5, end: 1.8 }, { text: 'замок', start: 3, end: 3.4 }];
test('exact anchors normalize stress/punctuation; repeated words are explicit', () => {
  assert.equal(anchorFrame(words, { onWord: 'КЛЮЧ' }), 21);
  assert.equal(anchorFrame(words, { onWord: 'ключ', occurrence: 2 }), 51);
  assert.throws(() => anchorFrame(words, { onWord: 'клю' }), /not found/);
  assert.throws(() => anchorFrame(words, { onWord: 'ключ', occurrence: 3 }), /not found/);
  assert.throws(() => cueFrames({ cues: [{ id: 'act', onWord: 'замок' }] }, words, 0, 60), /outside/);
  assert.throws(() => cueFrames({ cues: [{ id: 'act', onWord: 'ключ' }, { id: 'act', onWord: 'ключ' }] }, words, 0, 60), /Duplicate/);
});
test('camera waits for word, moves, holds; independent of evaluation order', () => {
  const slots = [{ start: 0, end: 90, motion: { intent: 'focus', camera: { onWord: 'ключ' } } }, { start: 90, end: 150, motion: { intent: 'reveal' } }];
  assert.deepEqual(cameraAt(20, slots, words), CAMERA_HOME);
  assert.ok(cameraAt(50, slots, words).scale > CAMERA_HOME.scale + 0.04);
  const sequential = Array.from({ length: 150 }, (_, f) => cameraAt(f, slots, words));
  for (let f = 149; f >= 0; f--) assert.deepEqual(cameraAt(f, slots, words), sequential[f]);
  assert.deepEqual(sequential[90], sequential[89]);
  assert.ok(sequential[149].scale < sequential[89].scale);
});
test('camera bounds across all primitives, corners and strengths', () => {
  for (const preset of Object.keys(cameraPrimitives)) for (const x of [0, 1]) for (const y of [0, 1]) for (const strength of [0, 1]) {
    const p = cameraAt(90, [{ start: 0, end: 120, motion: { camera: { preset, target: { x, y }, strength } } }], []);
    assert.ok(p.scale >= 0.89 && p.scale <= 0.99);
    assert.ok(Math.abs(p.x) <= 32 && Math.abs(p.y) <= 36);
  }
});
test('short beats stay positive, partition the scene, and entrances finish', () => {
  for (const frames of [6, 12, 23, 100]) {
    const slots = beatWindows({ beats: Array.from({ length: 6 }, () => ({ visual: 'title-slam', onWord: 'замок' })) }, words, frames);
    assert.equal(slots[0].start, 0); assert.equal(slots.at(-1).end, frames);
    for (const [i, s] of slots.entries()) {
      assert.ok(s.end > s.start); if (i) assert.equal(s.start, slots[i - 1].end);
      for (const index of [0, 1, 2, 3]) assert.equal(entranceAt(s.end - 1, s.start, s.end, 'cascade', index).opacity, 1);
    }
  }
});
test('actor actions have meaningful endpoints, stagger and no overshoot', () => {
  const a = entranceAt(5, 0, 100, 'cascade', 0), b = entranceAt(5, 0, 100, 'cascade', 2);
  assert.ok(a.opacity > b.opacity);
  assert.deepEqual(actionPrimitives.transfer(1, { x: 0, y: 0 }, { x: 120, y: 50 }), { x: 120, y: 50, opacity: 1, scale: 1 });
  assert.equal(actionPrimitives.depart(1, { x: 0, y: 0 }, { x: 0, y: 40 }).opacity, 0);
});
test('scene lengths and all transitions preserve the ten-frame overlap', () => {
  assert.equal(sceneFrames({ duration: 2 }), 83);
  assert.equal(motionTiming.getDurationInFrames({ fps: 30 }), 10);
  assert.equal(motionTiming.getProgress({ frame: 0 }), 0);
  assert.equal(motionTiming.getProgress({ frame: 9 }), 1);
  const styles = ['continuation', 'turn', 'contrast', 'finale'].map(kind => transitionStyle({ kind }, 0.5, true));
  assert.equal(new Set(styles.map(JSON.stringify)).size, 4);
  assert.equal(beatBlendFrames(100, 100), 8);
  assert.equal(beatBlendFrames(1, 1), 1);
});

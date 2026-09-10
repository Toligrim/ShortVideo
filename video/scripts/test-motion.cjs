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
const { beatBlendProgress } = require('../src/lib/motion/transitions.tsx');
const { resolveCue } = require('../src/lib/motion/anchors.ts');
const { motionAudit } = require('../src/lib/motion/audit.ts');
test('single-frame beats are fully visible; regular crossovers have two endpoints', () => {
  assert.equal(beatBlendProgress(0, 1), 1);
  assert.equal(beatBlendProgress(0, 8), 0);
  assert.equal(beatBlendProgress(7, 8), 1);
});
test('sound and actor cues share defaults and explicit anchored overrides', () => {
  const cues = cueFrames({ cues: [{ id: 'resolve', onWord: 'ключ', occurrence: 2 }] }, words, 0, 120);
  assert.equal(resolveCue(cues, 'resolve', 0, 120), 51);
  assert.equal(resolveCue({}, 'act', 0, 101), 30);
  assert.equal(resolveCue({}, 'resolve', 0, 101), 70);
});
test('audit uses the render scene formula and rejects invalid anchored plans', () => {
  const fs = require('node:fs'), path = require('node:path');
  const episode = JSON.parse(fs.readFileSync(path.join(__dirname, '../../examples/motion-engine.json')));
  const metas = JSON.parse(fs.readFileSync(path.join(__dirname, '../../examples/motion-engine.meta.json')));
  const report = motionAudit(episode, metas);
  assert.equal(report.durationInFrames, metas.reduce((n,m) => n + sceneFrames(m), 0) - 10 * (metas.length - 1));
  assert.equal(report.scenes[3].slots[1].cues.act, 314);
  assert.throws(() => motionAudit(episode, []), /count mismatch/);
  episode.scenes[0].beats[1].motion.cues = [{ id: 'wrong', onWord: 'Ты' }];
  assert.throws(() => motionAudit(episode, metas), /outside/);
});
test('camera/transition/entrance schema enums match the executable dictionaries', () => {
  const schema = require('../../schema/scenes.schema.json');
  const motion = schema.$defs.motion.properties;
  assert.deepEqual([...motion.camera.properties.preset.enum].sort(), Object.keys(cameraPrimitives).sort());
  const { entrancePrimitives } = require('../src/lib/motion/choreography.ts');
  const { transitionPrimitives } = require('../src/lib/motion/transitions.tsx');
  assert.deepEqual([...motion.entrance.enum].sort(), Object.keys(entrancePrimitives).sort());
  assert.deepEqual([...schema.$defs.motionTransition.properties.preset.enum].sort(), Object.keys(transitionPrimitives).sort());
});
test('real story SFX and shake track the demo action cues', () => {
  const fs = require('node:fs'), path = require('node:path');
  const { storySchedule, storySfx, storyImpacts } = require('../src/scenes/StoryScene.tsx');
  const episode = JSON.parse(fs.readFileSync(path.join(__dirname, '../../examples/motion-engine.json')));
  const metas = JSON.parse(fs.readFileSync(path.join(__dirname, '../../examples/motion-engine.meta.json')));
  for (const [sceneIndex, beatIndex, cue, sound] of [[0,0,'resolve','ding'], [1,0,'act','whoosh'], [2,0,'act','pop'], [3,0,'resolve','click'], [3,1,'act','slam']]) {
    const scene = episode.scenes[sceneIndex], meta = metas[sceneIndex], frames = sceneFrames(meta);
    const slot = storySchedule(scene, meta.words, frames)[beatIndex];
    const expected = anchorFrame(meta.words, scene.beats[beatIndex].motion.cues.find(c => c.id === cue));
    assert.equal(slot.impact, expected);
    assert.ok(storySfx(scene, meta.words, frames).some(e => e.frame === expected && e.sound === sound));
    assert.ok(storyImpacts(scene, meta.words, frames).includes(expected));
  }
});
test('JSON actor actions are registered and must reference a declared cue', () => {
  const schema = require('../../schema/scenes.schema.json');
  assert.deepEqual([...schema.$defs.motion.properties.actors.additionalProperties.properties.preset.enum].sort(), Object.keys(actionPrimitives).sort());
  const plan = { actors: { packet: { preset: 'depart', cue: 'act', to: {x: 0, y: 120} } } };
  assert.throws(() => cueFrames(plan, words, 0, 120), /undeclared cue/);
  plan.cues = [{ id: 'act', onWord: 'ключ' }];
  assert.equal(cueFrames(plan, words, 0, 120).act, 21);
});
test('audit crossover samples stay in the intended short incoming beat', () => {
  const episode = { scenes: [{ type: 'story', beats: Array.from({ length: 6 }, () => ({ visual: 'title-slam', onWord: 'ключ' })) }] };
  const report = motionAudit(episode, [{ duration: 2, words }]);
  for (const [i, samples] of report.scenes[0].boundaries.entries()) {
    const slot = report.scenes[0].slots[i + 1];
    assert.equal(samples[0], slot.start - 1);
    for (const frame of samples.slice(1)) assert.ok(frame >= slot.start && frame < slot.end);
  }
});

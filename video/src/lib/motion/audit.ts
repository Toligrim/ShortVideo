import type { Episode, SceneMeta } from "../types";
import { beatWindows, sceneFrames } from "../timeline";
import { TRANSITION_FRAMES } from "../theme";
import { cueFrames } from "./anchors";
import { cameraWindow } from "./camera";

/** Plans every check; --render can take a bounded subset without hiding unrendered checks. */
export const motionAudit = (episode: Episode, metas: SceneMeta[]) => {
  if (episode.scenes.length !== metas.length) throw new Error("Episode/meta scene count mismatch");
  let offset = 0;
  const scenes = episode.scenes.map((scene, i) => {
    const meta = metas[i];
    if (!Number.isFinite(meta.duration) || meta.duration < 0) throw new Error(`Invalid duration in scene ${i}`);
    const frames = sceneFrames(meta);
    const windows = scene.type === "story" ? beatWindows(scene, meta.words, frames).map(s => ({ start: s.start, end: s.end, motion: s.beat.motion, visual: s.beat.visual })) : [{ start: 0, end: frames, motion: scene.motion, visual: scene.type }];
    const slots = windows.map(s => ({ ...s, cues: cueFrames(s.motion, meta.words, s.start, s.end), camera: cameraWindow(s, meta.words) }));
    const triples = slots.flatMap((s, beat) => Object.entries(s.cues).map(([cue, f]) => {
      const next = Math.min(s.end - 1, ...Object.values(s.cues).filter(n => n > f), f + 24);
      return { beat, cue, frames: [Math.max(s.start, f - 1), Math.round((f + next) / 2), next].map(n => n + offset) };
    }));
    const boundaries = slots.slice(1).map(s => [s.start - 1, Math.min(s.end - 1, s.start + 3), Math.min(s.end - 1, s.start + 8)].map(f => f + offset));
    const result = { scene: i, start: offset, frames, slots, triples, boundaries,
      overview: [0.35, 0.75].map(p => offset + Math.min(frames - 1, Math.round(frames * p))) };
    offset += frames - TRANSITION_FRAMES;
    return result;
  });
  return { durationInFrames: offset + (metas.length ? TRANSITION_FRAMES : 0), scenes };
};

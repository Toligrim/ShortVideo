import type { Word } from "../types";
import { slotAnchor } from "./anchors";
import { clamp01, mix, progress } from "./curves";
import type { CameraMove, CameraPreset, MotionIntent, MotionSlot, Pose } from "./types";

// A common safe framing replaces the per-visual cams table. No visual IDs here.
export const CAMERA_HOME: Pose = { x: 0, y: -12, scale: 0.92 };
export const CAMERA_ORIGIN = { x: 540, y: 760 };
const intentCamera: Record<MotionIntent, CameraPreset> = {
  establish: "hold", focus: "push-in", follow: "track", compare: "track", reveal: "pull-out", resolve: "settle",
};
type CameraPrimitive = (move: CameraMove, strength: number) => Pose;
const focus = (move: CameraMove) => ({
  x: (0.5 - (move.target?.x ?? 0.5)) * 64,
  y: (0.4 - (move.target?.y ?? 0.4)) * 40,
});
/** Forge extension point: one bounded target function, no component registry edits. */
export const cameraPrimitives: Record<CameraPreset, CameraPrimitive> = {
  hold: () => ({ ...CAMERA_HOME }),
  "push-in": (m, s) => ({ x: focus(m).x * s, y: -12 + focus(m).y * s, scale: 0.92 + 0.07 * s }),
  "pull-out": (m, s) => ({ x: focus(m).x * s, y: -12 + focus(m).y * s, scale: 0.92 - 0.03 * s }),
  track: (m, s) => ({ x: (m.target ? focus(m).x : -28) * s, y: -12 + focus(m).y * s, scale: 0.92 + 0.03 * s }),
  settle: () => ({ ...CAMERA_HOME }),
};
const blend = (a: Pose, b: Pose, p: number): Pose => ({ x: mix(a.x, b.x, p), y: mix(a.y, b.y, p), scale: mix(a.scale, b.scale, p) });
export const cameraWindow = (slot: MotionSlot, words: Word[]) => {
  const move = slot.motion?.camera;
  const start = move?.onWord ? slotAnchor(words, { onWord: move.onWord, occurrence: move.occurrence }, slot.start, slot.end) : slot.start;
  // Usually 18–36 frames, compressed to available speech/beat space, never extends a scene.
  const end = Math.min(slot.end - 1, start + Math.max(1, Math.min(36, Math.round((slot.end - start) * 0.4))));
  return { start, end };
};
/** Evaluate from the beginning every time (≤6 slots). Seeking and reverse order are identical. */
export const cameraAt = (frame: number, slots: MotionSlot[], words: Word[]): Pose => {
  let pose = { ...CAMERA_HOME };
  for (const [i, slot] of slots.entries()) {
    if (frame < slot.start) break;
    const move = slot.motion?.camera ?? {};
    const preset = move.preset ?? intentCamera[slot.motion?.intent ?? (i === 0 ? "establish" : i % 2 ? "focus" : "reveal")];
    const target = cameraPrimitives[preset](move, clamp01(move.strength ?? 1));
    const window = cameraWindow(slot, words);
    pose = blend(pose, target, progress(Math.min(frame, slot.end - 1), window.start, window.end));
    if (frame < slot.end) break;
  }
  return pose;
};

import type { ActionPreset, EntrancePreset, Point } from "./types";
import { mix, progress } from "./curves";
export interface ActorPose extends Point { opacity: number; scale: number }
const neutral: ActorPose = { x: 0, y: 0, scale: 1, opacity: 1 };
export const entrancePrimitives: Record<EntrancePreset, (p: number, index: number) => ActorPose> = {
  rise: (p) => ({ ...neutral, y: 36 * (1 - p), opacity: p }),
  cascade: (p, i) => ({ ...neutral, x: (i % 2 ? 1 : -1) * 44 * (1 - p), opacity: p }),
  materialize: (p) => ({ ...neutral, scale: 0.9 + 0.1 * p, opacity: p }),
};
export const actionPrimitives: Record<ActionPreset, (p: number, from: Point, to: Point) => ActorPose> = {
  transfer: (p, from, to) => ({ ...neutral, x: mix(from.x, to.x, p), y: mix(from.y, to.y, p) }),
  recoil: (p, from, to) => ({ ...neutral, x: mix(from.x, to.x, p), y: mix(from.y, to.y, p) - 20 * Math.sin(Math.PI * p), opacity: 1 - 0.35 * p }),
  pulse: (p) => ({ ...neutral, scale: 1 + 0.12 * Math.sin(Math.PI * p) }),
  depart: (p, from, to) => ({ ...neutral, x: mix(from.x, to.x, p), y: mix(from.y, to.y, p), opacity: 1 - p }),
};
export const entranceAt = (frame: number, start: number, end: number, preset: EntrancePreset, index: number): ActorPose => {
  // Stagger compresses with the slot. Even a short beat has a fully visible end state.
  const budget = Math.min(24, Math.max(0, end - start - 1));
  const delay = Math.min(3, Math.max(0, index)) * Math.min(4, budget / 6);
  return entrancePrimitives[preset](progress(frame, start + delay, start + Math.min(budget, delay + 12)), index);
};

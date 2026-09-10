/** Episode declarations contain meaning and word anchors, never seconds or frames. */
export type MotionIntent = "establish" | "focus" | "follow" | "compare" | "reveal" | "resolve";
export type CameraPreset = "hold" | "push-in" | "pull-out" | "track" | "settle";
export type TransitionKind = "continuation" | "turn" | "contrast" | "finale";
export type TransitionPreset = "match" | "push" | "wipe" | "dissolve";
export type EntrancePreset = "rise" | "cascade" | "materialize";
export type ActionPreset = "transfer" | "recoil" | "pulse" | "depart";
export interface WordAnchor { onWord: string; occurrence?: number }
export interface MotionCue extends WordAnchor { id: string }
export interface CameraMove {
  preset?: CameraPreset;
  onWord?: string;
  occurrence?: number;
  /** Normalized point of attention in the 1080×1920 composition. */
  target?: { x: number; y: number };
  strength?: number;
}
export interface MotionTransition { kind: TransitionKind; preset?: TransitionPreset }
export interface MotionPlan {
  intent?: MotionIntent;
  camera?: CameraMove;
  entrance?: EntrancePreset;
  cues?: MotionCue[];
}
export interface Point { x: number; y: number }
export interface Pose extends Point { scale: number }
export interface MotionSlot { start: number; end: number; motion?: MotionPlan }

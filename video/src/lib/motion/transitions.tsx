import React from "react";
import type { TransitionPresentation, TransitionPresentationComponentProps, TransitionTiming } from "@remotion/transitions";
import { TRANSITION_FRAMES } from "../theme";
import { clamp01, smooth } from "./curves";
import type { MotionTransition, TransitionKind, TransitionPreset } from "./types";

export const transitionDefaults: Record<TransitionKind, TransitionPreset> = {
  continuation: "match", turn: "push", contrast: "wipe", finale: "dissolve",
};
type TransitionStyle = (p: number, entering: boolean) => React.CSSProperties;
/** Transparent layers: background never changes tone or flashes. */
export const transitionPrimitives: Record<TransitionPreset, TransitionStyle> = {
  match: (p, entering) => ({ opacity: entering ? p : 1 - p, transform: `translateY(${entering ? (1 - p) * 28 : -p * 28}px)` }),
  push: (p, entering) => ({ opacity: entering ? p : 1 - p, transform: `translateX(${entering ? (1 - p) * 96 : -p * 96}px)` }),
  wipe: (p, entering) => ({ clipPath: entering ? `inset(0 ${(1 - p) * 100}% 0 0)` : `inset(0 0 0 ${p * 100}%)` }),
  dissolve: (p, entering) => ({ opacity: entering ? p : 1 - p, transform: `scale(${entering ? 0.98 + 0.02 * p : 1 - 0.02 * p})` }),
};
export const transitionStyle = (transition: MotionTransition | undefined, p: number, entering: boolean): React.CSSProperties =>
  transitionPrimitives[transition?.preset ?? transitionDefaults[transition?.kind ?? "continuation"]](clamp01(p), entering);

type Props = { transition: MotionTransition };
const Presentation: React.FC<TransitionPresentationComponentProps<Props>> = ({ children, passedProps, presentationProgress, presentationDirection }) => (
  <div style={{ position: "absolute", inset: 0, ...transitionStyle(passedProps.transition, presentationProgress, presentationDirection === "entering") }}>{children}</div>
);
export const motionPresentation = (transition: MotionTransition): TransitionPresentation<Props> => ({ component: Presentation, props: { transition } });
export const motionTiming: TransitionTiming = {
  getDurationInFrames: () => TRANSITION_FRAMES,
  getProgress: ({ frame }) => smooth(frame / (TRANSITION_FRAMES - 1)),
};
/** Beat changes retain only one outgoing visual, for at most 8 frames. */
export const beatBlendFrames = (previousLength: number, nextLength: number): number =>
  Math.max(1, Math.min(8, Math.floor(previousLength / 3), Math.floor(nextLength / 3)));

export const beatBlendProgress = (local: number, blendFrames: number): number =>
  blendFrames <= 1 ? 1 : smooth(local / (blendFrames - 1));

import React, { createContext, useContext } from "react";
import { useCurrentFrame } from "remotion";
import type { Word } from "../types";
import { cueFrames, defaultCueFraction, resolveCue } from "./anchors";
import { actionPrimitives, entranceAt } from "./choreography";
import { progress } from "./curves";
import type { ActorAction, EntrancePreset, MotionPlan } from "./types";

interface Context { frame: number; start: number; end: number; plan?: MotionPlan; cues: Record<string, number> }
const MotionContext = createContext<Context | null>(null);
export const MotionStage: React.FC<{ start: number; end: number; words: Word[]; plan?: MotionPlan; sampleFrame?: number; children: React.ReactNode }> = ({ start, end, words, plan, sampleFrame, children }) => {
  const currentFrame = useCurrentFrame();
  const cues = cueFrames(plan, words, start, end);
  return <MotionContext.Provider value={{ frame: sampleFrame ?? currentFrame, start, end, plan, cues }}><div style={{ display: "contents" }} data-motion-expected-actors={Object.keys(plan?.actors ?? {}).join(",")}>{children}</div></MotionContext.Provider>;
};
export const useMotion = () => {
  const ctx = useContext(MotionContext);
  if (!ctx) throw new Error("MotionGroup/useMotion requires MotionStage");
  const cue = (id: string, fraction = defaultCueFraction(id)): number => resolveCue(ctx.cues, id, ctx.start, ctx.end, fraction);
  const action = (id: string, fraction = defaultCueFraction(id)): number => {
    const start = cue(id, fraction);
    const next = Math.min(ctx.end - 1, ...Object.values(ctx.cues).filter(f => f > start));
    return progress(ctx.frame, start, Math.min(next, start + 24));
  };
  return { ...ctx, cue, action };
};
/** One tracked semantic object. Layout lives inside; transform is a separate parent. */
export const MotionGroup: React.FC<{
  id: string; index?: number; entrance?: EntrancePreset;
  action?: ActorAction;
  children: React.ReactNode;
}> = ({ id, index = 0, entrance, action, children }) => {
  const motion = useMotion();
  action = motion.plan?.actors?.[id] ?? action;
  const enter = entranceAt(motion.frame, motion.start, motion.end, entrance ?? motion.plan?.entrance ?? "cascade", index);
  const act = action ? actionPrimitives[action.preset](motion.action(action.cue), action.from ?? { x: 0, y: 0 }, action.to ?? { x: 0, y: 0 }) : { x: 0, y: 0, scale: 1, opacity: 1 };
  return <div data-motion-binding={id} data-motion-actor={id} data-motion-x={act.x} data-motion-y={act.y} data-motion-scale={act.scale} data-motion-progress={action ? motion.action(action.cue) : undefined}
    style={{ position: "absolute", inset: 0, opacity: enter.opacity * act.opacity,
      transform: `translate(${enter.x + act.x}px, ${enter.y + act.y}px) scale(${enter.scale * act.scale})`, transformOrigin: "540px 760px" }}>
    {children}
  </div>;
};

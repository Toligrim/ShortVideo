import type { Word } from "../types";
import { FPS, LEAD_SEC } from "../theme";
import type { MotionPlan, WordAnchor } from "./types";

export const cleanWord = (s: string): string => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
/** Exact normalized display token. Repeated words require a 1-based occurrence. */
export const anchorFrame = (words: Word[], anchor: WordAnchor): number => {
  const key = cleanWord(anchor.onWord);
  const hits = words.filter(w => cleanWord(w.text) === key);
  const occurrence = anchor.occurrence ?? 1;
  if (!key || !Number.isInteger(occurrence) || occurrence < 1 || !hits[occurrence - 1]) {
    throw new Error(`Motion anchor not found: "${anchor.onWord}" #${occurrence}`);
  }
  return Math.round((LEAD_SEC + hits[occurrence - 1].start) * FPS);
};
export const slotAnchor = (words: Word[], anchor: WordAnchor, start: number, end: number): number => {
  const f = anchorFrame(words, anchor);
  if (f < start || f >= end) throw new Error(`Motion anchor "${anchor.onWord}" at ${f} outside [${start}, ${end})`);
  return f;
};
export const cueFrames = (plan: MotionPlan | undefined, words: Word[], start: number, end: number): Record<string, number> => {
  const result: Record<string, number> = Object.create(null);
  for (const cue of plan?.cues ?? []) {
    if (Object.hasOwn(result, cue.id)) throw new Error(`Duplicate motion cue: ${cue.id}`);
    result[cue.id] = slotAnchor(words, cue, start, end);
  }
  return result;
};

import { FPS, LEAD_SEC, TAIL_SEC } from "./theme";
import type { SceneMeta, Word } from "./types";

export interface SceneSlot {
  from: number; // кадр начала сцены в композиции
  frames: number; // длительность сцены в кадрах
  audioDelay: number; // кадры тишины до реплики
}

export const sceneFrames = (meta: SceneMeta): number =>
  Math.ceil((LEAD_SEC + meta.duration + TAIL_SEC) * FPS);

export const buildTimeline = (metas: SceneMeta[]): SceneSlot[] => {
  const slots: SceneSlot[] = [];
  let cursor = 0;
  for (const m of metas) {
    const frames = sceneFrames(m);
    slots.push({ from: cursor, frames, audioDelay: Math.round(LEAD_SEC * FPS) });
    cursor += frames;
  }
  return slots;
};

export const totalFrames = (metas: SceneMeta[]): number =>
  metas.reduce((acc, m) => acc + sceneFrames(m), 0);

const clean = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Кадр (внутри сцены), на котором произносится слово-якорь; null если не найдено. */
export const wordFrame = (words: Word[], anchor: string): number | null => {
  const target = clean(anchor);
  if (!target) return null;
  const w = words.find((x) => clean(x.text) === target || clean(x.text).includes(target));
  return w ? Math.round((LEAD_SEC + w.start) * FPS) : null;
};

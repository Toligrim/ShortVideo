import { FPS, LEAD_SEC, TAIL_SEC } from "./theme";
import type { SceneMeta, Word } from "./types";

// Длина одной сцены в кадрах. Суммарную длину эпизода и вычет стыков
// TransitionSeries считает Root.tsx (episodeFrames) — единственный источник.
export const sceneFrames = (meta: SceneMeta): number =>
  Math.ceil((LEAD_SEC + meta.duration + TAIL_SEC) * FPS);

const clean = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Кадр (внутри сцены), на котором произносится слово-якорь; null если не найдено. */
export const wordFrame = (words: Word[], anchor: string): number | null => {
  const target = clean(anchor);
  if (!target) return null;
  const w = words.find((x) => clean(x.text) === target || clean(x.text).includes(target));
  return w ? Math.round((LEAD_SEC + w.start) * FPS) : null;
};

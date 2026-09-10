import { FPS, LEAD_SEC, TAIL_SEC } from "./theme";
import type { SceneMeta, Word, StoryScene } from "./types";

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

/** Half-open beat windows shared by rendering and the cheap motion audit. */
export const beatWindows = (scene: StoryScene, words: Word[], frames: number) => {
  const n = scene.beats.length;
  if (frames < n) throw new Error("Story needs at least one frame per beat");
  const starts: number[] = [];
  for (let i = 0; i < n; i++) {
    const anchor = scene.beats[i].onWord;
    let start = anchor ? wordFrame(words, anchor) ?? Math.round(frames * i / n) : Math.round(frames * i / n);
    if (i === 0) start = 0;
    if (i > 0) start = Math.max(start, starts[i - 1] + 1);
    starts.push(Math.min(start, frames - (n - i)));
  }
  return scene.beats.map((beat, i) => ({ beat, start: starts[i], end: starts[i + 1] ?? frames }));
};

import type { Narration, SceneMeta, Word } from "./types";

const TOKEN_RE = /\{([^|{}]+)\|([^{}]+)\}|(\S+)/g;
const WORD_SEC = 0.42; // средний темп Fenrir

/** Синтетические тайминги слов из narration — для Preview без озвучки. */
export const fakeWords = (narration: Narration, lang = "ru"): Word[] => {
  const text = typeof narration === "string" ? narration : (narration[lang] ?? "");
  const words: Word[] = [];
  let t = 0.1;
  for (const m of text.matchAll(TOKEN_RE)) {
    const show = (m[1] ?? m[3] ?? "").trim();
    if (!show) continue;
    // пунктуационные токены клеим к предыдущему, как в tts_scenes.py
    if (!/[\p{L}\p{N}]/u.test(show) && words.length > 0) {
      words[words.length - 1].text += ` ${show}`;
      continue;
    }
    const dur = WORD_SEC * (0.7 + Math.min(show.length, 12) / 16);
    words.push({ text: show, start: round3(t), end: round3(t + dur) });
    t += dur + 0.06;
  }
  return words;
};

const round3 = (x: number) => Math.round(x * 1000) / 1000;

export const fakeMeta = (narration: Narration, lang = "ru"): SceneMeta => {
  const words = fakeWords(narration, lang);
  const duration = words.length ? words[words.length - 1].end + 0.4 : 4;
  return { index: 0, duration: round3(duration), words };
};

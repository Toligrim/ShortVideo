import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { fitText } from "@remotion/layout-utils";
import { layout, theme, LEAD_SEC } from "./theme";
import type { Word } from "./types";

const MAX_TOKENS = 3;
const MAX_CHARS = 18;

interface Line {
  words: Word[];
}

/** Разбивка слов на строки-группы по 2–3 слова (стиль шортсов). */
const buildLines = (words: Word[]): Line[] => {
  const lines: Line[] = [];
  let cur: Word[] = [];
  let chars = 0;
  for (const w of words) {
    const len = w.text.length;
    if (cur.length > 0 && (cur.length >= MAX_TOKENS || chars + len > MAX_CHARS)) {
      lines.push({ words: cur });
      cur = [];
      chars = 0;
    }
    cur.push(w);
    chars += len + 1;
  }
  if (cur.length) lines.push({ words: cur });
  return lines;
};

// Насколько дольше обычного (0.05с) может держаться последняя строка сцены —
// но не позже cutoffT: иначе она доживает до кросс-фейда TransitionSeries и
// накладывается на уже проявляющийся заголовок следующей сцены (аутро и др.).
const LAST_LINE_LINGER_SEC = 1.0;

/** Караоке-субтитры: показывается активная строка, произнесённые слова подсвечены. */
export const Karaoke: React.FC<{ words: Word[]; sceneFrames: number; cutoffFrames: number }> = ({
  words,
  sceneFrames,
  cutoffFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps - LEAD_SEC; // сек от начала аудио сцены
  const lines = buildLines(words);
  // момент (в тех же координатах t), после которого сцена уже входит в
  // кросс-фейд со следующей — субтитры должны погаснуть до него
  const cutoffT = (sceneFrames - cutoffFrames) / fps - LEAD_SEC;

  const active = lines.find(
    (l, i) =>
      t <
        (i === lines.length - 1
          ? Math.min(l.words[l.words.length - 1].end + LAST_LINE_LINGER_SEC, cutoffT)
          : l.words[l.words.length - 1].end + 0.05) &&
      t >= l.words[0].start - (i === 0 ? 999 : 0.05)
  );
  if (!active) return null;

  // автоподгонка: длинная строка ужимается, чтобы не вылезать и не переноситься
  const lineText = active.words.map((w) => w.text).join(" ");
  const { fontSize } = fitText({
    text: lineText,
    withinWidth: 900,
    fontFamily: theme.font,
    fontWeight: 800,
    textTransform: "uppercase",
  });
  const size = Math.min(72, fontSize * 0.94);

  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: layout.karaokeY,
        display: "flex",
        justifyContent: "center",
        // зазор пропорционален кеглю и учитывает поп-масштаб соседних слов
        gap: Math.round(size * 0.62),
        flexWrap: "wrap",
      }}
    >
      {active.words.map((w, i) => {
        const said = t >= w.start;
        // пружинный поп в момент произнесения: 1 → 1.22 → 1.06
        const dt = t - w.start;
        // поп ограничен 1.06 и без поворота: transform не раздвигает соседей,
        // и на больших словах масштаб+наклон съедали зазор (слова слипались)
        let scale = 1;
        if (said) {
          scale = dt < 0.12 ? 1 + 0.5 * dt : dt < 0.3 ? 1.06 - 0.17 * (dt - 0.12) : 1.03;
        }
        return (
          <span
            key={i}
            style={{
              fontFamily: theme.font,
              fontWeight: 800,
              fontSize: size,
              lineHeight: 1.15,
              textTransform: "uppercase",
              color: said ? theme.accent : theme.text,
              transform: `scale(${scale})`,
              textShadow: said
                ? `0 0 34px ${theme.accent}66, 0 4px 24px rgba(0,0,0,0.9)`
                : "0 4px 24px rgba(0,0,0,0.9), 0 2px 6px rgba(0,0,0,0.9)",
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};

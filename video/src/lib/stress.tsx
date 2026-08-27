import React from "react";

const COMBINING_ACUTE = "́";

/**
 * Наши шрифты (Montserrat cyrillic-подмножество + системные фолбэки) не умеют
 * композитить U+0301 с предыдущей кириллической буквой — браузер берёт глиф
 * из другого шрифта и рисует его отдельным несвязанным символом рядом с
 * буквой вместо диакритики над ней. Штрих ударения рисуется CSS поверх
 * буквы, а не глифом шрифта, поэтому не зависит от того, какой шрифт что
 * умеет.
 *
 * Используй везде, где на экран может попасть текст с ударениями
 * (U+0301) — заголовки, подписи, буллеты, караоке-субтитры.
 */
export function stressed(text: string): React.ReactNode {
  if (!text || !text.includes(COMBINING_ACUTE)) return text;
  const nodes: React.ReactNode[] = [];
  let key = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (text[i + 1] === COMBINING_ACUTE) {
      nodes.push(
        <span key={key++} style={{ position: "relative" }}>
          {ch}
          <span
            style={{
              position: "absolute",
              top: "-0.08em",
              left: "42%",
              width: "0.3em",
              height: "0.07em",
              background: "currentColor",
              transform: "translateX(-50%) rotate(-25deg)",
              borderRadius: "1px",
            }}
          />
        </span>
      );
      i += 1; // пропустить сам U+0301
    } else {
      nodes.push(ch);
    }
  }
  return nodes;
}

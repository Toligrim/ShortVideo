import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import Prism from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-c";
import "prismjs/components/prism-typescript";
import { theme } from "../lib/theme";

// палитра токенов под тему движка
const PRISM_CSS = `
.token.comment { color: #5B6678; font-style: italic; }
.token.keyword, .token.builtin { color: #A78BFA; }
.token.string, .token.char { color: #34D399; }
.token.function { color: #22D3EE; }
.token.number, .token.boolean { color: #FBBF24; }
.token.operator, .token.punctuation { color: #8B96A8; }
.token.variable, .token.parameter { color: #E8EEF6; }
.token.property, .token.attr-name { color: #22D3EE; }
`;

/** Панель кода: построчное появление, подсветка синтаксиса Prism, маркер строк highlight. */
export const CodePanel: React.FC<{
  code: string;
  highlight?: number[];
  language?: string;
  x: number;
  y: number;
  width?: number;
  startFrame?: number;
}> = ({ code, highlight = [], language = "bash", x, y, width = 940, startFrame = 10 }) => {
  const frame = useCurrentFrame();
  const lines = code.replace(/\n$/, "").split("\n");
  const grammar = Prism.languages[language] ?? Prism.languages.bash;
  return (
    <div
      style={{
        position: "absolute",
        left: x - width / 2,
        top: y,
        width,
        background: "#0A0F18",
        border: `2px solid ${theme.panelBorder}`,
        borderRadius: 24,
        padding: "32px 0",
        fontFamily: theme.mono,
        fontSize: 34,
        lineHeight: 1.7,
        boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
      }}
    >
      <style>{PRISM_CSS}</style>
      {lines.map((line, i) => {
        const from = startFrame + i * 5;
        const opacity = interpolate(frame, [from, from + 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const hl = highlight.includes(i + 1);
        return (
          <div
            key={i}
            style={{
              opacity,
              padding: "2px 32px",
              background: hl ? `${theme.accent}1E` : "transparent",
              borderLeft: hl ? `6px solid ${theme.accent}` : "6px solid transparent",
              color: theme.text,
              whiteSpace: "pre",
              filter: hl ? "none" : "brightness(0.72)",
            }}
            dangerouslySetInnerHTML={{
              __html: line ? Prism.highlight(line, grammar, language) : "&nbsp;",
            }}
          />
        );
      })}
    </div>
  );
};

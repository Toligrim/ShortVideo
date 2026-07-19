import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { theme } from "../lib/theme";

/** Панель кода с построчным появлением и подсветкой строк. */
export const CodePanel: React.FC<{
  code: string;
  highlight?: number[];
  x: number;
  y: number;
  width?: number;
  startFrame?: number;
}> = ({ code, highlight = [], x, y, width = 940, startFrame = 10 }) => {
  const frame = useCurrentFrame();
  const lines = code.replace(/\n$/, "").split("\n");
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
              color: hl ? theme.text : theme.subtext,
              whiteSpace: "pre",
            }}
          >
            {line || " "}
          </div>
        );
      })}
    </div>
  );
};

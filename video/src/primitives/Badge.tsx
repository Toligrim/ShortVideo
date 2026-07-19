import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, toneColor, Tone } from "../lib/theme";

/** Бейдж состояния («Соединение установлено»), появляется пружинкой. */
export const Badge: React.FC<{
  label: string;
  x: number;
  y: number;
  tone?: Tone;
  enterFrame?: number;
}> = ({ label, x, y, tone = "success", enterFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < enterFrame) return null;
  const scale = spring({ frame: frame - enterFrame, fps, config: { damping: 12 } });
  const color = toneColor(tone);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${scale})`,
        border: `3px solid ${color}`,
        color,
        background: `${color}1A`,
        fontFamily: theme.font,
        fontWeight: 700,
        fontSize: 42,
        padding: "18px 44px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        boxShadow: `0 0 50px ${color}33`,
      }}
    >
      {label}
    </div>
  );
};

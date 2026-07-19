import React from "react";
import { spring, useCurrentFrame, useVideoConfig, random } from "remotion";
import { fitText } from "@remotion/layout-utils";
import { theme, toneColor, Tone } from "../lib/theme";
import { IconGlyph } from "./IconGlyph";

/** Узел схемы: панель с иконкой и подписью; парит, пульсирует при прилёте пакета. */
export const NodeBox: React.FC<{
  label: string;
  icon?: string;
  tone?: Tone;
  x: number;
  y: number;
  enterFrame?: number;
  width?: number;
  floatSeed?: number;
  pulses?: number[]; // кадры прилётов — узел вздрагивает и вспыхивает
}> = ({ label, icon, tone, x, y, enterFrame = 0, width = 380, floatSeed = 0, pulses = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - enterFrame, fps, config: { damping: 14, mass: 0.8 } });

  // ленивое парение
  const phase = random(`nf${floatSeed}`) * 6.28;
  const t = (frame / fps) * 2;
  const fy = 8 * Math.sin(t + phase);
  const fx = 3.5 * Math.sin(t * 0.7 + phase * 2);
  const rot = 0.6 * Math.sin(t * 0.5 + phase);

  // пульс при прилёте
  let pulse = 0;
  for (const f0 of pulses) {
    const dt = frame - f0;
    if (dt >= 0 && dt < 18) pulse = Math.max(pulse, Math.exp(-dt * 0.25));
  }

  const color = toneColor(tone);
  const labelWidth = width - 64 - (icon ? 104 : 0);
  const labelSize = Math.min(
    46,
    fitText({ text: label, withinWidth: labelWidth, fontFamily: theme.font, fontWeight: 700 }).fontSize
  );
  return (
    <div
      style={{
        position: "absolute",
        left: x - width / 2,
        top: y - 90,
        width,
        height: 180,
        transform: `translate(${fx}px, ${fy}px) rotate(${rot}deg) scale(${enter * (1 + 0.09 * pulse)})`,
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "0 32px",
        background: theme.panel,
        border: `3px solid ${color}${pulse > 0.3 ? "CC" : "55"}`,
        borderRadius: 28,
        boxShadow: `0 0 ${60 + 90 * pulse}px ${color}${pulse > 0.3 ? "66" : "22"}`,
      }}
    >
      {icon ? <IconGlyph name={icon} size={80} color={color} strokeWidth={1.75} /> : null}
      <div
        style={{
          fontFamily: theme.font,
          fontWeight: 700,
          fontSize: labelSize,
          color: theme.text,
          lineHeight: 1.1,
        }}
      >
        {label}
      </div>
    </div>
  );
};

import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { theme, toneColor, Tone } from "../lib/theme";
import { stripStress } from "../lib/stress";

const easeInOut = (t: number) => t * t * (3 - 2 * t);

/** Пакет: пилюля со шлейфом, летящая из A в B по дуге; наклоняется по касательной. */
export const PacketDot: React.FC<{
  label: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startFrame: number;
  endFrame: number;
  tone?: Tone;
  arc?: number; // боковой прогиб дуги в px (знак = сторона); 0 — прямая
}> = ({ label, fromX, fromY, toX, toY, startFrame, endFrame, tone, arc = 0 }) => {
  const frame = useCurrentFrame();
  if (frame < startFrame) return null;
  const color = toneColor(tone);

  // квадратичная Безье: контрольная точка сбоку от середины пути
  const cx = (fromX + toX) / 2 + arc;
  const cy = (fromY + toY) / 2;
  const posAt = (f: number) => {
    const t = interpolate(f, [startFrame, endFrame], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const e = easeInOut(t);
    const u = 1 - e;
    return {
      x: u * u * fromX + 2 * u * e * cx + e * e * toX,
      y: u * u * fromY + 2 * u * e * cy + e * e * toY,
      // касательная — для наклона пилюли по ходу движения
      angle:
        (Math.atan2(
          2 * u * (cy - fromY) + 2 * e * (toY - cy),
          2 * u * (cx - fromX) + 2 * e * (toX - cx)
        ) *
          180) /
          Math.PI -
        90,
      t: e,
    };
  };

  const { x, y, t, angle } = posAt(frame);
  const flying = t > 0 && t < 1;
  const tilt = flying ? angle * 0.35 : 0;
  const wobble = (flying ? 5 * Math.sin(frame * 0.9) : 0) + tilt;
  const fade = interpolate(frame, [endFrame + 8, endFrame + 20], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pop = interpolate(frame, [startFrame, startFrame + 6], [0.4, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      {/* шлейф */}
      {flying
        ? [4, 8, 12].map((back, i) => {
            const g = posAt(frame - back);
            const op = [0.28, 0.16, 0.08][i];
            return (
              <div
                key={back}
                style={{
                  position: "absolute",
                  left: g.x,
                  top: g.y,
                  transform: `translate(-50%, -50%) scale(${0.85 - i * 0.15})`,
                  opacity: op,
                  background: color,
                  width: 70,
                  height: 44,
                  borderRadius: 999,
                  filter: "blur(6px)",
                }}
              />
            );
          })
        : null}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: `translate(-50%, -50%) scale(${pop}) rotate(${wobble}deg)`,
          opacity: fade,
          background: color,
          color: "#06121A",
          fontFamily: theme.mono,
          fontWeight: 700,
          fontSize: 40,
          padding: "14px 34px",
          borderRadius: 999,
          boxShadow: `0 0 ${flying ? 70 : 46}px ${color}${flying ? "AA" : "88"}`,
          whiteSpace: "nowrap",
        }}
      >
        {stripStress(label)}
      </div>
    </>
  );
};

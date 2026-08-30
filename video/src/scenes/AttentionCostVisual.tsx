import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

const W = layout.width;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

export type AttentionCostPhase = "pairs" | "quadratic";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: AttentionCostPhase;
};

const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };

const phaseTitle: Record<AttentionCostPhase, string> = {
  pairs: "КАЖДЫЙ ТОКЕН СВЕРЯЕТСЯ С КАЖДЫМ",
  quadratic: "ВДВОЕ ДЛИННЕЕ — ВЧЕТВЕРО РАБОТЫ",
};

const Header: React.FC<{ phase: AttentionCostPhase; enter: number }> = ({ phase, enter }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 250,
      transform: "translateX(-50%)",
      color: theme.subtext,
      fontSize: 25,
      whiteSpace: "nowrap",
      opacity: enter,
      ...mono,
    }}
  >
    {phaseTitle[phase]}
  </div>
);

const Badge: React.FC<{ text: string; tone?: string; opacity: number; y?: number }> = ({
  text,
  tone = theme.accent,
  opacity,
  y = 1080,
}) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: y,
      transform: "translateX(-50%)",
      padding: "16px 36px",
      borderRadius: 999,
      background: `${tone}18`,
      border: `2px solid ${tone}99`,
      color: tone,
      ...mono,
      fontSize: 25,
      whiteSpace: "nowrap",
      opacity,
      boxShadow: `0 0 32px ${tone}25`,
    }}
  >
    {text}
  </div>
);

// Ряд токенов + все попарные дуги.
const TokenGrid: React.FC<{
  n: number;
  cx: number;
  cy: number;
  spread: number;
  reveal: number;
  color: string;
  chip?: number;
}> = ({ n, cx, cy, spread, reveal, color, chip = 44 }) => {
  const xs = Array.from({ length: n }).map((_, i) => cx - spread / 2 + (spread * i) / Math.max(n - 1, 1));
  const pairs: [number, number][] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) pairs.push([a, b]);
  const shown = Math.round(pairs.length * reveal);
  return (
    <>
      <svg
        width={W}
        height={520}
        style={{ position: "absolute", left: 0, top: cy - 400, overflow: "visible" }}
      >
        {pairs.slice(0, shown).map(([a, b], i) => {
          const x1 = xs[a];
          const x2 = xs[b];
          const lift = 40 + Math.abs(b - a) * 46;
          return (
            <path
              key={i}
              d={`M ${x1} 400 Q ${(x1 + x2) / 2} ${400 - lift} ${x2} 400`}
              fill="none"
              stroke={color}
              strokeWidth={2}
              opacity={0.5}
            />
          );
        })}
      </svg>
      {xs.map((x, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: x - chip / 2,
            top: cy - chip / 2,
            width: chip,
            height: chip,
            borderRadius: 8,
            background: `${color}22`,
            border: `2px solid ${color}AA`,
            ...mono,
            fontSize: chip * 0.4,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {i + 1}
        </div>
      ))}
    </>
  );
};

export const AttentionCostVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "pairs" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const grow = smooth(clamp01(local / 40));
  const after = smooth(clamp01((local - impactLocal) / 16));

  if (phase === "pairs") {
    return (
      <>
        <Header phase={phase} enter={enter} />
        <TokenGrid n={6} cx={W / 2} cy={640} spread={720} reveal={grow} color={theme.accent} chip={56} />
        <Badge text="6 ТОКЕНОВ · 15 СВЯЗЕЙ" tone={theme.accent} opacity={enter} y={1020} />
        <PulseRing x={W / 2} y={640} triggerFrame={impactLocal} tone="accent" size={200} />
      </>
    );
  }

  // quadratic
  return (
    <>
      <Header phase={phase} enter={enter} />
      {/* слева: длина N */}
      <div style={{ position: "absolute", left: 90, top: 420, ...mono, fontSize: 22, color: theme.accent }}>
        ДЛИНА N · 6 СВЯЗЕЙ
      </div>
      <TokenGrid n={4} cx={280} cy={620} spread={300} reveal={1} color={theme.accent} chip={40} />
      {/* справа: длина 2N */}
      <div style={{ position: "absolute", left: W - 380, top: 420, ...mono, fontSize: 22, color: theme.accent2 }}>
        ДЛИНА 2N · 28 СВЯЗЕЙ
      </div>
      <TokenGrid n={8} cx={W - 300} cy={620} spread={420} reveal={grow} color={theme.accent2} chip={34} />
      {/* множитель */}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 560,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 76,
          color: theme.warning,
          opacity: enter * after,
        }}
      >
        ×4
      </div>
      {/* кривая роста */}
      <svg width={W} height={220} style={{ position: "absolute", left: 0, top: 820 }}>
        <path
          d={`M 120 200 Q ${W * 0.62} 200 ${W - 120} ${200 - 170 * grow}`}
          fill="none"
          stroke={theme.warning}
          strokeWidth={4}
        />
        <text x={W - 200} y={40} fill={theme.warning} style={{ ...mono, fontSize: 30 }}>
          n²
        </text>
      </svg>
      <Badge text="РОСТ РАБОТЫ — КАК КВАДРАТ ДЛИНЫ" tone={theme.warning} opacity={enter} y={1100} />
      <PulseRing x={W / 2} y={620} triggerFrame={impactLocal} tone="warning" size={200} />
    </>
  );
};

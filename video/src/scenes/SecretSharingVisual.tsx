import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";

export type SecretSharingPhase = "shares" | "curve" | "candidates" | "recover";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: SecretSharingPhase;
};

const W = layout.width;
const H = layout.height;
const CX = W / 2;
const CHART_LEFT = 120;
const CHART_RIGHT = 960;
const CHART_TOP = 560;
const CHART_BOTTOM = 1160;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const pointXs = [220, 380, 540, 700, 860];
const pointYs = [930, 785, 680, 665, 740];
const secretY = 1040;

const curvePath = (offset = 0) => {
  const samples = 34;
  return Array.from({ length: samples }, (_, i) => {
    const x = CHART_LEFT + ((CHART_RIGHT - CHART_LEFT) * i) / (samples - 1);
    const u = (x - CX) / 320;
    const y = 820 - 250 * (u * u - 0.22 * u) + offset * (u - 0.4);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
};

const PhaseTitle: React.FC<{ phase: SecretSharingPhase; opacity: number }> = ({ phase, opacity }) => {
  const title: Record<SecretSharingPhase, string> = {
    shares: "Пять долей. Три — достаточно",
    curve: "Секрет — в свободном члене",
    candidates: "Две точки не выдают секрет",
    recover: "Три точки возвращают ключ",
  };
  return (
    <div
      style={{
        position: "absolute",
        top: layout.safeTop + 30,
        left: 50,
        right: 50,
        textAlign: "center",
        color: theme.text,
        fontFamily: theme.font,
        fontSize: 48,
        fontWeight: 800,
        lineHeight: 1.08,
        opacity,
      }}
    >
      {title[phase]}
    </div>
  );
};

const Badge: React.FC<{ label: string; color: string; x: number; y: number; opacity: number }> = ({ label, color, x, y, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      padding: "12px 20px",
      borderRadius: 999,
      border: `2px solid ${color}99`,
      background: `${color}18`,
      color,
      fontFamily: theme.mono,
      fontSize: 24,
      fontWeight: 800,
      whiteSpace: "nowrap",
      opacity,
      transform: `translateY(${(1 - opacity) * 16}px)`,
    }}
  >
    {label}
  </div>
);

export const SecretSharingVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "curve" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 16, mass: 0.75 } });
  const reveal = smooth(local / 24);
  const hit = local >= impactLocal ? Math.exp(-(local - impactLocal) * 0.18) : 0;
  const selected = phase === "recover" || phase === "shares" ? [0, 2, 4] : [0, 1];
  const selectedSet = new Set(selected);
  const chartOpacity = phase === "shares" ? 0.28 * enter : enter;
  const candidatesOpacity = phase === "candidates" ? enter : 0;
  const recoverOpacity = phase === "recover" ? enter : 0;

  return (
    <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
      <PhaseTitle phase={phase} opacity={enter} />

      <div
        style={{
          position: "absolute",
          top: 300,
          left: CX - 180,
          width: 360,
          textAlign: "center",
          color: theme.subtext,
          fontFamily: theme.mono,
          fontSize: 22,
          letterSpacing: 1,
          opacity: enter * 0.9,
        }}
      >
        СХЕМА ШАМИРА · ТРИ ИЗ ПЯТИ
      </div>

      <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: chartOpacity }}>
        <line x1={CHART_LEFT} y1={CHART_BOTTOM} x2={CHART_RIGHT} y2={CHART_BOTTOM} stroke={theme.panelBorder} strokeWidth={3} />
        <line x1={CHART_LEFT} y1={CHART_TOP} x2={CHART_LEFT} y2={CHART_BOTTOM} stroke={theme.panelBorder} strokeWidth={3} />
        <line x1={CHART_LEFT} y1={secretY} x2={CHART_RIGHT} y2={secretY} stroke={theme.accent2} strokeWidth={2} strokeDasharray="10 14" opacity={0.65} />
        <text x={CHART_LEFT - 16} y={CHART_TOP - 18} fill={theme.subtext} fontFamily={theme.mono} fontSize="22" textAnchor="end">q(x)</text>
        <text x={CHART_RIGHT} y={CHART_BOTTOM + 42} fill={theme.subtext} fontFamily={theme.mono} fontSize="22" textAnchor="end">x</text>
        {phase === "candidates" ? [
          { offset: -90, color: theme.accent2 },
          { offset: -38, color: theme.warning },
          { offset: 42, color: theme.accent },
          { offset: 92, color: theme.success },
        ].map((candidate) => (
          <path key={candidate.offset} d={curvePath(candidate.offset)} fill="none" stroke={candidate.color} strokeWidth={4} strokeDasharray="14 13" opacity={0.66} />
        )) : null}
        <path d={curvePath()} fill="none" stroke={phase === "recover" ? theme.success : theme.accent} strokeWidth={7} strokeLinecap="round" />
        {pointXs.map((x, i) => {
          const visible = smooth((local - i * 6) / 18);
          const active = selectedSet.has(i);
          const color = active ? theme.success : theme.accent2;
          return (
            <g key={x} opacity={visible * (phase === "shares" ? 0.45 : 1)}>
              <circle cx={x} cy={pointYs[i]} r={active ? 18 : 14} fill={color} opacity={0.25} />
              <circle cx={x} cy={pointYs[i]} r={active ? 10 : 8} fill={color} />
              <text x={x} y={pointYs[i] - 30} fill={theme.text} fontFamily={theme.mono} fontSize="22" textAnchor="middle">{`доля ${i + 1}`}</text>
            </g>
          );
        })}
        {phase === "recover" ? (
          <>
            {selected.map((i) => <line key={i} x1={pointXs[i]} y1={pointYs[i]} x2={CX} y2={secretY} stroke={theme.success} strokeWidth={3} strokeDasharray="8 10" opacity={0.7} />)}
            <circle cx={CX} cy={secretY} r={26 + hit * 12} fill={`${theme.success}33`} stroke={theme.success} strokeWidth={5} />
          </>
        ) : null}
      </svg>

      {phase === "shares" ? (
        <div style={{ position: "absolute", left: 96, right: 96, top: 1260, display: "flex", justifyContent: "space-between", opacity: enter }}>
          {pointXs.map((_, i) => (
            <div key={i} style={{ width: 150, height: 86, borderRadius: 18, border: `2px solid ${selectedSet.has(i) ? theme.success : theme.panelBorder}`, background: `${selectedSet.has(i) ? theme.success : theme.panel}22`, display: "flex", alignItems: "center", justifyContent: "center", color: selectedSet.has(i) ? theme.success : theme.subtext, fontFamily: theme.mono, fontSize: 23 }}>
              доля {i + 1}
            </div>
          ))}
        </div>
      ) : null}

      <Badge label={phase === "candidates" ? "много подходящих кривых" : phase === "recover" ? "q(0) = СЕКРЕТ" : "каждая точка — доля"} color={phase === "recover" ? theme.success : theme.accent} x={phase === "recover" ? 348 : 340} y={phase === "recover" ? 1250 : 1260} opacity={reveal} />
      {phase === "candidates" ? <Badge label="меньше трёх — ноль подсказок" color={theme.warning} x={258} y={1360} opacity={candidatesOpacity} /> : null}
      {phase === "recover" ? <Badge label="интерполяция собрала ключ" color={theme.success} x={286} y={1360} opacity={recoverOpacity} /> : null}
      {hit > 0 ? <div style={{ position: "absolute", left: CX - 80, top: secretY - 80, width: 160, height: 160, borderRadius: "50%", border: `5px solid ${theme.success}`, opacity: hit * 0.65, transform: `scale(${1 + hit * 0.35})` }} /> : null}
    </div>
  );
};

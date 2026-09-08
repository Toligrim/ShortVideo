import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

export type TiltWeightPhase = "phone" | "frame" | "shift" | "gravity" | "screen";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: TiltWeightPhase;
};

const W = layout.width;
const H = layout.height;
const CX = W / 2;

const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.3,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const titles: Record<TiltWeightPhase, string> = {
  phone: "ТЕЛЕФОН ПОВЕРНУЛСЯ · ЭКРАН СЛЕДУЕТ",
  frame: "БЫТОВАЯ МОДЕЛЬ · ГИРЬКА НА ПРУЖИНКАХ",
  shift: "РАМКА НАКЛОНЯЕТСЯ · ГИРЬКА СМЕЩАЕТСЯ",
  gravity: "СИЛА ТЯЖЕСТИ ПОКАЗЫВАЕТ НИЗ",
  screen: "СИСТЕМА ПОВОРАЧИВАЕТ ЭКРАН ПОСЛЕ НАКЛОНА",
};

const colors: Record<TiltWeightPhase, string> = {
  phone: theme.accent,
  frame: theme.accent2,
  shift: theme.warning,
  gravity: theme.success,
  screen: theme.accent,
};

const Header: React.FC<{ phase: TiltWeightPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 228,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: colors[phase],
      fontSize: 23,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    <IconGlyph name={phase === "phone" || phase === "screen" ? "smartphone" : "move"} size={30} color={colors[phase]} strokeWidth={1.8} />
    <span>{titles[phase]}</span>
  </div>
);

const Badge: React.FC<{ phase: TiltWeightPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: 64,
      top: 1190,
      width: 952,
      minHeight: 76,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "13px 24px",
      borderRadius: 999,
      background: `${colors[phase]}16`,
      border: `3px solid ${colors[phase]}99`,
      color: colors[phase],
      fontSize: 22,
      textAlign: "center",
      whiteSpace: "nowrap",
      opacity,
      boxShadow: `0 0 34px ${colors[phase]}22`,
      ...mono,
    }}
  >
    {phase === "phone"
      ? "СЕНСОР ЗАМЕЧАЕТ НАКЛОН · КНОПКИ НЕТ"
      : phase === "screen"
        ? "СНАЧАЛА НАКЛОН · ПОТОМ НОВАЯ ОРИЕНТАЦИЯ"
        : "МАССА ОСТАЁТСЯ ВНИЗУ · РАМКА УХОДИТ ВБОК"}
  </div>
);

const Phone: React.FC<{ x: number; y: number; rotate: number; opacity: number; scale?: number }> = ({
  x,
  y,
  rotate,
  opacity,
  scale = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: 245,
      height: 490,
      transform: `translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`,
      transformOrigin: "50% 50%",
      borderRadius: 34,
      background: `${theme.panel}F5`,
      border: `5px solid ${theme.accent}AA`,
      boxShadow: `0 0 44px ${theme.accent}28`,
      opacity,
    }}
  >
    <div
      style={{
        position: "absolute",
        left: 20,
        top: 34,
        right: 20,
        bottom: 34,
        borderRadius: 22,
        background: `linear-gradient(145deg, ${theme.accent}20, ${theme.accent2}18)`,
        border: `3px solid ${theme.panelBorder}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
        color: theme.text,
        ...mono,
      }}
    >
      <IconGlyph name="arrow-up" size={58} color={theme.success} strokeWidth={1.8} />
      <span style={{ fontSize: 25 }}>ЭКРАН</span>
      <span style={{ color: theme.subtext, fontSize: 18 }}>верх ↑</span>
    </div>
    <div style={{ position: "absolute", left: "50%", top: 13, transform: "translateX(-50%)", width: 54, height: 8, borderRadius: 5, background: theme.panelBorder }} />
  </div>
);

const SpringLine: React.FC<{ x1: number; y1: number; x2: number; y2: number; color: string; opacity: number }> = ({
  x1,
  y1,
  x2,
  y2,
  color,
  opacity,
}) => {
  const points = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t + (i === 0 || i === 8 ? 0 : (i % 2 === 0 ? -1 : 1) * 16);
    return `${x},${y}`;
  }).join(" ");
  return <polyline points={points} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />;
};

const WeightFrame: React.FC<{ phase: TiltWeightPhase; local: number; fps: number; impactLocal: number; opacity: number }> = ({
  phase,
  local,
  fps,
  impactLocal,
  opacity,
}) => {
  const response = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 13, mass: 0.7 } });
  const amount = phase === "frame" ? 0 : phase === "shift" ? 78 * response : 116 * response;
  const angle = phase === "frame" ? 0 : -15 * response;
  const massX = 540 + amount;
  const color = colors[phase];
  return (
    <>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity }}>
        <g transform={`rotate(${angle} 540 730)`}>
          <rect x={250} y={450} width={580} height={560} rx={28} fill={`${theme.panel}E8`} stroke={`${color}99`} strokeWidth={4} />
          <rect x={282} y={482} width={516} height={496} rx={20} fill="none" stroke={`${theme.panelBorder}CC`} strokeWidth={2} strokeDasharray="12 16" />
          <line x1={540} y1={484} x2={540} y2={575} stroke={`${color}66`} strokeWidth={4} />
          <line x1={540} y1={885} x2={540} y2={976} stroke={`${color}66`} strokeWidth={4} />
        </g>
        <SpringLine x1={540} y1={484} x2={massX} y2={650} color={color} opacity={0.9} />
        <SpringLine x1={massX} y1={810} x2={540} y2={976} color={color} opacity={0.9} />
        <line x1={massX} y1={640} x2={massX} y2={820} stroke={theme.text} strokeWidth={4} opacity={0.9} />
        <circle cx={massX} cy={730} r={86} fill={`${theme.panel}FF`} stroke={color} strokeWidth={5} />
        <circle cx={massX} cy={730} r={28} fill={color} opacity={0.28} />
        <circle cx={massX} cy={730} r={13} fill={color} />
        <line x1={890} y1={560} x2={890} y2={875} stroke={theme.success} strokeWidth={5} strokeDasharray="14 12" />
        <path d="M 890 875 l -18 -32 M 890 875 l 18 -32" fill="none" stroke={theme.success} strokeWidth={5} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", left: massX, top: 832, transform: "translateX(-50%)", color: color, fontSize: 22, whiteSpace: "nowrap", ...mono, opacity }}>
        ГИРЬКА
      </div>
      <div style={{ position: "absolute", left: 890, top: 510, transform: "translateX(-50%)", color: theme.success, fontSize: 21, whiteSpace: "nowrap", ...mono, opacity }}>
        ВНИЗ
      </div>
      <div style={{ position: "absolute", left: 540, top: 1018, transform: "translateX(-50%)", color: theme.subtext, fontSize: 19, whiteSpace: "nowrap", ...mono, opacity }}>
        РАМКА · ПРУЖИНЫ · МАССА
      </div>
    </>
  );
};

export const TiltWeightVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "phone" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const response = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.75 } });

  if (phase === "phone") {
    const rotate = -90 * smooth(clamp01((local - impactLocal + 8) / 28));
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <Phone x={CX} y={710} rotate={rotate} opacity={enter} />
        <div style={{ position: "absolute", left: CX, top: 440, transform: "translateX(-50%)", color: theme.subtext, fontSize: 22, whiteSpace: "nowrap", opacity: enter, ...mono }}>
          НАКЛОН → ОРИЕНТАЦИЯ
        </div>
        <div style={{ position: "absolute", left: 178, top: 760, color: theme.warning, fontSize: 21, whiteSpace: "nowrap", opacity: enter, ...mono }}>
          КНОПКА: НЕТ
        </div>
        <Badge phase={phase} opacity={enter} />
        <PulseRing x={CX} y={710} triggerFrame={impactLocal} tone="accent" size={260} />
      </>
    );
  }

  if (phase === "screen") {
    const p = smooth(clamp01((local - impactLocal + 8) / 32));
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <Phone x={340} y={700} rotate={0} opacity={enter * (1 - p * 0.25)} scale={0.72} />
        <Phone x={740} y={700} rotate={-90 * p} opacity={enter} scale={0.72} />
        <div style={{ position: "absolute", left: 540, top: 680, transform: "translate(-50%, -50%)", color: theme.success, fontSize: 46, opacity: enter, ...mono }}>→</div>
        <div style={{ position: "absolute", left: 340, top: 1050, transform: "translateX(-50%)", color: theme.subtext, fontSize: 21, ...mono, opacity: enter }}>ВЕРТИКАЛЬНО</div>
        <div style={{ position: "absolute", left: 740, top: 1050, transform: "translateX(-50%)", color: theme.accent, fontSize: 21, ...mono, opacity: enter }}>ГОРИЗОНТАЛЬНО</div>
        <Badge phase={phase} opacity={enter} />
        <PulseRing x={740} y={700} triggerFrame={impactLocal} tone="accent" size={220} />
      </>
    );
  }

  return (
    <>
      <Header phase={phase} opacity={enter} />
      <WeightFrame phase={phase} local={local} fps={fps} impactLocal={impactLocal} opacity={enter} />
      <Badge phase={phase} opacity={enter} />
      <PulseRing x={540 + (phase === "frame" ? 0 : phase === "shift" ? 78 * response : 116 * response)} y={730} triggerFrame={impactLocal} tone={phase === "gravity" ? "success" : "warning"} size={210} />
    </>
  );
};

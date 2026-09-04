import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type PolarizerPhase =
  | "screen"
  | "glasses"
  | "pair"
  | "parallel"
  | "crossed"
  | "rotate"
  | "analogy";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: PolarizerPhase;
};

const W = layout.width;
const H = layout.height;
const CX = W / 2;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.5,
};

const phaseTitle: Record<PolarizerPhase, string> = {
  screen: "ЭКРАННЫЙ СЛОЙ · ОДНА ОСЬ",
  glasses: "ОЧКИ · ВТОРОЙ ФИЛЬТР",
  pair: "ДВА ПОЛЯРИЗАТОРА · ДВЕ ОСИ",
  parallel: "ОСИ СОВПАЛИ · СВЕТ ПРОХОДИТ",
  crossed: "ОСИ ПОПЕРЕЧНЫ · СВЕТ ГАСНЕТ",
  rotate: "ПОВОРОТ ОСИ МЕНЯЕТ ПРОПУСКАНИЕ",
  analogy: "АНАЛОГИЯ · ДВЕ ПОВЁРНУТЫЕ ЖАЛЮЗИ",
};

const phaseIcon: Record<PolarizerPhase, string> = {
  screen: "smartphone",
  glasses: "glasses",
  pair: "layers",
  parallel: "sun",
  crossed: "ban",
  rotate: "rotate-cw",
  analogy: "grid-2x2",
};

const phaseColor: Record<PolarizerPhase, string> = {
  screen: theme.accent,
  glasses: theme.accent2,
  pair: theme.warning,
  parallel: theme.success,
  crossed: theme.danger,
  rotate: theme.accent2,
  analogy: theme.warning,
};

const FilterPanel: React.FC<{
  id: string;
  x: number;
  y: number;
  angle: number;
  label: string;
  color: string;
  opacity?: number;
}> = ({ id, x, y, angle, label, color, opacity = 1 }) => {
  const slats = Array.from({ length: 9 }, (_, i) => i);
  return (
    <g opacity={opacity}>
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect x={x - 94} y={y - 192} width={188} height={384} rx={18} />
        </clipPath>
      </defs>
      <rect
        x={x - 112}
        y={y - 210}
        width={224}
        height={420}
        rx={28}
        fill={`${color}14`}
        stroke={`${color}B8`}
        strokeWidth={4}
      />
      <g clipPath={`url(#${id}-clip)`}>
        <g transform={`translate(${x} ${y}) rotate(${angle})`}>
          <rect x={-130} y={-215} width={260} height={430} fill={`${color}12`} />
          {slats.map((i) => (
            <line
              key={i}
              x1={-110 + i * 27}
              y1={-220}
              x2={-110 + i * 27}
              y2={220}
              stroke={color}
              strokeWidth={i === 4 ? 8 : 5}
              opacity={i === 4 ? 0.72 : 0.42}
            />
          ))}
        </g>
      </g>
      <g transform={`translate(${x} ${y}) rotate(${angle})`}>
        <line x1={0} y1={134} x2={0} y2={-125} stroke={theme.text} strokeWidth={5} strokeLinecap="round" opacity={0.92} />
        <path d="M -14 -105 L 0 -132 L 14 -105" fill="none" stroke={theme.text} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x={x} y={y - 238} textAnchor="middle" fill={theme.text} fontFamily={theme.font} fontWeight="800" fontSize={28}>
        {label}
      </text>
      <text x={x} y={y + 252} textAnchor="middle" fill={color} fontFamily={theme.mono} fontWeight="800" fontSize={22} letterSpacing="1">
        ОСЬ ПРОПУСКАНИЯ · {Math.round(angle)}°
      </text>
    </g>
  );
};

const Beam: React.FC<{
  x1: number;
  x2: number;
  opacity: number;
  color: string;
  local: number;
}> = ({ x1, x2, opacity, color, local }) => (
  <g opacity={opacity}>
    {Array.from({ length: 7 }).map((_, i) => {
      const y = 625 + i * 37;
      const bend = i % 2 === 0 ? -14 : 14;
      return (
        <path
          key={i}
          d={`M ${x1} ${y} C ${x1 + (x2 - x1) * 0.32} ${y + bend}, ${x1 + (x2 - x1) * 0.68} ${y - bend}, ${x2} ${y}`}
          fill="none"
          stroke={color}
          strokeWidth={i === 3 ? 7 : 4}
          strokeLinecap="round"
          strokeDasharray={i === 3 ? "24 15" : "14 18"}
          strokeDashoffset={-((local * 4 + i * 11) % 120)}
        />
      );
    })}
  </g>
);

const LightSource: React.FC<{ opacity: number; color: string }> = ({ opacity, color }) => (
  <g opacity={opacity}>
    <circle cx={74} cy={735} r={37} fill={`${color}22`} stroke={color} strokeWidth={4} />
    {Array.from({ length: 8 }).map((_, i) => {
      const a = (i * Math.PI) / 4;
      const x1 = 74 + Math.cos(a) * 52;
      const y1 = 735 + Math.sin(a) * 52;
      const x2 = 74 + Math.cos(a) * 69;
      const y2 = 735 + Math.sin(a) * 69;
      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={4} strokeLinecap="round" />;
    })}
    <text x={74} y={817} textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontWeight="800" fontSize={20}>
      СВЕТ
    </text>
  </g>
);

const EyeTarget: React.FC<{ opacity: number; color: string }> = ({ opacity, color }) => (
  <g opacity={opacity}>
    <path d="M 922 735 Q 966 690 1010 735 Q 966 780 922 735 Z" fill={`${color}15`} stroke={color} strokeWidth={4} />
    <circle cx={966} cy={735} r={15} fill={color} />
    <text x={966} y={817} textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontWeight="800" fontSize={20}>
      ГЛАЗ
    </text>
  </g>
);

const TransmissionMeter: React.FC<{
  value: number;
  color: string;
  opacity: number;
  label: string;
}> = ({ value, color, opacity, label }) => {
  const percent = Math.round(clamp01(value) * 100);
  return (
    <div
      style={{
        position: "absolute",
        left: 138,
        top: 1052,
        width: 804,
        opacity,
        ...mono,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: theme.subtext, fontSize: 22 }}>
        <span>{label}</span>
        <span style={{ color, fontSize: 30 }}>{percent}%</span>
      </div>
      <div
        style={{
          marginTop: 12,
          height: 24,
          borderRadius: 999,
          overflow: "hidden",
          background: `${theme.text}12`,
          border: `2px solid ${color}66`,
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            borderRadius: 999,
            background: `linear-gradient(90deg, ${color}66, ${color})`,
            boxShadow: `0 0 24px ${color}88`,
          }}
        />
      </div>
    </div>
  );
};

/** Два поляризующих фильтра: оси, совпадение/перпендикулярность и передача света. */
export const PolarizerStackVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "pair" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const impact = local >= impactLocal ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  const reveal = smooth(local / Math.max(impactLocal, 1));
  const paired = !(["screen", "glasses"] as PolarizerPhase[]).includes(phase);
  const secondAngle =
    phase === "crossed" || phase === "analogy"
      ? 90
      : phase === "parallel"
      ? 0
      : phase === "rotate"
      ? interpolate(local, [0, Math.max(impactLocal, 1)], [0, 66], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : phase === "pair"
      ? 44
      : 0;
  const transmission =
    phase === "screen" || phase === "glasses"
      ? 1
      : phase === "crossed" || phase === "analogy"
      ? 0.02
      : Math.pow(Math.cos((secondAngle * Math.PI) / 180), 2);
  const screenX = paired ? 330 : CX;
  const glassesX = 750;
  const outputOpacity = 0.14 + transmission * 0.86;
  const color = phaseColor[phase];
  const meterLabel = phase === "rotate" ? "ПЕРЕДАЧА · I = I₀ · cos² θ" : "ПРОПУСКАНИЕ ПОСЛЕ ФИЛЬТРОВ";
  const status =
    phase === "screen"
      ? "СЛОЙ ОСТАВЛЯЕТ ОДНУ ОСЬ"
      : phase === "glasses"
      ? "ОЧКИ ПРОПУСКАЮТ СВЕТ ВДОЛЬ ОСИ"
      : phase === "pair"
      ? "ДВА ФИЛЬТРА · УГОЛ МЕЖДУ ОСЯМИ"
      : phase === "parallel"
      ? "ОСИ ПАРАЛЛЕЛЬНЫ · ПЕРЕДАЧА 100%"
      : phase === "crossed"
      ? "ОСИ 90° · ПЕРЕДАЧА ПОЧТИ 0%"
      : phase === "rotate"
      ? `УГОЛ ${Math.round(secondAngle)}° · СВЕТ МЕНЯЕТСЯ`
      : "ЖАЛЮЗИ ПОПЕРЁК · ОБЩИЙ ПРОХОД ЗАКРЫТ";
  const statusColor = phase === "parallel" ? theme.success : phase === "crossed" || phase === "analogy" ? theme.danger : color;
  const pulseX = paired ? glassesX : CX;

  return (
    <div style={{ position: "absolute", inset: 0, opacity: enter }}>
      <div
        style={{
          position: "absolute",
          left: CX,
          top: 238,
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          color: theme.subtext,
          fontSize: 24,
          whiteSpace: "nowrap",
          ...mono,
        }}
      >
        <IconGlyph name={phaseIcon[phase]} size={30} color={color} strokeWidth={1.8} />
        <span>{phaseTitle[phase]}</span>
      </div>

      {paired ? (
        <div
          style={{
            position: "absolute",
            left: CX,
            top: 356,
            transform: "translateX(-50%)",
            padding: "12px 24px",
            borderRadius: 999,
            background: `${color}12`,
            border: `2px solid ${color}66`,
            color: color,
            fontSize: 22,
            whiteSpace: "nowrap",
            opacity: enter * (0.7 + reveal * 0.3),
            ...mono,
          }}
        >
          ОСИ: ЭКРАН 0°  ·  ОЧКИ {Math.round(secondAngle)}°
        </div>
      ) : null}

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <LightSource opacity={enter} color={theme.warning} />
        <Beam x1={116} x2={screenX - 120} opacity={enter * 0.82} color={theme.warning} local={local} />
        <FilterPanel
          id="screen-filter"
          x={screenX}
          y={735}
          angle={0}
          label={phase === "analogy" ? "ЖАЛЮЗИ A" : "ЭКРАННЫЙ СЛОЙ"}
          color={theme.accent}
          opacity={enter}
        />
        {paired ? (
          <Beam x1={screenX + 120} x2={glassesX - 120} opacity={enter * 0.72} color={theme.accent} local={local + 17} />
        ) : null}
        {paired ? (
          <>
            <FilterPanel
              id="glasses-filter"
              x={glassesX}
              y={735}
              angle={secondAngle}
              label={phase === "analogy" ? "ЖАЛЮЗИ B" : "ОЧКИ"}
              color={phase === "analogy" ? theme.warning : theme.accent2}
              opacity={enter}
            />
            <Beam x1={glassesX + 120} x2={918} opacity={enter * outputOpacity} color={statusColor} local={local + 33} />
          </>
        ) : (
          <Beam x1={screenX + 120} x2={918} opacity={enter * 0.9} color={theme.accent} local={local + 33} />
        )}
        <EyeTarget opacity={enter * outputOpacity} color={statusColor} />
      </svg>

      {phase === "rotate" ? (
        <div
          style={{
            position: "absolute",
            left: glassesX,
            top: 424,
            transform: "translateX(-50%)",
            color: theme.accent2,
            fontSize: 25,
            ...mono,
          }}
        >
          θ = {Math.round(secondAngle)}°
        </div>
      ) : null}

      <TransmissionMeter value={transmission} color={statusColor} opacity={enter * (0.82 + impact * 0.18)} label={meterLabel} />
      <div
        style={{
          position: "absolute",
          left: CX,
          top: 1194,
          transform: `translateX(-50%) scale(${0.92 + impact * 0.08})`,
          padding: "15px 28px",
          borderRadius: 999,
          background: `${statusColor}18`,
          border: `2px solid ${statusColor}99`,
          color: statusColor,
          fontSize: 24,
          whiteSpace: "nowrap",
          opacity: enter * (0.76 + impact * 0.24),
          boxShadow: `0 0 34px ${statusColor}26`,
          ...mono,
        }}
      >
        {status}
      </div>
      <PulseRing x={pulseX} y={735} triggerFrame={impactLocal} tone={phase === "parallel" ? "success" : phase === "crossed" || phase === "analogy" ? "danger" : "accent"} size={205} />
    </div>
  );
};

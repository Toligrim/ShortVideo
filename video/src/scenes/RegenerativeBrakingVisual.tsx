import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { Badge } from "../primitives/Badge";
import { IconGlyph } from "../primitives/IconGlyph";

export type RegenerativeBrakingPhase =
  | "symptom"
  | "friction"
  | "generator"
  | "inverter"
  | "dynamo"
  | "blend";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: RegenerativeBrakingPhase;
};

const W = layout.width;
const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.2,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const phaseTitle: Record<RegenerativeBrakingPhase, string> = {
  symptom: "ЗАПАС ХОДА ↑",
  friction: "КОЛОДКИ + ДИСК",
  generator: "МОТОР → ГЕНЕРАТОР",
  inverter: "ИНВЕРТОР → БАТАРЕЯ",
  dynamo: "ДИНАМО + ЛАМПА",
  blend: "ОГРАНИЧЕНИЕ ТОКА",
};

const phaseIcon: Record<RegenerativeBrakingPhase, string> = {
  symptom: "car-front",
  friction: "circle-dot",
  generator: "rotate-cw",
  inverter: "battery-full",
  dynamo: "lightbulb",
  blend: "battery-full",
};

const PhaseHeader: React.FC<{ phase: RegenerativeBrakingPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 338,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 13,
      color: theme.subtext,
      fontSize: 25,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={34} color={theme.accent} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const Panel = (color: string): React.CSSProperties => ({
  borderRadius: 26,
  background: `${theme.panel}F2`,
  border: `3px solid ${color}66`,
  boxShadow: `0 0 42px ${color}22`,
});

const Wheel: React.FC<{
  left: number;
  top: number;
  size: number;
  local: number;
  color?: string;
  spin?: number;
  opacity?: number;
}> = ({ left, top, size, local, color = theme.accent, spin = 2.8, opacity = 1 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 260 260"
    style={{ position: "absolute", left, top, overflow: "visible", opacity }}
  >
    <circle cx="130" cy="130" r="113" fill={`${theme.panel}F2`} stroke={`${color}AA`} strokeWidth="7" />
    <g transform={`rotate(${local * spin} 130 130)`}>
      {Array.from({ length: 8 }).map((_, i) => (
        <line
          key={i}
          x1="130"
          y1="30"
          x2="130"
          y2="78"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          transform={`rotate(${i * 45} 130 130)`}
          opacity="0.72"
        />
      ))}
    </g>
    <circle cx="130" cy="130" r="38" fill={`${color}22`} stroke={color} strokeWidth="5" />
    <circle cx="130" cy="130" r="10" fill={color} />
  </svg>
);

const CarBody: React.FC<{ left: number; top: number; local: number; opacity: number }> = ({ left, top, local, opacity }) => {
  const drift = interpolate(local, [0, 100], [0, -34], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <svg
      width="570"
      height="280"
      viewBox="0 0 570 280"
      style={{ position: "absolute", left, top, overflow: "visible", opacity, transform: `translateX(${drift}px)` }}
    >
      <path d="M45 184 L88 125 L187 101 L287 101 L359 132 L476 143 L522 184 L522 205 L45 205 Z" fill={`${theme.panel}F2`} stroke={`${theme.accent}BB`} strokeWidth="6" />
      <path d="M130 122 L190 91 L286 91 L332 132 L144 132 Z" fill={`${theme.accent}14`} stroke={`${theme.accent}66`} strokeWidth="4" />
      <path d="M207 96 L207 131 M287 96 L302 132" stroke={`${theme.accent}66`} strokeWidth="3" />
      <circle cx="151" cy="205" r="43" fill={theme.bg} stroke={theme.text} strokeWidth="6" />
      <circle cx="151" cy="205" r="19" fill={`${theme.accent}22`} stroke={theme.accent} strokeWidth="4" />
      <circle cx="417" cy="205" r="43" fill={theme.bg} stroke={theme.text} strokeWidth="6" />
      <circle cx="417" cy="205" r="19" fill={`${theme.accent}22`} stroke={theme.accent} strokeWidth="4" />
      <path d="M48 236 H520" stroke={`${theme.subtext}55`} strokeWidth="4" strokeDasharray="24 24" strokeDashoffset={-local * 2} />
      <path d="M498 158 L548 158" stroke={theme.warning} strokeWidth="5" strokeLinecap="round" />
      <path d="M548 158 L531 147 L531 169 Z" fill={theme.warning} />
    </svg>
  );
};

const RangeCard: React.FC<{ left: number; top: number; opacity: number; local: number }> = ({ left, top, opacity, local }) => {
  const level = 0.62 + 0.08 * smooth(local / 90);
  return (
    <div style={{ position: "absolute", left, top, width: 340, height: 236, padding: "24px 28px", opacity, ...Panel(theme.success) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, color: theme.success, fontSize: 23, ...mono }}>
        <IconGlyph name="gauge" size={37} color={theme.success} strokeWidth={1.8} />
        <span>ЗАПАС ХОДА</span>
      </div>
      <div style={{ marginTop: 28, color: theme.text, fontSize: 42, textAlign: "center", ...mono }}>
        62% <span style={{ color: theme.success }}>→</span> {Math.round(level * 100)}%
      </div>
      <div style={{ position: "absolute", left: 28, right: 28, bottom: 31, height: 18, borderRadius: 18, background: `${theme.panelBorder}` }}>
        <div style={{ width: `${level * 100}%`, height: "100%", borderRadius: 18, background: theme.success, boxShadow: `0 0 24px ${theme.success}88` }} />
      </div>
    </div>
  );
};

const BrakeAssembly: React.FC<{
  left: number;
  top: number;
  local: number;
  impactLocal: number;
  scale?: number;
  hot?: boolean;
}> = ({ left, top, local, impactLocal, scale = 1, hot = true }) => {
  const clamp = smooth((local - impactLocal + 10) / 24);
  const padDistance = 156 - clamp * 62;
  const heat = hot ? clamp01((local - impactLocal - 2) / 28) : 0;
  const padColor = hot ? theme.danger : theme.success;
  return (
    <svg
      width="560"
      height="410"
      viewBox="0 0 560 410"
      style={{ position: "absolute", left, top, overflow: "visible", transform: `scale(${scale})`, transformOrigin: "50% 50%" }}
    >
      <circle cx="280" cy="190" r="124" fill={`${theme.panel}F2`} stroke={`${theme.subtext}88`} strokeWidth="8" />
      <circle cx="280" cy="190" r="77" fill={`${theme.bg}CC`} stroke={`${theme.accent2}88`} strokeWidth="5" />
      <circle cx="280" cy="190" r="23" fill={`${theme.accent2}22`} stroke={theme.accent2} strokeWidth="5" />
      <g fill={`${padColor}DD`} stroke={padColor} strokeWidth="4">
        <rect x={280 - padDistance - 30} y="130" width="42" height="120" rx="17" />
        <rect x={280 + padDistance - 12} y="130" width="42" height="120" rx="17" />
      </g>
      {heat > 0 ? (
        <g fill="none" stroke={theme.warning} strokeWidth="7" strokeLinecap="round" opacity={heat}>
          <path d="M155 72 C120 45 140 18 112 -8" />
          <path d="M405 72 C440 45 420 18 448 -8" />
          <path d="M166 320 C130 345 148 372 120 397" />
          <path d="M394 320 C430 345 412 372 440 397" />
        </g>
      ) : null}
      <path d="M280 18 V42" stroke={theme.subtext} strokeWidth="4" strokeLinecap="round" />
      <path d="M280 338 V362" stroke={theme.subtext} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
};

const MotorGraphic: React.FC<{ left: number; top: number; size?: number; local: number; impactLocal: number; opacity?: number }> = ({ left, top, size = 360, local, impactLocal, opacity = 1 }) => {
  const current = smooth((local - impactLocal + 8) / 28);
  const spin = local * 2.4;
  return (
    <svg width={size} height={size} viewBox="0 0 360 360" style={{ position: "absolute", left, top, overflow: "visible", opacity }}>
      <circle cx="180" cy="180" r="143" fill={`${theme.panel}F2`} stroke={`${theme.accent2}AA`} strokeWidth="7" />
      <g transform={`rotate(${spin} 180 180)`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <ellipse key={i} cx="180" cy="68" rx="19" ry="39" fill="none" stroke={theme.accent} strokeWidth="7" transform={`rotate(${i * 45} 180 180)`} opacity="0.85" />
        ))}
        <circle cx="180" cy="180" r="68" fill={`${theme.accent2}16`} stroke={theme.accent2} strokeWidth="7" />
        <path d="M180 84 A96 96 0 0 1 265 130" fill="none" stroke={theme.warning} strokeWidth="7" strokeLinecap="round" />
        <path d="M265 130 L247 128 L256 144 Z" fill={theme.warning} />
      </g>
      <circle cx="180" cy="180" r="22" fill={theme.accent2} />
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = -1.1 + i * 0.44;
        const x = 180 + Math.cos(angle) * 103;
        const y = 180 + Math.sin(angle) * 103;
        return <circle key={`current-${i}`} cx={x} cy={y} r="9" fill={theme.success} opacity={0.25 + current * 0.75} />;
      })}
    </svg>
  );
};

const BatteryGraphic: React.FC<{
  left: number;
  top: number;
  width?: number;
  height?: number;
  level?: number;
  condition?: string;
  cold?: boolean;
  opacity?: number;
}> = ({ left, top, width = 260, height = 330, level = 0.68, condition = "ЗАРЯД", cold = false, opacity = 1 }) => {
  const color = cold ? theme.warning : theme.success;
  return (
    <div style={{ position: "absolute", left, top, width, height, opacity, ...Panel(color) }}>
      <div style={{ position: "absolute", left: width / 2 - 38, top: -21, width: 76, height: 22, borderRadius: "10px 10px 0 0", background: `${color}66`, border: `3px solid ${color}AA`, borderBottom: "none" }} />
      <div style={{ position: "absolute", left: 30, right: 30, top: 34, bottom: 34, border: `3px solid ${theme.panelBorder}`, borderRadius: 19, overflow: "hidden", background: `${theme.bg}CC` }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${clamp01(level) * 100}%`, background: `linear-gradient(180deg, ${color}AA, ${color}22)`, boxShadow: `0 0 30px ${color}55` }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ position: "absolute", left: 28 + i * 28, bottom: 32 + ((i * 38) % 120), width: 9, height: 9, borderRadius: "50%", background: color, boxShadow: `0 0 16px ${color}`, opacity: 0.35 + 0.25 * Math.sin(i + 1) }} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 76, textAlign: "center" }}>
        <IconGlyph name={cold ? "snowflake" : "battery-full"} size={48} color={color} strokeWidth={1.7} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 60, textAlign: "center", color: theme.text, fontSize: 33, ...mono }}>{condition}</div>
    </div>
  );
};

const MovingArrow: React.FC<{ d: string; local: number; color: string; reverse?: boolean; opacity?: number }> = ({ d, local, color, reverse = false, opacity = 1 }) => (
  <svg width={W} height={layout.height} viewBox={`0 0 ${W} ${layout.height}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity }}>
    <path d={d} fill="none" stroke={color} strokeWidth="7" strokeDasharray="19 18" strokeDashoffset={(reverse ? 1 : -1) * local * 3} strokeLinecap="round" />
  </svg>
);

const Bicycle: React.FC<{ left: number; top: number; local: number; opacity: number }> = ({ left, top, local, opacity }) => {
  const spin = local * 2.2;
  return (
    <svg width="560" height="360" viewBox="0 0 560 360" style={{ position: "absolute", left, top, overflow: "visible", opacity }}>
      <g fill="none" stroke={theme.text} strokeWidth="6">
        <circle cx="110" cy="235" r="82" />
        <circle cx="405" cy="235" r="82" />
        <path d="M110 235 L212 142 L300 235 L110 235 L260 235 L212 142 L190 90 L238 90" />
        <path d="M300 235 L405 235 M300 235 L345 142 L405 235 M345 142 L390 142" />
      </g>
      <g transform={`rotate(${spin} 110 235)`}>
        <circle cx="110" cy="235" r="16" fill={`${theme.accent}33`} stroke={theme.accent} strokeWidth="5" />
        <path d="M110 219 V251 M94 235 H126" stroke={theme.accent} strokeWidth="5" strokeLinecap="round" />
      </g>
      <circle cx="405" cy="235" r="14" fill={`${theme.warning}44`} stroke={theme.warning} strokeWidth="5" />
      <circle cx="390" cy="166" r="19" fill={`${theme.accent2}44`} stroke={theme.accent2} strokeWidth="5" />
      <path d="M390 166 C432 130 464 128 495 104" fill="none" stroke={theme.accent2} strokeWidth="5" strokeDasharray="12 12" strokeDashoffset={-local * 3} />
      <path d="M175 300 H88" stroke={theme.warning} strokeWidth="6" strokeLinecap="round" />
      <path d="M88 300 L105 289 L105 311 Z" fill={theme.warning} />
    </svg>
  );
};

const Lamp: React.FC<{ left: number; top: number; local: number; opacity: number }> = ({ left, top, local, opacity }) => {
  const glow = 0.35 + 0.2 * Math.sin(local / 8);
  return (
    <div style={{ position: "absolute", left, top, width: 235, height: 190, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: theme.warning, opacity, ...Panel(theme.warning) }}>
      <IconGlyph name="lightbulb" size={82} color={theme.warning} strokeWidth={1.6} />
      <div style={{ fontSize: 24, ...mono }}>ЛАМПА</div>
      <div style={{ position: "absolute", inset: -28, borderRadius: 48, boxShadow: `0 0 55px ${theme.warning}${Math.round(glow * 255).toString(16).padStart(2, "0")}`, pointerEvents: "none" }} />
    </div>
  );
};

/** Рекуперация: от замедления и колодок к генерации тока и возврату энергии в батарею. */
export const RegenerativeBrakingVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "symptom" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });

  if (phase === "symptom") {
    return (
      <>
        <PhaseHeader phase={phase} opacity={enter} />
        <CarBody left={75} top={520} local={local} opacity={enter} />
        <RangeCard left={680} top={525} opacity={enter} local={local} />
        <Badge label="ТОРМОЗИШЬ → ПЛЮС" x={540} y={1190} tone="success" enterFrame={0} />
        <PulseRing x={850} y={642} triggerFrame={impactLocal} tone="success" size={220} />
      </>
    );
  }

  if (phase === "friction") {
    return (
      <>
        <PhaseHeader phase={phase} opacity={enter} />
        <BrakeAssembly left={260} top={485} local={local} impactLocal={impactLocal} />
        <Badge label="ДВИЖЕНИЕ → ТЕПЛО" x={540} y={1190} tone="warning" enterFrame={0} />
        <PulseRing x={540} y={675} triggerFrame={impactLocal} tone="warning" size={240} />
      </>
    );
  }

  if (phase === "generator") {
    return (
      <>
        <PhaseHeader phase={phase} opacity={enter} />
        <Wheel left={80} top={590} size={260} local={local} color={theme.accent} />
        <MovingArrow d="M 340 720 C 420 620 492 620 562 650" local={local} color={theme.accent} opacity={enter} />
        <MotorGraphic left={570} top={500} local={local} impactLocal={impactLocal} opacity={enter} />
        <Badge label="ТОК В ОБМОТКАХ" x={540} y={1190} tone="success" enterFrame={0} />
        <PulseRing x={750} y={680} triggerFrame={impactLocal} tone="success" size={250} />
      </>
    );
  }

  if (phase === "inverter") {
    return (
      <>
        <PhaseHeader phase={phase} opacity={enter} />
        <MotorGraphic left={40} top={560} size={270} local={local} impactLocal={impactLocal} opacity={enter} />
        <div style={{ position: "absolute", left: 414, top: 640, width: 238, height: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: theme.accent, fontSize: 27, ...Panel(theme.accent), ...mono }}>
          <IconGlyph name="zap" size={48} color={theme.accent} strokeWidth={1.7} />
          <span>ИНВЕРТОР</span>
        </div>
        <BatteryGraphic left={780} top={520} width={230} height={350} level={0.72} condition="ЗАРЯД" opacity={enter} />
        <MovingArrow d="M 320 725 C 370 725 390 725 414 725 M 652 725 C 704 725 738 700 780 700" local={local} color={theme.success} opacity={enter} />
        <Badge label="ЭНЕРГИЯ В БАТАРЕЮ" x={540} y={1190} tone="success" enterFrame={0} />
        <PulseRing x={895} y={700} triggerFrame={impactLocal} tone="success" size={230} />
      </>
    );
  }

  if (phase === "dynamo") {
    return (
      <>
        <PhaseHeader phase={phase} opacity={enter} />
        <Bicycle left={55} top={490} local={local} opacity={enter} />
        <MovingArrow d="M 470 655 C 575 595 635 595 744 655" local={local} color={theme.success} opacity={enter} />
        <Lamp left={770} top={600} local={local} opacity={enter} />
        <Badge label="ВРАЩЕНИЕ → ТОК" x={540} y={1190} tone="success" enterFrame={0} />
        <PulseRing x={882} y={694} triggerFrame={impactLocal} tone="success" size={210} />
      </>
    );
  }

  return (
    <>
      <PhaseHeader phase="blend" opacity={enter} />
      <BatteryGraphic left={110} top={520} width={330} height={380} level={0.98} condition="100% · −10°C" cold opacity={enter} />
      <MovingArrow d="M 555 690 C 500 690 475 690 440 690 M 555 700 C 620 700 650 700 700 700" local={local} color={theme.success} opacity={enter} reverse />
      <BrakeAssembly left={625} top={520} scale={0.72} local={local} impactLocal={impactLocal} hot={false} />
      <Badge label="ЧАСТЬ → БАТАРЕЯ" x={540} y={1190} tone="success" enterFrame={0} />
      <PulseRing x={800} y={700} triggerFrame={impactLocal} tone="danger" size={225} />
    </>
  );
};

export default RegenerativeBrakingVisual;

import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type RotatingKeyPhase = "rotate" | "seal" | "neighbor" | "owner";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: RotatingKeyPhase;
}

const W = layout.width;
const CX = W / 2;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.4,
};

const phaseTitle: Record<RotatingKeyPhase, string> = {
  rotate: "ОТКРЫТАЯ МЕТКА МЕНЯЕТСЯ",
  seal: "КООРДИНАТА ЗАПИРАЕТСЯ МЕТКОЙ",
  neighbor: "СОСЕД ВИДИТ СЛУЧАЙНЫЙ КОД",
  owner: "ВЛАДЕЛЕЦ ОТКРЫВАЕТ ОТЧЁТ",
};

const phaseIcon: Record<RotatingKeyPhase, string> = {
  rotate: "refresh-cw",
  seal: "lock-keyhole",
  neighbor: "eye-off",
  owner: "unlock-keyhole",
};

const phaseColor: Record<RotatingKeyPhase, string> = {
  rotate: theme.accent,
  seal: theme.warning,
  neighbor: theme.danger,
  owner: theme.success,
};

const Header: React.FC<{ phase: RotatingKeyPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 320,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: phaseColor[phase],
      opacity,
      whiteSpace: "nowrap",
      fontSize: 24,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={31} color={phaseColor[phase]} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const StatusPill: React.FC<{
  text: string;
  color: string;
  opacity: number;
  y?: number;
}> = ({ text, color, opacity, y = 1205 }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: y,
      transform: "translateX(-50%)",
      padding: "14px 27px",
      borderRadius: 999,
      background: `${color}18`,
      border: `3px solid ${color}99`,
      boxShadow: `0 0 34px ${color}2E`,
      color,
      opacity,
      whiteSpace: "nowrap",
      fontSize: 24,
      ...mono,
    }}
  >
    {text}
  </div>
);

const Tag: React.FC<{
  x: number;
  y: number;
  label: string;
  value?: string;
  color: string;
  opacity: number;
  active?: boolean;
  crossed?: boolean;
  width?: number;
}> = ({ x, y, label, value, color, opacity, active = false, crossed = false, width = 210 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      minHeight: 94,
      transform: `translate(-50%, -50%) scale(${active ? 1.08 : 1})`,
      borderRadius: 20,
      background: `${color}${active ? "2B" : "17"}`,
      border: `3px solid ${color}${active ? "DD" : "88"}`,
      boxShadow: active ? `0 0 30px ${color}66` : `0 0 18px ${color}20`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      opacity,
    }}
  >
    <span style={{ ...mono, color: theme.subtext, fontSize: 15, letterSpacing: 0.8 }}>{label}</span>
    {value ? <span style={{ ...mono, color: active ? theme.text : color, fontSize: 25, letterSpacing: 1 }}>{value}</span> : null}
    {crossed ? <div style={{ position: "absolute", left: 10, right: 10, top: 45, height: 4, background: theme.danger, transform: "rotate(-13deg)", boxShadow: `0 0 12px ${theme.danger}` }} /> : null}
  </div>
);

const Arrow: React.FC<{ x: number; y: number; width: number; color: string; opacity: number }> = ({ x, y, width, color, opacity }) => (
  <div style={{ position: "absolute", left: x, top: y, width, height: 4, background: color, opacity, borderRadius: 4 }}>
    <div style={{ position: "absolute", right: -13, top: "50%", transform: "translateY(-50%)" }}>
      <IconGlyph name="arrow-right" size={30} color={color} strokeWidth={2} />
    </div>
  </div>
);

const Earbud: React.FC<{ x: number; y: number; opacity: number }> = ({ x, y, opacity }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", width: 176, height: 118, borderRadius: 24, background: `${theme.panel}F5`, border: `3px solid ${theme.accent}AA`, boxShadow: `0 0 32px ${theme.accent}33`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, opacity }}>
    <IconGlyph name="headphones" size={38} color={theme.accent} strokeWidth={1.8} />
    <span style={{ ...mono, color: theme.text, fontSize: 17, letterSpacing: 1 }}>НАУШНИК</span>
  </div>
);

const Phone: React.FC<{ x: number; y: number; label: string; color: string; opacity: number; width?: number }> = ({ x, y, label, color, opacity, width = 230 }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", width, height: 118, borderRadius: 24, background: `${theme.panel}F5`, border: `3px solid ${color}99`, boxShadow: `0 0 30px ${color}28`, display: "flex", alignItems: "center", justifyContent: "center", gap: 11, opacity }}>
    <IconGlyph name="smartphone" size={38} color={color} strokeWidth={1.8} />
    <span style={{ ...mono, color: theme.text, fontSize: 17, letterSpacing: 0.8, textAlign: "center" }}>{label}</span>
  </div>
);

const Cloud: React.FC<{ x: number; y: number; opacity: number }> = ({ x, y, opacity }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", width: 210, height: 116, borderRadius: 24, background: `${theme.panel}F5`, border: `3px solid ${theme.accent2}99`, boxShadow: `0 0 30px ${theme.accent2}28`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, opacity }}>
    <IconGlyph name="cloud" size={35} color={theme.accent2} strokeWidth={1.8} />
    <span style={{ ...mono, color: theme.text, fontSize: 16 }}>ОБЛАКО</span>
  </div>
);

const MapPoint: React.FC<{ x: number; y: number; opacity: number }> = ({ x, y, opacity }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", width: 266, height: 180, borderRadius: 20, overflow: "hidden", background: "linear-gradient(35deg, transparent 0 44%, #273A46 44% 47%, transparent 47% 73%, #273A46 73% 76%, transparent 76%), #182837", border: `3px solid ${theme.success}99`, opacity }}>
    <div style={{ position: "absolute", left: 18, top: 17, color: theme.success, ...mono, fontSize: 16 }}>ТОЧКА</div>
    <div style={{ position: "absolute", left: 134, top: 102, width: 26, height: 26, borderRadius: "50% 50% 50% 0", background: theme.danger, transform: "translate(-50%, -50%) rotate(-45deg)", boxShadow: `0 0 22px ${theme.danger}` }}>
      <div style={{ position: "absolute", left: 9, top: 9, width: 8, height: 8, borderRadius: "50%", background: theme.bg }} />
    </div>
  </div>
);

const RotatingKeyLockVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "rotate" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const impact = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const pulse = 0.5 + 0.5 * Math.sin(local / 10);

  if (phase === "rotate") {
    const cycle = Math.floor((local / 23) % 3);
    const keyP = smooth((local % 23) / 23);
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <Earbud x={145} y={680} opacity={enter} />
        <Arrow x={245} y={680} width={570} color={theme.accent} opacity={enter * 0.65} />
        <div style={{ position: "absolute", left: 530, top: 440, transform: "translateX(-50%)", color: theme.accent, ...mono, fontSize: 20, opacity: enter }}>ОТКРЫТЫЕ МЕТКИ МАЯКА</div>
        {["K-17", "K-18", "K-19"].map((key, i) => (
          <Tag key={key} x={355 + i * 190} y={680} label="ОТКРЫТЫЙ КЛЮЧ" value={key} color={theme.accent} opacity={enter * (i === cycle ? 1 : 0.5)} active={i === cycle && keyP > 0.2} />
        ))}
        <div style={{ position: "absolute", left: 530, top: 855, transform: "translateX(-50%)", color: theme.warning, ...mono, fontSize: 21, opacity: enter }}>МЕТКА МЕНЯЕТСЯ · ВЛАДЕЛЕЦ СЛЕДИТ</div>
        <StatusPill text="НЕ ОДНА ПОСТОЯННАЯ МЕТКА" color={theme.accent} opacity={enter} />
        <PulseRing x={545 + cycle * 190} y={680} triggerFrame={impactLocal} tone="accent" size={190} />
      </>
    );
  }

  if (phase === "seal") {
    const keyFlow = smooth((local - 8) / 42);
    const lockScale = 0.92 + 0.12 * impact;
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <Tag x={190} y={560} label="КООРДИНАТА ТЕЛЕФОНА" value="КОФЕЙНЯ · ТОЧКА" color={theme.accent2} opacity={enter} width={300} />
        <Tag x={190} y={790} label="МЕТКА МАЯКА" value="K-19" color={theme.accent} opacity={enter} width={220} />
        <Arrow x={350} y={660} width={300} color={theme.warning} opacity={enter * 0.7} />
        <div style={{ position: "absolute", left: interpolate(keyFlow, [0, 1], [390, 635]), top: 660, transform: "translate(-50%, -50%)", width: 74, height: 48, borderRadius: 14, background: `${theme.warning}2E`, border: `3px solid ${theme.warning}`, color: theme.warning, display: "flex", alignItems: "center", justifyContent: "center", ...mono, fontSize: 18, opacity: enter }}>K-19</div>
        <div style={{ position: "absolute", left: 820, top: 660, transform: `translate(-50%, -50%) scale(${lockScale})`, width: 230, height: 210, borderRadius: 28, background: `${theme.panel}F5`, border: `3px solid ${theme.warning}BB`, boxShadow: `0 0 38px ${theme.warning}40`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 11, opacity: enter }}>
          <IconGlyph name="lock-keyhole" size={66} color={theme.warning} strokeWidth={1.7} />
          <span style={{ ...mono, color: theme.text, fontSize: 17 }}>ЗАПЕРТЫЙ ОТЧЁТ</span>
        </div>
        <StatusPill text="КЛЮЧ ЗАПИРАЕТ КООРДИНАТУ" color={theme.warning} opacity={enter * (0.6 + 0.4 * impact)} />
        <PulseRing x={820} y={660} triggerFrame={impactLocal} tone="warning" size={230} />
      </>
    );
  }

  if (phase === "neighbor") {
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <Phone x={250} y={680} label="СОСЕДНИЙ ТЕЛЕФОН" color={theme.danger} opacity={enter} width={270} />
        <Arrow x={385} y={680} width={150} color={theme.danger} opacity={enter * 0.7} />
        <Tag x={650} y={560} label="ЧТО УВИДЕЛ СОСЕД" value="7F · A2 · 91" color={theme.danger} opacity={enter} width={270} active={impact > 0.4} />
        <Tag x={650} y={800} label="КЛЮЧА НЕТ" value="НЕ ОТКРЫТЬ" color={theme.subtext} opacity={enter} width={270} crossed />
        <StatusPill text="СЛУЧАЙНЫЙ КОД · ЛИЧНОСТЬ СКРЫТА" color={theme.danger} opacity={enter * (0.65 + 0.35 * pulse)} />
        <PulseRing x={650} y={560} triggerFrame={impactLocal} tone="danger" size={230} />
      </>
    );
  }

  const reportP = smooth((local - 8) / 40);
  return (
    <>
      <Header phase={phase} opacity={enter} />
      <Cloud x={170} y={650} opacity={enter} />
      <Arrow x={280} y={650} width={275} color={theme.success} opacity={enter * 0.7} />
      <div style={{ position: "absolute", left: interpolate(reportP, [0, 1], [320, 520]), top: 650, transform: "translate(-50%, -50%)", width: 95, height: 58, borderRadius: 15, background: `${theme.warning}25`, border: `3px solid ${theme.warning}`, display: "flex", alignItems: "center", justifyContent: "center", opacity: enter }}>
        <IconGlyph name="file-lock" size={31} color={theme.warning} strokeWidth={1.8} />
      </div>
      <Phone x={790} y={650} label="ПРИЛОЖЕНИЕ ВЛАДЕЛЬЦА" color={theme.success} opacity={enter} width={290} />
      <Tag x={790} y={470} label="СЕКРЕТ У ВЛАДЕЛЬЦА" value="ЗАКРЫТЫЙ КЛЮЧ" color={theme.warning} opacity={enter} width={290} active={impact > 0.35} />
      <MapPoint x={790} y={900} opacity={enter * (0.45 + 0.55 * impact)} />
      <StatusPill text="КЛЮЧ ОТКРЫЛ ОТЧЁТ · ТОЧКА ВИДНА" color={theme.success} opacity={enter * (0.55 + 0.45 * impact)} />
      <PulseRing x={790} y={900} triggerFrame={impactLocal} tone="success" size={220} />
    </>
  );
};

export { RotatingKeyLockVisual };

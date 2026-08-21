import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";

export type GpsRelativityPhase =
  | "orbit"
  | "speed"
  | "gravity"
  | "balance"
  | "factory"
  | "correction";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase: GpsRelativityPhase;
};

const W = layout.width;
const H = layout.height;
const CX = W / 2;
const CY = 760;
const SAFE_TOP = 180;
const SAFE_BOTTOM = 1450;

const MetricCard: React.FC<{
  x: number;
  y: number;
  width: number;
  label: string;
  value: string;
  color: string;
  opacity: number;
}> = ({ x, y, width, label, value, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: x - width / 2,
      top: y,
      width,
      minHeight: 126,
      boxSizing: "border-box",
      padding: "17px 18px",
      opacity,
      transform: `translateY(${(1 - opacity) * 24}px)`,
      border: `2px solid ${color}99`,
      borderRadius: 24,
      background: `${theme.panel}EE`,
      boxShadow: `0 16px 44px ${color}22`,
      textAlign: "center",
      fontFamily: theme.font,
    }}
  >
    <div style={{ color: theme.subtext, fontSize: 25, lineHeight: 1.1 }}>{label}</div>
    <div style={{ color, fontSize: 42, fontWeight: 800, lineHeight: 1.15, marginTop: 8 }}>{value}</div>
  </div>
);

const OrbitSystem: React.FC<{
  local: number;
  phase: GpsRelativityPhase;
  enter: number;
  pulse: number;
}> = ({ local, phase, enter, pulse }) => {
  const elliptical = phase === "correction";
  const rx = elliptical ? 380 : 350;
  const ry = elliptical ? 220 : 300;
  const angle = 0.55 + local * (phase === "speed" ? 0.035 : 0.018);
  const sx = CX + Math.cos(angle) * rx;
  const sy = CY + Math.sin(angle) * ry;
  const satelliteScale = 0.96 + 0.08 * Math.sin(local / 12);
  return (
    <>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: enter }}>
        <ellipse
          cx={CX}
          cy={CY}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={phase === "correction" ? theme.warning : theme.accent2}
          strokeWidth={4}
          strokeDasharray="18 16"
          opacity={0.82}
        />
        {phase === "balance" ? (
          <line x1={CX - 420} y1={CY + 245} x2={CX + 420} y2={CY + 245} stroke={theme.accent} strokeWidth={5} strokeDasharray="20 14" opacity={0.82} />
        ) : null}
      </svg>
      <div
        style={{
          position: "absolute",
          left: CX - 174,
          top: CY - 174,
          width: 348,
          height: 348,
          opacity: enter,
          transform: `scale(${1 + 0.025 * Math.sin(local / 18)})`,
          borderRadius: "50%",
          background: "radial-gradient(circle at 32% 27%, #77ddff 0%, #2675d8 42%, #153777 78%, #091a3e 100%)",
          border: `4px solid ${theme.accent}88`,
          boxShadow: `0 0 ${90 + 50 * pulse}px ${theme.accent}55, inset -28px -24px 54px #02061199`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <IconGlyph name="globe-2" size={150} color="#b9f4ff" strokeWidth={1.4} />
      </div>
      <div
        style={{
          position: "absolute",
          left: sx - 54,
          top: sy - 54,
          width: 108,
          height: 108,
          opacity: enter,
          transform: `scale(${satelliteScale})`,
          borderRadius: 24,
          background: "linear-gradient(145deg, #eff6ff, #9eb4df)",
          border: `3px solid ${theme.text}`,
          boxShadow: `0 0 ${40 + 80 * pulse}px ${theme.accent2}88`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <IconGlyph name="satellite" size={70} color="#18294c" strokeWidth={1.6} />
      </div>
      <div style={{ position: "absolute", left: sx - 80, top: sy + 66, width: 160, textAlign: "center", color: theme.text, fontFamily: theme.font, fontSize: 24, opacity: enter }}>
        спутник
      </div>
    </>
  );
};

const PhaseTitle: React.FC<{ phase: GpsRelativityPhase; opacity: number }> = ({ phase, opacity }) => {
  const titles: Record<GpsRelativityPhase, string> = {
    orbit: "Спутник и земные часы",
    speed: "Скорость замедляет время",
    gravity: "Слабая гравитация ускоряет время",
    balance: "Две поправки складываются",
    factory: "Поправка до запуска",
    correction: "Орбита не идеально круглая",
  };
  return (
    <div style={{ position: "absolute", top: SAFE_TOP + 26, left: 46, right: 46, textAlign: "center", opacity, color: theme.text, fontFamily: theme.font, fontSize: 49, fontWeight: 800, lineHeight: 1.08 }}>
      {titles[phase]}
    </div>
  );
};

export const GpsRelativity: React.FC<Props> = ({ local, fps, impactLocal, phase }) => {
  const enter = spring({ frame: local, fps, config: { damping: 16, mass: 0.75 } });
  const card = (delay: number) => spring({ frame: local - delay, fps, config: { damping: 15, mass: 0.7 } });
  const pulse = local >= impactLocal ? Math.exp(-(local - impactLocal) * 0.2) : 0;
  const phasePulse = phase === "gravity" ? theme.warning : phase === "factory" ? theme.success : theme.accent;
  const progress = interpolate(local, [0, Math.max(1, 260)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.38, background: "radial-gradient(ellipse 70% 48% at 50% 42%, #1c3b67 0%, transparent 72%)" }} />
      <PhaseTitle phase={phase} opacity={enter} />
      <OrbitSystem local={local} phase={phase} enter={enter} pulse={pulse} />
      {pulse > 0 ? <div style={{ position: "absolute", left: CX - 175 * (1 + 2 * (1 - pulse)), top: CY - 175 * (1 + 2 * (1 - pulse)), width: 350 * (1 + 2 * (1 - pulse)), height: 350 * (1 + 2 * (1 - pulse)), border: `4px solid ${phasePulse}`, borderRadius: "50%", opacity: pulse * 0.6 }} /> : null}

      {phase === "orbit" ? <MetricCard x={CX} y={SAFE_BOTTOM - 230} width={440} label="атомные часы" value="сверяем время" color={theme.accent} opacity={card(12)} /> : null}
      {phase === "speed" ? <MetricCard x={CX} y={SAFE_BOTTOM - 230} width={480} label="из-за скорости" value="−7 мкс / сутки" color={theme.accent2} opacity={card(12)} /> : null}
      {phase === "gravity" ? <MetricCard x={CX} y={SAFE_BOTTOM - 230} width={540} label="из-за гравитации" value="+45 мкс / сутки" color={theme.warning} opacity={card(12)} /> : null}
      {phase === "balance" ? (
        <>
          <MetricCard x={CX - 260} y={SAFE_BOTTOM - 240} width={300} label="итог" value="+38 мкс" color={theme.success} opacity={card(10)} />
          <MetricCard x={CX + 260} y={SAFE_BOTTOM - 240} width={380} label="путь света" value="≈11 км" color={theme.accent2} opacity={card(28)} />
        </>
      ) : null}
      {phase === "factory" ? (
        <>
          <MetricCard x={CX - 255} y={SAFE_BOTTOM - 240} width={350} label="номинал" value="10.23 MHz" color={theme.accent2} opacity={card(10)} />
          <div style={{ position: "absolute", left: CX - 28, top: SAFE_BOTTOM - 175, color: theme.success, fontSize: 58, fontWeight: 800, opacity: card(25) }}>→</div>
          <MetricCard x={CX + 285} y={SAFE_BOTTOM - 240} width={500} label="настраивают ниже" value="10.22999999543 MHz" color={theme.success} opacity={card(25)} />
        </>
      ) : null}
      {phase === "correction" ? <MetricCard x={CX} y={SAFE_BOTTOM - 230} width={600} label="приёмник считает" value="периодическую поправку" color={theme.warning} opacity={card(18)} /> : null}

      <div style={{ position: "absolute", left: 230, right: 230, top: SAFE_BOTTOM + 8, height: 8, borderRadius: 5, background: `${theme.panelBorder}AA`, overflow: "hidden" }}>
        <div style={{ width: `${progress * 100}%`, height: "100%", background: phasePulse, borderRadius: 5 }} />
      </div>
    </div>
  );
};

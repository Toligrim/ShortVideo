import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";

export type GpsPseudorangePhase =
  | "listening"
  | "signals"
  | "spheres"
  | "correction";

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

const SatelliteSignal: React.FC<{
  id: number;
  elevation: number;
  delay: number;
  distance: number;
  entered: number;
}> = ({ id, elevation, delay, distance, entered }) => {
  const sx = CX + Math.cos((elevation / 90) * Math.PI) * 300;
  const sy = CY - Math.sin((elevation / 90) * Math.PI) * 250;
  const d = delay > 0 ? Math.max(0, delay - 10) : 0;
  const progress = 1 - Math.exp(-d * 0.1);
  const dashArray = `${20 + d * 3} ${10 + d * 2}`;
  return (
    <g opacity={entered}>
      <line
        x1={CX}
        y1={CY}
        x2={sx}
        y2={sy}
        stroke={theme.accent2}
        strokeWidth={2}
        strokeDasharray={dashArray}
        opacity={0.5 * progress}
      />
      <circle cx={sx} cy={sy} r={18} fill={theme.accent2} stroke={theme.text} strokeWidth={1.5} opacity={entered * progress} />
      <text
        x={sx}
        y={sy - 30}
        textAnchor="middle"
        fill={theme.text}
        fontFamily={theme.font}
        fontSize={14}
      >
        Спутник {id}
      </text>
      <text
        x={sx}
        y={sy + 20}
        textAnchor="middle"
        fill={theme.subtext}
        fontFamily={theme.font}
        fontSize={10}
      >
        {distance.toFixed(0)} км
      </text>
    </g>
  );
};

const SphereIntersection: React.FC<{
  rx: number;
  ry: number;
  entered: number;
}> = ({ rx, ry, entered }) => (
  <g opacity={entered}>
    <circle
      cx={CX}
      cy={CY}
      r={ry}
      fill="none"
      stroke={theme.warning}
      strokeWidth={3}
      strokeDasharray="8 8"
      opacity={0.4 * entered}
    />
    <circle
      cx={CX - rx / 2}
      cy={CY}
      r={rx / 2}
      fill="none"
      stroke={theme.accent}
      strokeWidth={3}
      strokeDasharray="8 8"
      opacity={0.4 * entered}
    />
    <circle
      cx={CX + rx / 4}
      cy={CY - rx / 4}
      r={rx / 3}
      fill="none"
      stroke={theme.success}
      strokeWidth={3}
      strokeDasharray="8 8"
      opacity={0.4 * entered}
    />
    <circle
      cx={CX - rx / 4}
      cy={CY + rx / 4}
      r={rx / 3}
      fill="none"
      stroke={theme.accent2}
      strokeWidth={3}
      strokeDasharray="8 8"
      opacity={0.4 * entered}
    />
  </g>
);

const PhaseTitle: React.FC<{ phase: GpsPseudorangePhase; opacity: number }> = ({ phase, opacity }) => {
  const titles: Record<GpsPseudorangePhase, string> = {
    listening: "Пассивный GPS-приёмник",
    signals: "Четыре сигнала спутников",
    spheres: "Сферы пересекаются: позиция и часы",
    correction: "Поправка часов приёмника",
  };
  return (
    <div style={{ position: "absolute", top: SAFE_TOP + 26, left: 46, right: 46, textAlign: "center", opacity, color: theme.text, fontFamily: theme.font, fontSize: 49, fontWeight: 800, lineHeight: 1.08 }}>
      {titles[phase]}
    </div>
  );
};

export const GpsPseudorangeVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: GpsPseudorangePhase;
}> = ({ local, fps, impactLocal, phase = "listening" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 16, mass: 0.75 } });
  const phasePulse = phase === "correction" ? theme.warning : theme.accent;
  const progress = interpolate(local, [0, 300], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const card = (delayFrames: number) => spring({ frame: local - delayFrames, fps, config: { damping: 15, mass: 0.7 } });
  const delay = local % 100;
  const distance = Math.round(delay * 300000 / 1000); // c * delay, km

  const Satellites = [
    { id: 1, elevation: 80, label: "SV01" },
    { id: 2, elevation: 65, label: "SV02" },
    { id: 3, elevation: 45, label: "SV03" },
    { id: 4, elevation: 30, label: "SV04" },
  ];

  return (
    <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.38, background: "radial-gradient(ellipse 70% 48% at 50% 42%, #1c3b67 0%, transparent 72%)" }} />
      <PhaseTitle phase={phase} opacity={enter} />

      {phase === "listening" ? (
        <>
          <MetricCard
            x={CX}
            y={SAFE_BOTTOM - 230}
            width={440}
            label="пассивный слушатель"
            value="никого не передаёт"
            color={theme.accent}
            opacity={card(12)}
          />
          <div style={{ position: "absolute", left: 46, right: 46, top: SAFE_BOTTOM - 100, height: 80, textAlign: "center", color: theme.subtext, fontFamily: theme.font, fontSize: 28, opacity: enter }}>
            <p>GPS-приёмник только ловит сигналы</p>
            <p>со спутников — не передаёт ничего в космос</p>
            <p>постоянно: L1 ~ 1575.42 МГц</p>
          </div>
        </>
      ) : null}

      {phase === "signals" ? (
        <>
          <div style={{ position: "absolute", left: 46, right: 46, top: SAFE_TOP + 120, height: 300, textAlign: "center", color: theme.text, fontFamily: theme.font, fontSize: 28, opacity: enter }}>
            <p>Четыре спутника L1 — шлют метки времени</p>
            <p>приёмник считает задержку приёма минус время передачи</p>
          </div>
          <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
            {Satellites.map((s) => (
              <SatelliteSignal
                key={s.id}
                id={s.id}
                elevation={s.elevation}
                delay={delay}
                distance={distance}
                entered={enter}
              />
            ))}
          </svg>
          <div
            style={{
              position: "absolute",
              left: CX - 150,
              top: SAFE_BOTTOM - 200,
              width: 300,
              height: 80,
              background: `${theme.panel}CC`,
              border: `2px solid ${theme.accent}66`,
              borderRadius: 20,
              textAlign: "center",
              padding: "12px",
              fontFamily: theme.font,
              color: theme.accent,
              fontSize: 24,
              opacity: enter * 0.8,
            }}>
            дальность = c × задержка
          </div>
        </>
      ) : null}

      {phase === "spheres" ? (
        <>
          <div style={{ position: "absolute", left: 46, right: 46, top: SAFE_TOP + 120, height: 300, textAlign: "center", color: theme.text, fontFamily: theme.font, fontSize: 28, opacity: enter }}>
            <p>4 уравнения 4 неизвестных: x, y, z, смещение часов</p>
            <p>Каждый спутник даёт сферу: расстояние = c × задержка</p>
            <p>Пересечение 4 сфер даёт точную позицию</p>
          </div>
          <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
            <SphereIntersection rx={340} ry={300} entered={enter} />
          </svg>
          <div
            style={{
              position: "absolute",
              left: CX - 200,
              top: SAFE_BOTTOM - 200,
              width: 400,
              height: 80,
              background: `${theme.panel}CC`,
              border: `2px solid ${theme.warning}66`,
              borderRadius: 20,
              textAlign: "center",
              padding: "12px",
              fontFamily: theme.font,
              color: theme.warning,
              fontSize: 24,
              opacity: enter * 0.8,
            }}>
            4 сферы → 4 уравнения → x + y + z + смещение часов
          </div>
        </>
      ) : null}

      {phase === "correction" ? (
        <>
          <MetricCard
            x={CX}
            y={SAFE_BOTTOM - 230}
            width={500}
            label="поправка часов"
            value="− ошибка кварца · синхронизация"
            color={theme.warning}
            opacity={card(18)}
          />
          <div style={{ position: "absolute", left: 46, right: 46, top: SAFE_BOTTOM - 100, height: 80, textAlign: "center", color: theme.subtext, fontFamily: theme.font, fontSize: 28, opacity: enter }}>
            <p>4-й спутник снимает ошибку кварцевого</p>
            <p>часа в приёмнике — подстраивает время</p>
            <p>без атомных часов — бесплатно</p>
          </div>
        </>
      ) : null}

      <div style={{ position: "absolute", left: 230, right: 230, top: SAFE_BOTTOM + 8, height: 8, borderRadius: 5, background: `${theme.panelBorder}AA`, overflow: "hidden" }}>
        <div style={{ width: `${progress * 100}%`, height: "100%", background: phasePulse, borderRadius: 5 }} />
      </div>
    </div>
  );
};

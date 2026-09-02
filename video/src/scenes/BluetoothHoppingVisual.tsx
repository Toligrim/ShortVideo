import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type BluetoothHoppingPhase =
  | "crowd"
  | "collision"
  | "sync"
  | "hopping"
  | "hopping-collision"
  | "exclude";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: BluetoothHoppingPhase;
}

const W = layout.width;
const CX = W / 2;
const laneTop = 470;
const laneGap = 72;
const laneLeft = 105;
const laneWidth = 870;
const laneRight = laneLeft + laneWidth;
const laneY = (index: number) => laneTop + index * laneGap;
const routeX = [245, 365, 485, 605, 725, 845, 935];
const route = [0, 3, 1, 5, 2, 6, 4];
const noisyLane = 3;

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

const phaseTitle: Record<BluetoothHoppingPhase, string> = {
  crowd: "ТОЛПА · МНОГО РАДИОПАР",
  collision: "БЕЗ ПРЫЖКОВ · ОДНА ЛИНИЯ",
  sync: "ПОДКЛЮЧЁННАЯ ПАРА · ОБЩИЙ ПОРЯДОК",
  hopping: "СИНХРОННЫЙ ПРЫЖОК · ОБА ВМЕСТЕ",
  "hopping-collision": "ПРЫЖКИ · СТОЛКНОВЕНИЯ ВОЗМОЖНЫ",
  exclude: "ПЕРЕСТРОЙКА · ШУМНЫЙ КАНАЛ ВЫЧЁРКНУТ",
};

const phaseColor: Record<BluetoothHoppingPhase, string> = {
  crowd: theme.accent,
  collision: theme.danger,
  sync: theme.accent2,
  hopping: theme.accent,
  "hopping-collision": theme.warning,
  exclude: theme.success,
};

const phaseIcon: Record<BluetoothHoppingPhase, string> = {
  crowd: "users",
  collision: "x-circle",
  sync: "link",
  hopping: "shuffle",
  "hopping-collision": "triangle-alert",
  exclude: "list-x",
};

const Header: React.FC<{
  phase: BluetoothHoppingPhase;
  opacity: number;
}> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 245,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: phaseColor[phase],
      opacity,
      whiteSpace: "nowrap",
      fontFamily: theme.mono,
      fontSize: 23,
      letterSpacing: 2,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={29} color={phaseColor[phase]} strokeWidth={1.8} />
    {phaseTitle[phase]}
  </div>
);

const StatusPill: React.FC<{
  text: string;
  color: string;
  y?: number;
  opacity?: number;
  scale?: number;
}> = ({ text, color, y = 1165, opacity = 1, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: y,
      transform: `translateX(-50%) scale(${scale})`,
      padding: "14px 26px",
      borderRadius: 999,
      background: `${color}18`,
      border: `3px solid ${color}99`,
      color,
      opacity,
      boxShadow: `0 0 32px ${color}2E`,
      whiteSpace: "nowrap",
      ...mono,
      fontSize: 25,
    }}
  >
    {text}
  </div>
);

const DeviceToken: React.FC<{
  x: number;
  y: number;
  kind: "phone" | "buds";
  color: string;
  opacity: number;
  scale?: number;
}> = ({ x, y, kind, color, opacity, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: 142,
      height: 78,
      transform: `translate(-50%, -50%) scale(${scale})`,
      borderRadius: 18,
      background: `${theme.panel}F5`,
      border: `3px solid ${color}AA`,
      boxShadow: `0 0 26px ${color}33`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      color: theme.text,
      opacity,
    }}
  >
    <IconGlyph name={kind === "phone" ? "smartphone" : "headphones"} size={31} color={color} strokeWidth={1.8} />
    <span style={{ ...mono, fontSize: 15, letterSpacing: 0 }}>{kind === "phone" ? "ТЕЛЕФОН" : "НАУШНИКИ"}</span>
  </div>
);

const routePoint = (sequence: number[], progress: number) => {
  const bounded = Math.min(sequence.length - 1, Math.max(0, progress));
  const index = Math.floor(bounded);
  const next = Math.min(sequence.length - 1, index + 1);
  const fraction = smooth(bounded - index);
  return {
    x: interpolate(fraction, [0, 1], [routeX[index], routeX[next]]),
    y: interpolate(fraction, [0, 1], [laneY(sequence[index]), laneY(sequence[next])]),
  };
};

const ChannelBoard: React.FC<{
  sequence: number[];
  progress: number;
  enter: number;
  color: string;
  noisy?: boolean;
}> = ({ sequence, progress, enter, color, noisy = false }) => {
  const current = routePoint(sequence, progress);
  const currentLane = Math.round(current.y - laneTop) / laneGap;
  const points = sequence.map((lane, i) => `${routeX[i]},${laneY(lane)}`).join(" ");
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: laneLeft,
          top: laneTop - 35,
          width: laneWidth,
          height: laneGap * 6 + 70,
          borderRadius: 26,
          background: `${theme.panel}B8`,
          border: `2px solid ${color}44`,
          boxShadow: `0 0 42px ${color}18`,
          opacity: enter,
        }}
      />
      {Array.from({ length: 7 }).map((_, i) => {
        const isNoisy = noisy && i === noisyLane;
        const isCurrent = Math.abs(i - currentLane) < 0.45 && !isNoisy;
        const rowColor = isNoisy ? theme.danger : isCurrent ? color : theme.subtext;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: laneLeft + 22,
              top: laneY(i) - 26,
              width: laneWidth - 44,
              height: 52,
              borderRadius: 14,
              background: `${rowColor}${isCurrent || isNoisy ? "20" : "0B"}`,
              border: `2px solid ${rowColor}${isCurrent || isNoisy ? "AA" : "44"}`,
              opacity: enter,
              display: "flex",
              alignItems: "center",
            }}
          >
            <span style={{ ...mono, marginLeft: 18, fontSize: 16, color: rowColor, width: 86 }}>
              КАНАЛ {String(i + 1).padStart(2, "0")}
            </span>
            <div
              style={{
                position: "absolute",
                left: 112,
                right: 20,
                top: 23,
                height: 3,
                background: isNoisy ? `${theme.danger}66` : `${rowColor}55`,
                borderRadius: 3,
              }}
            />
            {isNoisy ? (
              <>
                <IconGlyph name="radio" size={24} color={theme.danger} strokeWidth={1.8} />
                <span style={{ ...mono, marginLeft: 8, fontSize: 15, color: theme.danger }}>ШУМ</span>
                <div style={{ position: "absolute", right: 28, top: 11 }}>
                  <IconGlyph name="x" size={30} color={theme.danger} strokeWidth={3} />
                </div>
              </>
            ) : null}
          </div>
        );
      })}
      <svg
        width={W}
        height={layout.safeBottom}
        viewBox={`0 0 ${W} ${layout.safeBottom}`}
        style={{ position: "absolute", inset: 0, overflow: "visible", opacity: enter }}
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeDasharray="12 10"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.72}
        />
        {sequence.map((lane, i) => (
          <circle key={`${lane}-${i}`} cx={routeX[i]} cy={laneY(lane)} r={i === Math.round(progress) ? 14 : 8} fill={color} opacity={i <= progress + 0.15 ? 0.95 : 0.38} />
        ))}
        <line x1={current.x - 64} y1={current.y} x2={current.x + 64} y2={current.y} stroke={color} strokeWidth={4} opacity={0.8} />
      </svg>
    </>
  );
};

const PairOnRoute: React.FC<{
  sequence: number[];
  progress: number;
  color: string;
  opacity: number;
  scale?: number;
}> = ({ sequence, progress, color, opacity, scale = 1 }) => {
  const point = routePoint(sequence, progress);
  return (
    <>
      <DeviceToken x={point.x - 84} y={point.y} kind="phone" color={color} opacity={opacity} scale={scale} />
      <DeviceToken x={point.x + 84} y={point.y} kind="buds" color={color} opacity={opacity} scale={scale} />
      <div
        style={{
          position: "absolute",
          left: point.x - 18,
          top: point.y - 2,
          width: 36,
          height: 4,
          borderRadius: 4,
          background: color,
          boxShadow: `0 0 18px ${color}`,
          opacity,
        }}
      />
    </>
  );
};

const CrowdPhase: React.FC<{ enter: number }> = ({ enter }) => {
  const devices = [
    { x: 170, y: 505, icon: "smartphone", tone: theme.accent2 },
    { x: 905, y: 500, icon: "radio", tone: theme.subtext },
    { x: 150, y: 920, icon: "headphones", tone: theme.subtext },
    { x: 930, y: 930, icon: "smartphone", tone: theme.accent2 },
    { x: 300, y: 380, icon: "radio", tone: theme.subtext },
    { x: 790, y: 385, icon: "headphones", tone: theme.accent2 },
  ];
  return (
    <>
      {devices.map((device, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: device.x,
            top: device.y,
            width: 112,
            height: 112,
            transform: "translate(-50%, -50%)",
            borderRadius: 24,
            background: `${theme.panel}D9`,
            border: `2px solid ${device.tone}55`,
            boxShadow: `0 0 24px ${device.tone}1A`,
            opacity: enter * 0.85,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconGlyph name={device.icon} size={43} color={device.tone} strokeWidth={1.7} />
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          left: CX,
          top: 665,
          width: 430,
          height: 250,
          transform: "translateX(-50%)",
          borderRadius: 30,
          background: `${theme.panel}F7`,
          border: `4px solid ${theme.accent}AA`,
          boxShadow: `0 0 48px ${theme.accent}33`,
          opacity: enter,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          <IconGlyph name="smartphone" size={68} color={theme.accent} strokeWidth={1.7} />
          <div style={{ width: 58, height: 4, borderRadius: 4, background: theme.accent, boxShadow: `0 0 18px ${theme.accent}` }} />
          <IconGlyph name="headphones" size={68} color={theme.accent} strokeWidth={1.7} />
        </div>
        <div style={{ ...mono, color: theme.text, fontSize: 26 }}>ТВОЯ ПАРА</div>
        <div style={{ ...mono, color: theme.success, fontSize: 22 }}>СВОЯ МУЗЫКА</div>
      </div>
      <StatusPill text="МНОГО УСТРОЙСТВ · ПАРА НЕ ТЕРЯЕТСЯ" color={theme.accent} opacity={enter} />
    </>
  );
};

const CollisionPhase: React.FC<{
  local: number;
  impactLocal: number;
  enter: number;
  pop: number;
}> = ({ local, impactLocal, enter, pop }) => {
  const converge = smooth(clamp01((local - impactLocal + 12) / 22));
  const transmitters = [
    { x: 155, icon: "smartphone", label: "ТЕЛЕФОН", color: theme.accent },
    { x: 320, icon: "radio", label: "СОСЕД", color: theme.accent2 },
    { x: 500, icon: "headphones", label: "НАУШНИКИ", color: theme.accent },
    { x: 680, icon: "radio", label: "СОСЕД", color: theme.accent2 },
    { x: 925, icon: "radio", label: "СОСЕД", color: theme.accent2 },
  ];
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 435,
          width: 880,
          height: 610,
          borderRadius: 28,
          background: `${theme.panel}E8`,
          border: `3px solid ${theme.danger}66`,
          boxShadow: `0 0 46px ${theme.danger}22`,
          opacity: enter,
        }}
      />
      <div style={{ position: "absolute", left: CX, top: 505, transform: "translateX(-50%)", ...mono, color: theme.danger, fontSize: 27, opacity: enter }}>
        ВСЕ ПЕРЕДАТЧИКИ · ОДНА ЛИНИЯ
      </div>
      <div
        style={{
          position: "absolute",
          left: 170,
          right: 170,
          top: 735,
          height: 6,
          borderRadius: 6,
          background: theme.danger,
          boxShadow: `0 0 24px ${theme.danger}88`,
          opacity: enter,
        }}
      />
      {transmitters.map((item) => {
        const x = interpolate(converge, [0, 1], [item.x, CX]);
        return (
          <div key={`${item.x}-${item.label}`} style={{ position: "absolute", left: x, top: 735, transform: "translate(-50%, -50%)", opacity: enter }}>
            <div
              style={{
                width: 126,
                height: 116,
                borderRadius: 20,
                background: `${theme.panel}F8`,
                border: `3px solid ${item.color}99`,
                boxShadow: `0 0 25px ${item.color}33`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <IconGlyph name={item.icon} size={38} color={item.color} strokeWidth={1.7} />
              <span style={{ ...mono, fontSize: 13, letterSpacing: 0, color: theme.text }}>{item.label}</span>
            </div>
          </div>
        );
      })}
      {pop > 0 ? (
        <>
          <div style={{ position: "absolute", left: CX - 46, top: 671, width: 92, height: 10, borderRadius: 10, background: theme.danger, opacity: pop, transform: `rotate(45deg) scale(${0.7 + 0.3 * pop})`, boxShadow: `0 0 22px ${theme.danger}` }} />
          <div style={{ position: "absolute", left: CX - 46, top: 671, width: 92, height: 10, borderRadius: 10, background: theme.danger, opacity: pop, transform: `rotate(-45deg) scale(${0.7 + 0.3 * pop})`, boxShadow: `0 0 22px ${theme.danger}` }} />
          <div style={{ position: "absolute", left: CX, top: 870, transform: "translateX(-50%)", display: "flex", gap: 18, opacity: pop }}>
            {["DATA", "DATA", "DATA"].map((label, i) => (
              <div key={i} style={{ padding: "9px 16px", borderRadius: 12, border: `2px solid ${theme.danger}99`, color: theme.danger, background: `${theme.danger}15`, ...mono, fontSize: 17, transform: `translateY(${(i % 2) * 12}px) rotate(${i === 1 ? 0 : i === 0 ? -6 : 6}deg)` }}>
                {label}
              </div>
            ))}
          </div>
        </>
      ) : null}
      <StatusPill
        text={pop > 0.15 ? "ДАННЫЕ ПОТЕРЯНЫ · МУЗЫКА ЗАИКАЕТСЯ" : "СИГНАЛЫ СХОДЯТСЯ В ОДНОЙ ЛИНИИ"}
        color={theme.danger}
        opacity={enter}
        scale={0.96 + pop * 0.04}
      />
      {pop > 0.15 ? <PulseRing x={CX} y={735} triggerFrame={impactLocal} tone="danger" size={280} /> : null}
    </>
  );
};

const RoutedPhase: React.FC<{
  local: number;
  impactLocal: number;
  enter: number;
  pop: number;
  phase: "sync" | "hopping" | "hopping-collision" | "exclude";
}> = ({ local, impactLocal, enter, pop, phase }) => {
  const usedRoute = phase === "exclude" ? route.filter((lane) => lane !== noisyLane) : route;
  const speed = phase === "sync" ? 0 : phase === "exclude" ? 14 : phase === "hopping-collision" ? 15 : 12;
  const progress = phase === "sync" ? 0 : Math.min(usedRoute.length - 1, Math.max(0, (local - 8) / speed));
  const color = phaseColor[phase];
  const point = routePoint(usedRoute, progress);
  const collisionIndex = route.indexOf(noisyLane);
  const collisionPoint = { x: routeX[collisionIndex], y: laneY(noisyLane) };
  const collisionApproach = interpolate(pop, [0, 1], [collisionPoint.x + 160, collisionPoint.x]);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: CX,
          top: 350,
          transform: "translateX(-50%)",
          padding: "9px 18px",
          borderRadius: 999,
          background: `${color}12`,
          border: `2px solid ${color}66`,
          color: phase === "exclude" ? theme.text : color,
          opacity: enter,
          ...mono,
          fontSize: 20,
          whiteSpace: "nowrap",
        }}
      >
        {phase === "exclude" ? "КОНТРОЛЛЕР ПРОВЕРЯЕТ КАЧЕСТВО" : "ОБЩИЙ ПОРЯДОК · 01 → 04 → 02 → 06 → 03 → 07 → 05"}
      </div>
      <ChannelBoard sequence={usedRoute} progress={progress} enter={enter} color={color} noisy={phase === "exclude"} />
      <PairOnRoute sequence={usedRoute} progress={progress} color={color} opacity={enter} scale={phase === "sync" ? 0.95 : 1} />
      {phase === "hopping-collision" ? (
        <>
          <div
            style={{
              position: "absolute",
              left: collisionApproach,
              top: collisionPoint.y,
              transform: "translate(-50%, -50%)",
              padding: "9px 14px",
              borderRadius: 14,
              background: `${theme.danger}24`,
              border: `3px solid ${theme.danger}`,
              color: theme.danger,
              opacity: enter * (0.4 + 0.6 * pop),
              ...mono,
              fontSize: 15,
              whiteSpace: "nowrap",
              boxShadow: `0 0 22px ${theme.danger}55`,
            }}
          >
            СОСЕДНИЙ СИГНАЛ
          </div>
          {pop > 0.35 ? (
            <>
              <div style={{ position: "absolute", left: collisionPoint.x - 32, top: collisionPoint.y - 7, width: 64, height: 9, borderRadius: 9, background: theme.danger, opacity: pop, transform: "rotate(45deg)" }} />
              <div style={{ position: "absolute", left: collisionPoint.x - 32, top: collisionPoint.y - 7, width: 64, height: 9, borderRadius: 9, background: theme.danger, opacity: pop, transform: "rotate(-45deg)" }} />
              <PulseRing x={collisionPoint.x} y={collisionPoint.y} triggerFrame={impactLocal} tone="danger" size={190} />
            </>
          ) : null}
        </>
      ) : null}
      {phase === "exclude" ? (
        <StatusPill text="ШУМНЫЙ КАНАЛ ВЫЧЁРКНУТ · ОСТАЛЬНЫЕ ПРОДОЛЖАЮТ" color={theme.success} opacity={enter} scale={0.96 + pop * 0.04} />
      ) : (
        <StatusPill
          text={phase === "sync" ? "ДВА УСТРОЙСТВА · ОДИН МАРШРУТ" : phase === "hopping-collision" ? "ПРЫЖКИ ЕСТЬ · СТОЛКНОВЛЕНИЯ ВОЗМОЖНЫ" : "ТЕЛЕФОН И НАУШНИКИ ПРЫГАЮТ ВМЕСТЕ"}
          color={color}
          opacity={enter}
          scale={0.96 + (phase === "hopping-collision" ? pop * 0.04 : 0)}
        />
      )}
      {phase === "hopping" && point.y !== laneY(usedRoute[usedRoute.length - 1]) ? <PulseRing x={point.x} y={point.y} triggerFrame={impactLocal} tone="accent" size={170} /> : null}
    </>
  );
};

/** Bluetooth: толпа, синхронные прыжки пары по каналам и исключение шумного канала. */
export const BluetoothHoppingVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "hopping",
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;

  return (
    <>
      <Header phase={phase} opacity={enter} />
      {phase === "crowd" ? <CrowdPhase enter={enter} /> : null}
      {phase === "collision" ? <CollisionPhase local={local} impactLocal={impactLocal} enter={enter} pop={pop} /> : null}
      {phase === "sync" || phase === "hopping" || phase === "hopping-collision" || phase === "exclude" ? (
        <RoutedPhase local={local} impactLocal={impactLocal} enter={enter} pop={pop} phase={phase} />
      ) : null}
    </>
  );
};

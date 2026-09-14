import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";
import { MotionGroup, useMotion } from "../lib/motion/MotionStage";

export type DirectWifiTransferPhase = "channel" | "stream" | "contrast" | "handoff";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: DirectWifiTransferPhase;
}

const W = layout.width;
const CX = W / 2;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1.3 };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const Header: React.FC<{ text: string; icon: string; color: string; opacity: number }> = ({ text, icon, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 225,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color,
      opacity,
      whiteSpace: "nowrap",
      fontSize: 24,
      ...mono,
    }}
  >
    <IconGlyph name={icon} size={31} color={color} strokeWidth={1.8} />
    <span>{text}</span>
  </div>
);

const DeviceCard: React.FC<{
  left: number;
  color: string;
  label: string;
  sub: string;
  opacity: number;
}> = ({ left, color, label, sub, opacity }) => (
  <div
    style={{
      position: "absolute",
      left,
      top: 500,
      width: 300,
      height: 265,
      borderRadius: 28,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}99`,
      boxShadow: `0 0 38px ${color}22`,
      opacity,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
    }}
  >
    <IconGlyph name="smartphone" size={78} color={color} strokeWidth={1.8} />
    <div style={{ color: theme.text, fontSize: 28, fontWeight: 800 }}>{label}</div>
    <div style={{ color, fontSize: 18, ...mono }}>{sub}</div>
  </div>
);

const StatusPill: React.FC<{ text: string; color: string; opacity: number }> = ({ text, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 1205,
      transform: "translateX(-50%)",
      padding: "13px 28px",
      borderRadius: 999,
      background: `${color}18`,
      border: `2px solid ${color}99`,
      color,
      opacity,
      whiteSpace: "nowrap",
      fontSize: 23,
      ...mono,
    }}
  >
    {text}
  </div>
);

const DirectPath: React.FC<{ opacity: number; color?: string; thick?: boolean; label: string }> = ({
  opacity,
  color = theme.accent,
  thick = false,
  label,
}) => (
  <>
    <svg width={W} height={layout.safeBottom} viewBox={`0 0 ${W} ${layout.safeBottom}`} style={{ position: "absolute", inset: 0, opacity }}>
      <path
        d="M 375 700 C 475 590, 605 590, 705 700"
        fill="none"
        stroke={`${color}33`}
        strokeWidth={thick ? 34 : 22}
        strokeLinecap="round"
      />
      <path
        d="M 375 700 C 475 590, 605 590, 705 700"
        fill="none"
        stroke={color}
        strokeWidth={thick ? 10 : 6}
        strokeDasharray={thick ? "1 28" : "16 18"}
        strokeLinecap="round"
      />
      <path d="M 666 683 L 705 700 L 666 717" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <div style={{ position: "absolute", left: CX, top: 565, transform: "translateX(-50%)", color, fontSize: 19, ...mono }}>
      {label}
    </div>
  </>
);

const ByteChip: React.FC<{ x: number; y: number; label: string; color: string; opacity: number; size?: number }> = ({
  x,
  y,
  label,
  color,
  opacity,
  size = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: `translate(-50%, -50%) scale(${size})`,
      minWidth: 74,
      height: 38,
      padding: "0 12px",
      borderRadius: 10,
      background: `${color}22`,
      border: `2px solid ${color}`,
      color,
      opacity,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 16,
      whiteSpace: "nowrap",
      boxSizing: "border-box",
      ...mono,
    }}
  >
    <IconGlyph name="file" size={20} color={color} strokeWidth={2} />
    <span style={{ marginLeft: 7 }}>{label}</span>
  </div>
);

const pathPoint = (progress: number) => ({
  x: interpolate(progress, [0, 1], [385, 695]),
  y: 700 - Math.sin(progress * Math.PI) * 110,
});

const Payload: React.FC<{
  local: number;
  phase: DirectWifiTransferPhase;
  opacity: number;
}> = ({ local, phase, opacity }) => {
  const motion = useMotion();
  const duration = Math.max(motion.end - motion.start - 1, 1);
  const flowStart = motion.cue("flow") - motion.start;
  const run = smooth((local - flowStart) / duration);
  const count = phase === "channel" ? 3 : phase === "stream" || phase === "handoff" ? 16 : 14;
  const spacing = phase === "channel" ? 0.11 : 0.065;
  return (
    <MotionGroup
      id="payload"
      index={2}
      action={{ preset: "transfer", cue: "flow", to: { x: 120, y: 0 } }}
    >
      <div style={{ position: "absolute", inset: 0, opacity }}>
        {Array.from({ length: count }).map((_, index) => {
          const p = clamp01(run * 1.08 + index * spacing);
          const point = pathPoint(p);
          const isStream = count > 3;
          return (
            <ByteChip
              key={index}
              x={point.x}
              y={point.y + (isStream ? Math.sin(index * 2.4) * 18 : 0)}
              label={isStream ? "ФИЛЬМ" : "БАЙТ"}
              color={phase === "handoff" ? theme.success : theme.accent}
              opacity={opacity * (0.45 + 0.55 * clamp01(run * 3 + index / count))}
              size={isStream ? 0.72 : 0.84}
            />
          );
        })}
      </div>
    </MotionGroup>
  );
};

const BluetoothService: React.FC<{ local: number; opacity: number; muted?: boolean }> = ({ local, opacity, muted = false }) => {
  const motion = useMotion();
  const p = smooth(clamp01((local - (motion.cue("service") - motion.start)) / 24));
  return (
    <MotionGroup id="service" index={3}>
      <div style={{ position: "absolute", inset: 0, opacity: opacity * (muted ? 0.5 : 1) }}>
        <div style={{ position: "absolute", left: 350, top: 430, width: 380, borderTop: `3px dashed ${theme.accent2}99` }} />
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              left: 380 + ((local * 4 + index * 112) % 310),
              top: 430,
              width: 14,
              height: 14,
              borderRadius: "50%",
              transform: `translateY(${Math.sin((local + index * 9) / 8) * 5}px) scale(${1 + p * 0.12})`,
              background: theme.accent2,
              boxShadow: `0 0 18px ${theme.accent2}`,
            }}
          />
        ))}
        <div style={{ position: "absolute", left: CX, top: 392, transform: "translateX(-50%)", color: theme.accent2, fontSize: 18, ...mono }}>
          BT · СЛУЖЕБНО
        </div>
      </div>
    </MotionGroup>
  );
};

const RouterExclusion: React.FC<{ opacity: number }> = ({ opacity }) => (
  <MotionGroup id="service" index={3}>
    <div
      style={{
        position: "absolute",
        left: 415,
        top: 930,
        width: 250,
        height: 160,
        borderRadius: 22,
        border: `2px dashed ${theme.danger}77`,
        background: `${theme.panel}B8`,
        opacity,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <IconGlyph name="router" size={52} color={theme.danger} strokeWidth={1.8} />
      <div style={{ ...mono, color: theme.danger, fontSize: 18, lineHeight: 1.45 }}>
        РОУТЕР
        <br />
        НЕ В ПУТИ
      </div>
      <div style={{ position: "absolute", left: 35, top: 77, width: 180, height: 6, borderRadius: 6, background: theme.danger, transform: "rotate(-24deg)" }} />
    </div>
  </MotionGroup>
);

const DevicePair: React.FC<{ opacity: number }> = ({ opacity }) => (
  <>
    <MotionGroup id="sender" index={0}>
      <DeviceCard left={75} color={theme.accent} label="ТЕЛЕФОН A" sub="ОТПРАВИТЕЛЬ" opacity={opacity} />
    </MotionGroup>
    <MotionGroup id="receiver" index={1}>
      <DeviceCard left={705} color={theme.accent2} label="ТЕЛЕФОН B" sub="ПОЛУЧАТЕЛЬ" opacity={opacity} />
    </MotionGroup>
  </>
);

/** Direct device-to-device Wi-Fi with a small service lane and a large payload lane. */
export const DirectWifiTransferVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "channel" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pulse = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  const baseOpacity = enter;

  if (phase === "contrast") {
    return (
      <>
        <Header text="ДВЕ РАДИОРОЛИ · НЕ ОДИН КАНАЛ" icon="split" color={theme.accent} opacity={enter} />
        <DevicePair opacity={baseOpacity} />
        <BluetoothService local={local} opacity={baseOpacity} />
        <DirectPath opacity={baseOpacity} thick label="WI-FI · БОЛЬШОЙ ПОТОК" />
        <Payload local={local} phase={phase} opacity={baseOpacity} />
        <StatusPill text="BT · СЛУЖБА / WI-FI · ФИЛЬМ" color={theme.success} opacity={enter} />
        <PulseRing x={CX} y={700} triggerFrame={impactLocal} tone="success" size={260} />
      </>
    );
  }

  if (phase === "handoff") {
    return (
      <>
        <Header text="РОЛИ ПЕРЕКЛЮЧИЛИСЬ" icon="arrow-right-left" color={theme.success} opacity={enter} />
        <DevicePair opacity={baseOpacity} />
        <BluetoothService local={local} opacity={baseOpacity} muted />
        <DirectPath opacity={baseOpacity} thick color={theme.success} label="WI-FI · БАЙТЫ ФИЛЬМА" />
        <Payload local={local} phase={phase} opacity={baseOpacity} />
        <StatusPill text="BT ↓ · WI-FI ↑" color={theme.success} opacity={enter} />
        <PulseRing x={CX} y={700} triggerFrame={impactLocal} tone="success" size={300} />
      </>
    );
  }

  const stream = phase === "stream";
  return (
    <>
      <Header text={stream ? "ПРЯМОЙ КАНАЛ · БОЛЬШОЙ ПОТОК" : "ПРЯМОЙ WI-FI-КАНАЛ"} icon="wifi" color={theme.accent} opacity={enter} />
      <DevicePair opacity={baseOpacity} />
      <DirectPath opacity={baseOpacity} thick={stream} label={stream ? "УСТРОЙСТВО ↔ УСТРОЙСТВО" : "P2P · НАПРЯМУЮ"} />
      <Payload local={local} phase={phase} opacity={baseOpacity} />
      <RouterExclusion opacity={baseOpacity * (stream ? 1 : 0.8)} />
      <StatusPill text={stream ? "WI-FI · ФИЛЬМ" : "P2P · ГОТОВ"} color={stream ? theme.success : theme.accent} opacity={enter} />
      <PulseRing x={CX} y={700} triggerFrame={impactLocal} tone={stream ? "success" : "accent"} size={stream ? 300 : 230} />
      {hit ? <div style={{ position: "absolute", left: CX, top: 875, transform: `translateX(-50%) scale(${0.96 + pulse * 0.04})`, color: theme.success, fontSize: 20, ...mono }}>ПРЯМОЙ МАРШРУТ ПОДТВЕРЖДЁН</div> : null}
    </>
  );
};

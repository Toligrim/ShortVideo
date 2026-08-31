import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
}

const W = layout.width;
const CX = W / 2;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };

const MetricCard: React.FC<{
  left: number;
  top: number;
  tone: string;
  title: string;
  children: React.ReactNode;
}> = ({ left, top, tone, title, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width: 410,
      height: 660,
      borderRadius: 28,
      background: `${theme.panel}EE`,
      border: `3px solid ${tone}88`,
      boxShadow: `0 0 34px ${tone}18`,
    }}
  >
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 36,
        width: "100%",
        textAlign: "center",
        color: tone,
        fontSize: 27,
        ...mono,
      }}
    >
      {title}
    </div>
    {children}
  </div>
);

const Badge: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 1220,
      transform: "translateX(-50%)",
      padding: "15px 32px",
      borderRadius: 999,
      background: `${theme.warning}18`,
      border: `2px solid ${theme.warning}`,
      color: theme.warning,
      fontSize: 24,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    СИЛЬНЫЙ СИГНАЛ · ЭФИР ЗАНЯТ
  </div>
);

/** Диагностика Wi‑Fi: сила сигнала и занятость общего эфира — разные метрики. */
export const WifiSignalVsAirtimeVisual: React.FC<Props> = ({ local, fps, impactLocal }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = smooth(local / Math.max(impactLocal, 1));
  const after = local >= impactLocal
    ? spring({ frame: local - impactLocal, fps, config: { damping: 13, mass: 0.7 } })
    : 0;
  const signalRise = interpolate(reveal, [0, 1], [0.45, 1]);
  const busyPercent = Math.round(interpolate(reveal, [0, 1], [38, 84]));
  const barHeights = [28, 46, 64, 82, 100];
  const slotCount = 12;
  const busySlots = 10;

  return (
    <div style={{ position: "absolute", inset: 0, opacity: enter }}>
      <div
        style={{
          position: "absolute",
          left: CX,
          top: 245,
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
        <IconGlyph name="gauge" size={30} color={theme.accent} strokeWidth={1.8} />
        <span>ДВА РАЗНЫХ ПОКАЗАТЕЛЯ</span>
      </div>

      <MetricCard left={95} top={420} tone={theme.accent} title="СИГНАЛ">
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 100,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
          }}
        >
          <IconGlyph name="router" size={58} color={theme.accent} strokeWidth={1.8} />
          <IconGlyph name="arrow-right" size={30} color={theme.subtext} strokeWidth={1.8} />
          <IconGlyph name="smartphone" size={58} color={theme.accent} strokeWidth={1.8} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 178,
            width: "100%",
            textAlign: "center",
            color: theme.subtext,
            fontSize: 18,
            ...mono,
          }}
        >
          RSSI · ГРОМКОСТЬ СВЯЗИ
        </div>
        <div
          style={{
            position: "absolute",
            left: 54,
            top: 250,
            width: 302,
            height: 118,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: 13,
            borderBottom: `3px solid ${theme.panelBorder}`,
          }}
        >
          {barHeights.map((height, index) => (
            <div
              key={height}
              style={{
                width: 28,
                height: height * signalRise,
                borderRadius: "7px 7px 0 0",
                background: theme.success,
                boxShadow: `0 0 18px ${theme.success}66`,
                opacity: 0.78 + index * 0.05,
              }}
            />
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 405,
            width: "100%",
            textAlign: "center",
            color: theme.success,
            fontSize: 31,
            ...mono,
          }}
        >
          −45 dBm
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 478,
            width: "100%",
            textAlign: "center",
            color: theme.subtext,
            fontSize: 19,
            ...mono,
          }}
        >
          РОУТЕР СЛЫШЕН ТЕЛЕФОНУ
        </div>
      </MetricCard>

      <MetricCard left={575} top={420} tone={theme.warning} title="ЭФИР">
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 100,
            width: "100%",
            textAlign: "center",
          }}
        >
          <IconGlyph name="radio" size={66} color={theme.warning} strokeWidth={1.8} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 178,
            width: "100%",
            textAlign: "center",
            color: theme.subtext,
            fontSize: 18,
            ...mono,
          }}
        >
          ОБЩИЙ КАНАЛ · СЛОТЫ
        </div>
        <div
          style={{
            position: "absolute",
            left: 46,
            top: 260,
            width: 318,
            height: 112,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            borderBottom: `3px solid ${theme.panelBorder}`,
          }}
        >
          {Array.from({ length: slotCount }).map((_, index) => {
            const occupied = index < busySlots;
            const slotReveal = occupied ? clamp01((reveal * 1.3 - index / busySlots) * 3) : 0;
            const color = occupied ? theme.warning : theme.panelBorder;
            return (
              <div
                key={index}
                style={{
                  width: 20,
                  height: occupied ? 66 : 30,
                  borderRadius: 5,
                  background: color,
                  opacity: occupied ? 0.35 + 0.65 * slotReveal : 0.65,
                  boxShadow: occupied ? `0 0 15px ${color}66` : undefined,
                }}
              />
            );
          })}
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 405,
            width: "100%",
            textAlign: "center",
            color: theme.warning,
            fontSize: 31,
            ...mono,
          }}
        >
          ЗАНЯТО {busyPercent}%
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 478,
            width: "100%",
            textAlign: "center",
            color: theme.subtext,
            fontSize: 19,
            ...mono,
          }}
        >
          СОСЕДИ ГОВОРЯТ
        </div>
      </MetricCard>

      <div
        style={{
          position: "absolute",
          left: CX,
          top: 700,
          transform: "translate(-50%, -50%)",
          color: theme.warning,
          fontSize: 66,
          ...mono,
          opacity: 0.85 + 0.15 * after,
        }}
      >
        ≠
      </div>
      <Badge opacity={enter * (0.72 + 0.28 * after)} />
      <PulseRing x={CX} y={750} triggerFrame={impactLocal} tone="warning" size={290} />
    </div>
  );
};

import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

export type PollardRhoPhase = "walk" | "collision" | "factor";

const W = layout.width;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

const Cell: React.FC<{
  value: string;
  left: number;
  top: number;
  color?: string;
  opacity: number;
  scale?: number;
}> = ({ value, left, top, color = theme.accent, opacity, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width: 150,
      height: 92,
      transform: `translate(-50%, -50%) scale(${scale})`,
      borderRadius: 18,
      border: `3px solid ${color}`,
      background: `${color}18`,
      boxShadow: `0 0 28px ${color}30`,
      color: theme.text,
      fontFamily: theme.mono,
      fontSize: 32,
      fontWeight: 800,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      opacity,
    }}
  >
    {value}
  </div>
);

const Label: React.FC<{
  text: string;
  top: number;
  color?: string;
  opacity: number;
}> = ({ text, top, color = theme.subtext, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top,
      transform: "translateX(-50%)",
      color,
      fontFamily: theme.mono,
      fontSize: 27,
      fontWeight: 800,
      letterSpacing: 2,
      whiteSpace: "nowrap",
      opacity,
    }}
  >
    {text}
  </div>
);

export const PollardRhoVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: PollardRhoPhase;
}> = ({ local, fps, impactLocal, phase = "walk" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({
    frame: Math.max(0, local - impactLocal),
    fps,
    config: { damping: 11, mass: 0.7 },
  });

  if (phase === "walk") {
    const values = ["2", "5", "26", "677", "…"];
    const progress = smooth(clamp01(local / Math.max(impactLocal, 1)));
    const active = Math.min(values.length - 1, Math.floor(progress * values.length));
    return (
      <>
        <Label text="МЕТОД ПОЛЛАРДА · СЛУЧАЙНАЯ ПРОГУЛКА" top={270} opacity={enter} />
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 450,
            transform: "translateX(-50%)",
            padding: "18px 30px",
            borderRadius: 22,
            border: `3px solid ${theme.accent2}`,
            background: `${theme.accent2}18`,
            color: theme.text,
            fontFamily: theme.mono,
            fontSize: 31,
            fontWeight: 800,
            opacity: enter,
          }}
        >
          следующее = квадрат + один
        </div>
        <div
          style={{
            position: "absolute",
            left: 120,
            right: 120,
            top: 780,
            height: 5,
            background: theme.panelBorder,
            opacity: enter,
          }}
        />
        {values.map((value, i) => {
          const x = 170 + i * 185;
          const isActive = i === active;
          return (
            <React.Fragment key={value}>
              {i > 0 ? (
                <div
                  style={{
                    position: "absolute",
                    left: x - 151,
                    top: 772,
                    width: 112,
                    height: 4,
                    background: theme.accent,
                    opacity: enter * 0.75,
                  }}
                />
              ) : null}
              <Cell
                value={value}
                left={x}
                top={780}
                color={isActive ? theme.success : theme.accent}
                opacity={enter}
                scale={isActive ? 1 + 0.05 * Math.sin(local / 5) : 1}
              />
            </React.Fragment>
          );
        })}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1110,
            transform: "translateX(-50%)",
            color: theme.subtext,
            fontFamily: theme.font,
            fontSize: 34,
            textAlign: "center",
            opacity: enter,
          }}
        >
          остатки образуют хвост и петлю
        </div>
      </>
    );
  }

  if (phase === "collision") {
    const trackStart = 180;
    const trackEnd = 900;
    const p = smooth(clamp01(local / Math.max(impactLocal, 1)));
    const turtleX = interpolate(p, [0, 1], [trackStart, 650]);
    const hareX = interpolate(p, [0, 1], [trackStart, 820]);
    const settled = local >= impactLocal;
    const pulse = settled ? 1 + 0.06 * Math.sin((local - impactLocal) / 4) : 1;
    return (
      <>
        <Label text="ЧЕРЕПАХА И ЗАЯЦ" top={270} color={theme.text} opacity={enter} />
        <Label text="один шаг · два шага" top={330} color={theme.subtext} opacity={enter} />
        <div
          style={{
            position: "absolute",
            left: trackStart,
            top: 760,
            width: trackEnd - trackStart,
            height: 6,
            borderRadius: 999,
            background: theme.panelBorder,
            opacity: enter,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: turtleX,
            top: 650,
            transform: "translate(-50%, -50%)",
            padding: "14px 20px",
            borderRadius: 18,
            border: `3px solid ${theme.accent}`,
            background: `${theme.accent}1A`,
            color: theme.accent,
            fontFamily: theme.font,
            fontSize: 29,
            fontWeight: 800,
            opacity: enter,
          }}
        >
          черепаха · 677
        </div>
        <div
          style={{
            position: "absolute",
            left: hareX,
            top: 900,
            transform: `translate(-50%, -50%) scale(${pulse})`,
            padding: "14px 20px",
            borderRadius: 18,
            border: `3px solid ${theme.accent2}`,
            background: `${theme.accent2}1A`,
            color: theme.accent2,
            fontFamily: theme.font,
            fontSize: 29,
            fontWeight: 800,
            opacity: enter,
          }}
        >
          заяц · 871
        </div>
        {settled ? (
          <>
            <PulseRing x={hareX} y={780} triggerFrame={impactLocal} tone="warning" size={300} />
            <div
              style={{
                position: "absolute",
                left: W / 2,
                top: 1160,
                transform: "translateX(-50%)",
                padding: "17px 30px",
                borderRadius: 999,
                border: `3px solid ${theme.warning}`,
                background: `${theme.warning}18`,
                color: theme.warning,
                fontFamily: theme.mono,
                fontSize: 30,
                fontWeight: 800,
                whiteSpace: "nowrap",
                opacity: reveal,
              }}
            >
              цикл найден · смотрим разность
            </div>
          </>
        ) : null}
      </>
    );
  }

  const factorPop = spring({
    frame: Math.max(0, local - impactLocal),
    fps,
    config: { damping: 10, mass: 0.7 },
  });
  return (
    <>
      <Label text="СТОЛКНОВЕНИЕ → НОД" top={270} color={theme.text} opacity={enter} />
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 560,
          transform: "translateX(-50%)",
          padding: "22px 34px",
          borderRadius: 24,
          border: `3px solid ${theme.warning}`,
          background: `${theme.warning}14`,
          color: theme.text,
          fontFamily: theme.mono,
          fontSize: 38,
          fontWeight: 800,
          opacity: enter,
        }}
      >
        |677 − 871| = 194
      </div>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 810,
          transform: `translateX(-50%) scale(${0.92 + 0.08 * factorPop})`,
          padding: "22px 34px",
          borderRadius: 24,
          border: `3px solid ${theme.success}`,
          background: `${theme.success}18`,
          color: theme.success,
          fontFamily: theme.mono,
          fontSize: 38,
          fontWeight: 800,
          opacity: enter,
          boxShadow: `0 0 ${30 + 35 * factorPop}px ${theme.success}44`,
        }}
      >
        НОД(194, 8051) = 97
      </div>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 1120,
          transform: "translateX(-50%)",
          padding: "20px 34px",
          borderRadius: 999,
          border: `3px solid ${theme.accent}`,
          background: `${theme.accent}18`,
          color: theme.accent,
          fontFamily: theme.mono,
          fontSize: 36,
          fontWeight: 800,
          whiteSpace: "nowrap",
          opacity: enter,
        }}
      >
        8051 = 83 × 97
      </div>
      {local >= impactLocal ? <PulseRing x={W / 2} y={810} triggerFrame={impactLocal} tone="success" size={360} /> : null}
    </>
  );
};

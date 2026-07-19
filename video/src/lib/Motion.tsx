import React from "react";
import { interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, toneColor, Tone } from "./theme";

/** Затухающая тряска после каждого кадра-импакта (прилёт пакета и т.п.). */
export const useShakeOffset = (impacts: number[], intensity = 12) => {
  const frame = useCurrentFrame();
  let dx = 0;
  let dy = 0;
  for (const f0 of impacts) {
    const dt = frame - f0;
    if (dt < 0 || dt > 14) continue;
    const decay = Math.exp(-dt * 0.32);
    const seed = f0 * 7.13;
    dx += intensity * decay * Math.sin(dt * 2.1 + random(`sx${seed}`) * 6.28);
    dy += intensity * decay * Math.sin(dt * 2.6 + random(`sy${seed}`) * 6.28);
  }
  return { dx, dy };
};

/** Обёртка сцены: вход (scale+fade), медленный наезд камеры, тряска на импактах. */
export const SceneContainer: React.FC<{
  frames: number;
  impacts?: number[];
  children: React.ReactNode;
}> = ({ frames, impacts = [], children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, mass: 0.7 } });
  const drift = interpolate(frame, [0, frames], [1, 1.055]);
  const { dx, dy } = useShakeOffset(impacts);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: enter,
        transform: `translate(${dx}px, ${dy}px) scale(${(0.94 + 0.06 * enter) * drift})`,
        transformOrigin: "50% 42%",
      }}
    >
      {children}
    </div>
  );
};

/** Ленивое парение: синусоидальный дрейф + лёгкий наклон. */
export const Floaty: React.FC<{
  seed?: number;
  amp?: number;
  children: React.ReactNode;
}> = ({ seed = 0, amp = 9, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const phase = random(`float${seed}`) * 6.28;
  const t = (frame / fps) * 2;
  const y = amp * Math.sin(t + phase);
  const x = amp * 0.4 * Math.sin(t * 0.7 + phase * 2);
  const rot = 0.7 * Math.sin(t * 0.5 + phase);
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translate(${x}px, ${y}px) rotate(${rot}deg)` }}>
      {children}
    </div>
  );
};

/** Расходящиеся кольца в точке (импакт, появление бейджа). */
export const PulseRing: React.FC<{
  x: number;
  y: number;
  triggerFrame: number;
  tone?: Tone;
  size?: number;
}> = ({ x, y, triggerFrame, tone, size = 220 }) => {
  const frame = useCurrentFrame();
  const color = toneColor(tone);
  return (
    <>
      {[0, 6].map((delay) => {
        const dt = frame - triggerFrame - delay;
        if (dt < 0 || dt > 26) return null;
        const p = dt / 26;
        return (
          <div
            key={delay}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size * (0.4 + p * 1.6),
              height: size * (0.4 + p * 1.6),
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              border: `4px solid ${color}`,
              opacity: 0.7 * (1 - p),
            }}
          />
        );
      })}
    </>
  );
};

/** Фоновые частицы: медленно всплывающие светящиеся точки. */
export const Particles: React.FC<{ count?: number }> = ({ count = 22 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {Array.from({ length: count }).map((_, i) => {
        const rx = random(`px${i}`);
        const speed = 26 + random(`pv${i}`) * 40; // px/сек вверх
        const size = 4 + random(`ps${i}`) * 9;
        const sway = 30 + random(`pw${i}`) * 50;
        const phase = random(`pp${i}`) * 6.28;
        const t = frame / fps;
        const total = 1920 + 200;
        const y = 1920 - ((t * speed + random(`po${i}`) * total) % total) - 100;
        const x = rx * 1080 + sway * Math.sin(t * 0.8 + phase);
        const twinkle = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.2 + phase));
        const color = i % 3 === 0 ? theme.accent2 : theme.accent;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              background: color,
              opacity: twinkle,
              boxShadow: `0 0 ${size * 2.5}px ${color}`,
            }}
          />
        );
      })}
    </div>
  );
};

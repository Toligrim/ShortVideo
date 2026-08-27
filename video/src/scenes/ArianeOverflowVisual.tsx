import React from "react";
import { interpolate, spring } from "remotion";
import { theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

export type ArianeOverflowPhase = "launch" | "overflow" | "cascade";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: ArianeOverflowPhase;
}

const W = 1080;
const CX = W / 2;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  children: React.ReactNode;
  border?: string;
  opacity?: number;
}> = ({ left, top, width, height, children, border = theme.panelBorder, opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 24,
      border: `3px solid ${border}`,
      background: `${theme.panel}F2`,
      boxShadow: `0 24px 70px ${border}22`,
      opacity,
    }}
  >
    {children}
  </div>
);

const Rocket: React.FC<{ phase: ArianeOverflowPhase; local: number; hit: boolean }> = ({ phase, local, hit }) => {
  const flight = phase === "launch" ? interpolate(local, [0, 80], [100, -90], { extrapolateRight: "clamp" }) : 20;
  const tilt = phase === "cascade" && hit ? 22 : phase === "overflow" && hit ? 5 : 0;
  const flame = phase === "launch" ? 1 : hit ? 0.35 : 0.7;
  return (
    <div
      style={{
        position: "absolute",
        left: 205,
        top: 590 + flight,
        width: 240,
        height: 360,
        transform: `rotate(${tilt}deg)`,
        transformOrigin: "50% 78%",
        transition: "transform 120ms linear",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 65,
          top: 12,
          width: 110,
          height: 250,
          borderRadius: "58% 58% 26% 26%",
          background: `linear-gradient(135deg, ${theme.text}, #9AA8B8 52%, ${theme.accent2})`,
          border: `4px solid ${theme.text}`,
          clipPath: "polygon(50% 0%, 87% 18%, 100% 100%, 0% 100%, 13% 18%)",
          boxShadow: `0 0 38px ${theme.accent}44`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 17,
            top: 86,
            width: 68,
            height: 68,
            borderRadius: "50%",
            background: theme.panel,
            border: `5px solid ${theme.accent}`,
            boxShadow: `0 0 24px ${theme.accent}88`,
          }}
        />
        <div style={{ position: "absolute", left: 30, top: 178, width: 50, height: 8, background: theme.accent2, borderRadius: 8 }} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 37,
          top: 238,
          width: 54,
          height: 75,
          borderRadius: "0 0 50% 50%",
          background: `linear-gradient(180deg, ${theme.warning}, ${theme.danger} 68%, transparent)`,
          transform: `scaleY(${flame})`,
          transformOrigin: "top",
          filter: "blur(2px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 149,
          top: 238,
          width: 54,
          height: 75,
          borderRadius: "0 0 50% 50%",
          background: `linear-gradient(180deg, ${theme.warning}, ${theme.danger} 68%, transparent)`,
          transform: `scaleY(${flame})`,
          transformOrigin: "top",
          filter: "blur(2px)",
        }}
      />
      {phase === "cascade" && hit ? (
        <>
          <div style={{ position: "absolute", left: 35, top: 245, width: 60, height: 5, background: theme.danger, transform: "rotate(28deg)" }} />
          <div style={{ position: "absolute", left: 148, top: 245, width: 60, height: 5, background: theme.danger, transform: "rotate(-28deg)" }} />
        </>
      ) : null}
      <div style={{ position: "absolute", left: 35, top: 325, color: theme.subtext, fontFamily: theme.mono, fontSize: 20, letterSpacing: 2, whiteSpace: "nowrap" }}>
        ARIANE 5
      </div>
    </div>
  );
};

const BitRow: React.FC<{ label: string; bits: string; color: string; dim?: boolean }> = ({ label, bits, color, dim = false }) => (
  <div style={{ display: "flex", alignItems: "center", gap: bits.length > 16 ? 8 : 14, opacity: dim ? 0.45 : 1 }}>
    <div style={{ width: bits.length > 16 ? 95 : 170, color: theme.subtext, fontFamily: theme.mono, fontSize: bits.length > 16 ? 16 : 19, lineHeight: 1.1, letterSpacing: bits.length > 16 ? 0.5 : 1 }}>{label}</div>
    <div style={{ display: "flex", gap: bits.length > 16 ? 1 : 5, flexShrink: 0 }}>
      {bits.split("").map((bit, index) => (
        <div
          key={`${label}-${index}`}
          style={{
            boxSizing: "border-box",
            width: bits.length > 16 ? 4 : 16,
            height: bits.length > 16 ? 26 : 34,
            borderRadius: 5,
            background: bit === "1" ? color : "#0A0F18",
            border: `2px solid ${bit === "1" ? color : theme.panelBorder}`,
            boxShadow: bit === "1" ? `0 0 12px ${color}66` : "none",
          }}
        />
      ))}
    </div>
  </div>
);

const Telemetry: React.FC<{ phase: ArianeOverflowPhase; local: number; hit: boolean }> = ({ phase, local, hit }) => {
  const progress = clamp01(local / 48);
  const danger = phase === "cascade" && hit;
  return (
    <Panel left={510} top={505} width={490} height={570} border={danger ? theme.danger : phase === "overflow" && hit ? theme.warning : theme.panelBorder}>
      <div style={{ padding: "28px 30px", fontFamily: theme.mono }}>
        <div style={{ color: theme.subtext, fontSize: 21, letterSpacing: 3 }}>FLIGHT COMPUTER · H0+{phase === "launch" ? "00" : "36.7"} s</div>
        <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 22 }}>
          <BitRow label="64-BIT FLOAT" bits="1011010010110100101101001011010010110100101101001011010010110100" color={theme.accent} />
          <div style={{ textAlign: "center", color: phase === "overflow" && hit ? theme.warning : theme.subtext, fontSize: 28 }}>↓  CONVERT</div>
          <BitRow label="16-BIT SIGNED" bits={danger ? "1111111111111111" : "0111111111111111"} color={danger ? theme.danger : theme.accent2} dim={phase === "launch"} />
        </div>
        <div style={{ marginTop: 38, padding: "20px 22px", borderRadius: 18, background: "#0A0F18", border: `2px solid ${danger ? theme.danger : phase === "overflow" && hit ? theme.warning : theme.panelBorder}` }}>
          <div style={{ color: theme.subtext, fontSize: 18, letterSpacing: 2 }}>SIGNED RANGE</div>
          <div style={{ marginTop: 8, color: danger || (phase === "overflow" && hit) ? theme.danger : theme.text, fontSize: 38, fontWeight: 800 }}>{danger || (phase === "overflow" && hit) ? "> 32 767" : "−32 768 … 32 767"}</div>
        </div>
        <div style={{ marginTop: 28, height: 12, borderRadius: 8, background: theme.panelBorder, overflow: "hidden" }}>
          <div style={{ width: `${phase === "launch" ? progress * 70 : 100}%`, height: "100%", background: danger ? theme.danger : phase === "overflow" && hit ? theme.warning : theme.accent, boxShadow: `0 0 16px ${danger ? theme.danger : theme.accent}` }} />
        </div>
      </div>
    </Panel>
  );
};

export const ArianeOverflowVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "overflow" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.75 } });
  const hit = local >= impactLocal;
  const pop = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 11, mass: 0.7 } });
  const title = phase === "launch" ? "ARIANE 5 · ПЕРВЫЕ 37 СЕКУНД" : phase === "overflow" ? "ПРЕОБРАЗОВАНИЕ · ДИАПАЗОН СЛИШКОМ МАЛ" : "КАСКАД ОШИБКИ · УПРАВЛЕНИЕ ПОТЕРЯНО";
  const badge = phase === "launch" ? "H0+00 · ПОЛЁТ НОРМАЛЬНЫЙ" : phase === "overflow" ? "OVERFLOW · 16-БИТНЫЙ ПРЕДЕЛ" : "ОШИБКА → ДИАГНОСТИКА → СОПЛА";
  return (
    <div style={{ position: "absolute", inset: 0, width: W, height: 1920, fontFamily: theme.font, opacity: enter }}>
      <div style={{ position: "absolute", left: CX, top: 245, transform: "translateX(-50%)", color: theme.subtext, fontFamily: theme.mono, fontSize: 26, letterSpacing: 3, whiteSpace: "nowrap" }}>
        {title}
      </div>
      <Rocket phase={phase} local={local} hit={hit} />
      <div style={{ position: "absolute", left: 225, top: 1110, width: 195, height: 4, background: `linear-gradient(90deg, transparent, ${phase === "cascade" && hit ? theme.danger : theme.accent})`, transform: phase === "cascade" && hit ? "rotate(19deg)" : "none", transformOrigin: "right", opacity: 0.85 }} />
      <Telemetry phase={phase} local={local} hit={hit} />
      <div style={{ position: "absolute", left: CX, top: 1160, transform: `translateX(-50%) scale(${0.94 + 0.06 * pop})`, padding: "16px 28px", borderRadius: 999, background: `${phase === "cascade" && hit ? theme.danger : phase === "overflow" && hit ? theme.warning : theme.panel}18`, border: `3px solid ${phase === "cascade" && hit ? theme.danger : phase === "overflow" && hit ? theme.warning : theme.panelBorder}`, color: phase === "cascade" && hit ? theme.danger : phase === "overflow" && hit ? theme.warning : theme.subtext, fontFamily: theme.mono, fontWeight: 800, fontSize: 25, letterSpacing: 1, whiteSpace: "nowrap", boxShadow: hit ? `0 0 32px ${phase === "cascade" ? theme.danger : theme.warning}44` : "none" }}>
        {badge}
      </div>
      {hit ? <PulseRing x={phase === "cascade" ? 320 : 760} y={phase === "cascade" ? 760 : 790} triggerFrame={impactLocal} tone={phase === "cascade" ? "danger" : phase === "overflow" ? "warning" : "accent"} size={phase === "cascade" ? 330 : 240} /> : null}
      {phase === "cascade" && hit ? (
        <div style={{ position: "absolute", left: 525, top: 1100, color: theme.danger, fontFamily: theme.mono, fontSize: 20, letterSpacing: 2, whiteSpace: "nowrap" }}>
          NOZZLES: MAX DEFLECTION
        </div>
      ) : null}
    </div>
  );
};

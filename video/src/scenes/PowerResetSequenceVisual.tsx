import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type PowerResetPhase = "stabilize" | "release" | "firmware" | "black-screen";

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1.5 };

const phaseTitle: Record<PowerResetPhase, string> = {
  stabilize: "POWER · СТАБИЛЬНО",
  release: "RESET · СНЯТ",
  firmware: "FIRMWARE · FETCH",
  "black-screen": "ЭКРАН · ЧЁРНЫЙ",
};

const phaseColor: Record<PowerResetPhase, string> = {
  stabilize: theme.warning,
  release: theme.success,
  firmware: theme.accent,
  "black-screen": theme.accent2,
};

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const PowerPanel: React.FC<{ enter: number; phase: PowerResetPhase; local: number }> = ({ enter, phase, local }) => {
  const fanSpin = local * 14;
  return (
    <div
      style={{
        position: "absolute",
        left: 62,
        top: 430,
        width: 280,
        height: 430,
        borderRadius: 26,
        background: `${theme.panel}F2`,
        border: `3px solid ${theme.subtext}66`,
        boxShadow: `0 0 32px ${theme.subtext}16`,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 30}px)`,
      }}
    >
      <div style={{ position: "absolute", left: 24, top: 20, display: "flex", alignItems: "center", gap: 10, ...mono, fontSize: 20, color: theme.subtext }}>
        <IconGlyph name="power" size={25} color={theme.subtext} strokeWidth={1.8} />
        СИСТЕМНЫЙ БЛОК
      </div>
      <div
        style={{
          position: "absolute",
          left: 38,
          top: 82,
          width: 204,
          height: 132,
          borderRadius: 16,
          background: "#05070B",
          border: `3px solid ${theme.subtext}55`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
        }}
      >
        <IconGlyph name="monitor" size={51} color={theme.subtext} strokeWidth={1.5} />
        <span style={{ ...mono, fontSize: 17, color: theme.subtext }}>ЭКРАН · ЧЁРНЫЙ</span>
      </div>
      <div style={{ position: "absolute", left: 104, top: 258, width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center", color: theme.accent2 }}>
        <div style={{ transform: `rotate(${fanSpin}deg)` }}>
          <IconGlyph name="fan" size={65} color={theme.accent2} strokeWidth={1.4} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 348, textAlign: "center", ...mono, fontSize: 18, color: phase === "black-screen" ? theme.accent2 : theme.subtext }}>
        ВЕНТИЛЯТОР · {phase === "black-screen" ? "СЛЫШНО" : "ПИТАНИЕ ЕСТЬ"}
      </div>
    </div>
  );
};

const BoardPanel: React.FC<{ enter: number; phase: PowerResetPhase; local: number; fps: number; impactLocal: number }> = ({ enter, phase, local, fps, impactLocal }) => {
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  const released = phase === "release" ? hit : phase === "firmware" || phase === "black-screen";
  const railP = clamp01(local / Math.max(impactLocal, 1));
  const points = phase === "stabilize"
    ? `18,232 48,224 78,238 108,208 138,216 168,180 198,189 228,166 258,169`
    : `18,232 48,228 78,224 108,220 138,218 168,217 198,216 228,216 258,216`;
  const boardTitle = phase === "firmware" ? "FIRMWARE ROM" : phase === "black-screen" ? "ИНИЦИАЛИЗАЦИЯ" : "ПЛАТА ПИТАНИЯ";
  return (
    <div
      style={{
        position: "absolute",
        left: 380,
        top: 430,
        width: 320,
        height: 430,
        borderRadius: 26,
        background: `${theme.panel}F2`,
        border: `3px solid ${phaseColor[phase]}77`,
        boxShadow: `0 0 38px ${phaseColor[phase]}1C`,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 30}px)`,
      }}
    >
      <div style={{ position: "absolute", left: 24, top: 20, display: "flex", alignItems: "center", gap: 10, ...mono, fontSize: 21, color: phaseColor[phase] }}>
        <IconGlyph name={phase === "firmware" ? "memory-stick" : "circuit-board"} size={26} color={phaseColor[phase]} strokeWidth={1.7} />
        {boardTitle}
      </div>
      {phase === "stabilize" ? (
        <>
          <div style={{ position: "absolute", left: 26, top: 78, ...mono, fontSize: 20, color: theme.subtext }}>VCORE · НАПРЯЖЕНИЕ</div>
          <svg width={270} height={250} viewBox="0 0 270 250" style={{ position: "absolute", left: 24, top: 105, overflow: "visible" }}>
            <line x1="18" y1="232" x2="258" y2="232" stroke={`${theme.subtext}55`} strokeWidth="2" />
            <line x1="18" y1="120" x2="258" y2="120" stroke={`${theme.warning}33`} strokeDasharray="7 7" strokeWidth="2" />
            <polyline points={points} fill="none" stroke={theme.warning} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={260 * railP} opacity={0.9} />
            <circle cx="258" cy="216" r={7 + pop * 4} fill={theme.success} opacity={0.7 + pop * 0.3} />
            <text x="18" y="27" fill={theme.subtext} fontFamily={theme.mono} fontSize="16">нестабильно</text>
            <text x="178" y="27" fill={theme.success} fontFamily={theme.mono} fontSize="16">стабильно</text>
          </svg>
          <div style={{ position: "absolute", left: 0, right: 0, top: 370, textAlign: "center", ...mono, fontSize: 21, color: pop > 0.4 ? theme.success : theme.warning }}>
            {pop > 0.4 ? "POWER GOOD" : "ЖДЁМ СТАБИЛЬНОСТЬ"}
          </div>
        </>
      ) : phase === "release" ? (
        <>
          <div style={{ position: "absolute", left: 28, top: 96, ...mono, fontSize: 20, color: theme.subtext }}>СИГНАЛ К ПРОЦЕССОРУ</div>
          <div style={{ position: "absolute", left: 28, top: 143, width: 264, height: 76, borderRadius: 16, background: `${released ? theme.success : theme.danger}12`, border: `3px solid ${released ? theme.success : theme.danger}99`, display: "flex", alignItems: "center", justifyContent: "center", ...mono, fontSize: 30, color: released ? theme.success : theme.danger, transform: `scale(${0.94 + pop * 0.06})` }}>
            RESET = {released ? "1 · СНЯТ" : "0 · ДЕРЖИТ"}
          </div>
          <div style={{ position: "absolute", left: 34, top: 258, width: 252, height: 4, background: `${theme.subtext}44` }}>
            <div style={{ width: `${released ? 100 : 34}%`, height: 4, background: released ? theme.success : theme.danger, transition: "width 0.1s linear" }} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 290, textAlign: "center", ...mono, fontSize: 19, color: released ? theme.success : theme.danger }}>
            {released ? "ПРОЦЕССОР МОЖЕТ ИДТИ" : "ПРОЦЕССОР УДЕРЖАН"}
          </div>
          <PulseRing x={540} y={610} triggerFrame={impactLocal} tone="success" size={190} />
        </>
      ) : phase === "firmware" ? (
        <>
          <div style={{ position: "absolute", left: 28, top: 94, ...mono, fontSize: 19, color: theme.subtext }}>КОД В ПЗУ</div>
          <div style={{ position: "absolute", left: 28, top: 136, width: 264, height: 112, borderRadius: 16, background: `${theme.accent}10`, border: `2px solid ${theme.accent}66`, padding: "18px 20px", boxSizing: "border-box", ...mono, fontSize: 22, lineHeight: 1.65, color: theme.text }}>
            <div>FETCH  ·  1</div>
            <div>INSTR  ·  READY</div>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 292, textAlign: "center", ...mono, fontSize: 20, color: theme.accent }}>
            ПЕРВАЯ ИНСТРУКЦИЯ
          </div>
          <PulseRing x={540} y={620} triggerFrame={impactLocal} tone="accent" size={200} />
        </>
      ) : (
        <>
          <div style={{ position: "absolute", left: 28, top: 94, ...mono, fontSize: 19, color: theme.subtext }}>СЛЕДУЮЩИЕ ШАГИ</div>
          {["RAM · INIT", "DISPLAY · INIT"].map((label, i) => (
            <div key={label} style={{ position: "absolute", left: 28, top: 142 + i * 78, width: 264, height: 52, borderRadius: 13, background: `${theme.accent2}0D`, border: `2px solid ${theme.accent2}55`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", boxSizing: "border-box", ...mono, fontSize: 18, color: theme.subtext }}>
              <span>{label}</span><span style={{ color: theme.warning }}>WAIT</span>
            </div>
          ))}
          <div style={{ position: "absolute", left: 0, right: 0, top: 320, textAlign: "center", ...mono, fontSize: 19, color: theme.accent2 }}>ЭКРАН ЕЩЁ НЕ ГОТОВ</div>
        </>
      )}
    </div>
  );
};

const CpuPanel: React.FC<{ enter: number; phase: PowerResetPhase; local: number }> = ({ enter, phase, local }) => {
  const active = phase === "firmware" || phase === "black-screen";
  const breathe = 1 + (active ? 0.018 : 0.008) * Math.sin(local / 8);
  return (
    <div
      style={{
        position: "absolute",
        left: 750,
        top: 492,
        width: 268,
        height: 290,
        borderRadius: 26,
        background: `${theme.panel}F2`,
        border: `3px solid ${(active ? theme.success : theme.danger)}88`,
        boxShadow: `0 0 40px ${(active ? theme.success : theme.danger)}1C`,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 30}px) scale(${breathe})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <IconGlyph name="cpu" size={64} color={active ? theme.success : theme.danger} strokeWidth={1.6} />
      <div style={{ ...mono, fontSize: 31, color: theme.text }}>CPU</div>
      <div style={{ ...mono, fontSize: 19, color: active ? theme.success : theme.danger }}>
        {active ? (phase === "firmware" ? "ЖДЁТ FETCH" : "RUNNING") : "RESET HELD"}
      </div>
    </div>
  );
};

export const PowerResetSequenceVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: PowerResetPhase;
}> = ({ local, fps, impactLocal, phase = "stabilize" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const color = phaseColor[phase];
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  const instructionP = phase === "firmware" ? clamp01((local - impactLocal) / 28) : 0;

  return (
    <>
      <div style={{ position: "absolute", left: 38, right: 38, top: 220, display: "flex", justifyContent: "center", alignItems: "center", gap: 12, ...mono, fontSize: 23, color, opacity: enter, whiteSpace: "nowrap" }}>
        <IconGlyph name={phase === "stabilize" ? "activity" : phase === "release" ? "lock-open" : phase === "firmware" ? "book-open" : "monitor-off"} size={28} color={color} strokeWidth={1.8} />
        {phaseTitle[phase]}
      </div>

      <PowerPanel enter={enter} phase={phase} local={local} />
      <BoardPanel enter={enter} phase={phase} local={local} fps={fps} impactLocal={impactLocal} />
      <CpuPanel enter={enter} phase={phase} local={local} />

      <svg width={W} height={layout.safeBottom} viewBox={`0 0 ${W} ${layout.safeBottom}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: enter }}>
        <line x1="342" y1="670" x2="380" y2="670" stroke={theme.warning} strokeWidth="5" strokeLinecap="round" opacity="0.8" />
        <circle cx="362" cy="670" r="7" fill={theme.warning} opacity={0.8 + 0.2 * Math.sin(local / 5) ** 2} />
        <line x1="700" y1="650" x2="750" y2="650" stroke={phase === "release" && !hit ? theme.danger : theme.success} strokeWidth={phase === "release" && !hit ? 4 : 6} strokeDasharray={phase === "release" && !hit ? "10 10" : "none"} strokeLinecap="round" />
        <text x="724" y="630" textAnchor="middle" fontFamily={theme.mono} fontSize="17" fontWeight="800" fill={phase === "release" && !hit ? theme.danger : theme.success}>RESET</text>
        {phase === "firmware" ? (
          <>
            <line x1="700" y1="725" x2="750" y2="725" stroke={theme.accent} strokeWidth="5" strokeLinecap="round" />
            <circle cx={700 + 50 * instructionP} cy="725" r="10" fill={theme.accent} opacity={0.4 + instructionP * 0.6} />
            <text x="725" y="756" textAnchor="middle" fontFamily={theme.mono} fontSize="16" fontWeight="800" fill={theme.accent}>1-я INSTR</text>
          </>
        ) : null}
      </svg>

      <div style={{ position: "absolute", left: "50%", top: 1140, transform: `translateX(-50%) scale(${0.92 + pop * 0.08})`, padding: "13px 26px", borderRadius: 999, background: `${color}18`, border: `3px solid ${color}99`, boxShadow: `0 0 34px ${color}2E`, opacity: enter * (phase === "stabilize" ? 0.9 : 0.95), ...mono, fontSize: 25, color, whiteSpace: "nowrap" }}>
        {phase === "stabilize"
          ? pop > 0.25 ? "POWER GOOD · МОЖНО СНИМАТЬ RESET" : "ПИТАНИЕ СТАБИЛИЗИРУЕТСЯ"
          : phase === "release"
          ? hit ? "RESET СНЯТ · CPU ОТПУЩЕН" : "RESET ДЕРЖИТ CPU"
          : phase === "firmware"
          ? `ПЕРВЫЙ FETCH${instructionP > 0.8 ? " · ПОЛУЧЕН" : " · ИЗ ROM"}`
          : "ВЕНТИЛЯТОР ЕСТЬ · ЭКРАН ЧЁРНЫЙ"}
      </div>
      <PulseRing x={phase === "release" ? 735 : phase === "firmware" ? 710 : 540} y={phase === "firmware" ? 725 : 650} triggerFrame={impactLocal} tone={phase === "release" ? "success" : phase === "stabilize" ? "warning" : phase === "firmware" ? "accent" : "accent2"} size={220} />
    </>
  );
};

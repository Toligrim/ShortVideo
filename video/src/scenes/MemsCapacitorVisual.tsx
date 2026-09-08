import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

export type MemsCapacitorPhase =
  | "mass"
  | "gap"
  | "capacitance"
  | "analogy"
  | "tilt"
  | "gravity"
  | "axes"
  | "bottom"
  | "switch"
  | "vertical"
  | "horizontal"
  | "result";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: MemsCapacitorPhase;
};

const W = layout.width;
const H = layout.height;
const CX = W / 2;

const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.2,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const titles: Record<MemsCapacitorPhase, string> = {
  mass: "MEMS-АКСЕЛЕРОМЕТР · ПОДВЕШЕННАЯ МАССА",
  gap: "СДВИГ МАССЫ · ЗАЗОР МЕЖДУ ПЛАСТИНАМИ",
  capacitance: "ЗАЗОР МЕНЯЕТ ЁМКОСТЬ",
  analogy: "ГИРЬКА · ПРУЖИНЫ · МИКРОПЛАСТИНЫ",
  tilt: "ТЕЛЕФОН НАКЛОНЕН · ДАТЧИК ВНУТРИ",
  gravity: "ЗЕМНОЕ ПРИТЯЖЕНИЕ ОТКЛОНЯЕТ МАССУ",
  axes: "ТРИ ОСИ · X · Y · Z",
  bottom: "ТРИ ЗНАЧЕНИЯ → СТОРОНА НИЗА",
  switch: "ДАННЫЕ СЕНСОРА → РЕЖИМ ЭКРАНА",
  vertical: "ВЕРТИКАЛЬНЫЙ РЕЖИМ",
  horizontal: "ГОРИЗОНТАЛЬНЫЙ РЕЖИМ",
  result: "ПОВОРОТ ЭКРАНА ПОСЛЕ ДВИЖЕНИЯ",
};

const phaseColor: Record<MemsCapacitorPhase, string> = {
  mass: theme.accent,
  gap: theme.warning,
  capacitance: theme.success,
  analogy: theme.accent2,
  tilt: theme.accent,
  gravity: theme.warning,
  axes: theme.accent2,
  bottom: theme.success,
  switch: theme.accent,
  vertical: theme.accent2,
  horizontal: theme.accent,
  result: theme.success,
};

const Header: React.FC<{ phase: MemsCapacitorPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 228,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: phaseColor[phase],
      fontSize: 22,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    <IconGlyph name={phase === "axes" || phase === "bottom" ? "axis-3d" : phase === "switch" || phase === "result" ? "smartphone" : "cpu"} size={30} color={phaseColor[phase]} strokeWidth={1.8} />
    <span>{titles[phase]}</span>
  </div>
);

const Badge: React.FC<{ phase: MemsCapacitorPhase; opacity: number }> = ({ phase, opacity }) => {
  const text =
    phase === "mass" || phase === "analogy"
      ? "ВНУТРИ ЧИПА · МАССА ДВИГАЕТСЯ НА ПОДВЕСКЕ"
      : phase === "gap"
        ? "ЗАЗОР СЛЕВА ≠ ЗАЗОР СПРАВА"
        : phase === "capacitance"
          ? "СМЕЩЕНИЕ → ЭЛЕКТРИЧЕСКИЙ СИГНАЛ"
          : phase === "axes"
            ? "АКСЕЛЕРОМЕТР ВИДИТ X, Y И Z"
            : phase === "bottom"
              ? "СРАВНИВАЕМ ТРИ ЗНАЧЕНИЯ С ГРАВИТАЦИЕЙ"
              : phase === "vertical" || phase === "horizontal" || phase === "result"
                ? "СИСТЕМА ВЫБИРАЕТ ОРИЕНТАЦИЮ"
                : "СЕНСОР ПЕРЕДАЁТ НАКЛОН ЭЛЕКТРОНИКЕ";
  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        top: 1190,
        width: 952,
        minHeight: 76,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "13px 24px",
        borderRadius: 999,
        background: `${phaseColor[phase]}16`,
        border: `3px solid ${phaseColor[phase]}99`,
        color: phaseColor[phase],
        fontSize: 22,
        textAlign: "center",
        whiteSpace: "nowrap",
        opacity,
        boxShadow: `0 0 34px ${phaseColor[phase]}22`,
        ...mono,
      }}
    >
      {text}
    </div>
  );
};

const SpringLine: React.FC<{ x1: number; y1: number; x2: number; y2: number; color: string }> = ({ x1, y1, x2, y2, color }) => {
  const points = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t + (i === 0 || i === 8 ? 0 : (i % 2 === 0 ? -1 : 1) * 14);
    return `${x},${y}`;
  }).join(" ");
  return <polyline points={points} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />;
};

const SensorCell: React.FC<{ shift: number; opacity: number; phase: MemsCapacitorPhase }> = ({ shift, opacity, phase }) => {
  const color = phaseColor[phase];
  const leftGap = Math.max(26, 138 - shift * 0.62);
  const rightGap = 138 + shift * 0.62;
  const massX = 540 + shift;
  const leftPlates = Array.from({ length: 5 }, (_, i) => 292 + i * 23);
  const rightPlates = Array.from({ length: 5 }, (_, i) => 788 - i * 23);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 390,
          width: 860,
          height: 620,
          borderRadius: 30,
          background: `${theme.panel}E8`,
          border: `3px solid ${color}66`,
          boxShadow: `0 0 44px ${color}20`,
          opacity,
        }}
      />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity }}>
        <g>
          {leftPlates.map((x) => <rect key={`l-${x}`} x={x} y={535} width={8} height={230} rx={4} fill={`${theme.accent}BB`} />)}
          {rightPlates.map((x) => <rect key={`r-${x}`} x={x} y={535} width={8} height={230} rx={4} fill={`${theme.accent2}BB`} />)}
          <line x1={240} y1={650} x2={292} y2={650} stroke={`${theme.accent}88`} strokeWidth={4} />
          <line x1={788} y1={650} x2={840} y2={650} stroke={`${theme.accent2}88`} strokeWidth={4} />
          <SpringLine x1={365} y1={650} x2={massX - 105} y2={650} color={color} />
          <SpringLine x1={massX + 105} y1={650} x2={715} y2={650} color={color} />
          <rect x={massX - 105} y={555} width={210} height={190} rx={26} fill={`${theme.panel}FF`} stroke={color} strokeWidth={5} />
          <rect x={massX - 76} y={584} width={152} height={132} rx={18} fill={`${color}12`} stroke={`${color}55`} strokeWidth={2} />
          <circle cx={massX} cy={650} r={22} fill={color} opacity={0.35} />
          <circle cx={massX} cy={650} r={9} fill={color} />
          <path d={`M ${massX - 105} 515 L ${massX - 105} 545 M ${massX + 105} 515 L ${massX + 105} 545`} stroke={theme.subtext} strokeWidth={3} />
          <path d={`M ${massX - 105} 755 L ${massX - 105} 790 M ${massX + 105} 755 L ${massX + 105} 790`} stroke={theme.subtext} strokeWidth={3} />
          {phase === "gap" || phase === "capacitance" ? (
            <>
              <line x1={massX - 105} y1={810} x2={292} y2={810} stroke={theme.warning} strokeWidth={3} strokeDasharray="10 10" />
              <line x1={massX + 105} y1={810} x2={788} y2={810} stroke={theme.warning} strokeWidth={3} strokeDasharray="10 10" />
            </>
          ) : null}
        </g>
      </svg>
      <div style={{ position: "absolute", left: 540, top: 665, transform: "translateX(-50%)", color: color, fontSize: 19, whiteSpace: "nowrap", ...mono, opacity }}>МИКРОМАССА</div>
      <div style={{ position: "absolute", left: 260, top: 470, color: theme.accent, fontSize: 18, whiteSpace: "nowrap", ...mono, opacity }}>НЕПОДВИЖНЫЕ ПЛАСТИНЫ</div>
      <div style={{ position: "absolute", left: 710, top: 470, color: theme.accent2, fontSize: 18, whiteSpace: "nowrap", ...mono, opacity }}>НЕПОДВИЖНЫЕ ПЛАСТИНЫ</div>
      {(phase === "gap" || phase === "capacitance") && (
        <>
          <div style={{ position: "absolute", left: 360, top: 840, color: theme.warning, fontSize: 20, whiteSpace: "nowrap", ...mono, opacity }}>ЗАЗОР {Math.round(leftGap)} мкм</div>
          <div style={{ position: "absolute", left: 650, top: 840, color: theme.warning, fontSize: 20, whiteSpace: "nowrap", ...mono, opacity }}>ЗАЗОР {Math.round(rightGap)} мкм</div>
        </>
      )}
    </>
  );
};

const Axes: React.FC<{ phase: MemsCapacitorPhase; opacity: number }> = ({ phase, opacity }) => {
  const active = phase === "bottom" ? theme.success : theme.accent2;
  return (
    <>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity }}>
        <line x1={540} y1={690} x2={260} y2={690} stroke={theme.accent} strokeWidth={7} />
        <path d="M 260 690 l 30 -18 M 260 690 l 30 18" stroke={theme.accent} strokeWidth={7} fill="none" strokeLinecap="round" />
        <line x1={540} y1={690} x2={820} y2={690} stroke={theme.accent2} strokeWidth={7} />
        <path d="M 820 690 l -30 -18 M 820 690 l -30 18" stroke={theme.accent2} strokeWidth={7} fill="none" strokeLinecap="round" />
        <line x1={540} y1={690} x2={540} y2={430} stroke={active} strokeWidth={7} />
        <path d="M 540 430 l -18 30 M 540 430 l 18 30" stroke={active} strokeWidth={7} fill="none" strokeLinecap="round" />
        <circle cx={540} cy={690} r={54} fill={`${theme.panel}FF`} stroke={active} strokeWidth={5} />
      </svg>
      <div style={{ position: "absolute", left: 220, top: 716, color: theme.accent, fontSize: 32, ...mono, opacity }}>X · +0.2</div>
      <div style={{ position: "absolute", left: 790, top: 716, color: theme.accent2, fontSize: 32, ...mono, opacity }}>Y · −0.1</div>
      <div style={{ position: "absolute", left: 570, top: 390, color: active, fontSize: 32, ...mono, opacity }}>Z · +9.8</div>
      <div style={{ position: "absolute", left: CX, top: 910, transform: "translateX(-50%)", color: theme.subtext, fontSize: 22, whiteSpace: "nowrap", ...mono, opacity }}>ТРИ ПРОЕКЦИИ СИЛЫ ТЯЖЕСТИ</div>
    </>
  );
};

const PhoneMode: React.FC<{ phase: MemsCapacitorPhase; local: number; impactLocal: number; opacity: number }> = ({ phase, local, impactLocal, opacity }) => {
  const p = phase === "switch" ? smooth(clamp01((local - impactLocal + 6) / 28)) : 1;
  const targetRotate = phase === "vertical" ? 0 : -90;
  const leftOpacity = phase === "vertical" ? 1 : phase === "horizontal" ? 0.25 : 1 - p * 0.2;
  const rightOpacity = phase === "vertical" ? 0.25 : 1;
  const screen = (x: number, rotate: number, label: string, cardOpacity: number, color: string) => (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 710,
        width: 245,
        height: 420,
        transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
        borderRadius: 30,
        background: `${theme.panel}F2`,
        border: `4px solid ${color}99`,
        boxShadow: `0 0 42px ${color}22`,
        opacity: opacity * cardOpacity,
      }}
    >
      <div style={{ position: "absolute", left: 18, top: 25, right: 18, bottom: 25, borderRadius: 20, background: `${color}16`, border: `2px solid ${color}55`, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, color: theme.text, ...mono }}>
        <IconGlyph name="arrow-up" size={52} color={color} strokeWidth={1.8} />
        <span style={{ fontSize: 23 }}>ЭКРАН</span>
      </div>
      <div style={{ position: "absolute", left: "50%", bottom: -64, transform: `translateX(-50%) rotate(${-rotate}deg)`, color, fontSize: 21, whiteSpace: "nowrap", ...mono }}>{label}</div>
    </div>
  );
  return (
    <>
      {screen(340, 0, "ВЕРТИКАЛЬНО", leftOpacity, theme.accent2)}
      <div style={{ position: "absolute", left: CX, top: 710, transform: "translate(-50%, -50%)", color: theme.success, fontSize: 48, opacity, ...mono }}>→</div>
      {screen(740, targetRotate * p, "ГОРИЗОНТАЛЬНО", rightOpacity, theme.accent)}
      <div style={{ position: "absolute", left: CX, top: 1045, transform: "translateX(-50%)", color: theme.subtext, fontSize: 21, whiteSpace: "nowrap", ...mono, opacity }}>ЗНАЧЕНИЯ СЕНСОРА → ВЫБОР РЕЖИМА</div>
    </>
  );
};

export const MemsCapacitorVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "mass" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const response = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.72 } });

  const sensorPhase = phase === "mass" || phase === "gap" || phase === "capacitance" || phase === "analogy";
  const axesPhase = phase === "axes" || phase === "bottom";
  const screenPhase = phase === "switch" || phase === "vertical" || phase === "horizontal" || phase === "result";
  const shift = phase === "mass" || phase === "analogy" ? 0 : phase === "gap" || phase === "capacitance" ? 108 * response : 0;

  return (
    <>
      <Header phase={phase} opacity={enter} />
      {sensorPhase ? <SensorCell shift={shift} opacity={enter} phase={phase} /> : null}
      {phase === "capacitance" ? (
        <>
          <div style={{ position: "absolute", left: 300, top: 920, width: 210, height: 82, borderRadius: 18, background: `${theme.accent}18`, border: `3px solid ${theme.accent}99`, color: theme.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, ...mono, opacity: enter }}>C₁ ↑</div>
          <div style={{ position: "absolute", left: 570, top: 920, width: 210, height: 82, borderRadius: 18, background: `${theme.accent2}18`, border: `3px solid ${theme.accent2}99`, color: theme.accent2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, ...mono, opacity: enter }}>C₂ ↓</div>
          <div style={{ position: "absolute", left: CX, top: 1030, transform: "translateX(-50%)", color: theme.success, fontSize: 24, whiteSpace: "nowrap", ...mono, opacity: enter }}>СХЕМА СЧИТЫВАЕТ РАЗНОСТЬ</div>
        </>
      ) : null}
      {phase === "analogy" ? (
        <div style={{ position: "absolute", left: CX, top: 1025, transform: "translateX(-50%)", color: theme.accent2, fontSize: 24, whiteSpace: "nowrap", ...mono, opacity: enter }}>КАК ГИРЬКА НА ПРУЖИНКАХ · ТОЛЬКО В МИКРОМАСШТАБЕ</div>
      ) : null}
      {phase === "tilt" || phase === "gravity" ? (
        <>
          <div style={{ position: "absolute", left: CX, top: 620, width: 360, height: 230, transform: `translate(-50%, -50%) rotate(${phase === "gravity" ? -14 : -10}deg)`, borderRadius: 30, background: `${theme.panel}F0`, border: `4px solid ${phaseColor[phase]}99`, display: "flex", alignItems: "center", justifyContent: "center", opacity: enter, boxShadow: `0 0 42px ${phaseColor[phase]}22` }}>
            <IconGlyph name="cpu" size={84} color={theme.accent} strokeWidth={1.6} />
            <span style={{ marginLeft: 18, color: theme.text, fontSize: 24, ...mono }}>MEMS</span>
          </div>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: enter }}>
            <line x1={840} y1={470} x2={840} y2={890} stroke={theme.success} strokeWidth={6} strokeDasharray="16 12" />
            <path d="M 840 890 l -20 -34 M 840 890 l 20 -34" fill="none" stroke={theme.success} strokeWidth={6} strokeLinecap="round" />
          </svg>
          <div style={{ position: "absolute", left: 840, top: 420, transform: "translateX(-50%)", color: theme.success, fontSize: 23, whiteSpace: "nowrap", ...mono, opacity: enter }}>g · ВНИЗ</div>
          <div style={{ position: "absolute", left: CX, top: 930, transform: "translateX(-50%)", color: theme.subtext, fontSize: 21, whiteSpace: "nowrap", ...mono, opacity: enter }}>МАССА СДВИГАЕТСЯ ОТНОСИТЕЛЬНО РАМКИ</div>
        </>
      ) : null}
      {axesPhase ? <Axes phase={phase} opacity={enter} /> : null}
      {screenPhase ? <PhoneMode phase={phase} local={local} impactLocal={impactLocal} opacity={enter} /> : null}
      <Badge phase={phase} opacity={enter} />
      <PulseRing
        x={screenPhase ? 740 : axesPhase ? 540 : 540 + shift}
        y={screenPhase ? 710 : axesPhase ? 690 : 650}
        triggerFrame={impactLocal}
        tone={phaseColor[phase] === theme.warning ? "warning" : phaseColor[phase] === theme.success ? "success" : "accent"}
        size={screenPhase ? 220 : 190}
      />
    </>
  );
};

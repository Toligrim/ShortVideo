import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

export type EliasFanoPhase = "split" | "unary" | "formula" | "access";

const W = layout.width;
const CENTER = W / 2;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ease = (n: number) => n * n * (3 - 2 * n);

const Caption: React.FC<{
  text: string;
  top: number;
  color?: string;
  size?: number;
  mono?: boolean;
}> = ({ text, top, color = theme.subtext, size = 30, mono = false }) => (
  <div
    style={{
      position: "absolute",
      left: CENTER,
      top,
      transform: "translateX(-50%)",
      color,
      fontFamily: mono ? theme.mono : theme.font,
      fontSize: size,
      fontWeight: 800,
      letterSpacing: mono ? 1 : 0.5,
      textAlign: "center",
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

const Chip: React.FC<{
  text: string;
  x: number;
  y: number;
  color: string;
  opacity?: number;
  scale?: number;
  width?: number;
}> = ({ text, x, y, color, opacity = 1, scale = 1, width = 176 }) => (
  <div
    style={{
      position: "absolute",
      left: x - width / 2,
      top: y - 38,
      width,
      height: 76,
      borderRadius: 18,
      border: `3px solid ${color}99`,
      background: `${color}18`,
      color: theme.text,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: theme.mono,
      fontSize: 28,
      fontWeight: 800,
      opacity,
      transform: `scale(${scale})`,
      boxShadow: `0 0 26px ${color}22`,
    }}
  >
    {text}
  </div>
);

const Bit: React.FC<{
  value: string;
  x: number;
  y: number;
  color: string;
  active?: boolean;
  opacity?: number;
  size?: number;
}> = ({ value, x, y, color, active = false, opacity = 1, size = 54 }) => (
  <div
    style={{
      position: "absolute",
      left: x - size / 2,
      top: y - size / 2,
      width: size,
      height: size,
      borderRadius: 12,
      border: `2px solid ${active ? color : theme.panelBorder}`,
      background: active ? `${color}38` : "#101722",
      color: active ? theme.text : theme.subtext,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: theme.mono,
      fontSize: size > 45 ? 25 : 21,
      fontWeight: 800,
      opacity,
      boxShadow: active ? `0 0 30px ${color}66` : "none",
    }}
  >
    {value}
  </div>
);

const Arrow: React.FC<{ x1: number; y1: number; x2: number; y2: number; color: string; opacity?: number }> = ({
  x1,
  y1,
  x2,
  y2,
  color,
  opacity = 1,
}) => (
  <svg
    width={W}
    height={layout.height}
    style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", opacity }}
  >
    <defs>
      <marker id={`arrow-${color.replace("#", "")}`} markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" fill={color} />
      </marker>
    </defs>
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={color}
      strokeWidth={4}
      strokeDasharray="10 8"
      markerEnd={`url(#arrow-${color.replace("#", "")})`}
    />
  </svg>
);

const SplitPhase: React.FC<{ local: number; fps: number }> = ({ local, fps }) => {
  const enter = spring({ frame: Math.max(0, local), fps, config: { damping: 15, mass: 0.8 } });
  const ids = [12, 19, 27, 31, 44, 52];
  const xs = ids.map((_, i) => 135 + i * 162);
  return (
    <>
      <Caption text="ОТСОРТИРОВАННЫЕ НОМЕРА ДОКУМЕНТОВ" top={286} color={theme.text} size={34} />
      <Caption text="каждый ID = верхняя часть + младшие биты" top={365} color={theme.subtext} size={28} mono />
      <div style={{ opacity: enter }}>
        {ids.map((id, i) => {
          const high = Math.floor(id / 8).toString(2).padStart(3, "0");
          const low = (id % 8).toString(2).padStart(3, "0");
          const p = spring({ frame: Math.max(0, local - i * 4), fps, config: { damping: 14, mass: 0.7 } });
          return (
            <React.Fragment key={id}>
              <Chip text={`ID ${id}`} x={xs[i]} y={560} color={theme.text} opacity={p} scale={p} width={132} />
              <div
                style={{
                  position: "absolute",
                  left: xs[i] - 58,
                  top: 670,
                  width: 116,
                  height: 142,
                  border: `2px solid ${theme.panelBorder}`,
                  borderRadius: 18,
                  background: theme.panel,
                  opacity: p,
                }}
              >
                <div style={{ color: theme.accent2, fontFamily: theme.mono, fontSize: 18, fontWeight: 800, textAlign: "center", marginTop: 14 }}>
                  ВЕРХ
                </div>
                <div style={{ color: theme.accent2, fontFamily: theme.mono, fontSize: 25, fontWeight: 800, textAlign: "center", marginTop: 3 }}>
                  {high}
                </div>
                <div style={{ height: 2, background: theme.panelBorder, margin: "9px 14px" }} />
                <div style={{ color: theme.accent, fontFamily: theme.mono, fontSize: 18, fontWeight: 800, textAlign: "center" }}>
                  НИЗ
                </div>
                <div style={{ color: theme.accent, fontFamily: theme.mono, fontSize: 25, fontWeight: 800, textAlign: "center", marginTop: 3 }}>
                  {low}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <Caption text="разрезаем число — порядок списка сохраняется" top={900} color={theme.success} size={30} />
    </>
  );
};

const UnaryPhase: React.FC<{ local: number; fps: number; impactLocal: number }> = ({ local, fps, impactLocal }) => {
  const enter = spring({ frame: Math.max(0, local), fps, config: { damping: 15, mass: 0.8 } });
  const low = ["1", "0", "0", "1", "1", "0", "1", "0", "0", "1"];
  const high = ["0", "0", "1", "0", "0", "0", "1", "0", "0", "0", "1", "0", "0", "0", "0", "1"];
  const lowStart = 178;
  const highStart = 132;
  const lowStep = 82;
  const highStep = 52;
  const glow = interpolate(local, [impactLocal, impactLocal + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Caption text="ДВА СЛОЯ, ОДНА БЫСТРАЯ СТРУКТУРА" top={286} color={theme.text} size={34} />
      <Caption text="младшие — плотно · верхние — унарно" top={365} color={theme.subtext} size={28} mono />
      <div style={{ opacity: enter }}>
        <Caption text="МЛАДШИЕ БИТЫ" top={535} color={theme.accent} size={26} mono />
        {low.map((bit, i) => <Bit key={`l-${i}`} value={bit} x={lowStart + i * lowStep} y={650} color={theme.accent} active={bit === "1"} opacity={enter} />)}
        <Caption text="ВЕРХНЯЯ ЧАСТЬ · УНАРНАЯ СТРОКА" top={785} color={theme.accent2} size={26} mono />
        {high.map((bit, i) => <Bit key={`h-${i}`} value={bit} x={highStart + i * highStep} y={900} color={theme.accent2} active={bit === "1"} opacity={enter} size={50} />)}
      </div>
      <Arrow x1={CENTER} y1={700} x2={CENTER} y2={835} color={theme.success} opacity={0.7} />
      <Caption text="единица = следующий документ · нули = пропущенные этажи" top={1055} color={theme.success} size={27} />
      {glow > 0.01 ? <PulseRing x={highStart + 6 * highStep} y={900} triggerFrame={impactLocal} tone="accent2" size={130} /> : null}
    </>
  );
};

const FormulaPhase: React.FC<{ local: number; fps: number; impactLocal: number }> = ({ local, fps, impactLocal }) => {
  const enter = spring({ frame: Math.max(0, local), fps, config: { damping: 14, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pulse = hit ? 1 + 0.035 * Math.sin((local - impactLocal) / 4) : 1;
  return (
    <>
      <Caption text="ВАУ-ФАКТ: ПОЧТИ НИЖНЯЯ ГРАНИЦА" top={300} color={theme.text} size={36} />
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 480,
          width: 900,
          height: 255,
          borderRadius: 28,
          border: `3px solid ${hit ? theme.success : theme.accent}AA`,
          background: `${hit ? theme.success : theme.accent}14`,
          boxShadow: `0 0 ${hit ? 60 : 35}px ${hit ? theme.success : theme.accent}44`,
          opacity: enter,
          transform: `scale(${enter * pulse})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ color: theme.text, fontFamily: theme.mono, fontSize: 47, fontWeight: 800, whiteSpace: "nowrap" }}>
          2n + n⌈log₂(U/n)⌉ битов
        </div>
        <div style={{ color: theme.subtext, fontFamily: theme.font, fontSize: 28, fontWeight: 700, marginTop: 20 }}>
          для n элементов в диапазоне U
        </div>
      </div>
      <Caption text="Elias–Fano ≈ информационный минимум" top={850} color={theme.success} size={34} mono />
      <div style={{ position: "absolute", left: 170, top: 980, width: 740, height: 18, background: theme.panelBorder, borderRadius: 10, opacity: enter }}>
        <div style={{ width: "72%", height: "100%", background: `linear-gradient(90deg, ${theme.accent}, ${theme.success})`, borderRadius: 10 }} />
      </div>
      <Caption text="ёмкость ↓ · порядок списка не теряется" top={1050} color={theme.subtext} size={28} />
    </>
  );
};

const AccessPhase: React.FC<{ local: number; fps: number; impactLocal: number }> = ({ local, fps, impactLocal }) => {
  const enter = spring({ frame: Math.max(0, local), fps, config: { damping: 15, mass: 0.8 } });
  const selected = local >= impactLocal;
  const pointerX = 132 + 6 * 68;
  return (
    <>
      <Caption text="ДОСТУП: НЕ РАСПАКОВЫВАЕМ ВЕСЬ СПИСОК" top={300} color={theme.text} size={34} />
      <Caption text="выбираем нужную единицу и собираем ID" top={375} color={theme.subtext} size={28} mono />
      <div style={{ opacity: enter }}>
        <Caption text="ВЕРХНЯЯ ЧАСТЬ" top={525} color={theme.accent2} size={25} mono />
        {Array.from({ length: 12 }, (_, i) => (
          <Bit key={i} value={i === 6 ? "1" : "0"} x={132 + i * 68} y={640} color={theme.accent2} active={selected && i === 6} opacity={enter} size={56} />
        ))}
        <Caption text="МЛАДШИЕ БИТЫ" top={820} color={theme.accent} size={25} mono />
        {Array.from({ length: 8 }, (_, i) => (
          <Bit key={i} value={["1", "0", "1", "1", "0", "0", "1", "0"][i]} x={270 + i * 78} y={930} color={theme.accent} active={selected && i === 3} opacity={enter} size={60} />
        ))}
      </div>
      <Arrow x1={pointerX} y1={685} x2={pointerX} y2={860} color={selected ? theme.success : theme.accent2} opacity={selected ? 1 : 0.55} />
      <div
        style={{
          position: "absolute",
          left: 180,
          top: 1120,
          width: 720,
          height: 115,
          borderRadius: 26,
          border: `3px solid ${selected ? theme.success : theme.panelBorder}`,
          background: selected ? `${theme.success}18` : theme.panel,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: selected ? theme.success : theme.subtext,
          fontFamily: theme.mono,
          fontSize: 33,
          fontWeight: 800,
          opacity: enter,
          boxShadow: selected ? `0 0 45px ${theme.success}44` : "none",
        }}
      >
        {selected ? "ВЕРХ + НИЗ = НУЖНЫЙ ID" : "ВЫБИРАЕМ ЕДИНИЦУ"}
      </div>
      {selected ? <PulseRing x={pointerX} y={640} triggerFrame={impactLocal} tone="success" size={140} /> : null}
    </>
  );
};

export const EliasFanoVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: EliasFanoPhase;
}> = ({ local, fps, impactLocal, phase = "split" }) => {
  switch (phase) {
    case "unary":
      return <UnaryPhase local={local} fps={fps} impactLocal={impactLocal} />;
    case "formula":
      return <FormulaPhase local={local} fps={fps} impactLocal={impactLocal} />;
    case "access":
      return <AccessPhase local={local} fps={fps} impactLocal={impactLocal} />;
    case "split":
    default:
      return <SplitPhase local={local} fps={fps} />;
  }
};

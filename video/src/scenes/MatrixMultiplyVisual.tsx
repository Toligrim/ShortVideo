import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type MatrixMultiplyPhase = "tables" | "workers" | "dot-product" | "repeat";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: MatrixMultiplyPhase;
}

type Matrix = readonly (readonly number[])[];

const A: Matrix = [
  [1, 2, 0],
  [0, 1, 3],
  [2, 1, 1],
];
const B: Matrix = [
  [2, 1, 0],
  [1, 0, 2],
  [3, 1, 1],
];
const C: Matrix = [
  [4, 1, 4],
  [10, 3, 5],
  [8, 3, 3],
];

const CX = layout.width / 2;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 2,
};

const phaseInfo: Record<MatrixMultiplyPhase, { title: string; icon: string; color: string }> = {
  tables: { title: "МАТРИЦА · ДВЕ ТАБЛИЦЫ ЧИСЕЛ", icon: "table-2", color: theme.accent },
  workers: { title: "ТЫСЯЧИ РАБОТНИКОВ · КАЖДЫЙ СВОЙ Cᵢⱼ", icon: "users-round", color: theme.accent2 },
  "dot-product": { title: "ОДНА ЯЧЕЙКА · СТРОКА × СТОЛБЕЦ", icon: "calculator", color: theme.warning },
  repeat: { title: "ОДИН ОТВЕТ · МИЛЛИОНЫ ОДИНАКОВЫХ ШАГОВ", icon: "repeat-2", color: theme.success },
};

const Header: React.FC<{ phase: MatrixMultiplyPhase; opacity: number }> = ({ phase, opacity }) => {
  const info = phaseInfo[phase];
  return (
    <div
      style={{
        position: "absolute",
        left: CX,
        top: 226,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        ...mono,
        fontSize: 23,
        color: info.color,
        opacity,
        whiteSpace: "nowrap",
      }}
    >
      <IconGlyph name={info.icon} size={29} color={info.color} strokeWidth={1.8} />
      {info.title}
    </div>
  );
};

const Card: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color?: string;
  opacity?: number;
  children: React.ReactNode;
}> = ({ left, top, width, height, color = theme.accent, opacity = 1, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      borderRadius: 26,
      background: `${theme.panel}F0`,
      border: `3px solid ${color}66`,
      boxShadow: `0 0 42px ${color}1C`,
      opacity,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const MatrixGrid: React.FC<{
  x: number;
  y: number;
  label: string;
  values: Matrix;
  color: string;
  opacity: number;
  compact?: boolean;
  highlightRow?: number;
  highlightCol?: number;
}> = ({ x, y, label, values, color, opacity, compact = false, highlightRow = -1, highlightCol = -1 }) => {
  const cell = compact ? 40 : 63;
  const gap = compact ? 5 : 8;
  const gridWidth = cell * 3 + gap * 2;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: compact ? 220 : 288,
        height: compact ? 238 : 380,
        borderRadius: 22,
        background: `${theme.panel}F0`,
        border: `3px solid ${color}66`,
        boxShadow: `0 0 30px ${color}18`,
        opacity,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 22,
          top: 19,
          display: "flex",
          alignItems: "center",
          gap: 8,
          ...mono,
          fontSize: compact ? 16 : 20,
          color,
        }}
      >
        <IconGlyph name="table-2" size={compact ? 21 : 25} color={color} strokeWidth={1.8} />
        {label}
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: compact ? 70 : 90,
          transform: "translateX(-50%)",
          display: "grid",
          gridTemplateColumns: `repeat(3, ${cell}px)`,
          gap,
        }}
      >
        {values.flatMap((row, rowIndex) =>
          row.map((value, colIndex) => {
            const selected = rowIndex === highlightRow || colIndex === highlightCol;
            return (
              <div
                key={`${rowIndex}-${colIndex}`}
                style={{
                  width: cell,
                  height: compact ? 38 : 58,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: compact ? 8 : 12,
                  background: `${color}${selected ? "42" : "12"}`,
                  border: `2px solid ${color}${selected ? "DD" : "52"}`,
                  color: selected ? theme.text : theme.subtext,
                  ...mono,
                  fontSize: compact ? 18 : 28,
                  transform: `scale(${selected ? 1.03 : 1})`,
                }}
              >
                {value}
              </div>
            );
          }),
        )}
      </div>
      {!compact ? (
        <div style={{ position: "absolute", left: 22, right: 22, bottom: 20, ...mono, fontSize: 15, color: theme.subtext, textAlign: "center" }}>
          3 × 3 ЧИСЛА
        </div>
      ) : null}
    </div>
  );
};

const Arrow: React.FC<{ x: number; y: number; color: string; opacity: number }> = ({ x, y, color, opacity }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", color, fontSize: 54, opacity }}>→</div>
);

const BottomPill: React.FC<{ text: string; color: string; opacity: number; y?: number; scale?: number }> = ({
  text,
  color,
  opacity,
  y = 1140,
  scale = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: y,
      transform: `translateX(-50%) scale(${scale})`,
      padding: "14px 28px",
      borderRadius: 999,
      background: `${color}18`,
      border: `3px solid ${color}`,
      color,
      ...mono,
      fontSize: 22,
      textAlign: "center",
      whiteSpace: "nowrap",
      opacity,
      boxShadow: `0 0 34px ${color}3A`,
    }}
  >
    {text}
  </div>
);

const VectorRow: React.FC<{ x: number; y: number; values: readonly number[]; color: string; opacity: number }> = ({
  x,
  y,
  values,
  color,
  opacity,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      display: "flex",
      gap: 10,
      opacity,
    }}
  >
    {values.map((value, i) => (
      <div
        key={i}
        style={{
          width: 74,
          height: 74,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 14,
          background: `${color}30`,
          border: `3px solid ${color}`,
          color: theme.text,
          ...mono,
          fontSize: 32,
        }}
      >
        {value}
      </div>
    ))}
  </div>
);

const VectorColumn: React.FC<{ x: number; y: number; values: readonly number[]; color: string; opacity: number }> = ({
  x,
  y,
  values,
  color,
  opacity,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      opacity,
    }}
  >
    {values.map((value, i) => (
      <div
        key={i}
        style={{
          width: 74,
          height: 62,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 14,
          background: `${color}30`,
          border: `3px solid ${color}`,
          color: theme.text,
          ...mono,
          fontSize: 30,
        }}
      >
        {value}
      </div>
    ))}
  </div>
);

/** Буквальное A×B=C: строки и столбцы сходятся в сумму попарных произведений. */
export const MatrixMultiplyVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "tables" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  const info = phaseInfo[phase];

  if (phase === "tables") {
    const focus = smooth(clamp01((local - 8) / 20));
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <MatrixGrid x={42} y={390} label="ТАБЛИЦА A" values={A} color={theme.accent} opacity={enter} highlightRow={focus > 0.25 ? 0 : -1} />
        <Arrow x={365} y={575} color={theme.text} opacity={enter} />
        <MatrixGrid x={396} y={390} label="ТАБЛИЦА B" values={B} color={theme.accent2} opacity={enter} highlightCol={focus > 0.25 ? 0 : -1} />
        <Arrow x={719} y={575} color={theme.text} opacity={enter} />
        <MatrixGrid x={750} y={390} label="РЕЗУЛЬТАТ C" values={C} color={theme.success} opacity={enter * (0.6 + 0.4 * focus)} highlightRow={focus > 0.55 ? 0 : -1} highlightCol={focus > 0.55 ? 0 : -1} />
        <div style={{ position: "absolute", left: CX, top: 840, transform: "translateX(-50%)", ...mono, fontSize: 23, color: theme.text, opacity: enter }}>
          СТРОКА A × СТОЛБЕЦ B <span style={{ color: theme.success }}>→ ЧИСЛО C</span>
        </div>
        <BottomPill text="ДВЕ ТАБЛИЦЫ → НОВАЯ ТАБЛИЦА" color={info.color} opacity={enter * (0.35 + 0.65 * pop)} scale={0.92 + 0.08 * pop} y={1080} />
        <PulseRing x={850} y={575} triggerFrame={impactLocal} tone="success" size={230} />
      </>
    );
  }

  if (phase === "workers") {
    const workerP = smooth(clamp01((local - 4) / 28));
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <MatrixGrid x={42} y={404} label="A" values={A} color={theme.accent} opacity={enter} compact />
        <MatrixGrid x={42} y={690} label="B" values={B} color={theme.accent2} opacity={enter} compact />
        <Arrow x={302} y={690} color={theme.text} opacity={enter} />
        <Card left={342} top={404} width={690} height={524} color={theme.accent2} opacity={enter}>
          <div style={{ position: "absolute", left: 26, top: 23, display: "flex", alignItems: "center", gap: 10, ...mono, fontSize: 20, color: theme.accent2 }}>
            <IconGlyph name="users-round" size={27} color={theme.accent2} strokeWidth={1.8} />
            ТЫСЯЧИ РАБОТНИКОВ
          </div>
          <div style={{ position: "absolute", left: 28, right: 28, top: 92, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {C.flatMap((row, rowIndex) =>
              row.map((value, colIndex) => {
                const i = rowIndex * 3 + colIndex;
                const tileP = smooth(clamp01((workerP * 9 - i) / 1.8));
                return (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    style={{
                      height: 101,
                      borderRadius: 16,
                      background: `${theme.accent2}${tileP > 0.45 ? "2F" : "0B"}`,
                      border: `2px solid ${theme.accent2}${tileP > 0.45 ? "C8" : "45"}`,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      opacity: 0.38 + 0.62 * tileP,
                      transform: `scale(${0.94 + 0.06 * tileP})`,
                    }}
                  >
                    <IconGlyph name="calculator" size={27} color={tileP > 0.45 ? theme.accent2 : theme.subtext} strokeWidth={1.8} />
                    <span style={{ ...mono, fontSize: 16, color: tileP > 0.45 ? theme.text : theme.subtext }}>C{rowIndex + 1}{colIndex + 1} = {value}</span>
                  </div>
                );
              }),
            )}
          </div>
          <div style={{ position: "absolute", left: 28, right: 28, bottom: 22, ...mono, fontSize: 17, color: theme.subtext, textAlign: "center" }}>
            КАЖДЫЙ СЧИТАЕТ СВОЮ ЯЧЕЙКУ
          </div>
        </Card>
        <BottomPill text="ОДНА ЯЧЕЙКА = ОДИН ПАРАЛЛЕЛЬНЫЙ РАБОТНИК" color={info.color} opacity={enter * (0.35 + 0.65 * pop)} scale={0.88 + 0.12 * pop} y={1100} />
        <PulseRing x={700} y={670} triggerFrame={impactLocal} tone="accent2" size={270} />
      </>
    );
  }

  if (phase === "dot-product") {
    const calcP = smooth(clamp01((local - 5) / 24));
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <Card left={56} top={430} width={350} height={300} color={theme.accent} opacity={enter}>
          <div style={{ position: "absolute", left: 28, top: 24, ...mono, fontSize: 20, color: theme.accent }}>СТРОКА A₁</div>
          <VectorRow x={38} y={110} values={[1, 2, 0]} color={theme.accent} opacity={enter} />
          <div style={{ position: "absolute", left: 28, right: 28, bottom: 24, ...mono, fontSize: 16, color: theme.subtext, textAlign: "center" }}>БЕРЁМ СЛЕВА НАПРАВО</div>
        </Card>
        <div style={{ position: "absolute", left: 441, top: 575, transform: "translate(-50%, -50%)", color: theme.text, fontSize: 48, opacity: enter }}>×</div>
        <Card left={500} top={430} width={246} height={300} color={theme.accent2} opacity={enter}>
          <div style={{ position: "absolute", left: 24, top: 24, ...mono, fontSize: 19, color: theme.accent2 }}>СТОЛБЕЦ B₁</div>
          <VectorColumn x={86} y={102} values={[2, 1, 3]} color={theme.accent2} opacity={enter} />
        </Card>
        <Arrow x={794} y={575} color={theme.text} opacity={enter} />
        <Card left={842} top={446} width={190} height={260} color={theme.success} opacity={enter * (0.5 + 0.5 * calcP)}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 28, ...mono, fontSize: 20, color: theme.success, textAlign: "center" }}>C₁₁</div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 94, ...mono, fontSize: 62, color: theme.text, textAlign: "center", transform: `scale(${0.85 + 0.15 * calcP})` }}>4</div>
          <IconGlyph name="check" size={26} color={theme.success} strokeWidth={2} />
        </Card>
        <div style={{ position: "absolute", left: CX, top: 842, transform: "translateX(-50%)", ...mono, fontSize: 31, color: theme.text, opacity: enter * (0.35 + 0.65 * calcP), whiteSpace: "nowrap" }}>
          1×2 + 2×1 + 0×3 <span style={{ color: theme.success }}>= 4</span>
        </div>
        <div style={{ position: "absolute", left: CX, top: 932, transform: "translateX(-50%)", ...mono, fontSize: 20, color: theme.subtext, opacity: enter }}>СУММА ПОПАРНЫХ ПРОИЗВЕДЕНИЙ</div>
        <BottomPill text="СТРОКА × СТОЛБЕЦ → ОДНО ЧИСЛО" color={info.color} opacity={enter * (0.35 + 0.65 * pop)} scale={0.92 + 0.08 * pop} y={1080} />
        <PulseRing x={934} y={570} triggerFrame={impactLocal} tone="success" size={230} />
      </>
    );
  }

  const tileP = smooth(clamp01((local - 4) / 24));
  const ops = ["×", "+", "×", "+", "×", "+", "×", "+", "×", "+", "×", "+"];
  return (
    <>
      <Header phase={phase} opacity={enter} />
      <Card left={56} top={410} width={968} height={566} color={theme.success} opacity={enter}>
        <div style={{ position: "absolute", left: 30, top: 25, display: "flex", alignItems: "center", gap: 10, ...mono, fontSize: 20, color: theme.success }}>
          <IconGlyph name="repeat-2" size={28} color={theme.success} strokeWidth={1.8} />
          ОДИН ОТВЕТ МОДЕЛИ
        </div>
        <div style={{ position: "absolute", left: 30, top: 106, width: 390, height: 360, borderRadius: 22, background: `${theme.success}10`, border: `2px solid ${theme.success}55`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{ ...mono, fontSize: 78, color: theme.success, transform: `scale(${0.9 + 0.1 * pop})` }}>1 000 000+</div>
          <div style={{ ...mono, fontSize: 18, color: theme.text, textAlign: "center" }}>ОДНОТИПНЫХ<br />УМНОЖЕНИЙ</div>
        </div>
        <div style={{ position: "absolute", left: 482, top: 106, width: 448, height: 360, borderRadius: 22, background: `${theme.accent2}0D`, border: `2px solid ${theme.accent2}55`, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 24, top: 22, ...mono, fontSize: 18, color: theme.accent2 }}>× И + · ПОВТОРЯЕМ</div>
          <div style={{ position: "absolute", left: 24, right: 24, top: 76, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {ops.map((op, i) => {
              const p = smooth(clamp01((tileP * ops.length - i) / 2));
              return (
                <div
                  key={`${op}-${i}`}
                  style={{
                    height: 64,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: `${theme.accent2}${p > 0.45 ? "32" : "0D"}`,
                    border: `2px solid ${theme.accent2}${p > 0.45 ? "CC" : "48"}`,
                    color: p > 0.45 ? theme.accent2 : theme.subtext,
                    ...mono,
                    fontSize: 34,
                    opacity: 0.4 + 0.6 * p,
                    transform: `scale(${0.92 + 0.08 * p})`,
                  }}
                >
                  {op}
                </div>
              );
            })}
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, ...mono, color: theme.text }}>
            <IconGlyph name="repeat-2" size={34} color={theme.accent2} strokeWidth={1.8} />
            <span style={{ fontSize: 17 }}>СНОВА · СНОВА · СНОВА</span>
          </div>
        </div>
      </Card>
      <div style={{ position: "absolute", left: CX, top: 1025, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12, ...mono, fontSize: 22, color: theme.text, opacity: enter }}>
        <IconGlyph name="arrow-right" size={26} color={theme.success} strokeWidth={1.8} />
        СЛЕДУЮЩИЙ КУСОЧЕК ТЕКСТА
      </div>
      <BottomPill text="ОДНОТИПНЫЕ ШАГИ × СНОВА × СНОВА" color={info.color} opacity={enter * (0.35 + 0.65 * pop)} scale={0.92 + 0.08 * pop} y={1110} />
      <PulseRing x={262} y={610} triggerFrame={impactLocal} tone="success" size={260} />
    </>
  );
};

export default MatrixMultiplyVisual;

import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";

export type GrayCodePhase =
  | "disk"
  | "read"
  | "binary-flip"
  | "glitch"
  | "gray-flip"
  | "gray-safe"
  | "formula"
  | "formula-check"
  | "disk-off"
  | "save";

const W = layout.width;
const CX = W / 2;
const CY = 900;
const SECTORS = 16;
const TRACKS = 4; // 4 бита
const STEP = (Math.PI * 2) / SECTORS;
const START = -Math.PI / 2;

const gray = (p: number) => p ^ (p >> 1);
const bitOf = (p: number, b: number, mode: "gray" | "binary") =>
  (((mode === "gray" ? gray(p) : p) >> b) & 1) === 1;

function sectorPath(rIn: number, rOut: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  const [x1, y1] = p(rIn, a0);
  const [x2, y2] = p(rOut, a0);
  const [x3, y3] = p(rOut, a1);
  const [x4, y4] = p(rIn, a1);
  return `M${x1},${y1} L${x2},${y2} A${rOut},${rOut} 0 0 1 ${x3},${y3} L${x4},${y4} A${rIn},${rIn} 0 0 0 ${x1},${y1} Z`;
}

const ringRadii = (i: number) => ({ rOut: 430 - i * 74, rIn: 430 - i * 74 - 64 });

const Badge: React.FC<{ text: string; color: string; top: number; scale?: number }> = ({
  text,
  color,
  top,
  scale = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top,
      transform: "translateX(-50%)",
      padding: "10px 26px",
      borderRadius: 999,
      background: `${color}22`,
      border: `2px solid ${color}`,
      color,
      fontFamily: theme.font,
      fontWeight: 800,
      fontSize: 30 * scale,
      whiteSpace: "nowrap",
      textAlign: "center",
    }}
  >
    {text}
  </div>
);

const Caption: React.FC<{ text: string; top: number; color?: string }> = ({
  text,
  top,
  color = theme.subtext,
}) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top,
      transform: "translateX(-50%)",
      fontFamily: theme.mono,
      fontSize: 26,
      color,
      textAlign: "center",
      letterSpacing: 1,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

const Disk: React.FC<{
  mode: "gray" | "binary";
  pos: number;
  highlightRings?: number[];
  misalign?: boolean;
  dimNumber?: boolean;
}> = ({ mode, pos, highlightRings = [], misalign = false, dimNumber = false }) => {
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < TRACKS; i++) {
    const { rIn, rOut } = ringRadii(i);
    const bit = 3 - i; // outer = MSB
    for (let p = 0; p < SECTORS; p++) {
      const a0 = START + p * STEP;
      const a1 = a0 + STEP * 0.92;
      const on = bitOf(p, bit, mode);
      const hi = highlightRings.includes(i);
      cells.push(
        <path
          key={`${i}-${p}`}
          d={sectorPath(rIn, rOut, a0, a1)}
          fill={on ? (hi ? theme.success : theme.accent) : theme.panel}
          stroke={theme.panelBorder}
          strokeWidth={1}
          opacity={on ? 0.95 : 0.85}
        />
      );
    }
  }
  // указатель(и) считывания
  const pointers: React.ReactNode[] = [];
  const drawPointer = (i: number, p: number, color: string) => {
    const a = START + (p + 0.5) * STEP;
    const { rOut } = ringRadii(i);
    const x = CX + rOut * Math.cos(a);
    const y = CY + rOut * Math.sin(a);
    pointers.push(
      <line key={`ptr-${i}-${p}`} x1={CX} y1={CY} x2={x} y2={y} stroke={color} strokeWidth={4} opacity={0.9} />
    );
  };
  if (misalign) {
    for (let i = 0; i < TRACKS; i++) drawPointer(i, (pos + i * 4) % SECTORS, theme.danger);
  } else {
    drawPointer(0, pos, theme.warning);
  }
  // внешнее кольцо
  const outer = ringRadii(0).rOut + 8;
  return (
    <svg width={W} height={CY + 440} style={{ position: "absolute", left: 0, top: CY - 440 }}>
      <circle cx={CX} cy={CY} r={outer} fill="none" stroke={theme.panelBorder} strokeWidth={3} />
      {cells}
      {pointers}
      <circle cx={CX} cy={CY} r={26} fill={theme.bg} stroke={theme.panelBorder} strokeWidth={3} />
    </svg>
  );
};

const NumberReadout: React.FC<{ value: number; bits: string; color?: string; top: number }> = ({
  value,
  bits,
  color = theme.text,
  top,
}) => (
  <div style={{ position: "absolute", left: CX, top, transform: "translateX(-50%)", textAlign: "center" }}>
    <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 64, color }}>{value}</div>
    <div style={{ fontFamily: theme.mono, fontSize: 28, color: theme.subtext, letterSpacing: 4 }}>{bits}</div>
  </div>
);

export const GrayCodeVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: GrayCodePhase;
  value?: number;
}> = ({ local, fps, impactLocal, phase = "disk", value = 5 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  const cx = CX;

  if (phase === "disk") {
    return (
      <>
        <Caption text="ДИСК ДАТЧИКА УГЛА · ДОРОЖКИ + СВЕТ" top={440} color={theme.text} />
        <div style={{ position: "absolute", left: 0, top: 0, opacity: enter }}>
          <Disk mode="gray" pos={7} />
        </div>
        <NumberReadout value={7} bits="0 1 0 0" color={theme.accent} top={1360} />
        <Caption text="свет сквозь прорези → кажется идеальным" top={1460} />
      </>
    );
  }

  if (phase === "read") {
    return (
      <>
        <Caption text="ТЁМНОЕ-СВЕТЛОЕ → НОМЕР ПОЗИЦИИ" top={460} color={theme.text} />
        <div style={{ position: "absolute", left: 0, top: 0, opacity: enter }}>
          <Disk mode="gray" pos={7} highlightRings={[]} />
        </div>
        <NumberReadout value={7} bits="Грей: 0 1 0 0" color={theme.accent} top={1360} />
        {hit ? <Badge text="ДВОИЧНЫЙ КОД ТУТ КАЖЕТСЯ ИДЕАЛЬНЫМ" color={theme.success} top={1460} /> : null}
      </>
    );
  }

  if (phase === "binary-flip") {
    const p = hit ? 8 : 7;
    const bits = p.toString(2).padStart(4, "0");
    return (
      <>
        <Caption text="ПЕРЕХОД 7 → 8 В ОБЫЧНОМ ДВОИЧНОМ" top={440} color={theme.text} />
        <div style={{ position: "absolute", left: 0, top: 0, opacity: enter }}>
          <Disk mode="binary" pos={p} />
        </div>
        <NumberReadout value={p} bits={bits} color={theme.warning} top={1360} />
        {hit ? (
          <Badge text="МЕНЯЮТСЯ ВСЕ 4 БИТА СРАЗУ" color={theme.danger} top={1460} scale={1.05} />
        ) : null}
      </>
    );
  }

  if (phase === "glitch") {
    return (
      <>
        <Caption text="ДОРОЖКИ РАССИНХРОНИЗИРОВАНЫ" top={420} color={theme.danger} />
        <div style={{ position: "absolute", left: 0, top: 0, opacity: enter }}>
          <Disk mode="binary" pos={7} misalign />
        </div>
        <NumberReadout value={15} bits="1 1 1 1 · ложный отсчёт" color={theme.danger} top={1330} />
        {hit ? (
          <>
            <Badge text="ДАТЧИК ЛОВИТ 15 ВМЕСТО 7" color={theme.danger} top={1430} scale={0.95} />
            <Caption text="угол — в пол-оборота от правды" top={1500} color={theme.danger} />
          </>
        ) : null}
      </>
    );
  }

  if (phase === "gray-flip") {
    const a = gray(7).toString(2).padStart(4, "0");
    const b = gray(8).toString(2).padStart(4, "0");
    return (
      <>
        <Caption text="КОД ГРЕЯ: СОСЕДНИЕ ЧИСЛА" top={460} color={theme.text} />
        <div style={{ position: "absolute", left: 0, top: 0, opacity: enter }}>
          <Disk mode="gray" pos={7} highlightRings={[0]} />
        </div>
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1340,
            transform: "translateX(-50%)",
            display: "flex",
            gap: 40,
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 40,
          }}
        >
          <span style={{ color: theme.accent }}>{a}</span>
          <span style={{ color: theme.subtext }}>→</span>
          <span style={{ color: theme.accent2 }}>{b}</span>
        </div>
        {hit ? (
          <Badge text="РАЗНЯТСЯ ОДНИМ БИТОМ" color={theme.success} top={1450} />
        ) : null}
      </>
    );
  }

  if (phase === "gray-safe") {
    return (
      <>
        <Caption text="ОШИБОЧНЫЙ ЗАМЕР В КОДЕ ГРЕЯ" top={460} color={theme.text} />
        <div style={{ position: "absolute", left: 0, top: 0, opacity: enter }}>
          <Disk mode="gray" pos={7} highlightRings={[0]} />
        </div>
        <NumberReadout value={7} bits=" G=0 1 0 0" color={theme.accent} top={1340} />
        {hit ? (
          <>
            <Badge text="ДАСТ СОСЕДНЮЮ ПОЗИЦИЮ" color={theme.success} top={1440} />
            <Caption text="никогда — пол-оборота" top={1510} color={theme.success} />
          </>
        ) : null}
      </>
    );
  }

  if (phase === "formula") {
    const shifted = value >> 1;
    const res = value ^ shifted;
    const card = (label: string, val: string, color: string, x: number) => (
      <div
        style={{
          position: "absolute",
          left: x,
          top: 720,
          transform: "translateX(-50%)",
          width: 260,
          padding: "20px 10px",
          borderRadius: 22,
          border: `3px solid ${color}`,
          background: `${color}14`,
          textAlign: "center",
        }}
      >
        <div style={{ fontFamily: theme.mono, fontSize: 24, color: theme.subtext }}>{label}</div>
        <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 56, color }}>{val}</div>
      </div>
    );
    return (
      <>
        <Caption text="СТРОИТСЯ ОДНОЙ ОПЕРАЦИЕЙ" top={440} color={theme.text} />
        {card("n", String(value), theme.accent, CX - 280)}
        {card("n >> 1", String(shifted), theme.accent2, CX)}
        {card("n ^ (n>>1)", String(res), theme.success, CX + 280)}
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1000,
            transform: "translateX(-50%)",
            fontFamily: theme.mono,
            fontSize: 30,
            color: theme.subtext,
            textAlign: "center",
            opacity: enter,
          }}
        >
          {`${value} сдвинутое = ${shifted},  ${value} XOR ${shifted} = ${res}`}
        </div>
      </>
    );
  }

  if (phase === "formula-check") {
    const shifted = value >> 1;
    const res = value ^ shifted;
    return (
      <>
        <Caption text="ПРОВЕРКА" top={460} color={theme.text} />
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 760,
            transform: "translateX(-50%)",
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 60,
            color: theme.success,
            textAlign: "center",
            opacity: enter,
          }}
        >
          {`G(${value}) = ${res}`}
        </div>
        {hit ? (
          <>
            <Badge text="ЭТО КОД ГРЕЯ ДЛЯ ПЯТИ" color={theme.success} top={940} scale={1.1} />
            <Caption text={`${value} XOR ${shifted} = ${res}`} top={1030} />
          </>
        ) : null}
      </>
    );
  }

  if (phase === "disk-off") {
    return (
      <>
        <Caption text="УБЕРИ КОД ГРЕЯ — ОСТАЁТСЯ ОБЫЧНЫЙ ДВОИЧНЫЙ" top={420} color={theme.danger} />
        <div style={{ position: "absolute", left: 0, top: 0, opacity: enter }}>
          <Disk mode="binary" pos={7} misalign />
        </div>
        <NumberReadout value={15} bits="1 1 1 1" color={theme.danger} top={1330} />
        {hit ? (
          <>
            <Badge text="ТОЧНЫЙ ДАТЧИК ВРЁТ НА ОБОРОТЫ" color={theme.danger} top={1430} scale={0.95} />
          </>
        ) : null}
      </>
    );
  }

  // phase === "save"
  return (
    <>
      <Caption text="А СПАСАЕТ ЕГО ОДНА ФОРМУЛА" top={460} color={theme.text} />
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 720,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontWeight: 800,
          fontSize: 54,
          color: theme.success,
          textAlign: "center",
          opacity: enter,
        }}
      >
        G(n) = n XOR (n &gt;&gt; 1)
      </div>
      {hit ? (
        <>
          <Badge text="ОДНА ФОРМУЛА — И ДАТЧИК ТОЧЕН" color={theme.success} top={900} scale={1.05} />
          <Caption text="дальше — как раскодировать обратно" top={990} color={theme.subtext} />
        </>
      ) : null}
    </>
  );
};

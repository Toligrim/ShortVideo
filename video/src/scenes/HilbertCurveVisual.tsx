import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

export type HilbertPhase = "grid" | "locality" | "cache";

const W = layout.width;
const ORDER = 3;
const N = 1 << ORDER; // 8 × 8 сетка, 64 клетки
const CELL = 92;
const STEP = 98;
const GRID = N * STEP;
const LEFT = (W - GRID) / 2;
const TOP = 470;
// бейдж выносим в свободную полосу между заголовком (низ ~383) и сеткой
// (верх 470), чтобы он гарантированно не пересекался с караоке (karaokeY=1390)
const BADGE_TOP = TOP - 78;

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Координата клетки по номеру шага — дискретная кривая Гильберта (d2xy). */
function d2xy(n: number, d: number): [number, number] {
  let rx = 0;
  let ry = 0;
  let t = d;
  let x = 0;
  let y = 0;
  for (let s = 1; s < n; s *= 2) {
    rx = 1 & (t >> 1);
    ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const tmp = x;
      x = y;
      y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t >>= 1;
  }
  return [x, y];
}

const PATH: [number, number][] = Array.from({ length: N * N }, (_, d) => d2xy(N, d));
const CENTER = (c: [number, number]) => ({
  x: LEFT + c[0] * STEP + CELL / 2,
  y: TOP + c[1] * STEP + CELL / 2,
});

const Caption: React.FC<{ text: string; top: number; color?: string; big?: boolean }> = ({
  text,
  top,
  color = theme.subtext,
  big = false,
}) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top,
      transform: "translateX(-50%)",
      fontFamily: theme.font,
      fontWeight: 800,
      fontSize: big ? 46 : 32,
      color,
      textAlign: "center",
      letterSpacing: 1,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

const Badge: React.FC<{ text: string; color: string; top: number }> = ({ text, color, top }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top,
      transform: "translateX(-50%)",
      padding: "14px 30px",
      borderRadius: 999,
      background: `${color}22`,
      border: `3px solid ${color}`,
      color,
      fontFamily: theme.font,
      fontWeight: 800,
      fontSize: 32,
      whiteSpace: "nowrap",
      textAlign: "center",
      boxShadow: `0 0 40px ${color}55`,
    }}
  >
    {text}
  </div>
);

/** Дискретная кривая Гильберта: одна линия обходит каждую клетку квадрата ровно по разу. */
export const HilbertCurveVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: HilbertPhase;
}> = ({ local, fps, impactLocal, phase = "grid" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;

  // базовая сетка (все клетки)
  const gridCells = PATH.map((c, i) => {
    const p = CENTER(c);
    return (
      <rect
        key={i}
        x={p.x - CELL / 2}
        y={p.y - CELL / 2}
        width={CELL}
        height={CELL}
        rx={12}
        fill={theme.panel}
        stroke={theme.panelBorder}
        strokeWidth={2}
        opacity={enter * 0.9}
      />
    );
  });

  if (phase === "grid") {
    const rev = Math.floor(N * N * clamp01(local / Math.max(impactLocal, 1)));
    const shown = PATH.slice(0, rev);
    const pts = shown.map((c, i) => {
      const p = CENTER(c);
      return `${i === 0 ? "M" : "L"}${p.x},${p.y}`;
    });
    const lineColor = theme.accent;
    return (
      <>
        <Caption text="ОДНА ЛИНИЯ · ВСЕ КЛЕТКИ КВАДРАТА" top={330} color={theme.text} big />
        <svg width={W} height={TOP + GRID + 120} style={{ position: "absolute", left: 0, top: 0, opacity: enter }}>
          {gridCells}
          <path d={pts.join(" ")} fill="none" stroke={lineColor} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
          {shown.map((c, i) => {
            const p = CENTER(c);
            const done = i < rev - 1;
            return (
              <rect
                key={i}
                x={p.x - CELL / 2 + 4}
                y={p.y - CELL / 2 + 4}
                width={CELL - 8}
                height={CELL - 8}
                rx={10}
                fill={done ? `${lineColor}33` : lineColor}
                opacity={done ? 0.6 : 0.95}
              />
            );
          })}
        </svg>
        <Caption text={`пройдено ${rev} из ${N * N}`} top={TOP + GRID + 30} color={theme.subtext} />
        {hit ? (
          <>
            <PulseRing x={W / 2} y={TOP + GRID / 2} triggerFrame={impactLocal} tone="success" size={GRID} />
            <Badge text="НИ ОДНОГО ПРОПУСКА" color={theme.success} top={BADGE_TOP} />
          </>
        ) : null}
      </>
    );
  }

  if (phase === "locality") {
    // полностью нарисованная кривая + движущаяся пара соседних шагов
    const idx = Math.floor(local / 36) % (N * N - 1);
    const a = PATH[idx];
    const b = PATH[idx + 1];
    const pa = CENTER(a);
    const pb = CENTER(b);
    const pulse = 1 + 0.05 * Math.sin(local / 5);
    const poly = PATH.map((c, i) => {
      const p = CENTER(c);
      return `${i === 0 ? "M" : "L"}${p.x},${p.y}`;
    }).join(" ");
    return (
      <>
        <Caption text="ШАГ — ВСЕГДА В СОСЕДНЮЮ КЛЕТКУ" top={330} color={theme.text} big />
        <svg width={W} height={TOP + GRID + 120} style={{ position: "absolute", left: 0, top: 0, opacity: enter }}>
          {gridCells}
          <path d={poly} fill="none" stroke={theme.accent} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" opacity={0.55} />
          <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={theme.success} strokeWidth={10} strokeLinecap="round" />
          <rect x={pa.x - CELL / 2 + 3} y={pa.y - CELL / 2 + 3} width={CELL - 6} height={CELL - 6} rx={10} fill={`${theme.success}55`} stroke={theme.success} strokeWidth={4} />
          <rect x={pb.x - CELL / 2 + 3} y={pb.y - CELL / 2 + 3} width={CELL - 6} height={CELL - 6} rx={10} fill={`${theme.success}55`} stroke={theme.success} strokeWidth={4} />
        </svg>
        {hit ? <PulseRing x={(pa.x + pb.x) / 2} y={(pa.y + pb.y) / 2} triggerFrame={impactLocal} tone="success" size={CELL * 2} /> : null}
        <Caption text="близкие точки остаются близкими" top={TOP + GRID + 30} color={theme.subtext} />
        {hit ? <Badge text="ЛОКАЛЬНОСТЬ СОХРАНЕНА" color={theme.success} top={BADGE_TOP} /> : null}
      </>
    );
  }

  // phase === "cache": кэш-независимый обход — блоки данных рядом, кэш не теряется
  const block = 2;
  const blocks: [number, number][][] = [];
  for (let by = 0; by < N; by += block) {
    for (let bx = 0; bx < N; bx += block) {
      blocks.push([
        [bx, by],
        [bx + 1, by],
        [bx + 1, by + 1],
        [bx, by + 1],
      ]);
    }
  }
  const w = Math.floor(local / 26) % (N * N);
  const wc = PATH[w];
  const wcenter = CENTER(wc);
  const poly = PATH.map((c, i) => {
    const p = CENTER(c);
    return `${i === 0 ? "M" : "L"}${p.x},${p.y}`;
  }).join(" ");
  return (
    <>
      <Caption text="КЭШ-НЕЗАВИСИМЫЙ ОБХОД" top={330} color={theme.text} big />
      <svg width={W} height={TOP + GRID + 120} style={{ position: "absolute", left: 0, top: 0, opacity: enter }}>
        {gridCells}
        <path d={poly} fill="none" stroke={theme.accent} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" opacity={0.5} />
        {blocks.map((blk, i) => {
          const minx = LEFT + blk[0][0] * STEP;
          const miny = TOP + blk[0][1] * STEP;
          return (
            <rect
              key={i}
              x={minx}
              y={miny}
              width={block * STEP}
              height={block * STEP}
              rx={14}
              fill="none"
              stroke={theme.panelBorder}
              strokeWidth={2}
              opacity={0.7}
            />
          );
        })}
        <rect
          x={wcenter.x - STEP}
          y={wcenter.y - STEP}
          width={block * STEP}
          height={block * STEP}
          rx={14}
          fill={`${theme.warning}22`}
          stroke={theme.warning}
          strokeWidth={4}
          opacity={0.95}
        />
      </svg>
      <Caption text="блоки данных рядом → кэш не теряется" top={TOP + GRID + 30} color={theme.subtext} />
      {hit ? (
        <>
          <PulseRing x={wcenter.x} y={wcenter.y} triggerFrame={impactLocal} tone="warning" size={STEP * 2} />
          <Badge text="O(log n) · БЕЗ РАЗМЕРА КЭША" color={theme.warning} top={BADGE_TOP} />
        </>
      ) : null}
    </>
  );
};

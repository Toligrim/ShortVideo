import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

export type FaceIdDepthPhase = "darkness" | "dots" | "depth";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: FaceIdDepthPhase;
};

const W = layout.width;
const CX = W / 2;

// Геометрия лица в экранных координатах (центр кадра по X, чуть ниже заголовка)
const FACE_CX = CX;
const FACE_CY = 720;
const FACE_W = 290; // полуширина лица
const FACE_H = 380; // полувысота лица (v = +1 — макушка, v = −1 — подбородок)

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

// Детерминированный генератор (без Math.random) — кадры воспроизводимы
const seeded = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Рельеф лица как функция глубины z(u,v): выпуклость головы + нос + скулы + брови
const faceRelief = (u: number, v: number): number => {
  const ex = u / 0.62;
  const ey = v / 0.85;
  let base = 1 - ex * ex - ey * ey;
  base = base > 0 ? Math.sqrt(base) : 0;
  const nose = Math.exp(-((u * u) * 40 + ((v + 0.02) * (v + 0.02)) * 18)) * 0.55;
  const cheekL = Math.exp(-(((u + 0.34) * (u + 0.34)) * 30 + ((v - 0.12) * (v - 0.12)) * 22)) * 0.2;
  const cheekR = Math.exp(-(((u - 0.34) * (u - 0.34)) * 30 + ((v - 0.12) * (v - 0.12)) * 22)) * 0.2;
  const brow = Math.exp(-(u * u * 8 + ((v - 0.45) * (v - 0.45)) * 40)) * 0.12;
  return base * 0.7 + nose + cheekL + cheekR + brow;
};

// Цвет по глубине: дальше (z→0) — серый, ближе (z→1) — циан
const depthColor = (z: number) => {
  const t = clamp01(z / 1.15);
  return `rgb(${mix(139, 34, t)},${mix(150, 211, t)},${mix(168, 238, t)})`;
};

const faceX = (u: number, z = 0) => FACE_CX + u * FACE_W + z * 55;
const faceY = (v: number, z = 0) => FACE_CY - v * FACE_H - z * 30;

/** Силуэт лица: голова + плечи. Цвет/прозрачность задаёт вызывающий. */
const FaceSilhouette: React.FC<{ stroke: string; fill: string; opacity: number }> = ({ stroke, fill, opacity }) => (
  <svg viewBox={`0 0 ${W} ${layout.height}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
    <g opacity={opacity} fill={fill} stroke={stroke} strokeWidth={5}>
      <ellipse cx={FACE_CX} cy={FACE_CY} rx={300} ry={400} />
      <path
        d={`M ${FACE_CX - 250} ${FACE_CY + 330}
            C ${FACE_CX - 360} ${FACE_CY + 540}, ${FACE_CX - 170} ${FACE_CY + 540}, ${FACE_CX} ${FACE_CY + 540}
            C ${FACE_CX + 170} ${FACE_CY + 540}, ${FACE_CX + 360} ${FACE_CY + 540}, ${FACE_CX + 250} ${FACE_CY + 330} Z`}
        fill={fill}
      />
    </g>
  </svg>
);

/** Телефон-проектор с «глазком» сенсора TrueDepth внизу кадра. */
const PhoneProjector: React.FC<{ opacity: number }> = ({ opacity }) => {
  const px = FACE_CX;
  const py = 1230;
  return (
    <svg viewBox={`0 0 ${W} ${layout.height}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <g opacity={opacity}>
        <rect x={px - 85} y={py} width={170} height={250} rx={34} fill={theme.panel} stroke={`${theme.accent2}AA`} strokeWidth={4} />
        <rect x={px - 70} y={py + 26} width={140} height={180} rx={18} fill="#0B0E14" stroke={`${theme.accent2}55`} strokeWidth={2} />
        {/* сенсор TrueDepth — точечный проектор + Flood Illuminator */}
        <circle cx={px - 38} cy={py + 18} r={9} fill={theme.accent} />
        <circle cx={px + 38} cy={py + 18} r={9} fill={theme.warning} />
        <circle cx={px} cy={py + 18} r={6} fill={theme.accent2} />
      </g>
    </svg>
  );
};

export const FaceIdDepthVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "darkness" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 16, mass: 0.75 } });

  // Детерминированный паттерн IR-точек: плотнее на носу, скулах и лбу
  const dotRegions = [
    { cu: 0.0, cv: -0.05, ru: 0.17, rv: 0.21, n: 150 },
    { cu: -0.32, cv: 0.12, ru: 0.16, rv: 0.14, n: 90 },
    { cu: 0.32, cv: 0.12, ru: 0.16, rv: 0.14, n: 90 },
    { cu: 0.0, cv: 0.5, ru: 0.46, rv: 0.16, n: 130 },
  ];
  const irDots: { x: number; y: number; r: number; o: number }[] = [];
  let idx = 0;
  for (const r of dotRegions) {
    for (let k = 0; k < r.n; k++) {
      const su = seeded(idx, 1);
      const sv = seeded(idx, 2);
      const bright = 0.45 + seeded(idx, 3) * 0.55;
      const u = r.cu + (su * 2 - 1) * r.ru;
      const v = r.cv + (sv * 2 - 1) * r.rv;
      irDots.push({ x: faceX(u), y: faceY(v), r: 2.2 + bright * 1.6, o: bright });
      idx++;
    }
  }

  // Сетка 3D-карты глубины
  const NX = 22;
  const NY = 28;
  const grid: { x: number; y: number; z: number }[][] = [];
  const flat: { x: number; y: number }[][] = [];
  for (let j = 0; j < NY; j++) {
    const row: { x: number; y: number; z: number }[] = [];
    const frow: { x: number; y: number }[] = [];
    for (let i = 0; i < NX; i++) {
      const u = (i / (NX - 1)) * 2 - 1;
      const v = (j / (NY - 1)) * 2 - 1;
      const z = faceRelief(u, v);
      row.push({ x: faceX(u, z), y: faceY(v, z), z });
      frow.push({ x: faceX(u, 0), y: faceY(v, 0) });
    }
    grid.push(row);
    flat.push(frow);
  }

  return (
    <div style={{ position: "relative", width: W, height: layout.height, overflow: "hidden" }}>
      {/* фон — первый слой */}
      <div style={{ position: "absolute", inset: 0, background: theme.bg, opacity: enter }} />

      {phase === "darkness" && (
        <>
          {/* видимый контур лица в темноте */}
          <FaceSilhouette stroke={`${theme.accent}44`} fill={`${theme.accent}0C`} opacity={enter} />
          {/* аккуратное свечение Flood Illuminator от сенсора телефона */}
          <div
            style={{
              position: "absolute",
              left: FACE_CX - 360,
              top: 360,
              width: 720,
              height: 820,
              background: `radial-gradient(ellipse 50% 45% at 360px 360px, ${theme.accent}33 0%, ${theme.accent}11 35%, transparent 70%)`,
              opacity: enter * 0.9,
            }}
          />
          <PhoneProjector opacity={enter} />
          <div
            style={{
              position: "absolute",
              left: FACE_CX,
              top: 1190,
              transform: "translateX(-50%)",
              padding: "12px 26px",
              borderRadius: 999,
              background: `${theme.accent}18`,
              border: `2px solid ${theme.accent}88`,
              color: theme.accent,
              fontFamily: theme.mono,
              fontSize: 24,
              fontWeight: 800,
              textAlign: "center",
              whiteSpace: "nowrap",
              opacity: enter * 0.85,
            }}
          >
            Flood Illuminator — невидимая подсветка
          </div>
        </>
      )}

      {phase === "dots" && (
        <>
          <FaceSilhouette stroke={`${theme.accent2}66`} fill={`${theme.accent2}08`} opacity={enter} />
          {/* направление проектора: луч от «глазка» к лицу */}
          <svg viewBox={`0 0 ${W} ${layout.height}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
            <line x1={FACE_CX} y1={1250} x2={FACE_CX} y2={FACE_CY + 200} stroke={theme.accent} strokeWidth={4} strokeDasharray="10 14" opacity={enter * 0.6} />
            <polygon points={`${FACE_CX - 14},${FACE_CY + 215} ${FACE_CX + 14},${FACE_CY + 215} ${FACE_CX},${FACE_CY + 188}`} fill={theme.accent} opacity={enter * 0.7} />
            {irDots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={theme.accent} opacity={enter * d.o} />
            ))}
          </svg>
          <PhoneProjector opacity={enter} />
          <div
            style={{
              position: "absolute",
              left: FACE_CX,
              top: 1190,
              transform: "translateX(-50%)",
              padding: "12px 26px",
              borderRadius: 999,
              background: `${theme.accent2}18`,
              border: `2px solid ${theme.accent2}88`,
              color: theme.accent2,
              fontFamily: theme.mono,
              fontSize: 24,
              fontWeight: 800,
              textAlign: "center",
              whiteSpace: "nowrap",
              opacity: enter * 0.85,
            }}
          >
            30 000 невидимых точек
          </div>
          {local >= impactLocal && <PulseRing x={FACE_CX} y={FACE_CY} triggerFrame={impactLocal} tone="accent" size={200} />}
        </>
      )}

      {phase === "depth" && (
        <>
          {/* плоский силуэт — контраст «фото = 2D» против карты глубины */}
          <FaceSilhouette stroke={`${theme.subtext}33`} fill="transparent" opacity={enter} />
          <svg viewBox={`0 0 ${W} ${layout.height}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: enter }}>
            {/* 3D-карта: плоская сетка-призрак (без рельефа) для сравнения */}
            <g stroke={`${theme.subtext}22`} strokeWidth={1.5} fill="none">
              {flat.map((row, j) =>
                row.map((p, i) => {
                  if (i + 1 < NX)
                    return <line key={`h${j}-${i}`} x1={p.x} y1={p.y} x2={flat[j][i + 1].x} y2={flat[j][i + 1].y} />;
                  if (j + 1 < NY)
                    return <line key={`v${j}-${i}`} x1={p.x} y1={p.y} x2={flat[j + 1][i].x} y2={flat[j + 1][i].y} />;
                  return null;
                })
              )}
            </g>
            {/* wireframe рельефа */}
            <g fill="none">
              {grid.map((row, j) =>
                row.map((p, i) => {
                  const z = p.z;
                  const c = depthColor(z);
                  const o = 0.35 + 0.55 * clamp01(z / 1.15);
                  if (i + 1 < NX)
                    return <line key={`hw${j}-${i}`} x1={p.x} y1={p.y} x2={grid[j][i + 1].x} y2={grid[j][i + 1].y} stroke={c} strokeWidth={1.6} opacity={o} />;
                  if (j + 1 < NY)
                    return <line key={`vw${j}-${i}`} x1={p.x} y1={p.y} x2={grid[j + 1][i].x} y2={grid[j + 1][i].y} stroke={c} strokeWidth={1.6} opacity={o} />;
                  return null;
                })
              )}
            </g>
            {/* point-cloud рельефа */}
            {grid.flat().map((p, i) => (
              <circle key={`pt${i}`} cx={p.x} cy={p.y} r={2.4} fill={depthColor(p.z)} opacity={0.55 + 0.45 * clamp01(p.z / 1.15)} />
            ))}
          </svg>
          {/* ось глубины со градацией */}
          <div
            style={{
              position: "absolute",
              left: 968,
              top: 380,
              width: 34,
              height: 720,
              borderRadius: 10,
              background: `linear-gradient(to bottom, ${theme.accent} 0%, ${theme.subtext} 100%)`,
              opacity: enter * 0.9,
              border: `2px solid ${theme.panelBorder}`,
            }}
          />
          <div style={{ position: "absolute", left: 940, top: 332, color: theme.accent, fontFamily: theme.mono, fontSize: 22, fontWeight: 800, whiteSpace: "nowrap", opacity: enter }}>БЛИЖЕ</div>
          <div style={{ position: "absolute", left: 936, top: 1100, color: theme.subtext, fontFamily: theme.mono, fontSize: 22, fontWeight: 800, whiteSpace: "nowrap", opacity: enter }}>ДАЛЬШЕ</div>
          <div
            style={{
              position: "absolute",
              left: FACE_CX,
              top: 1200,
              transform: "translateX(-50%)",
              padding: "12px 26px",
              borderRadius: 999,
              background: `${theme.success}18`,
              border: `2px solid ${theme.success}88`,
              color: theme.success,
              fontFamily: theme.mono,
              fontSize: 24,
              fontWeight: 800,
              textAlign: "center",
              whiteSpace: "nowrap",
              opacity: enter * 0.85,
            }}
          >
            3D-рельеф лица
          </div>
          {local >= impactLocal && <PulseRing x={FACE_CX} y={FACE_CY} triggerFrame={impactLocal} tone="success" size={220} />}
        </>
      )}
    </div>
  );
};

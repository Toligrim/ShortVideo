import React from "react";
import { spring, interpolate } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

export type AmdahlSpeedupPhase = "workers" | "formula" | "limit";

const W = layout.width;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

const titleStyle: React.CSSProperties = {
  position: "absolute",
  left: W / 2,
  top: 270,
  transform: "translateX(-50%)",
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 3,
  fontSize: 40,
  color: theme.text,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const chip = (
  text: string,
  color: string,
  extra?: React.CSSProperties
): React.CSSProperties => ({
  padding: "12px 26px",
  borderRadius: 999,
  background: `${color}18`,
  border: `2px solid ${color}`,
  color,
  fontFamily: theme.font,
  fontWeight: 800,
  fontSize: 30,
  whiteSpace: "nowrap",
  ...extra,
});

/** Закон Амдала: разделение serial/parallel, формула ускорения и предел насыщения. */
export const AmdahlSpeedupVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: AmdahlSpeedupPhase;
  serial?: number; // доля нераспараллеливаемой работы, 0..1 (по умолчанию 0.05)
}> = ({ local, fps, impactLocal, phase = "workers", serial = 0.05 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;

  if (phase === "workers") {
    const parallel = 1 - serial;
    const barY = 760;
    const barX = 120;
    const barW = W - 240;
    const serialW = barW * serial;
    const parW = barW * parallel;
    const workerCount = 12;
    const cellW = parW / workerCount;
    return (
      <>
        <div style={{ ...titleStyle, opacity: enter }}>РАЗДЕЛЕНИЕ РАБОТЫ</div>
        {/* серийная часть — один поток */}
        <div
          style={{
            position: "absolute",
            left: barX,
            top: barY,
            width: serialW,
            height: 150,
            borderRadius: 18,
            background: `${theme.danger}2A`,
            border: `3px solid ${theme.danger}`,
            opacity: enter,
            transform: `translateY(${(1 - enter) * 60}px)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 26,
            color: theme.danger,
            textAlign: "center",
            padding: 8,
          }}
        >
          {Math.round(serial * 100)}% серийная
        </div>
        {/* параллельная часть — много потоков */}
        <div
          style={{
            position: "absolute",
            left: barX + serialW,
            top: barY,
            width: parW,
            height: 150,
            borderRadius: 18,
            background: `${theme.accent}1A`,
            border: `3px solid ${theme.accent}`,
            opacity: enter,
            transform: `translateY(${(1 - enter) * 60}px)`,
          }}
        >
          {Array.from({ length: workerCount }).map((_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: i * cellW + cellW / 2,
                top: 75,
                transform: "translate(-50%, -50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                opacity: smooth(clamp01((local - i * 3) / 16)) * enter,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: theme.accent,
                  boxShadow: `0 0 18px ${theme.accent}AA`,
                }}
              />
            </div>
          ))}
          <div
            style={{
              position: "absolute",
              left: parW / 2,
              top: 132,
              transform: "translate(-50%, 0)",
              fontFamily: theme.font,
              fontWeight: 800,
              fontSize: 26,
              color: theme.accent,
              whiteSpace: "nowrap",
            }}
          >
            {Math.round(parallel * 100)}% параллельная
          </div>
        </div>
        {/* один поток под серийной частью */}
        <div
          style={{
            position: "absolute",
            left: barX + serialW / 2,
            top: barY + 230,
            transform: "translate(-50%, 0)",
            ...chip("1 нить", theme.danger, { opacity: enter }),
          }}
        />
        {/* много потоков под параллельной частью */}
        <div
          style={{
            position: "absolute",
            left: barX + serialW + parW / 2,
            top: barY + 230,
            transform: "translate(-50%, 0)",
            ...chip(`${workerCount} нитей`, theme.accent, { opacity: enter }),
          }}
        />
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: barY + 360,
            transform: "translateX(-50%)",
            ...chip("5% — только в одну нитку, не размножить", theme.danger, {
              opacity: hit ? pop : enter * 0.4,
              boxShadow: hit ? `0 0 45px ${theme.danger}55` : "none",
              fontSize: 28,
            }),
          }}
        />
        {hit ? (
          <PulseRing x={barX + serialW / 2} y={barY + 75} triggerFrame={impactLocal} tone="danger" size={360} />
        ) : null}
      </>
    );
  }

  if (phase === "formula") {
    const formula = "S = 1 / ((1 − p) + p / n)";
    const sub = `S = 1 / (${serial.toFixed(2)} + ${(1 - serial).toFixed(2)} / n)`;
    return (
      <>
        <div style={{ ...titleStyle, opacity: enter }}>ФОРМУЛА УСКОРЕНИЯ</div>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 620,
            transform: `translate(-50%, 0) scale(${0.92 + 0.08 * enter})`,
            minWidth: 720,
            padding: "40px 50px",
            borderRadius: 30,
            background: theme.panel,
            border: `3px solid ${theme.accent}`,
            opacity: enter,
            textAlign: "center",
            boxShadow: `0 0 70px ${theme.accent}33`,
          }}
        >
          <div
            style={{
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 60,
              color: theme.accent,
              textShadow: `0 0 30px ${theme.accent}66`,
            }}
          >
            {formula}
          </div>
          <div
            style={{
              marginTop: 26,
              fontFamily: theme.mono,
              fontSize: 36,
              color: theme.subtext,
            }}
          >
            {sub}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 940,
            transform: "translateX(-50%)",
            ...chip("(1 − p) — серийная доля", theme.danger, { opacity: enter }),
          }}
        />
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1030,
            transform: "translateX(-50%)",
            ...chip("p / n — параллельная, делённая на ядра", theme.accent, { opacity: enter }),
          }}
        />
        {hit ? <PulseRing x={W / 2} y={710} triggerFrame={impactLocal} size={520} /> : null}
      </>
    );
  }

  /* phase === "limit": кривая насыщения */
  const p = 1 - serial; // параллельная доля
  const speedup = (n: number) => 1 / (serial + p / n);
  const limit = 1 / serial; // предел при n→∞
  const xLeft = 200;
  const xRight = 980;
  const yBottom = 1320; // S = 1
  const yTop = 470; // S = limit
  const sx = (n: number) => xLeft + (Math.log(n) / Math.log(1000)) * (xRight - xLeft);
  const sy = (s: number) => yBottom - ((s - 1) / (limit - 1)) * (yBottom - yTop);
  const ns = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const path = ns.map((n) => `${sx(n).toFixed(1)},${sy(speedup(n)).toFixed(1)}`).join(" ");
  const limitY = sy(limit);
  const n100 = speedup(100);
  const n1000 = speedup(1000);
  return (
    <>
      <div style={{ ...titleStyle, opacity: enter }}>ПРЕДЕЛ НАСЫЩЕНИЯ</div>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 360,
          transform: "translateX(-50%)",
          ...chip(
            `предел ≈ ${limit.toFixed(0)}×  (1 / ${serial.toFixed(2)})`,
            theme.warning,
            { opacity: enter }
          ),
        }}
      />
      <svg
        width={W}
        height={layout.height}
        style={{ position: "absolute", left: 0, top: 0, opacity: enter }}
      >
        {/* оси */}
        <line x1={xLeft} y1={yBottom} x2={xRight} y2={yBottom} stroke={theme.panelBorder} strokeWidth={3} />
        <line x1={xLeft} y1={yTop} x2={xLeft} y2={yBottom} stroke={theme.panelBorder} strokeWidth={3} />
        {/* линия предела */}
        <line
          x1={xLeft}
          y1={limitY}
          x2={xRight}
          y2={limitY}
          stroke={theme.warning}
          strokeWidth={3}
          strokeDasharray="14 12"
          opacity={0.85}
        />
        {/* кривая */}
        <polyline points={path} fill="none" stroke={theme.accent} strokeWidth={6} strokeLinejoin="round" />
        {/* маркер 100 ядер */}
        <circle cx={sx(100)} cy={sy(n100)} r={16} fill={theme.success} />
        <circle cx={sx(1000)} cy={sy(n1000)} r={16} fill={theme.accent2} />
      </svg>
      {/* подписи осей */}
      <div style={{ position: "absolute", left: xLeft - 30, top: yBottom + 14, fontFamily: theme.mono, fontSize: 26, color: theme.subtext }}>1</div>
      <div style={{ position: "absolute", left: sx(100) - 24, top: yBottom + 14, fontFamily: theme.mono, fontSize: 26, color: theme.subtext }}>100</div>
      <div style={{ position: "absolute", left: xRight - 50, top: yBottom + 14, fontFamily: theme.mono, fontSize: 26, color: theme.subtext }}>1000 ядер</div>
      <div style={{ position: "absolute", left: 60, top: limitY - 18, fontFamily: theme.mono, fontSize: 26, color: theme.warning }}>≈{limit.toFixed(0)}×</div>
      <div
        style={{
          position: "absolute",
          left: sx(100),
          top: sy(n100) - 70,
          transform: "translateX(-50%)",
          ...chip("100 ядер ≈ 16.8×", theme.success, { opacity: enter, fontSize: 26 }),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: sx(1000),
          top: sy(n1000) - 70,
          transform: "translateX(-50%)",
          ...chip("1000 ядер ≈ 19.6×", theme.accent2, { opacity: enter, fontSize: 26 }),
        }}
      />
      {hit ? <PulseRing x={sx(1000)} y={sy(n1000)} triggerFrame={impactLocal} tone="accent2" size={220} /> : null}
    </>
  );
};

export default AmdahlSpeedupVisual;

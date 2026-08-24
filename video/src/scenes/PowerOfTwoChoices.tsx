import React from "react";
import { spring, interpolate, interpolateColors } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

export type PowerOfTwoPhase = "one" | "two" | "compare";

const W = layout.width;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

const BIN_COUNT = 12;
const BIN_W = 64;
const BIN_GAP = 10;
const ROW_W = BIN_COUNT * BIN_W + (BIN_COUNT - 1) * BIN_GAP;
const ROW_X = (W - ROW_W) / 2;
const BIN_BASE_Y = 1340; // низ корзин

// детерминированные высоты корзин: одна — высокий пик перегруза
const HEIGHTS_ONE = [70, 95, 60, 110, 80, 540, 75, 100, 65, 90, 85, 70];
const PEAK_ONE = 5;
// две корзины-кандидата (d=2): меньшая выбрана
const CAND_A = 4;
const CAND_B = 8;
const HEIGHTS_TWO = [120, 140, 110, 150, 130, 200, 115, 160, 125, 145, 135, 170];

const binX = (i: number) => ROW_X + i * (BIN_W + BIN_GAP);

const labelStyle: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 2,
};

export const PowerOfTwoChoices: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: PowerOfTwoPhase;
}> = ({ local, fps, impactLocal, phase = "one" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;

  /* ── фаза ONE: один случайный выбор → высокий пик ── */
  if (phase === "one") {
    const peakX = binX(PEAK_ONE) + BIN_W / 2;
    const pillP = smooth(clamp01(local / Math.max(impactLocal, 1)));
    const pillY = interpolate(pillP, [0, 1], [260, BIN_BASE_Y - HEIGHTS_ONE[PEAK_ONE] - 30]);
    const peakColor = interpolateColors(clamp01(local / Math.max(impactLocal, 1)), [0, 1], [theme.warning, theme.danger]);
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 300,
            transform: "translateX(-50%)",
            ...labelStyle,
            fontSize: 40,
            color: theme.text,
            opacity: enter,
          }}
        >
          ОДИН СЛУЧАЙНЫЙ ВЫБОР
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 372,
            transform: "translateX(-50%)",
            padding: "10px 26px",
            borderRadius: 999,
            background: `${theme.warning}18`,
            border: `2px solid ${theme.warning}`,
            color: theme.warning,
            ...labelStyle,
            fontSize: 28,
            opacity: enter,
          }}
        >
          d = 1
        </div>
        {/* корзины */}
        {HEIGHTS_ONE.map((h, i) => {
          const isPeak = i === PEAK_ONE;
          const color = isPeak ? peakColor : theme.accent2;
          const op = enter * (isPeak ? 1 : 0.85);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: binX(i),
                top: BIN_BASE_Y - h,
                width: BIN_W,
                height: h,
                borderRadius: 14,
                border: `3px solid ${color}`,
                background: `${color}${isPeak ? "33" : "12"}`,
                opacity: op,
                transform: `translateY(${(1 - enter) * 60}px) scale(${isPeak && hit ? 1 + 0.05 * Math.sin((local - impactLocal) / 5) : 1})`,
                boxShadow: isPeak ? `0 0 ${40 + 50 * pop}px ${theme.danger}88` : "none",
              }}
            />
          );
        })}
        {/* летящая задача */}
        <div
          style={{
            position: "absolute",
            left: peakX,
            top: pillY,
            transform: "translate(-50%, -50%)",
            padding: "12px 18px",
            borderRadius: 999,
            background: theme.danger,
            color: "#1B0E0E",
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 26,
            boxShadow: `0 0 30px ${theme.danger}AA`,
            opacity: enter,
          }}
        >
          задача
        </div>
        {hit ? <PulseRing x={peakX} y={BIN_BASE_Y - HEIGHTS_ONE[PEAK_ONE] / 2} triggerFrame={impactLocal} tone="danger" size={360} /> : null}
        <div
          style={{
            position: "absolute",
            left: peakX,
            top: BIN_BASE_Y - HEIGHTS_ONE[PEAK_ONE] - 96,
            transform: "translate(-50%, -50%)",
            padding: "14px 24px",
            borderRadius: 18,
            background: `${theme.danger}1F`,
            border: `2px solid ${theme.danger}`,
            color: theme.danger,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 30,
            whiteSpace: "nowrap",
            opacity: hit ? pop : enter * 0.5,
            boxShadow: hit ? `0 0 45px ${theme.danger}55` : "none",
          }}
        >
          пик ≈ ln n / ln ln n
        </div>
      </>
    );
  }

  /* ── фаза TWO: две случайные корзины, выбираем меньшую ── */
  if (phase === "two") {
    const aX = binX(CAND_A) + BIN_W / 2;
    const bX = binX(CAND_B) + BIN_W / 2;
    const smaller = HEIGHTS_TWO[CAND_A] <= HEIGHTS_TWO[CAND_B] ? CAND_A : CAND_B;
    const selX = smaller === CAND_A ? aX : bX;
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 300,
            transform: "translateX(-50%)",
            ...labelStyle,
            fontSize: 40,
            color: theme.text,
            opacity: enter,
          }}
        >
          ДВЕ СЛУЧАЙНЫЕ КОРЗИНЫ
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 372,
            transform: "translateX(-50%)",
            padding: "10px 26px",
            borderRadius: 999,
            background: `${theme.accent2}18`,
            border: `2px solid ${theme.accent2}`,
            color: theme.accent2,
            ...labelStyle,
            fontSize: 28,
            opacity: enter,
          }}
        >
          d = 2
        </div>
        {HEIGHTS_TWO.map((h, i) => {
          const isCand = i === CAND_A || i === CAND_B;
          const isSel = i === smaller;
          const color = isSel ? theme.success : isCand ? theme.accent2 : theme.accent;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: binX(i),
                top: BIN_BASE_Y - h,
                width: BIN_W,
                height: h,
                borderRadius: 14,
                border: `3px solid ${color}`,
                background: `${color}${isCand ? "2A" : "0F"}`,
                opacity: enter * (isCand ? 1 : 0.7),
                transform: `translateY(${(1 - enter) * 60}px) scale(${isSel && hit ? 1 + 0.05 * Math.sin((local - impactLocal) / 5) : 1})`,
                boxShadow: isSel && hit ? `0 0 ${40 + 50 * pop}px ${theme.success}88` : "none",
              }}
            />
          );
        })}
        {/* стрелка от бо́льшей к меньшей */}
        <div
          style={{
            position: "absolute",
            left: (smaller === CAND_A ? bX : aX),
            top: BIN_BASE_Y - Math.max(HEIGHTS_TWO[CAND_A], HEIGHTS_TWO[CAND_B]) - 70,
            width: Math.abs(bX - aX),
            height: 4,
            background: theme.success,
            transform: `translateY(-50%) scaleX(${hit ? pop : enter * 0.6})`,
            transformOrigin: smaller === CAND_A ? "right" : "left",
            opacity: enter,
          }}
        >
          <span style={{ position: "absolute", right: -4, top: "50%", transform: "translateY(-50%)", color: theme.success, fontSize: 38 }}>›</span>
        </div>
        {hit ? <PulseRing x={selX} y={BIN_BASE_Y - HEIGHTS_TWO[smaller] / 2} triggerFrame={impactLocal} tone="success" size={300} /> : null}
        <div
          style={{
            position: "absolute",
            left: selX,
            top: BIN_BASE_Y - HEIGHTS_TWO[smaller] - 90,
            transform: "translate(-50%, -50%)",
            padding: "14px 24px",
            borderRadius: 18,
            background: `${theme.success}1F`,
            border: `2px solid ${theme.success}`,
            color: theme.success,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 30,
            whiteSpace: "nowrap",
            opacity: hit ? pop : enter * 0.5,
            boxShadow: hit ? `0 0 45px ${theme.success}55` : "none",
          }}
        >
          выбрана меньшая ≤ ln ln n
        </div>
      </>
    );
  }

  /* ── фаза COMPARE: d=1 / d=2 / d=3 ── */
  const bars = [
    { d: "d = 1", h: 560, color: theme.danger, note: "высокий" },
    { d: "d = 2", h: 190, color: theme.accent, note: "низкий" },
    { d: "d = 3", h: 158, color: theme.accent2, note: "едва меньше" },
  ];
  const barW = 200;
  const barGap = 70;
  const barsW = bars.length * barW + (bars.length - 1) * barGap;
  const barsX = (W - barsW) / 2;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 290,
          transform: "translateX(-50%)",
          ...labelStyle,
          fontSize: 40,
          color: theme.text,
          opacity: enter,
        }}
      >
        СРАВНЕНИЕ ВЫБОРОВ
      </div>
      {bars.map((b, i) => {
        const x = barsX + i * (barW + barGap);
        const grow = smooth(clamp01((local - i * 8) / 26));
        const h = b.h * grow;
        return (
          <React.Fragment key={b.d}>
            <div
              style={{
                position: "absolute",
                left: x,
                top: BIN_BASE_Y - h,
                width: barW,
                height: h,
                borderRadius: 18,
                border: `3px solid ${b.color}`,
                background: `${b.color}22`,
                opacity: enter,
                transform: `translateY(${(1 - enter) * 60}px)`,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: x + barW / 2,
                top: BIN_BASE_Y + 30,
                transform: "translateX(-50%)",
                ...labelStyle,
                fontSize: 30,
                color: b.color,
                opacity: enter,
              }}
            >
              {b.d}
            </div>
            <div
              style={{
                position: "absolute",
                left: x + barW / 2,
                top: BIN_BASE_Y - h - 56,
                transform: "translateX(-50%)",
                fontFamily: theme.font,
                fontWeight: 800,
                fontSize: 26,
                color: theme.subtext,
                opacity: enter,
              }}
            >
              {b.note}
            </div>
          </React.Fragment>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 650,
          transform: "translateX(-50%)",
          padding: "16px 30px",
          borderRadius: 22,
          background: `${theme.success}1F`,
          border: `2px solid ${theme.success}`,
          color: theme.success,
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 30,
          textAlign: "center",
          whiteSpace: "nowrap",
          opacity: enter,
          boxShadow: "0 0 45px " + theme.success + "44",
        }}
      >
        d=1 → d=2: экспон. ↓ · d=3: +константа
      </div>
    </>
  );
};

export default PowerOfTwoChoices;

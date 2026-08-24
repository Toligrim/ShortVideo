import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

export type BbpDigitPhase = "formula" | "extract";

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

const Chip: React.FC<{
  text: string;
  color: string;
  style?: React.CSSProperties;
  extra?: React.CSSProperties;
}> = ({ text, color, style, extra }) => (
  <div
    style={{
      position: "absolute",
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
      ...style,
    }}
  >
    {text}
  </div>
);

/** BBP-формула: карточка с формулой Bailey-Borwein-Plouffe и результатом извлечения. */
export const BbpDigitVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: BbpDigitPhase;
  position?: number;
  hexDigit?: string;
}> = ({ local, fps, impactLocal, phase = "formula", position = 10, hexDigit = "2" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;

  if (phase === "formula") {
    const terms = [
      { coeff: "4", den: "8k+1", color: theme.accent },
      { coeff: "2", den: "8k+4", color: theme.accent2 },
      { coeff: "1", den: "8k+5", color: theme.success },
      { coeff: "1", den: "8k+6", color: theme.warning },
    ];
    const cardW = 840;
    const cardH = 580;
    const cardX = W / 2 - cardW / 2;
    const cardY = 420;

    return (
      <>
        <div style={{ ...titleStyle, opacity: enter }}>ФОРМУЛА BBP</div>
        {/* заголовок: π = */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 380,
            transform: "translateX(-50%)",
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 30,
            color: theme.subtext,
            opacity: enter,
            whiteSpace: "nowrap",
          }}
        >
          Bailey — Borwein — Plouffe, 1995
        </div>
        {/* карточка формулы */}
        <div
          style={{
            position: "absolute",
            left: cardX,
            top: cardY,
            width: cardW,
            height: cardH,
            borderRadius: 30,
            background: theme.panel,
            border: `3px solid ${theme.accent}66`,
            boxShadow: `0 0 80px ${theme.accent}22`,
            opacity: enter,
            transform: `translateY(${(1 - enter) * 80}px) scale(${0.92 + 0.08 * enter})`,
            overflow: "hidden",
          }}
        >
          {/* верхняя полоса */}
          <div
            style={{
              height: 60,
              background: `${theme.accent}18`,
              display: "flex",
              alignItems: "center",
              paddingLeft: 28,
              gap: 12,
            }}
          >
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#FF5F57" }} />
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#FEBC2E" }} />
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#28C840" }} />
            <div style={{ marginLeft: 14, fontFamily: theme.mono, fontSize: 22, color: theme.subtext }}>bbp.py</div>
          </div>
          {/* формула */}
          <div
            style={{
              padding: "30px 40px",
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 32,
              color: theme.text,
              lineHeight: 2.0,
            }}
          >
            <div style={{ color: theme.accent, fontSize: 38 }}>π = Σ (1/16<sup>k</sup>)</div>
            <div style={{ marginTop: 10 }}>
              <span style={{ color: theme.accent }}>× (</span>
              <span style={{ color: theme.accent }}>4/(8k+1)</span>
              <span style={{ color: theme.subtext }}> − </span>
              <span style={{ color: theme.accent2 }}>2/(8k+4)</span>
              <span style={{ color: theme.subtext }}> − </span>
              <span style={{ color: theme.success }}>1/(8k+5)</span>
              <span style={{ color: theme.subtext }}> − </span>
              <span style={{ color: theme.warning }}>1/(8k+6)</span>
              <span style={{ color: theme.accent }}>)</span>
            </div>
          </div>
          {/* четыре цветные полосы */}
          {terms.map((t, i) => {
            const p = smooth(clamp01((local - i * 6 - 10) / 16));
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 40,
                  bottom: 30 + i * 58,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  opacity: p,
                  transform: `translateX(${(1 - p) * -30}px)`,
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 8, background: t.color }} />
                <div style={{ fontFamily: theme.mono, fontSize: 26, color: t.color }}>
                  ±{t.coeff} / (8k+{t.den.split("+")[1]})
                </div>
              </div>
            );
          })}
        </div>
        <Chip
          text={`степень 16 в знаменателе → модульная арифметика`}
          color={theme.accent}
          style={{ left: W / 2, top: cardY + cardH + 50, transform: "translateX(-50%)" }}
          extra={{ opacity: hit ? pop : enter * 0.4, fontSize: 26 }}
        />
        {hit ? <PulseRing x={W / 2} y={cardY + cardH / 2} triggerFrame={impactLocal} tone="accent" size={700} /> : null}
      </>
    );
  }

  /* phase === "extract": извлечение шестнадцатеричного знака */
  const digitPop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 10, mass: 0.6 } }) : 0;
  const fracParts = [0.718, 0.412, 0.275, 0.333];

  return (
    <>
      <div style={{ ...titleStyle, opacity: enter }}>ИЗВЛЕЧЕНИЕ ЗНАКА</div>
      {/* позиция */}
      <div
        style={{
          position: "absolute",
          left: W / 2 - 350,
          top: 420,
          width: 700,
          height: 100,
          borderRadius: 22,
          background: `${theme.accent}0D`,
          border: `2px solid ${theme.accent}44`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          opacity: enter,
        }}
      >
        <div style={{ fontFamily: theme.mono, fontSize: 30, color: theme.subtext }}>позиция</div>
        <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 44, color: theme.accent }}>{position}</div>
        <div style={{ fontFamily: theme.mono, fontSize: 30, color: theme.subtext }}>в hex</div>
      </div>
      {/* дробные части четырёх рядов */}
      <div
        style={{
          position: "absolute",
          left: W / 2 - 380,
          top: 560,
          width: 760,
          height: 300,
          borderRadius: 24,
          background: theme.panel,
          border: `2px solid ${theme.panelBorder}`,
          opacity: enter,
        }}
      >
        {fracParts.map((f, i) => {
          const p = smooth(clamp01((local - i * 5 - 8) / 14));
          const colors = [theme.accent, theme.accent2, theme.success, theme.warning];
          const labels = ["4/(8k+1)", "2/(8k+4)", "1/(8k+5)", "1/(8k+6)"];
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 24,
                top: 20 + i * 68,
                display: "flex",
                alignItems: "center",
                gap: 14,
                opacity: p,
              }}
            >
              <div style={{ width: 16, height: 16, borderRadius: 5, background: colors[i] }} />
              <div style={{ fontFamily: theme.mono, fontSize: 24, color: colors[i], width: 130 }}>{labels[i]}</div>
              <div style={{ fontFamily: theme.mono, fontSize: 24, color: theme.subtext }}>= {f.toFixed(3)}</div>
            </div>
          );
        })}
        <div
          style={{
            position: "absolute",
            right: 24,
            top: 120,
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 30,
            color: theme.accent,
            opacity: enter,
          }}
        >
          сумма = 0.13...
        </div>
      </div>
      {/* извлечённый знак */}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 950,
          transform: `translate(-50%, 0) scale(${digitPop})`,
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 200,
          color: theme.accent,
          textShadow: `0 0 80px ${theme.accent}66, 0 6px 40px rgba(0,0,0,0.7)`,
          opacity: hit ? 1 : enter * 0.2,
        }}
      >
        {hexDigit}
      </div>
      <Chip
        text={`${hexDigit} — шестнадцатеричный знак на позиции ${position}`}
        color={theme.success}
        style={{ left: W / 2, top: 1200, transform: "translateX(-50%)" }}
        extra={{ opacity: hit ? pop : 0, fontSize: 28 }}
      />
      <Chip
        text="без предыдущих знаков — только здесь и дальше"
        color={theme.warning}
        style={{ left: W / 2, top: 1290, transform: "translateX(-50%)" }}
        extra={{ opacity: hit ? pop * 0.8 : 0, fontSize: 24 }}
      />
      {hit ? <PulseRing x={W / 2} y={1050} triggerFrame={impactLocal} tone="success" size={360} /> : null}
    </>
  );
};

export default BbpDigitVisual;

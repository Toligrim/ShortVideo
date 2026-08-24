import React from "react";
import { spring, interpolate } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

export type BbpExtractPhase = "series" | "remainders" | "digit";

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

/** BBP-формула: четыре ряда с общей формулой, модульные остатки → шестнадцатеричный знак. */
export const BbpExtractVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: BbpExtractPhase;
  position?: number;
}> = ({ local, fps, impactLocal, phase = "series", position = 10 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;

  if (phase === "series") {
    const terms = [
      { label: "4 / (8k+1)", color: theme.accent, num: 4, den: "8k+1", sign: "+" },
      { label: "−2 / (8k+4)", color: theme.accent2, num: 2, den: "8k+4", sign: "−" },
      { label: "−1 / (8k+5)", color: theme.success, num: 1, den: "8k+5", sign: "−" },
      { label: "−1 / (8k+6)", color: theme.warning, num: 1, den: "8k+6", sign: "−" },
    ];
    const cardH = 170;
    const cardGap = 18;
    const startY = 480;

    return (
      <>
        <div style={{ ...titleStyle, opacity: enter }}>ЧЕТЫРЕ БЕСКОНЕЧНЫХ РЯДА</div>
        <div
          style={{
            position: "absolute",
            width: W - 40,
            left: W / 2,
            top: 380,
            transform: "translateX(-50%)",
            fontFamily: theme.mono,
            fontSize: 24,
            color: theme.subtext,
            opacity: enter,
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          π = Σ (1/16<sup>k</sup>) × ( 4/(8k+1) − 2/(8k+4) − 1/(8k+5) − 1/(8k+6) )
        </div>
        {terms.map((t, i) => {
          const p = smooth(clamp01((local - i * 8) / 20));
          const y = startY + i * (cardH + cardGap);
          return (
            <React.Fragment key={i}>
              <div
                style={{
                  position: "absolute",
                  left: W / 2 - 400,
                  top: y,
                  width: 800,
                  height: cardH,
                  borderRadius: 24,
                  background: `${t.color}0D`,
                  border: `3px solid ${t.color}88`,
                  opacity: p,
                  transform: `translateX(${(1 - p) * -60}px) scale(${0.92 + 0.08 * p})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 20,
                }}
              >
                <div
                  style={{
                    fontFamily: theme.mono,
                    fontSize: 34,
                    color: t.color,
                    opacity: 0.7,
                    minWidth: 50,
                    textAlign: "right",
                  }}
                >
                  {t.sign}
                </div>
                <div
                  style={{
                    fontFamily: theme.mono,
                    fontWeight: 800,
                    fontSize: 44,
                    color: theme.text,
                    textAlign: "center",
                  }}
                >
                  {t.label}
                </div>
              </div>
              {i < terms.length - 1 ? (
                <div
                  style={{
                    position: "absolute",
                    left: W / 2,
                    top: y + cardH,
                    width: 4,
                    height: cardGap,
                    background: `${t.color}66`,
                    opacity: p,
                  }}
                />
              ) : null}
            </React.Fragment>
          );
        })}
        <Chip
          text={`степень 16^${position} → не нужны предыдущие знаки`}
          color={theme.success}
          style={{ left: W / 2, top: startY + 4 * (cardH + cardGap) + 30, transform: "translateX(-50%)" }}
          extra={{ opacity: hit ? pop : enter * 0.5, fontSize: 28 }}
        />
        {hit ? <PulseRing x={W / 2} y={startY + 2 * (cardH + cardGap)} triggerFrame={impactLocal} tone="success" size={600} /> : null}
      </>
    );
  }

  if (phase === "remainders") {
    const rows = [
      { coeff: "4", den: "8k+1", color: theme.accent, mod: "mod 16" },
      { coeff: "2", den: "8k+4", color: theme.accent2, mod: "mod 16" },
      { coeff: "1", den: "8k+5", color: theme.success, mod: "mod 16" },
      { coeff: "1", den: "8k+6", color: theme.warning, mod: "mod 16" },
    ];
    const rowH = 130;
    const rowGap = 20;
    const startY = 460;
    const leftCard = 40;
    const colArrow = W / 2 + 40;
    const colResult = W / 2 + 220;

    return (
      <>
        <div style={{ ...titleStyle, opacity: enter }}>ОСТАТКИ ПО МОДУЛЮ 16</div>
        {rows.map((r, i) => {
          const p = smooth(clamp01((local - i * 6) / 18));
          const y = startY + i * (rowH + rowGap);
          const remainders = [2, 12, 5, 11];
          return (
            <React.Fragment key={i}>
              {/* ряд: коэффициент / (8k+d) mod 16 = остаток */}
              <div
                style={{
                  position: "absolute",
                  left: leftCard,
                  top: y,
                  width: 500,
                  height: rowH,
                  borderRadius: 20,
                  background: `${r.color}0D`,
                  border: `3px solid ${r.color}66`,
                  opacity: p,
                  transform: `scale(${0.92 + 0.08 * p})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ fontFamily: theme.mono, fontSize: 28, color: theme.subtext }}>
                  {r.coeff} / (8k+{r.den.split("+")[1]})
                </div>
                <div style={{ margin: "0 18px", fontFamily: theme.mono, fontSize: 26, color: theme.subtext }}>
                  {r.mod}
                </div>
              </div>
              {/* стрелка */}
              <div
                style={{
                  position: "absolute",
                  left: colArrow,
                  top: y + rowH / 2,
                  transform: "translate(-50%, -50%)",
                  fontFamily: theme.mono,
                  fontSize: 36,
                  color: r.color,
                  opacity: p,
                }}
              >
                →
              </div>
              {/* остаток */}
              <div
                style={{
                  position: "absolute",
                  left: colResult,
                  top: y,
                  width: 120,
                  height: rowH,
                  borderRadius: 20,
                  background: `${r.color}18`,
                  border: `3px solid ${r.color}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: p,
                  transform: `scale(${0.92 + 0.08 * p})`,
                }}
              >
                <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 52, color: r.color }}>
                  {remainders[i]}
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <Chip
          text={`позиция ${position} → дробная часть каждого ряда`}
          color={theme.accent}
          style={{ left: W / 2, top: startY + 4 * (rowH + rowGap) + 40, transform: "translateX(-50%)" }}
          extra={{ opacity: hit ? pop : enter * 0.5, fontSize: 28 }}
        />
        {hit ? <PulseRing x={colResult + 60} y={startY + 1.5 * (rowH + rowGap)} triggerFrame={impactLocal} tone="accent" size={400} /> : null}
      </>
    );
  }

  /* phase === "digit": извлечённый шестнадцатеричный знак */
  const hexDigit = "2";
  const digitPop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 10, mass: 0.6 } }) : 0;
  const fractionals = [
    { label: "4/(8k+1)", color: theme.accent },
    { label: "−2/(8k+4)", color: theme.accent2 },
    { label: "−1/(8k+5)", color: theme.success },
    { label: "−1/(8k+6)", color: theme.warning },
  ];

  return (
    <>
      <div style={{ ...titleStyle, opacity: enter }}>ИЗВЛЕЧЁННЫЙ ЗНАК</div>
      {/* дробная часть → знак */}
      <div
        style={{
          position: "absolute",
          left: W / 2 - 380,
          top: 480,
          width: 760,
          height: 340,
          borderRadius: 28,
          background: theme.panel,
          border: `3px solid ${theme.panelBorder}`,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 60}px)`,
        }}
      >
        {fractionals.map((f, i) => {
          const p = smooth(clamp01((local - i * 5) / 16));
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 30,
                top: 28 + i * 78,
                display: "flex",
                alignItems: "center",
                gap: 14,
                opacity: p,
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  background: f.color,
                }}
              />
              <div style={{ fontFamily: theme.mono, fontSize: 26, color: theme.subtext }}>{f.label}</div>
            </div>
          );
        })}
        <div
          style={{
            position: "absolute",
            left: 400,
            top: 120,
            fontFamily: theme.mono,
            fontSize: 28,
            color: theme.subtext,
            opacity: enter,
          }}
        >
          сумма дробных частей
        </div>
        <div
          style={{
            position: "absolute",
            left: 400,
            top: 180,
            fontFamily: theme.mono,
            fontSize: 22,
            color: theme.subtext,
            opacity: enter,
          }}
        >
          = 0.850...
        </div>
        <div
          style={{
            position: "absolute",
            left: 400,
            top: 230,
            fontFamily: theme.mono,
            fontSize: 28,
            color: theme.accent,
            opacity: enter,
          }}
        >
          → шестнадцатеричный знак:
        </div>
      </div>
      {/* крупный извлечённый знак */}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 1000,
          transform: `translate(-50%, 0) scale(${digitPop})`,
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 180,
          color: theme.accent,
          textShadow: `0 0 60px ${theme.accent}77, 0 4px 30px rgba(0,0,0,0.6)`,
          opacity: hit ? 1 : enter * 0.3,
        }}
      >
        {hexDigit}
      </div>
      <Chip
        text={`позиция ${position} = ${hexDigit} (hex)`}
        color={theme.success}
        style={{ left: W / 2, top: 1230, transform: "translateX(-50%)" }}
        extra={{ opacity: hit ? pop : 0, fontSize: 32 }}
      />
      {hit ? <PulseRing x={W / 2} y={1080} triggerFrame={impactLocal} tone="success" size={320} /> : null}
    </>
  );
};

export default BbpExtractVisual;

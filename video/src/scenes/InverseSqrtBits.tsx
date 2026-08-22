import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

const W = layout.width;
const CX = W / 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => { const c = clamp01(t); return c * c * (3 - 2 * c); };

const monoStyle: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: "strip" | "newton";
};

export const InverseSqrtBits: React.FC<Props> = ({ local, fps, impactLocal, phase = "strip" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;

  if (phase === "strip") {
    const expBits = [0, 1, 1, 1, 1, 1, 1, 1];
    const mantBits = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const allBits = [0, ...expBits, ...mantBits];

    const bitW = 26;
    const bitH = 32;
    const bitGap = 3;
    const stripW = 32 * (bitW + bitGap) - bitGap;
    const stripX = CX - stripW / 2;
    const stripY = 520;

    const shiftProg = smooth(clamp01(local / Math.max(impactLocal, 1)));
    const magicConstP = smooth(clamp01((local - impactLocal + 14) / 18));
    const resultP = smooth(clamp01((local - impactLocal + 4) / 20));

    const bitType = (i: number) => i === 0 ? "sign" : i <= 8 ? "exp" : "mant";
    const bitColor = (i: number) => {
      const t = bitType(i);
      if (t === "sign") return theme.subtext;
      if (t === "exp") return theme.accent;
      return theme.accent2;
    };

    const bitCell = (bit: number, i: number, highlighted = false, opacityVal = enter) => (
      <div key={i} style={{
        width: bitW, height: bitH, borderRadius: 6,
        border: `2px solid ${highlighted ? theme.warning : bitColor(i)}${highlighted ? "FF" : "88"}`,
        background: highlighted ? `${theme.warning}22` : bit ? `${bitColor(i)}22` : "#0D1420",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: theme.mono, fontWeight: 800, fontSize: 18,
        color: highlighted ? theme.warning : bit ? bitColor(i) : theme.panelBorder,
        opacity: opacityVal,
        transform: highlighted ? `scale(${1 + 0.06 * Math.sin(local / 4)})` : undefined,
        boxShadow: highlighted ? `0 0 12px ${theme.warning}55` : "none",
      }}>{bit}</div>
    );

    // Arrow showing shift direction
    const arrowProg = smooth(clamp01((local - 4) / Math.max(impactLocal - 4, 1)));

    return (
      <>
        <div style={{ position: "absolute", left: CX, top: 300, transform: "translateX(-50%)", ...monoStyle, fontSize: 26, color: theme.subtext, opacity: enter }}>
          32 БИТА IEEE FLOAT
        </div>
        <div style={{ position: "absolute", left: CX, top: 350, transform: "translateX(-50%)", display: "flex", gap: 30, opacity: enter }}>
          {[
            { label: "ЗНАК", color: theme.subtext, count: 1 },
            { label: "ЭКСПОНЕНТА", color: theme.accent, count: 8 },
            { label: "МАНТИССА", color: theme.accent2, count: 23 },
          ].map((g) => (
            <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: g.color }} />
              <span style={{ fontFamily: theme.mono, fontSize: 18, color: g.color }}>{g.label}</span>
            </div>
          ))}
        </div>

        {/* Original bit strip */}
        <div style={{ position: "absolute", left: stripX, top: stripY, display: "flex", gap: bitGap, opacity: enter, transform: `translateY(${(1 - enter) * 40}px)` }}>
          {allBits.map((b, i) => bitCell(b, i))}
        </div>

        {/* Shift arrow */}
        <div style={{ position: "absolute", left: CX, top: stripY + bitH + 18, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12, opacity: arrowProg * enter }}>
          <IconGlyph name="move-right" size={28} color={theme.warning} strokeWidth={2} />
          <span style={{ fontFamily: theme.mono, fontSize: 22, color: theme.warning, fontWeight: 700 }}>&gt;&gt; 1</span>
          <span style={{ fontFamily: theme.font, fontSize: 22, color: theme.subtext }}>делит экспоненту пополам</span>
        </div>

        {/* Shifted bit strip (result of >> 1) */}
        <div style={{ position: "absolute", left: stripX, top: stripY + 90, display: "flex", gap: bitGap, opacity: shiftProg * enter, transform: `translateY(${(1 - shiftProg) * 20}px)` }}>
          {[0, ...allBits.slice(0, -1)].map((b, i) => bitCell(b, i, false, shiftProg * enter))}
        </div>
        <div style={{ position: "absolute", left: stripX, top: stripY + 90 + bitH + 8, fontFamily: theme.mono, fontSize: 18, color: theme.subtext, opacity: shiftProg * enter }}>
          float_bits &gt;&gt; 1
        </div>

        {/* Magic constant */}
        <div style={{ position: "absolute", left: 80, top: 810, opacity: magicConstP * enter, transform: `translateY(${(1 - magicConstP) * 30}px)` }}>
          <div style={{ fontFamily: theme.mono, fontSize: 22, color: theme.subtext, marginBottom: 8 }}>КОНСТАНТА</div>
          <div style={{
            display: "inline-flex", padding: "14px 28px", borderRadius: 20,
            background: `${theme.accent}12`, border: `3px solid ${theme.accent}`,
            boxShadow: `0 0 40px ${theme.accent}33`,
          }}>
            <span style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 48, color: theme.accent, textShadow: `0 0 20px ${theme.accent}55` }}>
              0x5f3759df
            </span>
          </div>
        </div>

        {/* Formula */}
        <div style={{ position: "absolute", left: CX, top: 1010, transform: "translateX(-50%)", opacity: resultP * enter }}>
          <div style={{
            padding: "16px 32px", borderRadius: 20,
            background: theme.panel, border: `2px solid ${theme.panelBorder}`,
            textAlign: "center",
          }}>
            <span style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 38, color: theme.text }}>
              i = 0x5f3759df - (i &gt;&gt; 1)
            </span>
          </div>
        </div>

        {/* Impact badge */}
        {done ? (
          <div style={{
            position: "absolute", left: CX, top: 1140, transform: `translateX(-50%) scale(${badgeP})`,
            opacity: badgeP, padding: "14px 28px", borderRadius: 999,
            background: `${theme.success}18`, border: `2px solid ${theme.success}`,
            color: theme.success, fontFamily: theme.font, fontWeight: 800, fontSize: 30,
            whiteSpace: "nowrap", boxShadow: `0 0 40px ${theme.success}33`,
          }}>
            КВАДРАТНЫЙ КОРЕНЬ В ЛОГАРИФМИЧЕСКОМ ПРОСТРАНСТВЕ
          </div>
        ) : null}
        {done ? <PulseRing x={CX} y={930} triggerFrame={impactLocal} tone="success" size={400} /> : null}
      </>
    );
  }

  // phase === "newton" — one iteration of Newton's method
  const iterP = smooth(clamp01((local - 8) / Math.max(impactLocal - 8, 1)));
  const resultP = smooth(clamp01((local - impactLocal) / 16));
  const cx = CX;
  const y0 = 0.9947; // initial estimate from magic constant
  const x = 4.0; // example: 1/sqrt(4) = 0.5
  const y1 = y0 * (1.5 - 0.5 * x * y0 * y0); // one Newton step
  const exact = 1 / Math.sqrt(x);

  const formulaLine = (label: string, value: string, tone: string, p: number) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 16, marginBottom: 18,
      opacity: p, transform: `translateY(${(1 - p) * 20}px)`,
    }}>
      <div style={{ width: 160, fontFamily: theme.mono, fontSize: 24, color: tone, textAlign: "right" }}>{label}</div>
      <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 38, color: tone, textShadow: `0 0 16px ${tone}44` }}>{value}</div>
    </div>
  );

  return (
    <>
      <div style={{ position: "absolute", left: cx, top: 300, transform: "translateX(-50%)", ...monoStyle, fontSize: 26, color: theme.subtext, opacity: enter }}>
        МЕТОД НЬЮТОНА · ОДНА ИТЕРАЦИЯ
      </div>
      <div style={{ position: "absolute", left: cx, top: 350, transform: "translateX(-50%)", fontFamily: theme.font, fontSize: 24, color: theme.subtext, opacity: enter }}>
        3% погрешности → 0.017%
      </div>

      <div style={{ position: "absolute", left: cx, top: 440, transform: "translateX(-50%)", opacity: enter }}>
        {formulaLine("y₀ =", "0.9947", theme.accent, enter)}
        {formulaLine("x =", "4.0", theme.subtext, enter)}
        <div style={{ height: 2, background: `${theme.panelBorder}66`, margin: "12px 0", opacity: enter }} />
        {formulaLine("y₁ =", y1.toFixed(4), theme.accent2, iterP)}
      </div>

      {/* Newton formula card */}
      <div style={{
        position: "absolute", left: cx, top: 810, transform: `translateX(-50%) scale(${0.92 + 0.08 * enter})`,
        opacity: enter,
      }}>
        <div style={{
          padding: "18px 32px", borderRadius: 20,
          background: theme.panel, border: `2px solid ${theme.accent}88`,
          textAlign: "center",
        }}>
          <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 30, color: theme.accent, marginBottom: 6 }}>
            y = y × (1.5 − 0.5 × x × y²)
          </div>
          <div style={{ fontFamily: theme.font, fontSize: 22, color: theme.subtext }}>
            одна мультипликация и один сдвиг
          </div>
        </div>
      </div>

      {/* Accuracy comparison */}
      {done ? (
        <div style={{
          position: "absolute", left: cx, top: 1010, transform: `translateX(-50%) scale(${badgeP})`,
          opacity: badgeP, display: "flex", gap: 40,
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: theme.mono, fontSize: 28, color: theme.subtext }}>до Ньютона</div>
            <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 46, color: theme.warning, marginTop: 4 }}>~3%</div>
          </div>
          <div style={{ width: 2, height: 70, background: theme.panelBorder }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: theme.mono, fontSize: 28, color: theme.subtext }}>после Ньютона</div>
            <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 46, color: theme.success, marginTop: 4 }}>0.017%</div>
          </div>
        </div>
      ) : null}

      {done ? (
        <div style={{
          position: "absolute", left: cx, top: 1200, transform: `translateX(-50%) scale(${badgeP})`,
          opacity: badgeP, padding: "14px 28px", borderRadius: 999,
          background: `${theme.success}18`, border: `2px solid ${theme.success}`,
          color: theme.success, fontFamily: theme.font, fontWeight: 800, fontSize: 30,
          whiteSpace: "nowrap", boxShadow: `0 0 40px ${theme.success}33`,
        }}>
          0.017% ПОГРЕШНОСТИ — ДОСТАТОЧНО ДЛЯ 3D-ГРАФИКИ
        </div>
      ) : null}
      {done ? <PulseRing x={cx} y={940} triggerFrame={impactLocal} tone="success" size={380} /> : null}
    </>
  );
};

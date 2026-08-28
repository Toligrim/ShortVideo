import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type ConvolutionStencilPhase = "input" | "scan" | "features" | "stack";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: ConvolutionStencilPhase;
}

const W = layout.width;
const CX = W / 2;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Convolution as reusable stencil: input 227×227×3 → sliding filter → feature map → layer stacking. */
export const ConvolutionStencilVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "input",
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;

  const titleMap: Record<ConvolutionStencilPhase, string> = {
    input: "ВХОД · 227×227×3 · 154 ТЫСЯЧИ ЧИСЕЛ",
    scan: "СВЁРТКА · ТРАФАРЕТ СКОЛЬЗИТ ПО ФОТО",
    features: "ОТКЛИК · 96 ТРАФАРЕТОВ · СВЕТЛОЕ ПЯТНО",
    stack: "5 СЛОЁВ · КРАЯ → УХО → МОРДА",
  };
  const colorMap: Record<ConvolutionStencilPhase, string> = {
    input: theme.accent,
    scan: theme.accent2,
    features: theme.warning,
    stack: theme.success,
  };
  const iconMap: Record<ConvolutionStencilPhase, string> = {
    input: "image",
    scan: "scan",
    features: "sparkles",
    stack: "layers",
  };
  const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };

  const header = (
    <div
      style={{
        position: "absolute",
        left: CX,
        top: 240,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: theme.mono,
        fontSize: 23,
        letterSpacing: 2,
        color: colorMap[phase],
        opacity: enter,
        whiteSpace: "nowrap",
      }}
    >
      <IconGlyph name={iconMap[phase]} size={28} color={colorMap[phase]} strokeWidth={1.8} />
      {titleMap[phase]}
    </div>
  );

  // ── INPUT phase ──
  if (phase === "input") {
    const countP = smooth(clamp01((local - impactLocal + 6) / 18));
    // three stacked channel layers
    const channels = [
      { label: "R", color: theme.danger },
      { label: "G", color: theme.success },
      { label: "B", color: theme.accent },
    ];
    return (
      <>
        {header}
        {/* Stacked input cube */}
        <div
          style={{
            position: "absolute",
            left: 76,
            top: 370,
            width: 928,
            height: 520,
            borderRadius: 28,
            background: `${theme.panel}F2`,
            border: `3px solid ${theme.accent}66`,
            boxShadow: `0 0 44px ${theme.accent}16`,
            opacity: enter,
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", left: 60, top: 44, display: "flex", gap: 18 }}>
            {channels.map((ch, i) => (
              <div
                key={ch.label}
                style={{
                  width: 270,
                  height: 270,
                  borderRadius: 20,
                  background: `${ch.color}14`,
                  border: `3px solid ${ch.color}99`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  transform: `translateY(${i * 12}px) translateX(${i * -6}px)`,
                  boxShadow: `0 0 28px ${ch.color}33`,
                  opacity: enter,
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
                  {Array.from({ length: 36 }).map((_, k) => (
                    <div
                      key={k}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: k % 3 === 0 ? `${ch.color}88` : `${ch.color}22`,
                        border: `1px solid ${ch.color}44`,
                      }}
                    />
                  ))}
                </div>
                <div style={{ fontFamily: theme.mono, fontSize: 22, fontWeight: 800, color: ch.color, marginTop: 8 }}>
                  {ch.label} 227×227
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              position: "absolute",
              left: 60,
              right: 60,
              bottom: 28,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ fontFamily: theme.mono, fontSize: 22, color: theme.subtext }}>
              227 × 227 × <span style={{ color: theme.accent, fontWeight: 800 }}>3</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", color: theme.subtext, fontFamily: theme.mono, fontSize: 20 }}>
              <IconGlyph name="x" size={18} color={theme.subtext} />
              <span>каждый пиксель — число 0…255</span>
            </div>
          </div>
        </div>

        {/* Big counter */}
        <div
          style={{
            position: "absolute",
            left: CX,
            top: 960,
            transform: `translateX(-50%) scale(${0.85 + countP * 0.15})`,
            textAlign: "center",
            opacity: enter,
          }}
        >
          <div
            style={{
              fontFamily: theme.mono,
              fontSize: 86,
              fontWeight: 800,
              color: theme.accent,
              textShadow: `0 0 34px ${theme.accent}55`,
            }}
          >
            154 000
          </div>
          <div style={{ ...mono, fontSize: 26, color: theme.text, marginTop: 6 }}>ЧИСЕЛ НА ВХОДЕ</div>
        </div>

        <div
          style={{
            position: "absolute",
            left: CX,
            top: 1130,
            transform: `translateX(-50%) scale(${0.85 + pop * 0.15})`,
            padding: "14px 28px",
            borderRadius: 999,
            background: `${theme.warning}18`,
            border: `3px solid ${theme.warning}`,
            color: theme.warning,
            fontFamily: theme.mono,
            fontSize: 26,
            fontWeight: 800,
            opacity: enter * pop,
            whiteSpace: "nowrap",
            boxShadow: `0 0 32px ${theme.warning}44`,
          }}
        >
          ДЕСЯТКИ МИЛЛИОНОВ УМНОЖЕНИЙ
        </div>
        <PulseRing x={CX} y={1030} triggerFrame={impactLocal} tone="accent" size={220} />
      </>
    );
  }

  // ── SCAN phase ──
  if (phase === "scan") {
    // 7x7 photo grid (simulated cat edge) and 3x3 kernel sliding
    const gridN = 7;
    const cell = 54;
    const gap = 6;
    const gridW = gridN * cell + (gridN - 1) * gap;
    const left = (W - gridW) / 2;
    const top = 360;
    // kernel position animates across row
    const slideT = smooth(clamp01((local - impactLocal + 4) / 34));
    const kx = Math.floor(interpolate(slideT, [0, 1], [0, gridN - 3]));
    const ky = Math.floor(interpolate(slideT, [0, 1], [0, 1]));
    // actual window origin
    const winX = left + kx * (cell + gap);
    const winY = top + ky * (cell + gap);
    // toy values for dot product demo: 2x2 window
    // show formula 0×0+1×1+3×2+4×3=19 in badge
    const formulaP = smooth(clamp01((local - impactLocal) / 18));
    const kernelVals = [0, 1, 2, 3];
    const winVals = [0, 1, 3, 4];

    return (
      <>
        {header}
        {/* Photo grid */}
        <div style={{ position: "absolute", left, top, width: gridW, height: gridN * cell + (gridN - 1) * gap, opacity: enter }}>
          {Array.from({ length: gridN }).map((_, r) =>
            Array.from({ length: gridN }).map((_, c) => {
              const isEdge = c >= 3 && c <= 4 && r >= 1 && r <= 5;
              const isWindow = r >= ky && r < ky + 3 && c >= kx && c < kx + 3;
              const bg = isWindow ? `${theme.accent2}22` : isEdge ? `${theme.accent}18` : theme.panel;
              const border = isWindow ? `3px solid ${theme.accent2}` : `2px solid ${theme.panelBorder}`;
              return (
                <div
                  key={`${r}-${c}`}
                  style={{
                    position: "absolute",
                    left: c * (cell + gap),
                    top: r * (cell + gap),
                    width: cell,
                    height: cell,
                    borderRadius: 10,
                    background: bg,
                    border,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: theme.mono,
                    fontSize: 20,
                    fontWeight: 800,
                    color: isEdge ? theme.accent : theme.subtext,
                    opacity: 0.92,
                  }}
                >
                  {isEdge ? "▓" : "·"}
                </div>
              );
            })
          )}
          {/* sliding window highlight */}
          <div
            style={{
              position: "absolute",
              left: winX - left - 4,
              top: winY - top - 4,
              width: 3 * cell + 2 * gap + 8,
              height: 3 * cell + 2 * gap + 8,
              borderRadius: 16,
              border: `4px solid ${theme.warning}`,
              boxShadow: `0 0 28px ${theme.warning}88`,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              // Keep the label below the grid: placing it beside the moving
              // window puts it on top of the grid's dot text at the first
              // two sampled positions.
              left: gridW - 110,
              top: gridN * (cell + gap) + 14,
              padding: "6px 12px",
              borderRadius: 999,
              background: theme.warning,
              color: "#1A1200",
              fontFamily: theme.mono,
              fontSize: 16,
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            ОКНО 3×3
          </div>
        </div>

        {/* Kernel */}
        <div
          style={{
            position: "absolute",
            left: 90,
            top: 900,
            width: 330,
            borderRadius: 20,
            background: theme.panel,
            border: `3px solid ${theme.accent2}99`,
            padding: 18,
            opacity: enter,
            boxShadow: `0 0 32px ${theme.accent2}22`,
          }}
        >
          <div style={{ ...mono, fontSize: 18, color: theme.accent2, textAlign: "center" }}>ТРАФАРЕТ 3×3</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 14 }}>
            {[0, 1, 0, 1, 2, 1, 0, 1, 0].map((v, i) => (
              <div
                key={i}
                style={{
                  height: 58,
                  borderRadius: 12,
                  background: `${theme.accent2}${v === 2 ? "33" : v === 1 ? "18" : "0A"}`,
                  border: `2px solid ${theme.accent2}${v === 2 ? "CC" : "66"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: theme.mono,
                  fontSize: 28,
                  fontWeight: 800,
                  color: theme.accent2,
                }}
              >
                {v}
              </div>
            ))}
          </div>
          <div style={{ fontFamily: theme.mono, fontSize: 16, color: theme.subtext, textAlign: "center", marginTop: 10 }}>
            обучаемый узор
          </div>
        </div>

        {/* Multiplication arrow */}
        <div
          style={{
            position: "absolute",
            left: 445,
            top: 1000,
            fontFamily: theme.mono,
            fontSize: 44,
            color: theme.warning,
            opacity: enter,
          }}
        >
          ×
        </div>

        {/* Dot product card */}
        <div
          style={{
            position: "absolute",
            left: 520,
            top: 900,
            width: 470,
            borderRadius: 20,
            background: `${theme.panel}F2`,
            border: `3px solid ${theme.warning}99`,
            padding: 18,
            opacity: enter,
            transform: `scale(${0.9 + formulaP * 0.1})`,
            boxShadow: `0 0 32px ${theme.warning}22`,
          }}
        >
          <div style={{ ...mono, fontSize: 16, color: theme.subtext, textAlign: "center" }}>В КАЖДОМ ОКНЕ — СКАЛЯРНОЕ ПРОИЗВЕДЕНИЕ</div>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              justifyContent: "center",
              gap: 10,
              fontFamily: theme.mono,
              fontSize: 22,
              fontWeight: 800,
              color: theme.text,
            }}
          >
            {winVals.map((wv, i) => (
              <span key={i} style={{ color: i % 2 === 0 ? theme.subtext : theme.text }}>
                {wv}
                <span style={{ color: theme.warning }}>×{kernelVals[i]}</span>
                {i < 3 ? " +" : ""}
              </span>
            ))}
          </div>
          <div
            style={{
              marginTop: 12,
              textAlign: "center",
              fontFamily: theme.mono,
              fontSize: 34,
              fontWeight: 800,
              color: formulaP > 0.5 ? theme.success : theme.warning,
            }}
          >
            = 19
          </div>
          <div style={{ fontFamily: theme.mono, fontSize: 16, color: theme.subtext, textAlign: "center", marginTop: 4 }}>
            размер выхода (n−k+1)²
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: CX,
            top: 1130,
            transform: `translateX(-50%) scale(${0.85 + pop * 0.15})`,
            padding: "12px 26px",
            borderRadius: 999,
            background: `${theme.accent2}18`,
            border: `3px solid ${theme.accent2}`,
            color: theme.accent2,
            fontFamily: theme.mono,
            fontSize: 24,
            fontWeight: 800,
            opacity: enter * pop,
            whiteSpace: "nowrap",
          }}
        >
          СКОЛЬЗИТ · МНОЖИТ · СУММИРУЕТ
        </div>
        <PulseRing x={winX + 70} y={winY + 70} triggerFrame={impactLocal} tone="warning" size={180} />
      </>
    );
  }

  // ── FEATURES phase ──
  if (phase === "features") {
    const grid = 8;
    const cell = 52;
    const gap = 8;
    const gridW = grid * cell + (grid - 1) * gap;
    const left = (W - gridW) / 2;
    const top = 380;
    const highlightP = smooth(clamp01((local - impactLocal) / 16));
    // bright cells where ear edge matches
    const bright = new Set(["2-3", "2-4", "3-3", "3-4", "4-3", "4-4", "5-3"]);

    return (
      <>
        {header}
        {/* Feature map */}
        <div style={{ position: "absolute", left, top, width: gridW, opacity: enter }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontFamily: theme.mono, fontSize: 18, color: theme.subtext }}>
            <span>КАРТА ОТКЛИКА</span>
            <span style={{ color: theme.warning }}>ярче = совпало</span>
          </div>
          <div style={{ position: "relative", width: gridW, height: grid * cell + (grid - 1) * gap }}>
            {Array.from({ length: grid }).map((_, r) =>
              Array.from({ length: grid }).map((_, c) => {
                const key = `${r}-${c}`;
                const isBright = bright.has(key);
                const intensity = isBright ? 1 : 0.22 + 0.18 * ((r + c) % 3);
                return (
                  <div
                    key={key}
                    style={{
                      position: "absolute",
                      left: c * (cell + gap),
                      top: r * (cell + gap),
                      width: cell,
                      height: cell,
                      borderRadius: 10,
                      background: isBright ? `rgba(251,191,36,${0.18 + highlightP * 0.55})` : `rgba(20,26,38,${0.9})`,
                      border: `2px solid ${isBright ? theme.warning : theme.panelBorder}`,
                      boxShadow: isBright && hit ? `0 0 ${18 + highlightP * 16}px ${theme.warning}88` : "none",
                      opacity: 0.55 + intensity * 0.45,
                      transform: `scale(${isBright ? 0.9 + highlightP * 0.1 : 1})`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isBright ? <div style={{ width: 18, height: 18, borderRadius: 999, background: theme.warning, boxShadow: `0 0 12px ${theme.warning}` }} /> : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 96 filters badge */}
        <div
          style={{
            position: "absolute",
            left: 76,
            top: 1030,
            width: 928,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            opacity: enter,
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const isActive = i < 6;
            return (
              <div
                key={i}
                style={{
                  width: 66,
                  height: 66,
                  borderRadius: 12,
                  background: isActive ? `${theme.warning}18` : `${theme.panelBorder}55`,
                  border: `2px solid ${isActive ? theme.warning + "99" : theme.panelBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: theme.mono,
                  fontSize: 10,
                  color: isActive ? theme.warning : theme.subtext,
                }}
              >
                {isActive ? "▓▓" : "··"}
              </div>
            );
          })}
        </div>
        <div
          style={{
            position: "absolute",
            left: CX,
            top: 1125,
            transform: `translateX(-50%) scale(${0.85 + pop * 0.15})`,
            padding: "14px 28px",
            borderRadius: 999,
            background: `${theme.warning}18`,
            border: `3px solid ${theme.warning}`,
            color: theme.warning,
            fontFamily: theme.mono,
            fontSize: 26,
            fontWeight: 800,
            opacity: enter * pop,
            whiteSpace: "nowrap",
            boxShadow: `0 0 32px ${theme.warning}44`,
          }}
        >
          96 ТРАФАРЕТОВ · КАЖДЫЙ ИЩЕТ СВОЁ
        </div>
        <div
          style={{
            position: "absolute",
            left: CX,
            top: 1215,
            transform: "translateX(-50%)",
            fontFamily: theme.mono,
            fontSize: 18,
            color: theme.subtext,
            opacity: enter,
          }}
        >
          край уха · ус · пятно цвета — светлое пятно
        </div>
        <PulseRing x={CX} y={top + 220} triggerFrame={impactLocal} tone="warning" size={260} />
      </>
    );
  }

  // ── STACK phase ──
  const layers = [
    { label: "СЛОЙ 1", desc: "края · линии", color: theme.accent },
    { label: "СЛОЙ 2", desc: "ухо · ус", color: theme.accent2 },
    { label: "СЛОЙ 3", desc: "морда", color: theme.warning },
    { label: "СЛОЙ 4–5", desc: "кот целиком", color: theme.success },
  ];
  const errorP = smooth(clamp01((local - impactLocal) / 18));
  return (
    <>
      {header}
      {/* vertical stack */}
      <div
        style={{
          position: "absolute",
          left: 88,
          top: 360,
          width: 520,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          opacity: enter,
        }}
      >
        {layers.map((l, i) => {
          const active = i <= 2 || hit;
          return (
            <div
              key={l.label}
              style={{
                height: 112,
                borderRadius: 20,
                background: `${l.color}14`,
                border: `3px solid ${l.color}99`,
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "0 22px",
                opacity: active ? 1 : 0.5,
                transform: `translateX(${active ? 0 : -14}px)`,
                boxShadow: `0 0 24px ${l.color}22`,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: `${l.color}22`,
                  border: `2px solid ${l.color}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <IconGlyph name={i === 0 ? "grid-3x3" : i === 1 ? "ear" : i === 2 ? "cat" : "sparkles"} size={26} color={l.color} strokeWidth={1.7} />
              </div>
              <div>
                <div style={{ fontFamily: theme.mono, fontSize: 22, fontWeight: 800, color: l.color }}>{l.label}</div>
                <div style={{ fontFamily: theme.mono, fontSize: 18, color: theme.subtext }}>{l.desc}</div>
              </div>
              {i < 3 ? (
                <div style={{ marginLeft: "auto", color: l.color, fontSize: 22 }}>↓</div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* error reduction card */}
      <div
        style={{
          position: "absolute",
          right: 76,
          top: 360,
          width: 360,
          borderRadius: 24,
          background: theme.panel,
          border: `3px solid ${theme.panelBorder}`,
          padding: 22,
          opacity: enter,
          textAlign: "center",
        }}
      >
        <div style={{ ...mono, fontSize: 18, color: theme.subtext }}>ILSVRC-2012 · ТОП-5 ОШИБКА</div>
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              padding: "14px 18px",
              borderRadius: 16,
              background: `${theme.danger}14`,
              border: `2px solid ${theme.danger}66`,
              opacity: 0.9,
            }}
          >
            <div style={{ fontFamily: theme.mono, fontSize: 18, color: theme.danger }}>ДО · 2011</div>
            <div style={{ fontFamily: theme.mono, fontSize: 38, fontWeight: 800, color: theme.danger }}>26,2%</div>
          </div>
          <div style={{ color: theme.success, fontSize: 26, fontWeight: 800 }}>↓</div>
          <div
            style={{
              padding: "14px 18px",
              borderRadius: 16,
              background: `${theme.success}18`,
              border: `3px solid ${theme.success}`,
              boxShadow: `0 0 28px ${theme.success}44`,
              transform: `scale(${0.9 + errorP * 0.1})`,
              opacity: 0.6 + errorP * 0.4,
            }}
          >
            <div style={{ fontFamily: theme.mono, fontSize: 18, color: theme.success }}>5 СВЁРТОК · 2012</div>
            <div style={{ fontFamily: theme.mono, fontSize: 42, fontWeight: 800, color: theme.success }}>15,3%</div>
            <div style={{ fontFamily: theme.mono, fontSize: 16, color: theme.success }}>AlexNet</div>
          </div>
        </div>
        <div style={{ fontFamily: theme.mono, fontSize: 16, color: theme.subtext, marginTop: 12 }}>
          60 млн параметров · 650k нейронов
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: CX,
          top: 1120,
          transform: `translateX(-50%) scale(${0.85 + pop * 0.15})`,
          padding: "12px 26px",
          borderRadius: 999,
          background: `${theme.success}18`,
          border: `3px solid ${theme.success}`,
          color: theme.success,
          fontFamily: theme.mono,
          fontSize: 24,
          fontWeight: 800,
          opacity: enter * pop,
          whiteSpace: "nowrap",
          boxShadow: `0 0 32px ${theme.success}44`,
        }}
      >
        СЛОЙ ЗА СЛОЕМ — КОТ ПО ЧАСТЯМ
      </div>
      <PulseRing x={CX - 10} y={620} triggerFrame={impactLocal} tone="success" size={260} />
    </>
  );
};

import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

export type Utf8BoundaryPhase = "stream" | "broken" | "resync";

const W = layout.width;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

// Byte representation of UTF-8 multibyte sequence for "Ю" (U+042E) = D0 AE
// and a continuation sequence for "т" (U+0442) = D1 82
// Then a corrupted byte, then next boundary at "и" (U+0438) = D0 B8
const BYTES: { hex: string; label: string; type: "ascii" | "start" | "cont" | "broken" | "next" }[] = [
  { hex: "48", label: "H", type: "ascii" },
  { hex: "65", label: "e", type: "ascii" },
  { hex: "6C", label: "l", type: "ascii" },
  { hex: "6C", label: "l", type: "ascii" },
  { hex: "6F", label: "o", type: "ascii" },
  { hex: "20", label: " ", type: "ascii" },
  { hex: "D0", label: "Д0", type: "start" },
  { hex: "AE", label: "AE", type: "cont" },
  { hex: "D1", label: "Д1", type: "start" },
  { hex: "82", label: "82", type: "cont" },
  { hex: "FF", label: "FF", type: "broken" },
  { hex: "D0", label: "Д0", type: "next" },
  { hex: "B8", label: "B8", type: "cont" },
  { hex: "20", label: " ", type: "ascii" },
  { hex: "57", label: "W", type: "ascii" },
  { hex: "6F", label: "o", type: "ascii" },
  { hex: "72", label: "r", type: "ascii" },
  { hex: "6C", label: "l", type: "ascii" },
  { hex: "64", label: "d", type: "ascii" },
  { hex: "21", label: "!", type: "ascii" },
];

const BYTE_W = 72;
const BYTE_GAP = 6;
const ROW_GAP = 28;
const ROW_Y_START = 380;
const COLS = 10;

const byteColor = (type: string) => {
  switch (type) {
    case "ascii": return theme.text;
    case "start": return theme.accent;
    case "cont": return theme.accent2;
    case "broken": return theme.danger;
    case "next": return theme.success;
    default: return theme.text;
  }
};

const byteBg = (type: string) => {
  switch (type) {
    case "ascii": return `${theme.text}14`;
    case "start": return `${theme.accent}22`;
    case "cont": return `${theme.accent2}22`;
    case "broken": return `${theme.danger}22`;
    case "next": return `${theme.success}22`;
    default: return `${theme.text}14`;
  }
};

const byteBorder = (type: string) => {
  switch (type) {
    case "ascii": return `${theme.text}44`;
    case "start": return `${theme.accent}AA`;
    case "cont": return `${theme.accent2}AA`;
    case "broken": return `${theme.danger}EE`;
    case "next": return `${theme.success}EE`;
    default: return `${theme.text}44`;
  }
};

export const Utf8BoundaryVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: Utf8BoundaryPhase;
}> = ({ local, fps, impactLocal, phase = "stream" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const brokenIdx = 10; // FF byte
  const nextIdx = 11; // D0 after broken
  const done = local >= impactLocal;

  // Highlight phases
  const highlightBroken = phase === "broken" || phase === "resync";
  const highlightResync = phase === "resync";

  const brokenPulse = highlightBroken ? 1 + 0.08 * Math.sin((local - impactLocal) / 4) : 1;
  const resyncPop = highlightResync ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;

  // Arrow animation for resync
  const arrowP = highlightResync ? smooth(clamp01((local - impactLocal) / 18)) : 0;

  const cx = W / 2;
  const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };

  // Label annotations (≤20 chars)
  const annotations: { idx: number; text: string }[] = [];
  if (phase === "stream") {
    annotations.push({ idx: 6, text: "старт 3 байта" });
    annotations.push({ idx: 7, text: "продолжение" });
  }
  if (phase === "broken") {
    annotations.push({ idx: brokenIdx, text: "повреждён!" });
  }
  if (phase === "resync") {
    annotations.push({ idx: brokenIdx, text: "сброшен" });
    annotations.push({ idx: nextIdx, text: "новая граница" });
  }

  return (
    <>
      {/* Title */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 260,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 28,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        {phase === "stream" && "ПОТОК БАЙТОВ UTF-8"}
        {phase === "broken" && "ПОВРЕЖДЁННЫЙ БАЙТ"}
        {phase === "resync" && "СИНХРОНИЗАЦИЯ → НОВАЯ ГРАНИЦА"}
      </div>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 320,
          transform: "translateX(-50%)",
          fontFamily: theme.font,
          fontSize: 24,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        {phase === "stream" && "каждый байт — часть строки"}
        {phase === "broken" && "декодер находит ошибку"}
        {phase === "resync" && "максимум 3 байта до границы"}
      </div>

      {/* Byte grid */}
      {BYTES.map((b, i) => {
        const row = Math.floor(i / COLS);
        const col = i % COLS;
        const x = cx - (COLS * (BYTE_W + BYTE_GAP)) / 2 + col * (BYTE_W + BYTE_GAP);
        const y = ROW_Y_START + row * (130 + ROW_GAP);

        const isBroken = i === brokenIdx;
        const isNext = i === nextIdx;
        const isStart = b.type === "start";
        const isCont = b.type === "cont";

        const color = byteColor(b.type);
        const bg = byteBg(b.type);
        const border = byteBorder(b.type);

        const cellPulse = isBroken && highlightBroken
          ? brokenPulse
          : isNext && highlightResync
            ? 1 + 0.05 * Math.sin(local / 5)
            : 1;

        const cellOpacity = enter;
        const brokenFlash = isBroken && highlightBroken
          ? 0.7 + 0.3 * Math.sin(local / 3)
          : 1;

        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: BYTE_W,
                height: 110,
                borderRadius: 18,
                background: bg,
                border: `3px solid ${border}`,
                boxShadow: isBroken && highlightBroken
                  ? `0 0 30px ${theme.danger}88`
                  : isNext && highlightResync
                    ? `0 0 25px ${theme.success}66`
                    : isStart
                      ? `0 0 18px ${theme.accent}33`
                      : "none",
                opacity: cellOpacity * (isBroken && highlightBroken ? brokenFlash : 1),
                transform: `scale(${cellPulse})`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              <div
                style={{
                  ...mono,
                  fontSize: 30,
                  color,
                  textShadow: isBroken && highlightBroken
                    ? `0 0 14px ${theme.danger}`
                    : isNext && highlightResync
                      ? `0 0 14px ${theme.success}`
                      : "none",
                }}
              >
                {b.hex}
              </div>
              <div
                style={{
                  fontFamily: theme.font,
                  fontSize: 16,
                  color: theme.subtext,
                  opacity: 0.7,
                }}
              >
                {b.label}
              </div>
            </div>
            {/* Type badge under byte */}
            {b.type !== "ascii" && (
              <div
                style={{
                  position: "absolute",
                  left: x,
                  top: y + 116,
                  width: BYTE_W,
                  textAlign: "center",
                  fontFamily: theme.mono,
                  fontSize: 14,
                  fontWeight: 700,
                  color,
                  opacity: enter * 0.8,
                  letterSpacing: 1,
                }}
              >
                {b.type === "start" ? "СТАРТ" : b.type === "cont" ? "CONT" : b.type === "broken" ? "ERR" : "NEXT"}
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* Annotations */}
      {annotations.map((a, i) => {
        const row = Math.floor(a.idx / COLS);
        const col = a.idx % COLS;
        const x = cx - (COLS * (BYTE_W + BYTE_GAP)) / 2 + col * (BYTE_W + BYTE_GAP) + BYTE_W / 2;
        const y = ROW_Y_START + row * (130 + ROW_GAP) - 30;
        const isNext = a.idx === nextIdx;
        const color = isNext ? theme.success : BYTES[a.idx].type === "broken" ? theme.danger : theme.warning;
        // resync phase: push red badge up, green badge down to avoid overlap
        const verticalOffset = highlightResync ? (isNext ? 18 : -18) : 0;
        return (
          <div
            key={`ann-${i}`}
            style={{
              position: "absolute",
              left: x,
              top: y - 38 + verticalOffset,
              transform: "translateX(-50%)",
              padding: "6px 14px",
              borderRadius: 999,
              background: `${color}18`,
              border: `2px solid ${color}AA`,
              fontFamily: theme.font,
              fontWeight: 700,
              fontSize: 18,
              color,
              whiteSpace: "nowrap",
              opacity: enter,
            }}
          >
            {a.text}
          </div>
        );
      })}

      {/* Arrow from broken to next (resync phase) */}
      {highlightResync && (
        <>
          <div
            style={{
              position: "absolute",
              left: cx - (COLS * (BYTE_W + BYTE_GAP)) / 2 + brokenIdx % COLS * (BYTE_W + BYTE_GAP) + BYTE_W + 4,
              top: ROW_Y_START + Math.floor(brokenIdx / COLS) * (130 + ROW_GAP) + 55,
              width: (nextIdx - brokenIdx) * (BYTE_W + BYTE_GAP) - 4,
              height: 4,
              background: `linear-gradient(90deg, ${theme.danger}, ${theme.success})`,
              opacity: arrowP,
              borderRadius: 2,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: cx - (COLS * (BYTE_W + BYTE_GAP)) / 2 + nextIdx * (BYTE_W + BYTE_GAP) - 6,
              top: ROW_Y_START + Math.floor(nextIdx / COLS) * (130 + ROW_GAP) + 47,
              width: 0,
              height: 0,
              borderTop: "10px solid transparent",
              borderBottom: "10px solid transparent",
              borderLeft: `14px solid ${theme.success}`,
              opacity: arrowP,
            }}
          />
        </>
      )}

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 1280,
          transform: "translateX(-50%)",
          display: "flex",
          gap: 24,
          opacity: enter,
        }}
      >
        {[
          { color: theme.accent, label: "старт" },
          { color: theme.accent2, label: "continuation" },
          { color: theme.danger, label: "ошибка" },
          { color: theme.success, label: "новая граница" },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: item.color }} />
            <span style={{ fontFamily: theme.mono, fontSize: 18, color: theme.text }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Bottom status badge */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 1380,
          transform: `translateX(-50%) scale(${highlightResync ? resyncPop : 0.94})`,
          opacity: highlightResync ? resyncPop : enter * 0.9,
          padding: "14px 26px",
          borderRadius: 999,
          background: highlightResync ? `${theme.success}18` : theme.panel,
          border: `2px solid ${highlightResync ? theme.success : theme.panelBorder}`,
          color: highlightResync ? theme.success : theme.subtext,
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 26,
          whiteSpace: "nowrap",
        }}
      >
        {phase === "stream" && "ASCII байты не появляются внутри многобайтовых"}
        {phase === "broken" && "FF не является допустимым стартовым байтом"}
        {phase === "resync" && "декодер пропускает → находит D0 как новую границу"}
      </div>

      {highlightResync && (
        <PulseRing
          x={cx - (COLS * (BYTE_W + BYTE_GAP)) / 2 + nextIdx * (BYTE_W + BYTE_GAP) + BYTE_W / 2}
          y={ROW_Y_START + Math.floor(nextIdx / COLS) * (130 + ROW_GAP) + 55}
          triggerFrame={impactLocal}
          tone="success"
          size={160}
        />
      )}
      {highlightBroken && (
        <PulseRing
          x={cx - (COLS * (BYTE_W + BYTE_GAP)) / 2 + brokenIdx * (BYTE_W + BYTE_GAP) + BYTE_W / 2}
          y={ROW_Y_START + Math.floor(brokenIdx / COLS) * (130 + ROW_GAP) + 55}
          triggerFrame={impactLocal}
          tone="danger"
          size={150}
        />
      )}
    </>
  );
};

import React from "react";
import { spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const W = layout.width;

export type BwtMatrixPhase = "rotations" | "sorted" | "column";

const S = "BANANA$";
const N = S.length;

// unsorted rotations: row i = S.slice(i)+S.slice(0,i)
const rotations: string[] = Array.from({ length: N }, (_, i) => S.slice(i) + S.slice(0, i));
// sorted indices (lexicographically, $ < letters): [$BANANA, A$BANAN, ANA$BAN, ANANA$B, BANANA$, NA$BANA, NANA$BA]
const sortedIdx = [6, 5, 3, 1, 0, 4, 2];
const sorted: string[] = sortedIdx.map((i) => rotations[i]);
// L = last column of sorted
const L = sorted.map((r) => r[N - 1]).join(""); // ANNB$AA

export const BwtMatrixVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: BwtMatrixPhase;
}> = ({ local, fps, impactLocal, phase = "rotations" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  const cx = W / 2;

  const cell = 72;
  const gap = 8;
  const gridW = N * cell + (N - 1) * gap;
  const gridH = N * cell + (N - 1) * gap;
  const left = (W - gridW) / 2;
  const top = 470;

  const rows = phase === "rotations" ? rotations : sorted;
  const isSorted = phase !== "rotations";
  const showColumnHighlight = phase === "column";

  // For rotations: appearance row by row
  // For sorted: same but with sorted order and small slide-in

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 300,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontSize: 24,
          letterSpacing: 3,
          color: theme.subtext,
          opacity: enter,
          textAlign: "center",
        }}
      >
        {phase === "rotations" ? "7 ЦИКЛИЧЕСКИХ СДВИГОВ" : phase === "sorted" ? "СОРТИРУЕМ КАК В СЛОВАРЕ" : "ПОСЛЕДНИЙ СТОЛБЕЦ — BWT"}
      </div>
      {/* column labels F / L */}
      <div
        style={{
          position: "absolute",
          left: left,
          top: top - 44,
          width: gridW,
          display: "flex",
          justifyContent: "space-between",
          opacity: enter * 0.9,
          fontFamily: theme.mono,
          fontSize: 20,
          color: theme.subtext,
        }}
      >
        <span style={{ color: theme.accent, fontWeight: 800 }}>F</span>
        <span style={{ color: showColumnHighlight ? theme.success : theme.subtext, fontWeight: 800 }}>L ← забираем</span>
      </div>

      {/* grid */}
      {rows.map((row, r) => {
        const rowDelay = r * 4;
        const p = smooth(clamp01((local - rowDelay) / 14));
        const rowEnter = isSorted ? smooth(clamp01((local - rowDelay - 4) / 14)) : p;
        const op = enter * rowEnter;
        // sorted phase highlight movement: offset
        return (
          <React.Fragment key={r}>
            {/* row background */}
            <div
              style={{
                position: "absolute",
                left: left - 12,
                top: top + r * (cell + gap) - 6,
                width: gridW + 24,
                height: cell + 12,
                borderRadius: 14,
                background: r === 0 && isSorted ? `${theme.accent}10` : "transparent",
                border: r === 0 && isSorted ? `2px solid ${theme.accent}33` : "2px solid transparent",
                opacity: op,
              }}
            />
            {row.split("").map((ch, c) => {
              const isLastCol = c === N - 1;
              const isFirstCol = c === 0;
              const hl = showColumnHighlight && isLastCol;
              const pulse = hl && done ? 1 + 0.05 * Math.sin((local - impactLocal) / 6 + c) : 1;
              const bg = hl ? `${theme.success}18` : isFirstCol ? `${theme.accent}10` : theme.panel;
              const border = hl
                ? `3px solid ${theme.success}`
                : isFirstCol
                  ? `2px solid ${theme.accent}66`
                  : `2px solid ${theme.panelBorder}`;
              return (
                <div
                  key={`${r}-${c}`}
                  style={{
                    position: "absolute",
                    left: left + c * (cell + gap),
                    top: top + r * (cell + gap),
                    width: cell,
                    height: cell,
                    borderRadius: 12,
                    background: bg,
                    border,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: theme.mono,
                    fontWeight: 800,
                    fontSize: 30,
                    color: ch === "$" ? theme.warning : hl ? theme.success : isFirstCol ? theme.accent : theme.text,
                    opacity: op,
                    transform: `scale(${0.6 + 0.4 * rowEnter})`,
                    boxShadow: hl && done ? `0 0 22px ${theme.success}66` : isFirstCol ? `0 0 12px ${theme.accent}22` : "none",
                    ...(hl ? { transform: `scale(${pulse * (0.6 + 0.4 * rowEnter)})` } : {}),
                  }}
                >
                  {ch}
                </div>
              );
            })}
            {/* row index badge for sorted */}
            {isSorted ? (
              <div
                style={{
                  position: "absolute",
                  left: left + gridW + 16,
                  top: top + r * (cell + gap) + cell / 2 - 14,
                  fontFamily: theme.mono,
                  fontSize: 16,
                  color: theme.subtext,
                  opacity: op * 0.7,
                }}
              >
                {r + 1}
              </div>
            ) : null}
          </React.Fragment>
        );
      })}

      {/* result extraction for column phase */}
      {showColumnHighlight ? (
        <>
          <div
            style={{
              position: "absolute",
              left: left + gridW + 22,
              top: top,
              width: 6,
              height: gridH,
              background: `${theme.success}AA`,
              borderRadius: 999,
              opacity: enter * 0.9,
              boxShadow: `0 0 18px ${theme.success}88`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: cx,
              top: top + gridH + 50,
              transform: `translateX(-50%) scale(${done ? badgeP : 0.8})`,
              opacity: done ? badgeP : enter * 0.6,
              padding: "14px 30px",
              borderRadius: 999,
              background: `${theme.success}18`,
              border: `2px solid ${theme.success}`,
              color: theme.success,
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 30,
              letterSpacing: 2,
              boxShadow: done ? `0 0 40px ${theme.success}55` : "none",
              whiteSpace: "nowrap",
            }}
          >
            L = {L} &nbsp;→&nbsp; ANNB$AA
          </div>
          <div
            style={{
              position: "absolute",
              left: cx,
              top: top + gridH + 130,
              transform: "translateX(-50%)",
              fontFamily: theme.mono,
              fontSize: 22,
              color: theme.subtext,
              opacity: enter,
              textAlign: "center",
            }}
          >
            {done ? "«NN» и «AA» уже рядом — RLE-дружелюбно" : "последний символ каждой отсортированной строки"}
          </div>
          {done ? <PulseRing x={left + gridW + 22} y={top + gridH / 2} triggerFrame={impactLocal} tone="success" size={220} /> : null}
        </>
      ) : null}

      {/* unsorted → sorted arrow hint for sorted phase */}
      {phase === "sorted" && done ? (
        <>
          <PulseRing x={cx} y={top + gridH / 2} triggerFrame={impactLocal} tone="accent" size={260} />
          <div
            style={{
              position: "absolute",
              left: cx,
              top: top + gridH + 56,
              transform: `translateX(-50%) scale(${badgeP})`,
              opacity: badgeP,
              padding: "10px 24px",
              borderRadius: 999,
              background: `${theme.accent}18`,
              border: `2px solid ${theme.accent}`,
              color: theme.accent,
              fontFamily: theme.font,
              fontWeight: 800,
              fontSize: 24,
            }}
          >
            лексикографически ↑ — $ первый
          </div>
        </>
      ) : null}
    </>
  );
};

import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { interpolate, interpolateColors } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type CountMinSketchPhase = "grid" | "insert" | "collide" | "query" | "guarantee";

const W = layout.width;

const ROWS = 3;
const COLS = 6;
const CELL_W = 120;
const CELL_H = 70;
const GAP = 10;
const GRID_LEFT = (W - COLS * (CELL_W + GAP)) / 2;
const GRID_TOP = 480;
const LABEL_H = 50;

/** Count-Min Sketch: сетка счётчиков, хеш-стрелки, коллизии, запрос минимума, гарантия. */
export const CountMinSketchVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: CountMinSketchPhase;
}> = ({ local, fps, impactLocal, phase = "grid" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const cx = W / 2;

  // Pre-computed grid values for each phase
  const gridValues: number[][] = [
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
  ];

  // For insert phase: element "A" hashes to columns 1, 3, 4
  const insertTargets = [
    { row: 0, col: 1 },
    { row: 1, col: 3 },
    { row: 2, col: 4 },
  ];

  // For collide phase: element "B" also hits col 3 in row 1 (collision with A)
  const collideTargets = [
    { row: 0, col: 2 },
    { row: 1, col: 3 }, // collision!
    { row: 2, col: 5 },
  ];

  const getCellValue = (row: number, col: number): number => {
    if (phase === "grid") return 0;
    if (phase === "insert" || phase === "query" || phase === "guarantee") {
      return insertTargets.some((t) => t.row === row && t.col === col) ? 1 : 0;
    }
    if (phase === "collide") {
      const fromA = insertTargets.some((t) => t.row === row && t.col === col) ? 1 : 0;
      const fromB = collideTargets.some((t) => t.row === row && t.col === col) ? 1 : 0;
      return fromA + fromB;
    }
    return 0;
  };

  const isTarget = (row: number, col: number): boolean => {
    if (phase === "insert") return insertTargets.some((t) => t.row === row && t.col === col);
    if (phase === "collide") return collideTargets.some((t) => t.row === row && t.col === col);
    if (phase === "query") return row === 1 && col === 3; // the queried cell
    return false;
  };

  const isCollision = (row: number, col: number): boolean => {
    if (phase !== "collide") return false;
    const fromA = insertTargets.some((t) => t.row === row && t.col === col);
    const fromB = collideTargets.some((t) => t.row === row && t.col === col);
    return fromA && fromB;
  };

  // Hash function labels
  const hashLabels = ["h₁(x)", "h₂(x)", "h₃(x)"];
  const queryValue = 1; // min across rows for queried element

  return (
    <>
      {/* Header */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 280,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontWeight: 800,
          fontSize: 28,
          color: theme.subtext,
          opacity: enter,
          letterSpacing: 3,
        }}
      >
        {phase === "grid"
          ? "СЕТКА СЧЁТЧИКОВ"
          : phase === "insert"
            ? "ЭЛЕМЕНТ → ХЕШ → +1 В КАЖДОМ РЯДУ"
            : phase === "collide"
              ? "КОЛЛИЗИЯ → СЧЁТЧИК РАЗДУВАЕТСЯ"
              : phase === "query"
                ? "ЗАПРОС: БЕРЁМ МИНИМУМ ПО РЯДАМ"
                : "НИКОГДА НЕ ЗАНИЖАЕТ · ОШИБКА ≤ ε"}
      </div>

      {/* Row labels (hash functions) */}
      {Array.from({ length: ROWS }).map((_, row) => (
        <div
          key={`label-${row}`}
          style={{
            position: "absolute",
            left: GRID_LEFT - 130,
            top: GRID_TOP + row * (CELL_H + GAP) + CELL_H / 2 - 16,
            fontFamily: theme.mono,
            fontWeight: 700,
            fontSize: 26,
            color: theme.accent2,
            opacity: enter,
          }}
        >
          {hashLabels[row]}
        </div>
      ))}

      {/* Grid of counters */}
      {Array.from({ length: ROWS }).map((_, row) =>
        Array.from({ length: COLS }).map((_, col) => {
          const val = getCellValue(row, col);
          const target = isTarget(row, col);
          const collision = isCollision(row, col);
          const cellColor = collision
            ? theme.danger
            : target
              ? theme.success
              : val > 0
                ? theme.accent
                : theme.panelBorder;
          const cellBg = collision
            ? `${theme.danger}24`
            : target
              ? `${theme.success}1A`
              : val > 0
                ? `${theme.accent}12`
                : "#0D1420";

          // Animate cells appearing
          const cellDelay = (row * COLS + col) * 0.04;
          const cellP = spring({
            frame: Math.max(0, local - cellDelay * 30),
            fps,
            config: { damping: 14, mass: 0.7 },
          });

          return (
            <div
              key={`cell-${row}-${col}`}
              style={{
                position: "absolute",
                left: GRID_LEFT + col * (CELL_W + GAP),
                top: GRID_TOP + row * (CELL_H + GAP),
                width: CELL_W,
                height: CELL_H,
                borderRadius: 14,
                border: `3px solid ${cellColor}${target || collision ? "EE" : "66"}`,
                background: cellBg,
                boxShadow: target || collision ? `0 0 35px ${cellColor}55` : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: enter * cellP,
                transform: `scale(${target ? 1 + 0.04 * Math.sin(local / 6) : 1})`,
              }}
            >
              <span
                style={{
                  fontFamily: theme.mono,
                  fontWeight: 800,
                  fontSize: 36,
                  color: cellColor,
                  textShadow: val > 0 ? `0 0 12px ${cellColor}77` : "none",
                }}
              >
                {val}
              </span>
            </div>
          );
        })
      )}

      {/* Hash arrows during insert/collide/query */}
      {(phase === "insert" || phase === "collide" || phase === "query") && (
        <>
          {(phase === "insert" ? insertTargets : phase === "collide" ? collideTargets : insertTargets).map(
            (t, i) => {
              const arrowProgress = spring({
                frame: Math.max(0, local - i * 5),
                fps,
                config: { damping: 12, mass: 0.6 },
              });
              const cellX = GRID_LEFT + t.col * (CELL_W + GAP) + CELL_W / 2;
              const cellY = GRID_TOP + t.row * (CELL_H + GAP);
              const startY = cellY - 80;
              const color =
                phase === "collide" && t.row === 1 && t.col === 3 ? theme.danger : theme.accent;

              return (
                <React.Fragment key={`arrow-${i}`}>
                  {/* Arrow line */}
                  <div
                    style={{
                      position: "absolute",
                      left: cellX - 1.5,
                      top: startY,
                      width: 3,
                      height: 80 * arrowProgress,
                      background: `linear-gradient(180deg, transparent, ${color})`,
                      opacity: enter * arrowProgress,
                    }}
                  />
                  {/* Arrow head */}
                  <div
                    style={{
                      position: "absolute",
                      left: cellX - 8,
                      top: startY + 80 * arrowProgress - 10,
                      transform: "translateX(-50%) rotate(-90deg)",
                      borderLeft: "8px solid transparent",
                      borderRight: "8px solid transparent",
                      borderTop: `12px solid ${color}`,
                      opacity: enter * arrowProgress,
                    }}
                  />
                  {/* Hash label */}
                  <div
                    style={{
                      position: "absolute",
                      left: cellX + 18,
                      top: startY - 10,
                      fontFamily: theme.mono,
                      fontSize: 20,
                      fontWeight: 800,
                      color,
                      opacity: enter * arrowProgress,
                    }}
                  >
                    {hashLabels[t.row]}
                  </div>
                </React.Fragment>
              );
            }
          )}
        </>
      )}

      {/* Element pill flying in during insert/collide */}
      {(phase === "insert" || phase === "collide") && (
        <div
          style={{
            position: "absolute",
            left: interpolate(
              spring({ frame: local, fps, config: { damping: 14, mass: 0.8 } }),
              [0, 1],
              [100, cx]
            ),
            top: 380,
            transform: "translate(-50%, -50%)",
            padding: "10px 22px",
            borderRadius: 999,
            background: phase === "collide" ? theme.warning : theme.success,
            color: "#06121A",
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 30,
            opacity: enter,
            boxShadow: `0 0 28px ${(phase === "collide" ? theme.warning : theme.success)}AA`,
          }}
        >
          {phase === "collide" ? "B" : "A"}
        </div>
      )}

      {/* Collision flash */}
      {phase === "collide" && local >= impactLocal && (
        <PulseRing
          x={GRID_LEFT + 3 * (CELL_W + GAP) + CELL_W / 2}
          y={GRID_TOP + 1 * (CELL_H + GAP) + CELL_H / 2}
          triggerFrame={impactLocal}
          tone="danger"
          size={160}
        />
      )}

      {/* Query: min line across row 1 */}
      {phase === "query" && (
        <>
          {/* Horizontal scan line */}
          <div
            style={{
              position: "absolute",
              left: GRID_LEFT,
              top: GRID_TOP + 1 * (CELL_H + GAP) + CELL_H / 2 - 2,
              width: COLS * (CELL_W + GAP),
              height: 4,
              background: `linear-gradient(90deg, ${theme.accent}00, ${theme.accent}, ${theme.accent}00)`,
              opacity: enter * 0.6,
            }}
          />
          {/* Min badge */}
          <div
            style={{
              position: "absolute",
              left: cx,
              top: GRID_TOP + ROWS * (CELL_H + GAP) + 60,
              transform: "translateX(-50%)",
              padding: "14px 30px",
              borderRadius: 999,
              background: `${theme.success}18`,
              border: `2px solid ${theme.success}`,
              color: theme.success,
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 30,
              opacity: spring({
                frame: Math.max(0, local - 10),
                fps,
                config: { damping: 12, mass: 0.7 },
              }),
            }}
          >
            min(1, 2, 1) = {queryValue}
          </div>
        </>
      )}

      {/* Guarantee badge */}
      {phase === "guarantee" && (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 850,
            transform: `translateX(-50%) scale(${spring({ frame: local, fps, config: { damping: 11, mass: 0.7 } })})`,
            padding: "20px 40px",
            borderRadius: 24,
            background: `${theme.success}1A`,
            border: `3px solid ${theme.success}`,
            textAlign: "center",
            opacity: enter,
          }}
        >
          <div
            style={{
              fontFamily: theme.font,
              fontWeight: 800,
              fontSize: 36,
              color: theme.success,
              marginBottom: 8,
            }}
          >
            НИКОГДА НЕ ЗАНИЖАЕТ
          </div>
          <div
            style={{
              fontFamily: theme.mono,
              fontSize: 24,
              color: theme.subtext,
            }}
          >
            оценка ≥ реальности · ошибка ≤ ε
          </div>
        </div>
      )}

      {/* Bottom label: counter count */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 1300,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontSize: 22,
          color: theme.subtext,
          opacity: enter,
          letterSpacing: 2,
        }}
      >
        {ROWS} РЯДА × {COLS} СЧЁТЧИКОВ · ФИКСИРОВАННАЯ ПАМЯТЬ
      </div>
    </>
  );
};

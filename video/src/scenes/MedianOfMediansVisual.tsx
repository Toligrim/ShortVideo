import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";

export type MedianOfMediansPhase = "groups" | "pivot" | "partition";

const W = layout.width;

const Chip: React.FC<{
  text: string;
  color: string;
  extra?: React.CSSProperties;
}> = ({ text, color, extra }) => (
  <div
    style={{
      position: "absolute",
      padding: "10px 24px",
      borderRadius: 999,
      background: `${color}18`,
      border: `2px solid ${color}`,
      color,
      fontFamily: theme.font,
      fontWeight: 800,
      fontSize: 28,
      whiteSpace: "nowrap",
      ...extra,
    }}
  >
    {text}
  </div>
);

const GROUP_SIZE = 5;
const GROUPS = 3;
const ALL = GROUPS * GROUP_SIZE;
const ELEMENT_W = 54;
const ELEMENT_H = 64;
const ELEMENT_GAP = 6;
const GROUP_GAP = 18;
const ROW_W = GROUP_SIZE * ELEMENT_W + (GROUP_SIZE - 1) * ELEMENT_GAP;
const TOTAL_W = GROUPS * ROW_W + (GROUPS - 1) * GROUP_GAP;
const ROW_LEFT = (W - TOTAL_W) / 2;
const ROW_TOP = 500;
const MEDIAN_Y = ROW_TOP + ELEMENT_H + 60;
const PIVOT_Y = MEDIAN_Y + 120;

const values = [23, 8, 42, 15, 3, 61, 7, 29, 11, 50, 18, 36, 5, 44, 27];
const sortedGroups = Array.from({ length: GROUPS }, (_, g) =>
  values.slice(g * GROUP_SIZE, (g + 1) * GROUP_SIZE).sort((a, b) => a - b)
);
const medians = sortedGroups.map((g) => g[Math.floor(GROUP_SIZE / 2)]);

export const MedianOfMediansVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: MedianOfMediansPhase;
}> = ({ local, fps, impactLocal, phase = "groups" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  const cx = W / 2;

  const isMedian = (g: number, i: number) => i === Math.floor(GROUP_SIZE / 2);
  const getGroupColor = (g: number) =>
    g === 0 ? theme.accent : g === 1 ? theme.accent2 : theme.success;

  if (phase === "groups") {
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 340,
            transform: "translateX(-50%)",
            fontFamily: theme.mono,
            fontWeight: 800,
            letterSpacing: 3,
            fontSize: 36,
            color: theme.text,
            textAlign: "center",
            opacity: enter,
          }}
        >
          ГРУППЫ ПО ПЯТЬ
        </div>

        {Array.from({ length: GROUPS }).map((_, g) => {
          const sorted = sortedGroups[g];
          const color = getGroupColor(g);
          const groupLeft = ROW_LEFT + g * (ROW_W + GROUP_GAP);
          return (
            <React.Fragment key={g}>
              <div
                style={{
                  position: "absolute",
                  left: groupLeft - 14,
                  top: ROW_TOP - 42,
                  width: ROW_W + 28,
                  height: ELEMENT_H + 56,
                  borderRadius: 22,
                  border: `3px solid ${color}55`,
                  background: `${color}08`,
                  opacity: enter,
                  transform: `translateY(${(1 - enter) * 50}px)`,
                }}
              />
              {sorted.map((v, i) => {
                const med = isMedian(g, i);
                const x = groupLeft + i * (ELEMENT_W + ELEMENT_GAP);
                const pulse = med ? 1 + 0.08 * Math.sin(local / 6) : 1;
                const medGlow = med ? 0.5 + 0.5 * Math.sin(local / 8) : 0;
                return (
                  <div
                    key={`${g}-${i}`}
                    style={{
                      position: "absolute",
                      left: x,
                      top: ROW_TOP,
                      width: ELEMENT_W,
                      height: ELEMENT_H,
                      borderRadius: 16,
                      border: `3px solid ${med ? color : theme.panelBorder}`,
                      background: med ? `${color}22` : theme.panel,
                      boxShadow: med ? `0 0 ${30 + 40 * medGlow}px ${color}66` : "none",
                      opacity: enter,
                      transform: `scale(${pulse}) translateY(${(1 - enter) * 50}px)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: theme.mono,
                      fontWeight: 800,
                      fontSize: 34,
                      color: med ? color : theme.text,
                    }}
                  >
                    {v}
                  </div>
                );
              })}
              <div
                style={{
                  position: "absolute",
                  left: groupLeft + ROW_W / 2,
                  top: ROW_TOP + ELEMENT_H + 14,
                  transform: "translateX(-50%)",
                  fontFamily: theme.mono,
                  fontSize: 22,
                  color: theme.subtext,
                  opacity: enter,
                }}
              >
                {`[${sorted.join(", ")}]`}
              </div>
            </React.Fragment>
          );
        })}

        <div
          style={{
            position: "absolute",
            left: cx,
            top: MEDIAN_Y,
            transform: "translateX(-50%)",
            fontFamily: theme.mono,
            fontSize: 28,
            color: theme.subtext,
            opacity: enter,
            letterSpacing: 2,
          }}
        >
          МЕДИАНЫ
        </div>

        {medians.map((m, g) => {
          const color = getGroupColor(g);
          const groupLeft = ROW_LEFT + g * (ROW_W + GROUP_GAP);
          const x = groupLeft + Math.floor(GROUP_SIZE / 2) * (ELEMENT_W + ELEMENT_GAP) + ELEMENT_W / 2;
          return (
            <div
              key={`med-${g}`}
              style={{
                position: "absolute",
                left: x - 30,
                top: MEDIAN_Y + 40,
                width: 60,
                height: 60,
                borderRadius: 30,
                border: `3px solid ${color}`,
                background: `${color}22`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: theme.mono,
                fontWeight: 800,
                fontSize: 28,
                color,
                opacity: enter,
                boxShadow: `0 0 20px ${color}44`,
              }}
            >
              {m}
            </div>
          );
        })}
      </>
    );
  }

  if (phase === "pivot") {
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 340,
            transform: "translateX(-50%)",
            fontFamily: theme.mono,
            fontWeight: 800,
            letterSpacing: 3,
            fontSize: 36,
            color: theme.text,
            textAlign: "center",
            opacity: enter,
          }}
        >
          МЕДИАНА МЕДИАН
        </div>

        <div
          style={{
            position: "absolute",
            left: cx,
            top: 440,
            transform: "translateX(-50%)",
            fontFamily: theme.mono,
            fontSize: 26,
            color: theme.subtext,
            opacity: enter,
            textAlign: "center",
          }}
        >
          рекурсивно из трёх медиан
        </div>

        {medians.map((m, g) => {
          const color = getGroupColor(g);
          const x = cx + (g - 1) * 160;
          const isPivot = g === 1;
          const yOff = isPivot ? PIVOT_Y - 60 : MEDIAN_Y + 30;
          const pulse = isPivot ? 1 + 0.08 * Math.sin(local / 6) : 1;
          const glow = isPivot ? 0.5 + 0.5 * Math.sin(local / 8) : 0;
          return (
            <React.Fragment key={`med2-${g}`}>
              <div
                style={{
                  position: "absolute",
                  left: x - 36,
                  top: yOff,
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  border: `3px solid ${isPivot ? color : theme.panelBorder}`,
                  background: isPivot ? `${color}22` : theme.panel,
                  boxShadow: isPivot ? `0 0 ${30 + 40 * glow}px ${color}66` : "none",
                  opacity: enter,
                  transform: `scale(${pulse})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: theme.mono,
                  fontWeight: 800,
                  fontSize: 30,
                  color: isPivot ? color : theme.text,
                }}
              >
                {m}
              </div>
              {isPivot ? (
                <div
                  style={{
                    position: "absolute",
                    left: x,
                    top: yOff + 90,
                    transform: "translateX(-50%)",
                    fontFamily: theme.font,
                    fontWeight: 700,
                    fontSize: 30,
                    color,
                    opacity: enter,
                  }}
                >
                  ← ПИВОТ
                </div>
              ) : null}
            </React.Fragment>
          );
        })}

        <Chip
          text="30–70%"
          color={theme.warning}
          extra={{
            left: cx,
            top: PIVOT_Y + 160,
            transform: "translateX(-50%)",
            opacity: enter,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: cx,
            top: PIVOT_Y + 220,
            transform: "translateX(-50%)",
            fontFamily: theme.mono,
            fontSize: 26,
            color: theme.subtext,
            opacity: enter,
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          {`гарантированно ≥30% с каждой стороны`}
        </div>
      </>
    );
  }

  // phase === "partition"
  const pivotVal = medians[1];
  const arr = [...values].sort((a, b) => a - b);
  const pivotIdx = arr.indexOf(pivotVal);
  const leftCount = pivotIdx;
  const rightCount = ALL - pivotIdx - 1;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 340,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontWeight: 800,
          letterSpacing: 3,
          fontSize: 36,
          color: theme.text,
          textAlign: "center",
          opacity: enter,
        }}
      >
        РАЗДЕЛЕНИЕ ВОКРУГ ПИВОТА
      </div>

      {arr.map((v, i) => {
        const x = ROW_LEFT + i * (ELEMENT_W + ELEMENT_GAP);
        const isPivot = v === pivotVal;
        const isLeft = i < pivotIdx;
        const isRight = i > pivotIdx;
        const color = isPivot
          ? theme.warning
          : isLeft
            ? theme.accent
            : isRight
              ? theme.accent2
              : theme.text;
        const dimmed = (isLeft || isRight) && hit;
        const opacity = dimmed ? 0.35 : enter;
        return (
          <div
            key={`part-${i}`}
            style={{
              position: "absolute",
              left: x,
              top: ROW_TOP,
              width: ELEMENT_W,
              height: ELEMENT_H,
              borderRadius: 16,
              border: `3px solid ${color}`,
              background: isPivot ? `${theme.warning}22` : `${color}12`,
              opacity,
              transform: `translateY(${(1 - enter) * 50}px)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 34,
              color,
            }}
          >
            {v}
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: ROW_LEFT - 20,
          top: ROW_TOP + ELEMENT_H + 20,
          fontFamily: theme.mono,
          fontSize: 24,
          color: theme.accent,
          opacity: hit ? 0.5 : enter,
        }}
      >
        ≤ {leftCount}
      </div>
      <div
        style={{
          position: "absolute",
          left: ROW_LEFT + ALL * (ELEMENT_W + ELEMENT_GAP) - 20,
          top: ROW_TOP + ELEMENT_H + 20,
          fontFamily: theme.mono,
          fontSize: 24,
          color: theme.accent2,
          opacity: hit ? 0.5 : enter,
        }}
      >
        {rightCount} ≥
      </div>

      {hit ? (
        <>
          <Chip
            text={`${leftCount} элементов × 2`}
            color={theme.danger}
            extra={{
              left: cx,
              top: PIVOT_Y + 80,
              transform: "translateX(-50%)",
              opacity: pop,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: cx,
              top: PIVOT_Y + 140,
              transform: "translateX(-50%)",
              fontFamily: theme.mono,
              fontSize: 24,
              color: theme.danger,
              opacity: pop * 0.8,
              textAlign: "center",
            }}
          >
            отброшены с каждой стороны
          </div>
        </>
      ) : null}
    </>
  );
};

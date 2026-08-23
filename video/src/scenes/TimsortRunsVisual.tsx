import React from "react";
import { interpolate, interpolateColors, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, theme, toneColor } from "../lib/theme";

const W = layout.width;

type Phase = "runs" | "merge" | "invariant";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase: Phase;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export const TimsortRunsVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase,
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const postImpact = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });

  if (phase === "runs") {
    const cardW = 260;
    const cardH = 180;
    const gap = 24;
    const totalW = 3 * cardW + 2 * gap;
    const startX = (W - totalW) / 2;
    const centerY = 850;

    const runs = [
      { label: "RUN A", color: theme.accent, items: [1, 3, 5, 7, 9] },
      { label: "RUN B", color: theme.accent2, items: [2, 4, 6, 8, 10] },
      { label: "RUN C", color: theme.success, items: [0, 11, 12, 13, 14] },
    ];

    return (
      <>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 320,
            transform: "translateX(-50%)",
            fontFamily: theme.mono,
            fontSize: 26,
            letterSpacing: 3,
            color: theme.subtext,
            opacity: enter,
          }}
        >
          НАТУРАЛЬНЫЕ RUNS — УПОРЯДОЧЕННЫЕ УЧАСТКИ
        </div>

        {runs.map((run, i) => {
          const x = startX + i * (cardW + gap);
          const slideP = smooth(clamp01(local / Math.max(impactLocal - 6, 1)));
          const slideX = interpolate(slideP, [0, 1], [x + (i === 1 ? 0 : i === 0 ? -120 : 120), x]);
          const cardEnter = interpolate(slideP, [0.3, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

          return (
            <div
              key={run.label}
              style={{
                position: "absolute",
                left: slideX,
                top: centerY,
                width: cardW,
                height: cardH,
                borderRadius: 20,
                background: theme.panel,
                border: `3px solid ${run.color}99`,
                boxShadow: `0 0 40px ${run.color}22`,
                opacity: enter * cardEnter,
                transform: `translateY(${(1 - cardEnter) * 60}px)`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                paddingTop: 18,
              }}
            >
              <div
                style={{
                  fontFamily: theme.mono,
                  fontWeight: 800,
                  fontSize: 28,
                  color: run.color,
                  letterSpacing: 2,
                }}
              >
                {run.label}
              </div>
              <div
                style={{
                  marginTop: 14,
                  fontFamily: theme.mono,
                  fontSize: 18,
                  color: theme.subtext,
                }}
              >
                возрастающий
              </div>
              <div
                style={{
                  marginTop: 18,
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  justifyContent: "center",
                  width: cardW - 24,
                }}
              >
                {run.items.map((v, j) => (
                  <div
                    key={j}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: `${run.color}22`,
                      border: `2px solid ${run.color}88`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: theme.mono,
                      fontWeight: 700,
                      fontSize: 16,
                      color: run.color,
                      opacity: 0.6 + 0.4 * Math.sin((local + j * 5) / 10),
                    }}
                  >
                    {v}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: centerY + cardH + 40,
            transform: "translateX(-50%)",
            fontFamily: theme.font,
            fontWeight: 700,
            fontSize: 28,
            color: theme.text,
            opacity: enter,
          }}
        >
          три отрезка в стеке слияния
        </div>
      </>
    );
  }

  if (phase === "merge") {
    const cardW = 160;
    const cardH = 130;
    const centerY = 780;
    const mergeCardW = 320;
    const mergeCardH = 160;

    const runAColor = theme.accent;
    const runBColor = theme.accent2;
    const runCColor = theme.success;
    const mergedColor = toneColor("success");

    const t = smooth(clamp01(local / Math.max(impactLocal, 1)));

    const startAX = W / 2 - 380;
    const startBX = W / 2 - 80;
    const startCX = W / 2 + 220;
    const targetX = W / 2 - mergeCardW / 2;

    const ax = interpolate(t, [0, 1], [startAX, targetX + 20]);
    const bx = interpolate(t, [0, 1], [startBX, targetX + mergeCardW / 2 - cardW / 2]);
    const cx = interpolate(t, [0, 1], [startCX, targetX + mergeCardW - cardW - 20]);

    const mergedEnter = postImpact;
    const mergedScale = interpolate(mergedEnter, [0, 1], [0.6, 1]);
    const mergedOpacity = mergedEnter;

    return (
      <>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 320,
            transform: "translateX(-50%)",
            fontFamily: theme.mono,
            fontSize: 26,
            letterSpacing: 3,
            color: theme.subtext,
            opacity: enter,
          }}
        >
          СЛИЯНИЕ В СТЕКЕ — ПОПАРНО И ПОСЛЕДОВАТЕЛЬНО
        </div>

        <div
          key="runA"
          style={{
            position: "absolute",
            left: ax,
            top: centerY,
            width: cardW,
            height: cardH,
            borderRadius: 16,
            background: theme.panel,
            border: `3px solid ${runAColor}99`,
            boxShadow: `0 0 30px ${runAColor}22`,
            opacity: enter * (1 - mergedEnter * 0.5),
            transform: `translateY(${(1 - enter) * 60}px) scale(${1 - mergedEnter * 0.15})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 12,
          }}
        >
          <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 22, color: runAColor }}>RUN A</div>
          <div style={{ marginTop: 6, fontFamily: theme.mono, fontSize: 14, color: theme.subtext }}>1 3 5 7 9</div>
        </div>

        <div
          key="runB"
          style={{
            position: "absolute",
            left: bx,
            top: centerY,
            width: cardW,
            height: cardH,
            borderRadius: 16,
            background: theme.panel,
            border: `3px solid ${runBColor}99`,
            boxShadow: `0 0 30px ${runBColor}22`,
            opacity: enter * (1 - mergedEnter * 0.5),
            transform: `translateY(${(1 - enter) * 60}px) scale(${1 - mergedEnter * 0.15})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 12,
          }}
        >
          <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 22, color: runBColor }}>RUN B</div>
          <div style={{ marginTop: 6, fontFamily: theme.mono, fontSize: 14, color: theme.subtext }}>2 4 6 8 10</div>
        </div>

        <div
          key="runC"
          style={{
            position: "absolute",
            left: cx,
            top: centerY,
            width: cardW,
            height: cardH,
            borderRadius: 16,
            background: theme.panel,
            border: `3px solid ${runCColor}99`,
            boxShadow: `0 0 30px ${runCColor}22`,
            opacity: enter * (1 - mergedEnter * 0.5),
            transform: `translateY(${(1 - enter) * 60}px) scale(${1 - mergedEnter * 0.15})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 12,
          }}
        >
          <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 22, color: runCColor }}>RUN C</div>
          <div style={{ marginTop: 6, fontFamily: theme.mono, fontSize: 14, color: theme.subtext }}>0 11 12 13 14</div>
        </div>

        <div
          style={{
            position: "absolute",
            left: targetX,
            top: centerY - 20,
            width: mergeCardW,
            height: mergeCardH,
            borderRadius: 20,
            background: theme.panel,
            border: `3px solid ${mergedColor}CC`,
            boxShadow: `0 0 50px ${mergedColor}33`,
            opacity: mergedOpacity * enter,
            transform: `translateY(${(1 - mergedEnter) * 80}px) scale(${mergedScale})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 16,
          }}
        >
          <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 24, color: mergedColor }}>ОТСОРТИРОВАННЫЙ МАССИВ</div>
          <div style={{ marginTop: 8, fontFamily: theme.mono, fontSize: 16, color: theme.text }}>0 1 2 3 4 5 6 7 8 9 10 11 12 13 14</div>
          <div
            style={{
              marginTop: 14,
              padding: "6px 18px",
              borderRadius: 999,
              background: `${mergedColor}1A`,
              border: `2px solid ${mergedColor}88`,
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 18,
              color: mergedColor,
            }}
          >
            MERGE-STACK
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: centerY + mergeCardH + 30,
            transform: "translateX(-50%)",
            fontFamily: theme.font,
            fontWeight: 700,
            fontSize: 26,
            color: theme.text,
            opacity: enter,
          }}
        >
          три отрезка сходятся в один отсортированный
        </div>
      </>
    );
  }

  // phase === "invariant"
  const cardW = 160;
  const cardH = 130;
  const centerY = 720;
  const mergeCardW = 320;
  const mergeCardH = 160;
  const mergedColor = toneColor("success");

  const post = smooth(clamp01(postImpact));

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 280,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontSize: 26,
          letterSpacing: 3,
          color: theme.danger,
          opacity: enter,
        }}
      >
        ИНВАРИАНТ СТЕКА НАРУШЕН
      </div>

      <div
        style={{
          position: "absolute",
          left: W / 2 - mergeCardW / 2,
          top: centerY - 20,
          width: mergeCardW,
          height: mergeCardH,
          borderRadius: 20,
          background: theme.panel,
          border: `3px solid ${mergedColor}CC`,
          boxShadow: `0 0 50px ${mergedColor}33`,
          opacity: enter,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 16,
        }}
      >
        <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 24, color: mergedColor }}>ОТСОРТИРОВАННЫЙ МАССИВ</div>
        <div style={{ marginTop: 8, fontFamily: theme.mono, fontSize: 16, color: theme.text }}>0 1 2 3 4 5 6 7 8 9 10 11 12 13 14</div>
        <div
          style={{
            marginTop: 14,
            padding: "6px 18px",
            borderRadius: 999,
            background: `${mergedColor}1A`,
            border: `2px solid ${mergedColor}88`,
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 18,
            color: mergedColor,
          }}
        >
          MERGE-STACK
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: centerY + mergeCardH + 55,
          transform: "translateX(-50%)",
          padding: "10px 24px",
          borderRadius: 12,
          background: `${theme.danger}22`,
          border: `3px solid ${theme.danger}AA`,
          fontFamily: theme.mono,
          fontWeight: 800,
          fontSize: 20,
          color: theme.danger,
          opacity: post,
        }}
      >
        переполнение возможно
      </div>

      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: centerY + mergeCardH + 110,
          transform: "translateX(-50%)",
          fontFamily: theme.font,
          fontWeight: 700,
          fontSize: 26,
          color: theme.text,
          opacity: enter,
        }}
      >
        стек не вмещает элементы → ArrayIndexOutOfBounds
      </div>

      {post > 0.3 ? (
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: centerY + mergeCardH / 2,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: mergeCardW + 60,
              height: mergeCardH + 60,
              borderRadius: 28,
              border: `6px solid ${theme.danger}`,
              boxShadow: `0 0 ${40 + 30 * Math.sin(local / 6)}px ${theme.danger}88`,
              animation: `pulse 0.6s ease-in-out infinite`,
            }}
          />
        </div>
      ) : null}


    </>
  );
};
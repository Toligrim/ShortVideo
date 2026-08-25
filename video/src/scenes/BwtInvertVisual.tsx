import React from "react";
import { spring, interpolate } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const W = layout.width;

export type BwtInvertPhase = "invert" | "runs";

// Data for BANANA$
const sorted = ["$BANANA", "A$BANAN", "ANA$BAN", "ANANA$B", "BANANA$", "NA$BANA", "NANA$BA"];
const L = sorted.map((r) => r[6]).join(""); // ANNB$AA
const F = sorted.map((r) => r[0]).join(""); // $AAABNNN? let's compute: sorted F chars: $, A, A, A, B, N, N => $AAABNN? actually sorted: $BANANA(F $), A$BANAN(F A), ANA$BAN(F A), ANANA$B(F A), BANANA$(F B), NANA$BA(F N), NA$BANA(F N) => $AAABNN
const LF = F; // use F for display

export const BwtInvertVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: BwtInvertPhase;
}> = ({ local, fps, impactLocal, phase = "invert" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  const cx = W / 2;

  if (phase === "runs") {
    // Show L string with runs highlighted
    const chars = L.split(""); // A N N B $ A A
    const cell = 98;
    const gap = 10;
    const rowW = chars.length * cell + (chars.length - 1) * gap;
    const left = (W - rowW) / 2;
    const top = 640;
    // runs: indices 1-2 (N,N) and 5-6 (A,A)
    const runIdx = new Set([1, 2, 5, 6]);
    const walkP = smooth(clamp01((local - 6) / 22));
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 320,
            transform: "translateX(-50%)",
            fontFamily: theme.mono,
            fontSize: 24,
            letterSpacing: 3,
            color: theme.subtext,
            opacity: enter,
          }}
        >
          ОДИНАКОВЫЕ КОНТЕКСТЫ → РЯДОМ
        </div>
        <div
          style={{
            position: "absolute",
            left: left,
            top: top,
            display: "flex",
            gap,
            opacity: enter,
          }}
        >
          {chars.map((ch, i) => {
            const isRun = runIdx.has(i);
            const hl = isRun && walkP > 0.35;
            const scale = hl ? 1 + 0.06 * Math.sin((local - impactLocal) / 5 + i) : 1;
            const bg = hl ? `${theme.success}1A` : isRun ? `${theme.warning}0F` : theme.panel;
            const border = hl ? `3px solid ${theme.success}` : `3px solid ${isRun ? theme.warning + "66" : theme.panelBorder}`;
            return (
              <div
                key={i}
                style={{
                  width: cell,
                  height: cell + 30,
                  borderRadius: 18,
                  background: bg,
                  border,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: theme.mono,
                  fontWeight: 800,
                  fontSize: 44,
                  color: ch === "$" ? theme.warning : hl ? theme.success : theme.text,
                  transform: `scale(${scale})`,
                  boxShadow: hl ? `0 0 26px ${theme.success}66` : "none",
                  opacity: enter,
                }}
              >
                {ch}
              </div>
            );
          })}
        </div>
        {/* run connectors */}
        <div
          style={{
            position: "absolute",
            left: left + cell + gap / 2,
            top: top + cell + 36,
            width: cell + gap,
            height: 4,
            background: theme.success,
            borderRadius: 999,
            opacity: done ? badgeP : walkP * 0.6,
            boxShadow: `0 0 14px ${theme.success}88`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: left + 5 * (cell + gap) + cell / 2 - (cell + gap) / 2,
            top: top + cell + 36,
            width: cell + gap,
            height: 4,
            background: theme.success,
            borderRadius: 999,
            opacity: done ? badgeP : walkP * 0.6,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: cx,
            top: top + cell + 70,
            transform: "translateX(-50%)",
            fontFamily: theme.mono,
            fontSize: 22,
            color: theme.subtext,
            opacity: enter,
          }}
        >
          <span style={{ color: theme.success, fontWeight: 800 }}>NN</span> &nbsp;и&nbsp; <span style={{ color: theme.success, fontWeight: 800 }}>AA</span> — серии, Хаффману легко
        </div>
        {done ? (
          <>
            <PulseRing x={left + 1 * (cell + gap) + cell / 2 + (cell + gap) / 2} y={top + cell / 2} triggerFrame={impactLocal} tone="success" size={170} />
            <PulseRing x={left + 5 * (cell + gap) + cell / 2 + (cell + gap) / 2} y={top + cell / 2} triggerFrame={impactLocal} tone="success" size={170} />
            <div
              style={{
                position: "absolute",
                left: cx,
                top: top + cell + 150,
                transform: `translateX(-50%) scale(${badgeP})`,
                opacity: badgeP,
                padding: "14px 28px",
                borderRadius: 999,
                background: `${theme.success}18`,
                border: `2px solid ${theme.success}`,
                color: theme.success,
                fontFamily: theme.font,
                fontWeight: 800,
                fontSize: 26,
              }}
            >
              ДЛИННЫЕ ПОВТОРЫ → СЖИМАЕМО
            </div>
          </>
        ) : null}
      </>
    );
  }

  // phase invert: show L column -> F column and steps restoring original right-to-left
  const cell = 64;
  const gap = 8;
  const colLeftL = W / 2 - 180;
  const colLeftF = W / 2 + 60;
  const top = 480;
  const rowH = cell;
  const n = L.length;
  const gridH = n * (rowH + gap) - gap;

  // LF mapping for BANANA$: L= A N N B $ A A, F= $ A A A B N N
  // For visual we show arrows L -> F for same rank per char (stable)
  // Steps reconstruction: start at row with $ in L (index 4), then follow T[4]=? etc.
  // Precomputed LF links: by ranking
  // We'll animate reconstruction accumulating "BANANA$" from end.
  const steps = ["$", "A$", "NA$", "ANA$", "NANA$", "ANANA$", "BANANA$"];
  const stepIdx = Math.min(steps.length - 1, Math.floor(smooth(clamp01((local - 10) / 28)) * steps.length));
  const restored = steps[stepIdx];

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
        }}
      >
        ОБРАТИМО — LF-ШАГ ЗА ШАГОМ
      </div>
      {/* headers L / F */}
      <div style={{ position: "absolute", left: colLeftL + cell / 2 - 20, top: top - 50, fontFamily: theme.mono, fontSize: 26, fontWeight: 800, color: theme.accent2, opacity: enter }}>L</div>
      <div style={{ position: "absolute", left: colLeftF + cell / 2 - 20, top: top - 50, fontFamily: theme.mono, fontSize: 26, fontWeight: 800, color: theme.accent, opacity: enter }}>F</div>
      <div style={{ position: "absolute", left: colLeftL + cell / 2 - 20, top: top - 78, fontFamily: theme.mono, fontSize: 16, color: theme.subtext, opacity: enter * 0.7 }}>последний</div>
      <div style={{ position: "absolute", left: colLeftF + cell / 2 - 20, top: top - 78, fontFamily: theme.mono, fontSize: 16, color: theme.subtext, opacity: enter * 0.7 }}>первый</div>

      {/* columns */}
      {Array.from({ length: n }).map((_, i) => {
        const p = smooth(clamp01((local - i * 3) / 12));
        const isPrimary = L[i] === "$";
        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: "absolute",
                left: colLeftL,
                top: top + i * (rowH + gap),
                width: cell,
                height: rowH,
                borderRadius: 12,
                background: isPrimary ? `${theme.warning}18` : theme.panel,
                border: `3px solid ${isPrimary ? theme.warning : theme.accent2 + "99"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: theme.mono,
                fontWeight: 800,
                fontSize: 30,
                color: L[i] === "$" ? theme.warning : theme.accent2,
                opacity: enter * p,
                transform: `scale(${0.7 + 0.3 * p})`,
                boxShadow: isPrimary ? `0 0 18px ${theme.warning}55` : "none",
              }}
            >
              {L[i]}
            </div>
            <div
              style={{
                position: "absolute",
                left: colLeftF,
                top: top + i * (rowH + gap),
                width: cell,
                height: rowH,
                borderRadius: 12,
                background: theme.panel,
                border: `3px solid ${theme.accent}66`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: theme.mono,
                fontWeight: 800,
                fontSize: 30,
                color: F[i] === "$" ? theme.warning : theme.accent,
                opacity: enter * p,
                transform: `scale(${0.7 + 0.3 * p})`,
              }}
            >
              {F[i]}
            </div>
            {/* LF arrow hint for $ row */}
            {isPrimary && p > 0.5 ? (
              <div
                style={{
                  position: "absolute",
                  left: colLeftL + cell + 12,
                  top: top + i * (rowH + gap) + rowH / 2 - 2,
                  width: colLeftF - (colLeftL + cell + 12) - 10,
                  height: 3,
                  background: theme.warning,
                  opacity: enter * p * 0.9,
                  borderRadius: 999,
                }}
              >
                <span style={{ position: "absolute", right: -6, top: -11, color: theme.warning, fontSize: 22 }}>›</span>
              </div>
            ) : null}
          </React.Fragment>
        );
      })}

      {/* restore ribbon bottom */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: top + gridH + 46,
          transform: "translateX(-50%)",
          width: 780,
          minHeight: 110,
          borderRadius: 20,
          background: theme.panel,
          border: `2px solid ${theme.success}66`,
          padding: "18px 24px",
          opacity: enter,
          textAlign: "center",
        }}
      >
        <div style={{ fontFamily: theme.mono, fontSize: 18, color: theme.subtext, letterSpacing: 2 }}>ВОССТАНОВЛЕНИЕ (справа налево)</div>
        <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 38, color: theme.text, marginTop: 10, letterSpacing: 6 }}>{restored}</div>
        <div style={{ fontFamily: theme.mono, fontSize: 18, color: theme.success, marginTop: 6, opacity: done ? 1 : 0.5 }}>
          {done ? "→ BANANA$ без потерь" : `шаг ${stepIdx + 1} / ${steps.length}`}
        </div>
      </div>
      {done ? (
        <>
          <PulseRing x={cx} y={top + gridH + 100} triggerFrame={impactLocal} tone="success" size={320} />
          <div
            style={{
              position: "absolute",
              left: cx,
              top: top + gridH + 190,
              transform: `translateX(-50%) scale(${badgeP})`,
              opacity: badgeP,
              padding: "12px 24px",
              borderRadius: 999,
              background: `${theme.success}18`,
              border: `2px solid ${theme.success}`,
              color: theme.success,
              fontFamily: theme.font,
              fontWeight: 800,
              fontSize: 24,
            }}
          >
            100% ОБРАТИМО — РАСШИФРОВКА ТОЧНА
          </div>
        </>
      ) : null}
    </>
  );
};

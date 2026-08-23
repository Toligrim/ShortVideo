import React from "react";
import { spring, interpolate, interpolateColors } from "remotion";
import { layout, theme } from "../lib/theme";
import { fitText } from "@remotion/layout-utils";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type ImplicationGraphPhase = "nodes" | "edges" | "complete";

const W = layout.width;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

type Pt = { x: number; y: number };

const NODE_POSITIONS: Pt[] = [
  { x: 300, y: 520 },  // x₁
  { x: 300, y: 920 },  // ¬x₁
  { x: 780, y: 520 },  // x₂
  { x: 780, y: 920 },  // ¬x₂
];

const NODE_LABELS = ["x₁", "¬x₁", "x₂", "¬x₂"];
const NODE_ICONS = ["variable", "circle-x", "variable", "circle-x"];
const NODE_TONES: ("accent" | "danger")[] = ["accent", "danger", "accent", "danger"];

// For a clause (a ∨ b): edges ¬a→b and ¬b→a
// Clause 1: (x₁ ∨ x₂) → ¬x₁→x₂, ¬x₂→x₁  (indices 1→2, 3→0)
// Clause 2: (¬x₁ ∨ x₂) → x₁→x₂, ¬x₂→¬x₁  (indices 0→2, 3→1)
const EDGES: [number, number][] = [
  [1, 2], // ¬x₁ → x₂
  [3, 0], // ¬x₂ → x₁
  [0, 2], // x₁ → x₂
  [3, 1], // ¬x₂ → ¬x₁
];

const EDGE_COLORS = [theme.accent2, theme.accent, theme.success, theme.warning];

const arrowPath = (from: Pt, to: Pt): { dx: number; dy: number; length: number; angle: number; midX: number; midY: number } => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { dx, dy, length, angle, midX: (from.x + to.x) / 2, midY: (from.y + to.y) / 2 };
};

const ImplicationGraphVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: ImplicationGraphPhase;
  variables?: number;
}> = ({ local, fps, impactLocal, phase = "complete", variables = 2 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const cx = W / 2;

  const showNodes = phase === "nodes" || phase === "edges" || phase === "complete";
  const showEdges = phase === "edges" || phase === "complete";
  const showVerdict = phase === "complete";

  const edgeProgress = showEdges
    ? smooth(clamp01((local - 6) / Math.max(impactLocal - 6, 1)))
    : 0;

  const verdictPop = showVerdict
    ? spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 11, mass: 0.7 } })
    : 0;

  const settled = local >= impactLocal;

  // Node appearance stagger
  const nodeP = (i: number) =>
    showNodes
      ? spring({ frame: Math.max(0, local - i * 8), fps, config: { damping: 13, mass: 0.7 } })
      : 0;

  // Edge appearance stagger
  const edgeP = (i: number) =>
    showEdges
      ? clamp01((edgeProgress - i * 0.18) / 0.35)
      : 0;

  const nodeRadius = 52;

  const renderNode = (i: number) => {
    const pos = NODE_POSITIONS[i];
    const p = nodeP(i);
    const color = NODE_TONES[i] === "accent" ? theme.accent : theme.danger;
    const pulse = 1 + 0.02 * Math.sin((local + i * 5) / 8);
    return (
      <div
        key={`node-${i}`}
        style={{
          position: "absolute",
          left: pos.x - nodeRadius,
          top: pos.y - nodeRadius,
          width: nodeRadius * 2,
          height: nodeRadius * 2,
          borderRadius: "50%",
          background: theme.panel,
          border: `3px solid ${color}`,
          boxShadow: `0 0 38px ${color}33`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          opacity: p,
          transform: `translateY(${(1 - p) * 60}px) scale(${pulse * (0.85 + 0.15 * p)})`,
          zIndex: 3,
        }}
      >
        <IconGlyph name={NODE_ICONS[i]} size={32} color={color} strokeWidth={1.7} />
        <div
          style={{
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 26,
            color: theme.text,
          }}
        >
          {NODE_LABELS[i]}
        </div>
      </div>
    );
  };

  const renderEdge = (i: number) => {
    const fromIdx = EDGES[i][0];
    const toIdx = EDGES[i][1];
    const from = NODE_POSITIONS[fromIdx];
    const to = NODE_POSITIONS[toIdx];
    const p = edgeP(i);
    const color = EDGE_COLORS[i];
    const { length, angle, midX, midY } = arrowPath(from, to);

    // Offset start/end from node center by nodeRadius
    const rad = (angle * Math.PI) / 180;
    const startX = from.x + Math.cos(rad) * (nodeRadius + 8);
    const startY = from.y + Math.sin(rad) * (nodeRadius + 8);
    const endX = to.x - Math.cos(rad) * (nodeRadius + 8);
    const endY = to.y - Math.sin(rad) * (nodeRadius + 8);
    const edgeLen = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
    const edgeAngle = (Math.atan2(endY - startY, endX - startX) * 180) / Math.PI;

    return (
      <div
        key={`edge-${i}`}
        style={{
          position: "absolute",
          left: startX,
          top: startY,
          width: edgeLen * p,
          height: 4,
          transformOrigin: "0 50%",
          transform: `translateY(-50%) rotate(${edgeAngle}deg)`,
          background: color,
          opacity: p * enter,
          zIndex: 1,
        }}
      >
        {p > 0.3 ? (
          <span
            style={{
              position: "absolute",
              right: -6,
              top: "50%",
              transform: "translateY(-50%)",
              color,
              fontFamily: theme.font,
              fontSize: 28,
              lineHeight: 1,
            }}
          >
            ›
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <>
      {/* Заголовок */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 310,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontSize: 28,
          letterSpacing: 4,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        ГРАФ ИМПЛИКАЦИЙ
      </div>

      {/* Подпись формулы */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 380,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontSize: 24,
          color: theme.subtext,
          opacity: enter,
          letterSpacing: 2,
        }}
      >
        (x₁ ∨ x₂) ∧ (¬x₁ ∨ x₂)
      </div>

      {/* Рёбра */}
      {showEdges ? EDGES.map((_, i) => renderEdge(i)) : null}

      {/* Узлы */}
      {showNodes ? NODE_POSITIONS.map((_, i) => renderNode(i)) : null}

      {/* Импликационные подписи на ребрах */}
      {showEdges
        ? EDGES.map((edge, i) => {
            const p = edgeP(i);
            if (p < 0.5) return null;
            const from = NODE_POSITIONS[edge[0]];
            const to = NODE_POSITIONS[edge[1]];
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            const labels = ["¬x₁→x₂", "¬x₂→x₁", "x₁→x₂", "¬x₂→¬x₁"];
            return (
              <div
                key={`elabel-${i}`}
                style={{
                  position: "absolute",
                  left: mx,
                  top: my - 28,
                  transform: "translateX(-50%)",
                  fontFamily: theme.mono,
                  fontSize: 18,
                  color: EDGE_COLORS[i],
                  opacity: (p - 0.5) * 2 * enter,
                  background: `${theme.panel}CC`,
                  padding: "2px 8px",
                  borderRadius: 8,
                  whiteSpace: "nowrap",
                  zIndex: 4,
                }}
              >
                {labels[i]}
              </div>
            );
          })
        : null}

      {/* Бейдж итога */}
      {showVerdict ? (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1300,
            transform: `translateX(-50%) scale(${verdictPop})`,
            padding: "14px 28px",
            borderRadius: 999,
            background: `${theme.success}18`,
            border: `2px solid ${theme.success}`,
            color: theme.success,
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 22,
            opacity: verdictPop,
            boxShadow: settled ? `0 0 40px ${theme.success}44` : "none",
            zIndex: 5,
            whiteSpace: "nowrap",
          }}
        >
          4 УЗЛА · 4 СТРЕЛКИ · ГРАФ ГОТОВ
        </div>
      ) : null}

      {settled && showVerdict ? (
        <PulseRing x={cx} y={1300} triggerFrame={impactLocal} tone="success" size={240} />
      ) : null}
    </>
  );
};

export { ImplicationGraphVisual };

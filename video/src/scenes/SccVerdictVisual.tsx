import React from "react";
import { spring, interpolate, interpolateColors } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type SccVerdictPhase = "tarjan" | "verdict";

const W = layout.width;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

type Pt = { x: number; y: number };

// Same graph layout as ImplicationGraph for visual continuity
const NODE_POSITIONS: Pt[] = [
  { x: 300, y: 520 },  // x₁
  { x: 300, y: 920 },  // ¬x₁
  { x: 780, y: 520 },  // x₂
  { x: 780, y: 920 },  // ¬x₂
];

const NODE_LABELS = ["x₁", "¬x₁", "x₂", "¬x₂"];

// Implication edges
const EDGES: [number, number][] = [
  [1, 2], // ¬x₁ → x₂
  [3, 0], // ¬x₂ → x₁
  [0, 2], // x₁ → x₂
  [3, 1], // ¬x₂ → ¬x₁
];

const EDGE_COLORS = [theme.accent2, theme.accent, theme.success, theme.warning];

// SCC groups for this formula: {x₁, x₂} and {¬x₁, ¬x₂} — no conflict
// For unsatisfiable demo: if x₁ and ¬x₁ are in same SCC
const SCC_GROUPS = [
  { nodes: [0, 2], color: theme.accent, label: "SCC-1" },   // x₁, x₂
  { nodes: [1, 3], color: theme.danger, label: "SCC-2" },   // ¬x₁, ¬x₂
];

const nodeRadius = 52;

const SccVerdictVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: SccVerdictPhase;
}> = ({ local, fps, impactLocal, phase = "tarjan" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const cx = W / 2;

  const isTarjan = phase === "tarjan";
  const isVerdict = phase === "verdict";

  // DFS traversal animation
  const dfsOrder = [0, 2, 1, 3]; // x₁ → x₂ → ¬x₁ → ¬x₂
  const dfsProgress = smooth(clamp01(local / Math.max(impactLocal - 4, 1)));
  const currentDfsStep = Math.floor(dfsProgress * dfsOrder.length);

  // Discovery times (mock)
  const discovery = [1, 5, 2, 6];
  const lowlink = [1, 1, 5, 5];

  // SCC reveal
  const sccReveal = isVerdict
    ? smooth(clamp01((local - 8) / Math.max(impactLocal - 8, 1)))
    : 0;

  const verdictPop = isVerdict
    ? spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 11, mass: 0.7 } })
    : 0;

  const settled = local >= impactLocal;

  // Danger pulse when x and ¬x in same SCC
  const dangerPulse = isVerdict && settled
    ? 1 + 0.08 * Math.sin((local - impactLocal) / 4)
    : 1;

  const nodeP = (i: number) =>
    spring({ frame: Math.max(0, local - i * 6), fps, config: { damping: 13, mass: 0.7 } });

  const renderNode = (i: number) => {
    const pos = NODE_POSITIONS[i];
    const p = nodeP(i);
    const inDfs = isTarjan && dfsOrder.indexOf(i) <= currentDfsStep;
    const dfsActive = isTarjan && dfsOrder[currentDfsStep] === i;

    // SCC coloring
    let sccColor: string = theme.panelBorder;
    let inScc = false;
    if (isVerdict && sccReveal > 0.3) {
      for (const group of SCC_GROUPS) {
        if (group.nodes.includes(i)) {
          sccColor = group.color;
          inScc = true;
          break;
        }
      }
    }

    const baseColor = inDfs ? theme.accent : inScc ? sccColor : theme.panelBorder;
    const pulse = dfsActive ? 1 + 0.08 * Math.sin(local / 3) : inScc ? dangerPulse : 1;

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
          background: inScc ? `${sccColor}22` : theme.panel,
          border: `3px solid ${baseColor}`,
          boxShadow: dfsActive
            ? `0 0 40px ${theme.accent}66`
            : inScc
            ? `0 0 35px ${sccColor}44`
            : "none",
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
        {isTarjan && inDfs ? (
          <div
            style={{
              fontFamily: theme.mono,
              fontSize: 16,
              color: theme.accent,
              opacity: 0.9,
            }}
          >
            d={discovery[i]} l={lowlink[i]}
          </div>
        ) : null}
      </div>
    );
  };

  const renderEdge = (i: number) => {
    const fromIdx = EDGES[i][0];
    const toIdx = EDGES[i][1];
    const from = NODE_POSITIONS[fromIdx];
    const to = NODE_POSITIONS[toIdx];
    const color = EDGE_COLORS[i];

    const rad = Math.atan2(to.y - from.y, to.x - from.x);
    const startX = from.x + Math.cos(rad) * (nodeRadius + 8);
    const startY = from.y + Math.sin(rad) * (nodeRadius + 8);
    const endX = to.x - Math.cos(rad) * (nodeRadius + 8);
    const endY = to.y - Math.sin(rad) * (nodeRadius + 8);
    const edgeLen = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
    const edgeAngle = (Math.atan2(endY - startY, endX - startX) * 180) / Math.PI;

    // Highlight DFS tree edges
    const isDfsTree =
      isTarjan &&
      ((fromIdx === 0 && toIdx === 2) || (fromIdx === 1 && toIdx === 2) || (fromIdx === 3 && toIdx === 1));

    const opacity = enter * (isDfsTree ? 1 : 0.35);
    const width = isDfsTree ? 5 : 3;

    return (
      <div
        key={`edge-${i}`}
        style={{
          position: "absolute",
          left: startX,
          top: startY,
          width: edgeLen,
          height: width,
          transformOrigin: "0 50%",
          transform: `translateY(-50%) rotate(${edgeAngle}deg)`,
          background: isDfsTree ? theme.accent : color,
          opacity,
          zIndex: 1,
        }}
      >
        <span
          style={{
            position: "absolute",
            right: -6,
            top: "50%",
            transform: "translateY(-50%)",
            color: isDfsTree ? theme.accent : color,
            fontFamily: theme.font,
            fontSize: 24,
            lineHeight: 1,
          }}
        >
          ›
        </span>
      </div>
    );
  };

  // SCC group halos
  const renderSccHalo = (group: (typeof SCC_GROUPS)[0], idx: number) => {
    if (!isVerdict || sccReveal < 0.3) return null;
    const nodes = group.nodes.map((i) => NODE_POSITIONS[i]);
    const minX = Math.min(...nodes.map((n) => n.x)) - 80;
    const maxX = Math.max(...nodes.map((n) => n.x)) + 80;
    const minY = Math.min(...nodes.map((n) => n.y)) - 80;
    const maxY = Math.max(...nodes.map((n) => n.y)) + 80;
    const w = maxX - minX;
    const h = maxY - minY;

    return (
      <div
        key={`scc-halo-${idx}`}
        style={{
          position: "absolute",
          left: minX,
          top: minY,
          width: w,
          height: h,
          borderRadius: 32,
          border: `3px dashed ${group.color}`,
          background: `${group.color}0A`,
          opacity: (sccReveal - 0.3) * 1.43 * enter,
          zIndex: 0,
        }}
      />
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
        {isTarjan ? "ОБХОД В ГЛУБИНУ · TARJAN" : "СИЛЬНЫЕ КОМПОНЕНТЫ СВЯЗНОСТИ"}
      </div>

      {/* Рёбра */}
      {EDGES.map((_, i) => renderEdge(i))}

      {/* SCC-хало */}
      {SCC_GROUPS.map((g, i) => renderSccHalo(g, i))}

      {/* Узлы */}
      {NODE_POSITIONS.map((_, i) => renderNode(i))}

      {/* DFS step indicator */}
      {isTarjan ? (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1300,
            transform: "translateX(-50%)",
            fontFamily: theme.mono,
            fontSize: 24,
            color: theme.accent,
            opacity: enter,
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          {dfsOrder.map((nodeIdx, step) => (
            <React.Fragment key={step}>
              <div
                style={{
                  padding: "6px 14px",
                  borderRadius: 12,
                  background: step <= currentDfsStep ? `${theme.accent}33` : "transparent",
                  border: `2px solid ${step <= currentDfsStep ? theme.accent : theme.panelBorder}`,
                  color: step <= currentDfsStep ? theme.accent : theme.subtext,
                  fontFamily: theme.mono,
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                {NODE_LABELS[nodeIdx]}
              </div>
              {step < dfsOrder.length - 1 ? (
                <span style={{ color: theme.panelBorder, fontSize: 20 }}>→</span>
              ) : null}
            </React.Fragment>
          ))}
        </div>
      ) : null}

      {/* Вердикт: x и ¬x в одной компоненте */}
      {isVerdict ? (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1300,
            transform: `translateX(-50%) scale(${verdictPop})`,
            padding: "16px 32px",
            borderRadius: 24,
            background: `${theme.danger}18`,
            border: `3px solid ${theme.danger}`,
            color: theme.danger,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 26,
            textAlign: "center",
            opacity: verdictPop,
            boxShadow: settled ? `0 0 50px ${theme.danger}55` : "none",
            zIndex: 5,
          }}
        >
          x₁ → … → ¬x₁ → … → x₁
          <div
            style={{
              fontFamily: theme.mono,
              fontSize: 20,
              marginTop: 8,
              color: theme.danger,
              opacity: 0.8,
            }}
          >
            ЦИКЛ В ОДНОЙ КОМПОНЕНТЕ · НЕВЫПОЛНИМА
          </div>
        </div>
      ) : null}

      {settled && isVerdict ? (
        <PulseRing x={cx} y={1300} triggerFrame={impactLocal} tone="danger" size={320} />
      ) : null}
    </>
  );
};

export { SccVerdictVisual };

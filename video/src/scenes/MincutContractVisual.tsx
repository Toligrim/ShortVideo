import React from "react";
import { spring, useCurrentFrame, useVideoConfig, interpolate, interpolateColors } from "remotion";
import { layout, theme } from "../lib/theme";
import { fitText } from "@remotion/layout-utils";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type MincutContractPhase = "contract" | "survive" | "probability" | "branch" | "repeat";

const W = layout.width;

type Pt = { x: number; y: number };

const NODES: Pt[] = [
  { x: 200, y: 460 },
  { x: 500, y: 360 },
  { x: 800, y: 460 },
  { x: 300, y: 820 },
  { x: 600, y: 760 },
  { x: 860, y: 780 },
];
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4], [4, 5],
];
const RED_CUT: [number, number] = [3, 4];
const MERGE_EDGE: [number, number] = [1, 4];

const edgeKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
const isRedCut = (a: number, b: number) => edgeKey(a, b) === edgeKey(RED_CUT[0], RED_CUT[1]);
const isMergeEdge = (a: number, b: number) => edgeKey(a, b) === edgeKey(MERGE_EDGE[0], MERGE_EDGE[1]);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const MincutContractVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: MincutContractPhase;
}> = ({ local, fps, impactLocal, phase = "contract" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const cx = W / 2;

  const contractP = smooth(clamp01((local - 4) / Math.max(impactLocal - 4, 1)));
  const merged = local >= impactLocal;
  const mergeP = merged
    ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } })
    : 0;

  const nodeRadius = 46;
  const contractRadius = merged ? nodeRadius + 18 * mergeP : nodeRadius;

  const mergedCenter: Pt = {
    x: (NODES[1].x + NODES[4].x) / 2,
    y: (NODES[1].y + NODES[4].y) / 2,
  };

  const getNodePos = (i: number): Pt => {
    if (merged && (i === 1 || i === 4)) {
      return {
        x: lerp(NODES[i].x, mergedCenter.x, mergeP),
        y: lerp(NODES[i].y, mergedCenter.y, mergeP),
      };
    }
    return NODES[i];
  };

  const edgeOpacity = (a: number, b: number): number => {
    if (isMergeEdge(a, b)) {
      return merged ? 0 : 1;
    }
    return 1;
  };

  const edgeColor = (a: number, b: number): string => {
    if (isRedCut(a, b)) return theme.danger;
    return theme.panelBorder;
  };

  const edgeLine = (key: string, a: number, b: number, opacity: number, dashed = false) => {
    const pA = getNodePos(a);
    const pB = getNodePos(b);
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const color = edgeColor(a, b);
    const isCut = isRedCut(a, b);
    return (
      <div
        key={key}
        style={{
          position: "absolute",
          left: pA.x,
          top: pA.y,
          width: len,
          height: isCut ? 6 : 4,
          transformOrigin: "0 50%",
          transform: `translateY(-50%) rotate(${angle}deg)`,
          background: dashed ? "transparent" : color,
          borderTop: dashed ? `4px dashed ${color}` : undefined,
          opacity: enter * opacity,
          boxShadow: isCut ? `0 0 16px ${theme.danger}88` : "none",
          zIndex: 1,
        }}
      />
    );
  };

  const nodeBox = (
    key: string,
    pt: Pt,
    label: string,
    color: string,
    scale = 1,
    sub?: string,
  ) => (
    <div
      key={key}
      style={{
        position: "absolute",
        left: pt.x - contractRadius,
        top: pt.y - contractRadius,
        width: contractRadius * 2,
        height: contractRadius * 2,
        borderRadius: contractRadius,
        background: theme.panel,
        border: `3px solid ${color}`,
        boxShadow: `0 0 32px ${color}33`,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 50}px) scale(${scale})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        zIndex: 2,
      }}
    >
      <IconGlyph name="circle" size={32} color={color} strokeWidth={1.6} />
      {sub ? (
        <div style={{ fontFamily: theme.mono, fontSize: 16, color, marginTop: 2 }}>{sub}</div>
      ) : null}
    </div>
  );

  const pill = (text: string, x: number, y: number, color: string, opacity: number) => (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${opacity})`,
        padding: "10px 22px",
        borderRadius: 999,
        background: `${color}22`,
        border: `2px solid ${color}`,
        color: theme.text,
        fontFamily: theme.mono,
        fontWeight: 800,
        fontSize: 26,
        whiteSpace: "nowrap",
        boxShadow: `0 0 20px ${color}44`,
      }}
    >
      {text}
    </div>
  );

  const selectedEdgeFlash = merged ? 0 : Math.max(0, 1 - (local - impactLocal + 20) / 14);
  const mergeFlash = merged ? Math.exp(-(local - impactLocal) * 0.2) : 0;

  const nodesToShow = phase === "branch" || phase === "repeat"
    ? [0, 2, 3, 5]
    : [0, 1, 2, 3, 4, 5];

  return (
    <>
      {/* label */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 280,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontSize: 26,
          letterSpacing: 3,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        {phase === "contract" && "АЛГОРИТМ КАРГЕРА"}
        {phase === "survive" && "РЕБРО НЕ В РАЗРЕЗЕ → ОТВЕТ СОХРАНЁН"}
        {phase === "probability" && `ШАНС: 2 / [n(n−1)]`}
        {phase === "branch" && "KARGER–STEIN: ДВЕ ВЕТВИ"}
        {phase === "repeat" && "МНОГО ЗАПУСКОВ → МИНИМУМ"}
      </div>

      {/* edges */}
      {EDGES.map(([a, b]) => {
        const op = edgeOpacity(a, b);
        if (op <= 0) return null;
        const isSel = isMergeEdge(a, b) && !merged;
        return (
          <React.Fragment key={edgeKey(a, b)}>
            {edgeLine(`e-${edgeKey(a, b)}`, a, b, op)}
            {isSel && selectedEdgeFlash > 0 ? (
              <div
                style={{
                  position: "absolute",
                  left: (getNodePos(a).x + getNodePos(b).x) / 2,
                  top: (getNodePos(a).y + getNodePos(b).y) / 2,
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  background: theme.warning,
                  transform: "translate(-50%, -50%)",
                  boxShadow: `0 0 30px ${theme.warning}`,
                  opacity: selectedEdgeFlash,
                  zIndex: 3,
                }}
              />
            ) : null}
          </React.Fragment>
        );
      })}

      {/* nodes */}
      {nodesToShow.map((i) => {
        const pt = getNodePos(i);
        const color =
          merged && (i === 1 || i === 4) && (phase === "survive" || phase === "contract")
            ? theme.warning
            : phase === "branch"
            ? i === 3 || i === 5
              ? theme.accent
              : theme.accent2
            : theme.accent;
        const sub =
          merged && (i === 1 || i === 4) && (phase === "survive" || phase === "contract")
            ? "UV"
            : undefined;
        return nodeBox(`n-${i}`, pt, `${i}`, color, 1, sub);
      })}

      {/* merged center node */}
      {merged && (phase === "survive" || phase === "contract") ? (
        <div
          style={{
            position: "absolute",
            left: mergedCenter.x - contractRadius - 4,
            top: mergedCenter.y - contractRadius - 4,
            width: (contractRadius + 4) * 2,
            height: (contractRadius + 4) * 2,
            borderRadius: contractRadius + 4,
            border: `4px solid ${theme.warning}`,
            boxShadow: `0 0 40px ${theme.warning}55`,
            opacity: mergeP * enter,
            zIndex: 1,
          }}
        />
      ) : null}

      {/* flash on merge edge during contract */}
      {phase === "contract" && !merged && local >= impactLocal - 4 ? (
        <PulseRing
          x={(getNodePos(MERGE_EDGE[0]).x + getNodePos(MERGE_EDGE[1]).x) / 2}
          y={(getNodePos(MERGE_EDGE[0]).y + getNodePos(MERGE_EDGE[1]).y) / 2}
          triggerFrame={impactLocal}
          tone="warning"
          size={180}
        />
      ) : null}

      {/* red cut label */}
      {phase === "survive" && merged ? (
        <div
          style={{
            position: "absolute",
            left: (getNodePos(3).x + getNodePos(4).x) / 2 + 30,
            top: (getNodePos(3).y + getNodePos(4).y) / 2 - 40,
            padding: "8px 18px",
            borderRadius: 999,
            background: `${theme.danger}22`,
            border: `2px solid ${theme.danger}`,
            color: theme.danger,
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 22,
            opacity: mergeP,
            boxShadow: `0 0 18px ${theme.danger}66`,
            zIndex: 5,
          }}
        >
          РАЗРЕЗ
        </div>
      ) : null}

      {/* probability pill */}
      {phase === "probability" ? (
        <>
          {pill("P ≥ 2 / [n(n−1)]", cx, 1160, theme.success, enter)}
          <div
            style={{
              position: "absolute",
              left: cx,
              top: 1260,
              transform: "translateX(-50%)",
              fontFamily: theme.mono,
              fontSize: 24,
              color: theme.subtext,
              opacity: enter,
              textAlign: "center",
            }}
          >
            ≥ 2/[n(n−1)] за ОДИН проход
          </div>
        </>
      ) : null}

      {/* branch phase: two trees */}
      {phase === "branch" ? (
        <>
          {[{ x: 300, label: "ветвь A", color: theme.accent }, { x: 780, label: "ветвь B", color: theme.accent2 }].map(
            (br, i) => {
              const bp = smooth(clamp01((local - impactLocal - i * 8) / 18));
              return (
                <React.Fragment key={br.label}>
                  <div
                    style={{
                      position: "absolute",
                      left: br.x - 140,
                      top: 1040,
                      width: 280,
                      height: 200,
                      borderRadius: 24,
                      background: `${br.color}0D`,
                      border: `3px solid ${br.color}66`,
                      opacity: enter * bp,
                      transform: `translateY(${(1 - bp) * 30}px)`,
                    }}
                  >
                    <div
                      style={{
                        textAlign: "center",
                        paddingTop: 20,
                        fontFamily: theme.font,
                        fontWeight: 800,
                        fontSize: 28,
                        color: br.color,
                      }}
                    >
                      {br.label}
                    </div>
                    <div
                      style={{
                        textAlign: "center",
                        marginTop: 12,
                        fontFamily: theme.mono,
                        fontSize: 22,
                        color: theme.subtext,
                      }}
                    >
                      n/√2 вершин
                    </div>
                    <div
                      style={{
                        textAlign: "center",
                        marginTop: 8,
                        fontFamily: theme.mono,
                        fontSize: 20,
                        color: br.color,
                      }}
                    >
                      повтор
                    </div>
                  </div>
                  {bp > 0.8 ? (
                    <PulseRing x={br.x} y={1140} triggerFrame={impactLocal + i * 8} tone={i === 0 ? "accent" : "accent2"} size={200} />
                  ) : null}
                </React.Fragment>
              );
            },
          )}
        </>
      ) : null}

      {/* repeat phase: multiple small graphs */}
      {phase === "repeat" ? (
        <>
          {[
            { x: 180, y: 800, color: theme.accent, ok: true },
            { x: 440, y: 800, color: theme.danger, ok: false },
            { x: 700, y: 800, color: theme.danger, ok: false },
            { x: 960, y: 800, color: theme.success, ok: true },
          ].map((r, i) => {
            const rp = smooth(clamp01((local - impactLocal - i * 5) / 14));
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: r.x - 50,
                  top: r.y - 50,
                  width: 100,
                  height: 100,
                  borderRadius: 20,
                  background: theme.panel,
                  border: `3px solid ${r.color}`,
                  opacity: enter * rp,
                  transform: `scale(${rp})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <IconGlyph
                  name={r.ok ? "check" : "x"}
                  size={36}
                  color={r.color}
                  strokeWidth={2}
                />
              </div>
            );
          })}
          <div
            style={{
              position: "absolute",
              left: cx,
              top: 1000,
              transform: "translateX(-50%)",
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 28,
              color: theme.success,
              opacity: enter,
            }}
          >
            берём минимальный разрез из всех запусков
          </div>
        </>
      ) : null}
    </>
  );
};

const smooth = (t: number) => t * t * (3 - 2 * t);

export { MincutContractVisual };

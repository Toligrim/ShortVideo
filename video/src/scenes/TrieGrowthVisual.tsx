import React from "react";
import { spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const W = layout.width;

/**
 * TrieGrowth — суффиксное дерево (trie) растёт квадратично.
 * Каждый новый суффикс — ветка вниз; узлов n(n+1)/2+1.
 *
 * params:
 *   suffixes — число показываемых суффиксов (по умолчанию 6)
 */
export const TrieGrowthVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  suffixes?: number;
}> = ({ local, fps, impactLocal, suffixes = 6 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const cx = W / 2;

  const mono: React.CSSProperties = {
    fontFamily: theme.mono,
    fontWeight: 800,
    letterSpacing: 2,
  };

  // появление суффиксов по одному
  const showCount = Math.min(
    suffixes,
    Math.floor(clamp01(local / Math.max(impactLocal - 10, 1)) * suffixes) + 1
  );

  // узлы trie: корень наверху, каждый суффикс — цепочка узлов вниз
  const nodeR = 24;
  const colGap = 120;
  const rowGap = 72;
  const startX = 140;
  const startY = 420;

  const nodes: React.ReactNode[] = [];
  const edges: React.ReactNode[] = [];
  let totalNodes = 1; // корень

  for (let s = 0; s < showCount; s++) {
    const suffixLen = suffixes - s; // длина суффикса
    const p = smooth(clamp01((local - s * 4) / 16));
    if (p <= 0) continue;

    const x = startX + s * colGap;
    // корень общий (рисуется отдельно, ниже, на своей строке y = startY),
    // цепочка каждого суффикса идёт на одну строку ниже него, вниз —
    // d=0 больше НЕ делит строку с корнем (раньше оба сидели на y=startY,
    // и колонка с x близким к cx визуально сливалась с корнем в один кружок)
    for (let d = 0; d < suffixLen; d++) {
      totalNodes++;
      const y = startY + (d + 1) * rowGap;
      const isBottom = d === suffixLen - 1;
      const color = isBottom ? theme.accent2 : theme.accent;

      nodes.push(
        <div
          key={`n-${s}-${d}`}
          style={{
            position: "absolute",
            left: x - nodeR,
            top: y - nodeR,
            width: nodeR * 2,
            height: nodeR * 2,
            borderRadius: "50%",
            background: theme.panel,
            border: `3px solid ${color}`,
            boxShadow: `0 0 14px ${color}44`,
            opacity: p * enter,
            transform: `scale(${0.3 + 0.7 * p})`,
          }}
        />
      );

      // ребро к предыдущему узлу (для d=0 предыдущий узел — сам корень на y=startY)
      const prevY = d === 0 ? startY : startY + d * rowGap;
      edges.push(
        <div
          key={`e-${s}-${d}`}
          style={{
            position: "absolute",
            left: x,
            top: prevY + nodeR,
            width: 3,
            height: rowGap - nodeR * 2,
            background: `${theme.accent2}66`,
            opacity: p * enter * 0.6,
          }}
        />
      );
    }
  }

  // счётчик узлов
  const nodeCount = Math.min(totalNodes, Math.round((suffixes * (suffixes + 1)) / 2 + 1));
  const counterVal = Math.round(
    smooth(clamp01(local / Math.max(impactLocal - 6, 1))) * nodeCount
  );

  const badgeP = done
    ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } })
    : 0;

  return (
    <>
      {/* заголовок */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 260,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 26,
          color: theme.subtext,
          opacity: enter,
          textAlign: "center",
        }}
      >
        СУФФИКСНОЕ ДЕРЕВО
      </div>

      {/* строка-источник */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 330,
          transform: `translateX(-50%) scale(${enter})`,
          padding: "10px 28px",
          borderRadius: 999,
          background: `${theme.accent}18`,
          border: `2px solid ${theme.accent}88`,
          ...mono,
          fontSize: 32,
          color: theme.accent,
        }}
      >
        abbb…
      </div>

      {/* корень */}
      <div
        style={{
          position: "absolute",
          left: cx - nodeR,
          top: startY - nodeR,
          width: nodeR * 2,
          height: nodeR * 2,
          borderRadius: "50%",
          background: theme.panel,
          border: `3px solid ${theme.success}`,
          boxShadow: `0 0 18px ${theme.success}44`,
          opacity: enter,
          transform: `scale(${enter})`,
        }}
      />

      {/* суффиксы и узлы */}
      {edges}
      {nodes}

      {/* подписи суффиксов */}
      {Array.from({ length: showCount }).map((_, s) => {
        const p = smooth(clamp01((local - s * 4) / 16));
        if (p <= 0) return null;
        return (
          <div
            key={`lbl-${s}`}
            style={{
              position: "absolute",
              left: startX + s * colGap,
              // последний узел колонки теперь на y = startY + suffixLen*rowGap
              // (на одну строку ниже, чем раньше, — см. правку корня выше);
              // подпись должна уйти под него, а не на 10px под центр
              top: startY + (suffixes - s) * rowGap + nodeR + 14,
              transform: `translateX(-50%) scale(${p})`,
              ...mono,
              fontSize: 16,
              color: theme.subtext,
              opacity: p * enter,
            }}
          >
            {suffixes - s}
          </div>
        );
      })}

      {/* счётчик */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 1080,
          transform: "translateX(-50%)",
          textAlign: "center",
          opacity: enter,
        }}
      >
        <div style={{ ...mono, fontSize: 20, color: theme.subtext }}>УЗЛОВ</div>
        <div
          style={{
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 68,
            color: done ? theme.danger : theme.text,
            textShadow: done ? `0 0 50px ${theme.danger}66` : "none",
          }}
        >
          {counterVal}
        </div>
      </div>

      {/* бейдж на импакте */}
      {done ? (
        <>
          <PulseRing x={cx} y={1150} triggerFrame={impactLocal} tone="danger" size={280} />
          <div
            style={{
              position: "absolute",
              left: cx,
              top: 1240,
              transform: `translateX(-50%) scale(${badgeP})`,
              opacity: badgeP,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 28px",
              borderRadius: 999,
              background: `${theme.danger}18`,
              border: `2px solid ${theme.danger}`,
              color: theme.danger,
              fontFamily: theme.font,
              fontWeight: 800,
              fontSize: 26,
              whiteSpace: "nowrap",
              boxShadow: `0 0 40px ${theme.danger}33`,
            }}
          >
            N(N+1)/2 + 1 УЗЛОВ
          </div>
        </>
      ) : null}
    </>
  );
};

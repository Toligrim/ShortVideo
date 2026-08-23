import React from "react";
import { spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const W = layout.width;

/**
 * BacktrackTree — дерево ветвления НФА при бэктрэкинге.
 * Показывает экспоненциальный рост числа путей для паттерна вроде (a+)+:
 * узлы-состояния ветвятся вниз, счётчик шагов растёт, на импакте — красный бейдж.
 *
 * params:
 *   pattern  — строка паттерна (по умолчанию "(a+)+")
 *   branches — исходное число ветвей (по умолчанию 2)
 *   depth    — глубина дерева (по умолчанию 5)
 */
export const BacktrackTreeVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  pattern?: string;
  branches?: number;
  depth?: number;
}> = ({ local, fps, impactLocal, pattern = "(a+)+", branches = 2, depth = 5 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const cx = W / 2;

  // вспомогательные стили
  const mono: React.CSSProperties = {
    fontFamily: theme.mono,
    fontWeight: 800,
    letterSpacing: 2,
  };

  // дерево: узлы в столбцах (levels), по branches^n узлов на уровне
  const cols = depth;
  const maxNodes = Math.pow(branches, cols - 1);
  const nodeW = 100;
  const nodeH = 68;
  const colGap = (W - 160) / cols;
  const startX = 120;
  const startY = 480;
  const rowGap = Math.min(56, (1100 - startY) / Math.max(maxNodes, 1));

  // анимация появления уровней
  const levelP = (lv: number) => smooth(clamp01((local - lv * 5) / 14));

  // счётчик экспоненциального роста
  const totalPaths = Math.pow(branches, Math.min(16, depth + 3));
  const counterP = smooth(clamp01(local / Math.max(impactLocal - 6, 1)));
  const counterVal = Math.round(counterP * totalPaths);

  // пульс узлов
  const pulse = (lv: number, idx: number) =>
    1 + 0.03 * Math.sin((local + lv * 4 + idx * 3) / 7);

  const badgeP = done
    ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } })
    : 0;

  // рисуем узлы и рёбра
  const nodes: React.ReactNode[] = [];
  const edges: React.ReactNode[] = [];

  for (let lv = 0; lv < cols; lv++) {
    const count = Math.min(Math.pow(branches, lv), 32); // cap для отрисовки
    const p = levelP(lv);
    if (p <= 0) continue;
    const x = startX + lv * colGap;
    const totalH = count * rowGap;
    const yOff = startY - totalH / 2 + rowGap / 2;

    for (let n = 0; n < count; n++) {
      const y = yOff + n * rowGap;
      const isLast = lv === cols - 1;
      const color = isLast ? theme.danger : lv < 2 ? theme.accent : theme.accent2;
      nodes.push(
        <div
          key={`n-${lv}-${n}`}
          style={{
            position: "absolute",
            left: x - nodeW / 2,
            top: y - nodeH / 2,
            width: nodeW,
            height: nodeH,
            borderRadius: 16,
            background: theme.panel,
            border: `3px solid ${color}`,
            boxShadow: `0 0 ${isLast ? 30 : 16}px ${color}44`,
            opacity: p * enter,
            transform: `scale(${(0.4 + 0.6 * p) * pulse(lv, n)})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <div style={{ fontFamily: theme.mono, fontSize: 22, color }}>
            {lv === 0 ? "S0" : `S${lv}`}
          </div>
          <div style={{ fontFamily: theme.mono, fontSize: 14, color: theme.subtext }}>
            {lv === 0 ? "старт" : isLast ? "qt→qt" : `x${branches}`}
          </div>
        </div>
      );

      // рёбра к следующему уровню
      if (lv < cols - 1) {
        const nextCount = Math.min(Math.pow(branches, lv + 1), 32);
        const nextX = startX + (lv + 1) * colGap;
        const nextTotalH = nextCount * rowGap;
        const nextYOff = startY - nextTotalH / 2 + rowGap / 2;
        const childStart = n * branches;
        const childEnd = Math.min(childStart + branches, nextCount);
        for (let c = childStart; c < childEnd; c++) {
          const ty = nextYOff + c * rowGap;
          const dx = nextX - x;
          const dy = ty - y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          edges.push(
            <div
              key={`e-${lv}-${n}-${c}`}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: len,
                height: 3,
                transformOrigin: "0 50%",
                transform: `rotate(${angle}deg)`,
                background: `linear-gradient(90deg, ${theme.accent}88, ${theme.accent2}88)`,
                opacity: p * enter * 0.6,
              }}
            />
          );
        }
      }
    }
  }

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
          fontSize: 28,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        БЭКТРЭКИНГ: КАЖДЫЙ ПУТЬ ОБХОДИТСЯ
      </div>

      {/* паттерн */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 340,
          transform: `translateX(-50%) scale(${enter})`,
          padding: "14px 32px",
          borderRadius: 999,
          background: `${theme.accent}18`,
          border: `2px solid ${theme.accent}88`,
          ...mono,
          fontSize: 38,
          color: theme.accent,
          whiteSpace: "nowrap",
        }}
      >
        {pattern}
      </div>

      {/* дерево */}
      {edges}
      {nodes}

      {/* счётчик */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 1320,
          transform: "translateX(-50%)",
          textAlign: "center",
          opacity: enter,
        }}
      >
        <div style={{ ...mono, fontSize: 22, color: theme.subtext }}>ПУТЕЙ</div>
        <div
          style={{
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 72,
            color: done ? theme.danger : theme.text,
            textShadow: done ? `0 0 50px ${theme.danger}66` : "none",
          }}
        >
          {counterVal.toLocaleString("ru-RU")}
        </div>
      </div>

      {/* бейдж на импакте */}
      {done ? (
        <>
          <PulseRing x={cx} y={1360} triggerFrame={impactLocal} tone="danger" size={320} />
          <div
            style={{
              position: "absolute",
              left: cx,
              top: 1480,
              transform: `translateX(-50%) scale(${badgeP})`,
              opacity: badgeP,
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 32px",
              borderRadius: 999,
              background: `${theme.danger}18`,
              border: `2px solid ${theme.danger}`,
              color: theme.danger,
              fontFamily: theme.font,
              fontWeight: 800,
              fontSize: 30,
              whiteSpace: "nowrap",
              boxShadow: `0 0 50px ${theme.danger}33`,
            }}
          >
            <IconGlyph name="alert-triangle" size={34} color={theme.danger} strokeWidth={2} />
            КАЖДЫЙ ЛИШНИЙ — УДВАИВАЕТ
          </div>
        </>
      ) : null}
    </>
  );
};

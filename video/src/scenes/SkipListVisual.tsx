import React from "react";
import { interpolate, random } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

export type SkipListPhase = "compare" | "coin" | "levels" | "search" | "insert";

const W = layout.width;
const NODES = ["A", "B", "C", "D", "E", "F", "G"];
const N = NODES.length;
const CELL_W = 92;
const CELL_H = 96;
const BASE_Y = 1330; // центр уровня 0
const LEVEL_GAP = 185;
const MARGIN_X = 110;
const xOf = (i: number) => MARGIN_X + (i * (W - 2 * MARGIN_X)) / (N - 1);
const yOf = (level: number) => BASE_Y - level * LEVEL_GAP;
const LEVEL_COLORS = [theme.accent, theme.accent2, theme.success, theme.warning];

// присутствие узла на каждом уровне (снизу вверх): skip-list с разной высотой узлов
const LEVELS: number[][] = [
  [0, 1, 2, 3, 4, 5, 6], // L0 — полный список
  [0, 1, 3, 4, 6], // L1
  [0, 2, 4, 6], // L2
  [0, 3, 6], // L3 — верхний прыгает через узлы
];

const maxLevelOf = (i: number) => {
  let m = -1;
  LEVELS.forEach((lv, L) => {
    if (lv.includes(i)) m = L;
  });
  return m;
};

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const lerpPath = (
  pts: { x: number; y: number }[],
  p: number
): { x: number; y: number } => {
  if (pts.length === 1) return pts[0];
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const l = Math.hypot(dx, dy);
    segLens.push(l);
    total += l;
  }
  let d = p * total;
  for (let i = 0; i < segLens.length; i++) {
    if (d <= segLens[i] || i === segLens.length - 1) {
      const t = segLens[i] === 0 ? 0 : d / segLens[i];
      return {
        x: interpolate(t, [0, 1], [pts[i].x, pts[i + 1].x]),
        y: interpolate(t, [0, 1], [pts[i].y, pts[i + 1].y]),
      };
    }
    d -= segLens[i];
  }
  return pts[pts.length - 1];
};

const NodeCell: React.FC<{
  i: number;
  level: number;
  color: string;
  label?: string;
  active?: boolean;
  glow?: boolean;
}> = ({ i, level, color, label, active, glow }) => {
  const cx = xOf(i);
  const cy = yOf(level);
  const pulse = active ? 1 + 0.05 * Math.sin(level * 3) : 1;
  return (
    <div
      style={{
        position: "absolute",
        left: cx - CELL_W / 2,
        top: cy - CELL_H / 2,
        width: CELL_W,
        height: CELL_H,
        borderRadius: 18,
        border: `3px solid ${color}${active ? "FF" : "BB"}`,
        background: active ? `${color}33` : `${color}18`,
        boxShadow: glow || active ? `0 0 40px ${color}88` : "none",
        transform: `scale(${pulse})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: theme.font,
        fontWeight: 800,
        fontSize: 34,
        color: theme.text,
        zIndex: 2,
      }}
    >
      {label ?? NODES[i]}
    </div>
  );
};

const HConnector: React.FC<{ from: number; to: number; level: number; color: string; width?: number }> = ({
  from,
  to,
  level,
  color,
  width = 5,
}) => {
  const x1 = xOf(from) + CELL_W / 2;
  const x2 = xOf(to) - CELL_W / 2;
  return (
    <div
      style={{
        position: "absolute",
        left: x1,
        top: yOf(level) - width / 2,
        width: Math.max(0, x2 - x1),
        height: width,
        background: color,
        opacity: 0.85,
        zIndex: 1,
      }}
    />
  );
};

/** Базовая «башня» skip-списка: башни разной высоты + длинные указатели по уровням. */
const SkipTowers: React.FC<{ revealTop?: number; highlight?: { i: number; level: number }[] }> = ({
  revealTop = 3,
  highlight = [],
}) => {
  const isHi = (i: number, l: number) => highlight.some((h) => h.i === i && h.level === l);
  return (
    <>
      {/* вертикальные башни */}
      {Array.from({ length: N }).map((_, i) => {
        const top = maxLevelOf(i);
        if (top < 0) return null;
        return (
          <div
            key={`tower${i}`}
            style={{
              position: "absolute",
              left: xOf(i) - 2,
              top: yOf(top) - CELL_H / 2,
              width: 4,
              height: yOf(0) - yOf(top) + CELL_H,
              background: LEVEL_COLORS[0],
              opacity: 0.5,
              zIndex: 0,
            }}
          />
        );
      })}
      {/* горизонтальные длинные указатели по уровням */}
      {LEVELS.map((lv, L) => {
        if (L > revealTop) return null;
        const color = LEVEL_COLORS[L];
        return lv.slice(0, -1).map((idx, k) => (
          <HConnector key={`h${L}-${k}`} from={idx} to={lv[k + 1]} level={L} color={color} />
        ));
      })}
      {/* ячейки узлов */}
      {LEVELS.map((lv, L) =>
        lv.map((i) => {
          if (L > revealTop) return null;
          return (
            <NodeCell
              key={`n${L}-${i}`}
              i={i}
              level={L}
              color={LEVEL_COLORS[L]}
              active={isHi(i, L)}
            />
          );
        })
      )}
    </>
  );
};

const Badge: React.FC<{ text: string; color: string; top: number; left?: number; right?: number }> = ({
  text,
  color,
  top,
  left,
  right = W / 2,
}) => (
  <div
    style={{
      position: "absolute",
      left: left ?? undefined,
      right: left === undefined ? W - right : undefined,
      top,
      transform: left === undefined && right === W / 2 ? "translateX(50%)" : "none",
      padding: "12px 22px",
      borderRadius: 999,
      border: `2px solid ${color}99`,
      background: `${color}18`,
      color,
      fontFamily: theme.mono,
      fontWeight: 800,
      fontSize: 25,
      whiteSpace: "nowrap",
      zIndex: 3,
    }}
  >
    {text}
  </div>
);

/** Фаза compare: слева связный список (медленный перебор), справа сбалансированное дерево (вращения). */
const ComparePhase: React.FC<{ local: number; dur: number }> = ({ local, dur }) => {
  const p = smooth(clamp01(local / Math.max(1, dur - 6)));
  const listY = 1080;
  const scanIdx = Math.min(N - 1, Math.floor(p * N));
  // маленькое дерево справа (локальные координаты внутри контейнера 480×460, x∈[0,480])
  const tree = [
    { x: 240, y: 40, label: "R" },
    { x: 100, y: 220, label: "L" },
    { x: 380, y: 220, label: "X" },
    { x: 20, y: 400, label: "•" },
    { x: 180, y: 400, label: "•" },
    { x: 320, y: 400, label: "•" },
    { x: 440, y: 400, label: "•" },
  ];
  const edges = [
    [0, 1],
    [0, 2],
    [1, 3],
    [1, 4],
    [2, 5],
    [2, 6],
  ];
  const wobble = 4 * Math.sin(local / 10);
  const treeLeft = 560;
  return (
    <>
      <div style={{ position: "absolute", left: W / 2, top: 270, transform: "translateX(-50%)", fontFamily: theme.mono, fontWeight: 800, fontSize: 30, letterSpacing: 2, color: theme.subtext }}>
        СПИСОК ПРОТИВ ДЕРЕВА
      </div>
      {/* левая зона: связный список */}
      <div style={{ position: "absolute", left: W / 2, top: 470, transform: "translateX(-50%)", fontFamily: theme.font, fontWeight: 800, fontSize: 30, color: theme.accent }}>
        СВЯЗНЫЙ СПИСОК
      </div>
      {Array.from({ length: N }).map((_, i) => {
        const cx = xOf(i);
        const active = i <= scanIdx;
        const cur = i === scanIdx;
        return (
          <React.Fragment key={`ll${i}`}>
            <NodeCell i={i} level={0} color={active ? theme.accent : theme.panelBorder} label={NODES[i]} active={cur} />
            {i < N - 1 ? <HConnector from={i} to={i + 1} level={0} color={theme.panelBorder} width={4} /> : null}
          </React.Fragment>
        );
      })}
      <Badge text="O(n) — перебираем почти всё" color={theme.danger} top={listY + 110} left={W / 2 - 360} />
      {/* правая зона: дерево (контейнер 480×460, локальные x∈[0,480] → абс. x∈[560,1040]) */}
      <div style={{ position: "absolute", left: treeLeft + 240, top: 470, transform: "translateX(-50%)", fontFamily: theme.font, fontWeight: 800, fontSize: 30, color: theme.accent2 }}>
        ДЕРЕВО
      </div>
      <div style={{ position: "absolute", left: treeLeft, top: 520, width: 480, height: 460, transform: `rotate(${wobble}deg)`, transformOrigin: "50% 30%" }}>
        {edges.map(([a, b], k) => {
          const dx = tree[b].x - tree[a].x;
          const dy = tree[b].y - tree[a].y;
          const len = Math.hypot(dx, dy);
          const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
          return (
            <div
              key={`e${k}`}
              style={{
                position: "absolute",
                left: tree[a].x,
                top: tree[a].y,
                width: len,
                height: 4,
                transformOrigin: "0 50%",
                transform: `translateY(-50%) rotate(${ang}deg)`,
                background: theme.accent2,
                opacity: 0.8,
              }}
            />
          );
        })}
        {tree.map((n, k) => (
          <div
            key={`tn${k}`}
            style={{
              position: "absolute",
              left: n.x - 40,
              top: n.y - 40,
              width: 80,
              height: 80,
              borderRadius: 18,
              border: `3px solid ${theme.accent2}`,
              background: `${theme.accent2}18`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: theme.font,
              fontWeight: 800,
              fontSize: 28,
              color: theme.text,
            }}
          >
            {n.label}
          </div>
        ))}
      </div>
      <Badge text="O(log n), НО вращения и код" color={theme.accent2} top={1010} left={treeLeft + 30} />
    </>
  );
};

/** Фаза coin: монетка у каждого узла решает его высоту. */
const CoinPhase: React.FC<{ local: number }> = ({ local }) => {
  return (
    <>
      <div style={{ position: "absolute", left: W / 2, top: 250, transform: "translateX(-50%)", fontFamily: theme.mono, fontWeight: 800, fontSize: 29, letterSpacing: 2, color: theme.subtext }}>
        МОНЕТКА РЕШАЕТ ВЫСОТУ УЗЛА
      </div>
      <SkipTowers revealTop={3} />
      {Array.from({ length: N }).map((_, i) => {
        const top = maxLevelOf(i);
        if (top < 0) return null;
        const flip = interpolate(local % 18, [0, 9, 18], [0, 180, 360]) % 360;
        const faceUp = Math.floor(random(`coin${i}`) * 2) === 0;
        const coinY = yOf(top) - 90;
        const emoji = faceUp ? "О" : "Р";
        return (
          <div
            key={`coin${i}`}
            style={{
              position: "absolute",
              left: xOf(i) - 26,
              top: coinY,
              width: 52,
              height: 52,
              borderRadius: 26,
              background: theme.warning,
              border: `3px solid ${theme.warning}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 26,
              color: "#3A2A00",
              transform: `rotateY(${flip}deg) translateY(${4 * Math.sin(local / 7 + i)})`,
              boxShadow: `0 0 26px ${theme.warning}77`,
              zIndex: 4,
            }}
          >
            {emoji}
          </div>
        );
      })}
      <Badge text="ОРЁЛ → ещё уровень · РЕШКА → стоп" color={theme.warning} top={1430} left={W / 2 - 320} />
      <div style={{ position: "absolute", left: W / 2, top: 1500, transform: "translateX(-50%)", fontFamily: theme.font, fontWeight: 800, fontSize: 26, color: theme.subtext }}>
        высоты случайны: 4, 2, 3, 4, 3, 2, 4 уровня
      </div>
    </>
  );
};

/** Фаза levels: уровни проявляются снизу вверх, верхние прыгают через узлы. */
const LevelsPhase: React.FC<{ local: number; dur: number }> = ({ local, dur }) => {
  const p = smooth(clamp01(local / Math.max(1, dur - 8)));
  const reveal = Math.min(3, Math.floor(p * 4));
  return (
    <>
      <div style={{ position: "absolute", left: W / 2, top: 250, transform: "translateX(-50%)", fontFamily: theme.mono, fontWeight: 800, fontSize: 29, letterSpacing: 2, color: theme.subtext }}>
        УРОВНИ ПЕРЕПРЫГИВАЮТ УЗЛЫ
      </div>
      <SkipTowers revealTop={reveal} />
      <Badge text={`уровень ${reveal}: реже = длиннее прыжок`} color={theme.success} top={1430} left={W / 2 - 300} />
    </>
  );
};

/** Фаза search: поиск сверху вниз по длинным указателям, как бинарный без дерева. */
const SearchPhase: React.FC<{ local: number; dur: number; impactLocal: number }> = ({ local, dur, impactLocal }) => {
  const p = smooth(clamp01(local / Math.max(1, dur - 6)));
  const path = [
    { x: xOf(0), y: yOf(3) },
    { x: xOf(3), y: yOf(3) },
    { x: xOf(3), y: yOf(2) },
    { x: xOf(4), y: yOf(2) },
  ];
  const pos = lerpPath(path, p);
  const found = local >= impactLocal;
  const target = { i: 4, level: 2 };
  return (
    <>
      <div style={{ position: "absolute", left: W / 2, top: 250, transform: "translateX(-50%)", fontFamily: theme.mono, fontWeight: 800, fontSize: 29, letterSpacing: 2, color: theme.subtext }}>
        ПОИСК СВЕРХУ ВНИЗ
      </div>
      <SkipTowers revealTop={3} highlight={[{ i: 0, level: 3 }, { i: 3, level: 3 }, { i: 3, level: 2 }, target]} />
      {/* маршрут */}
      <svg style={{ position: "absolute", left: 0, top: 0, width: W, height: layout.height, zIndex: 1, pointerEvents: "none" }}>
        <polyline
          points={path.map((pt) => `${pt.x},${pt.y}`).join(" ")}
          fill="none"
          stroke={theme.warning}
          strokeWidth={6}
          strokeOpacity={0.55}
          strokeDasharray="14 12"
        />
      </svg>
      {/* токен поиска */}
      <div
        style={{
          position: "absolute",
          left: pos.x - 30,
          top: pos.y - 30,
          width: 60,
          height: 60,
          borderRadius: 30,
          background: theme.warning,
          boxShadow: `0 0 40px ${theme.warning}`,
          zIndex: 5,
          opacity: found ? 0 : 1,
        }}
      />
      {found ? (
        <>
          <NodeCell i={target.i} level={target.level} color={theme.success} active glow />
          <PulseRing x={xOf(target.i)} y={yOf(target.level)} triggerFrame={impactLocal} tone="success" size={170} />
        </>
      ) : null}
      <Badge text="как бинарный поиск, но без дерева" color={theme.warning} top={1430} left={W / 2 - 300} />
    </>
  );
};

/** Фаза insert: новый узел, монетка даёт высоту, указатели вшиваются без вращений. */
const InsertPhase: React.FC<{ local: number; dur: number; impactLocal: number }> = ({ local, dur, impactLocal }) => {
  const p = smooth(clamp01(local / Math.max(1, dur - 10)));
  const newIdx = 3.5; // между D(3) и E(4)
  const newTop = 1; // высота 2 уровня (0 и 1) по монетке
  const appear = spring(local, 120, 14);
  const placed = local >= impactLocal;
  void appear;
  const nx = xOf(newIdx);
  return (
    <>
      <div style={{ position: "absolute", left: W / 2, top: 250, transform: "translateX(-50%)", fontFamily: theme.mono, fontWeight: 800, fontSize: 29, letterSpacing: 2, color: theme.subtext }}>
        ВСТАВКА: МОНЕТКА ВМЕСТО ВРАЩЕНИЙ
      </div>
      <SkipTowers revealTop={3} />
      {/* башня нового узла */}
      <div
        style={{
          position: "absolute",
          left: nx - 2,
          top: yOf(newTop) - CELL_H / 2,
          width: 4,
          height: yOf(0) - yOf(newTop) + CELL_H,
          background: theme.success,
          opacity: 0.6 * p,
          zIndex: 0,
        }}
      />
      {[0, 1].map((L) =>
        L <= newTop ? (
          <HConnector key={`nh${L}`} from={3} to={4} level={L} color={theme.success} width={4} />
        ) : null
      )}
      <div
        style={{
          position: "absolute",
          left: nx - CELL_W / 2,
          top: yOf(0) - CELL_H / 2,
          width: CELL_W,
          height: CELL_H,
          borderRadius: 18,
          border: `3px solid ${theme.success}FF`,
          background: `${theme.success}33`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 30,
          color: theme.text,
          transform: `scale(${0.6 + 0.4 * p})`,
          boxShadow: placed ? `0 0 50px ${theme.success}` : "none",
          zIndex: 4,
        }}
      >
        P
      </div>
      {placed ? <PulseRing x={nx} y={yOf(0)} triggerFrame={impactLocal} tone="success" size={170} /> : null}
      <Badge text="высота — монеткой · никаких вращений" color={theme.success} top={1430} left={W / 2 - 300} />
    </>
  );
};

const spring = (frame: number, fps: number, mass: number) => {
  // лёгкая аппроксимация пружины для появления
  const t = clamp01(frame / (fps * 0.4));
  return 1 - Math.exp(-6 * t) * Math.cos(8 * t);
};

export const SkipListVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  dur: number;
  phase?: SkipListPhase;
}> = ({ local, fps, impactLocal, dur, phase = "levels" }) => {
  switch (phase) {
    case "compare":
      return <ComparePhase local={local} dur={dur} />;
    case "coin":
      return <CoinPhase local={local} />;
    case "levels":
      return <LevelsPhase local={local} dur={dur} />;
    case "search":
      return <SearchPhase local={local} dur={dur} impactLocal={impactLocal} />;
    case "insert":
      return <InsertPhase local={local} dur={dur} impactLocal={impactLocal} />;
    default:
      return <LevelsPhase local={local} dur={dur} />;
  }
};

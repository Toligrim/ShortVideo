import React from "react";
import { interpolate } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { MotionGroup, useMotion } from "../lib/motion/MotionStage";
import { PulseRing } from "../lib/Motion";

export type RouteHierarchyPhase = "map" | "graph" | "shortcuts" | "express" | "query" | "expand";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: RouteHierarchyPhase;
}

const W = layout.width;
const CX = W / 2;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const smooth = (n: number) => {
  const t = clamp01(n);
  return t * t * (3 - 2 * t);
};

const Header: React.FC<{ icon: string; text: string; color: string }> = ({ icon, text, color }) => (
  <div style={{ position: "absolute", left: CX, top: 280, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12, color, fontSize: 25, whiteSpace: "nowrap", ...mono }}>
    <IconGlyph name={icon} size={31} color={color} strokeWidth={1.8} />
    <span>{text}</span>
  </div>
);

const Badge: React.FC<{ text: string; color: string; opacity?: number }> = ({ text, color, opacity = 1 }) => (
  <div style={{ position: "absolute", left: CX, top: 1195, transform: "translateX(-50%)", padding: "14px 28px", borderRadius: 999, border: `2px solid ${color}`, background: `${color}18`, color, fontSize: 23, whiteSpace: "nowrap", opacity, ...mono }}>
    {text}
  </div>
);

const Panel: React.FC<{ left: number; top: number; width: number; height: number; color?: string; children: React.ReactNode }> = ({ left, top, width, height, color = theme.accent, children }) => (
  <div style={{ position: "absolute", left, top, width, height, boxSizing: "border-box", borderRadius: 28, background: `${theme.panel}E8`, border: `3px solid ${color}66`, boxShadow: `0 0 42px ${color}1B` }}>
    {children}
  </div>
);

const Pin: React.FC<{ x: number; y: number; label: string; color: string; opacity?: number }> = ({ x, y, label, color, opacity = 1 }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color, opacity }}>
    <IconGlyph name="map-pin" size={50} color={color} strokeWidth={1.8} />
    <span style={{ ...mono, fontSize: 18, color: theme.text }}>{label}</span>
  </div>
);

const MapPhase: React.FC = () => {
  const motion = useMotion();
  const route = smooth(motion.action("route"));
  return (
    <>
      <Header icon="map" text="МАРШРУТ НА КАРТЕ" color={theme.accent} />
      <MotionGroup id="map" index={0}>
        <Panel left={90} top={395} width={900} height={560} color={theme.accent}>
          <svg width="900" height="560" style={{ position: "absolute", inset: 0 }}>
            {[130, 250, 370, 490].map((y) => <path key={`h-${y}`} d={`M 34 ${y} C 260 ${y - 45} 570 ${y + 42} 866 ${y - 8}`} stroke={`${theme.subtext}44`} strokeWidth="16" fill="none" />)}
            {[155, 360, 565, 770].map((x) => <path key={`v-${x}`} d={`M ${x} 36 C ${x - 40} 190 ${x + 50} 365 ${x - 4} 524`} stroke={`${theme.subtext}38`} strokeWidth="13" fill="none" />)}
            <path d="M 150 450 C 275 265 420 390 530 245 S 740 170 820 90" stroke={`${theme.accent}66`} strokeWidth="26" fill="none" strokeLinecap="round" />
            <path d="M 150 450 C 275 265 420 390 530 245 S 740 170 820 90" stroke={theme.accent} strokeWidth="5" fill="none" strokeDasharray="12 16" strokeDashoffset={interpolate(route, [0, 1], [180, 0])} />
          </svg>
          <Pin x={150} y={845} label="ДОМ" color={theme.accent2} />
          <MotionGroup id="speed" index={2} action={{ preset: "pulse", cue: "speed" }}>
            <div data-motion-shape><Pin x={820} y={485} label="КАФЕ" color={theme.success} /></div>
          </MotionGroup>
        </Panel>
      </MotionGroup>
      <Badge text="ДОРОГ МНОГО · ПОИСК БЫСТРЫЙ" color={theme.success} opacity={0.9} />
      <PulseRing x={820} y={485} triggerFrame={motion.cue("route")} tone="success" size={230} />
    </>
  );
};

type GraphNode = { x: number; y: number; label: string; color: string };
const NODES: GraphNode[] = [
  { x: 180, y: 690, label: "A", color: theme.accent2 },
  { x: 345, y: 505, label: "B", color: theme.accent },
  { x: 535, y: 735, label: "C", color: theme.warning },
  { x: 720, y: 505, label: "D", color: theme.accent },
  { x: 900, y: 690, label: "E", color: theme.success },
  { x: 710, y: 930, label: "F", color: theme.accent2 },
];
const EDGES: [number, number, string][] = [
  [0, 1, "4"], [1, 2, "7"], [2, 3, "3"], [3, 4, "5"], [2, 5, "2"], [5, 4, "6"], [0, 2, "9"],
];

const Edge: React.FC<{ from: GraphNode; to: GraphNode; label: string; color: string; opacity?: number; dash?: boolean }> = ({ from, to, label, color, opacity = 1, dash = false }) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return (
    <g opacity={opacity}>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth={dash ? 8 : 5} strokeDasharray={dash ? "16 12" : undefined} />
      <circle cx={(from.x + to.x) / 2} cy={(from.y + to.y) / 2} r={17} fill={theme.panel} stroke={color} strokeWidth={2} />
      <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 + 7} textAnchor="middle" fill={color} fontFamily={theme.mono} fontSize={18} fontWeight={800} transform={`rotate(0 ${(from.x + to.x) / 2} ${(from.y + to.y) / 2})`}>{label}</text>
      <path d={`M ${to.x - Math.cos(angle * Math.PI / 180) * 32} ${to.y - Math.sin(angle * Math.PI / 180) * 32} l ${-Math.cos((angle + 150) * Math.PI / 180) * 16} ${-Math.sin((angle + 150) * Math.PI / 180) * 16} l ${Math.cos(angle * Math.PI / 180) * 16} ${Math.sin(angle * Math.PI / 180) * 16} l ${-Math.cos((angle - 150) * Math.PI / 180) * 16} ${-Math.sin((angle - 150) * Math.PI / 180) * 16}`} fill={color} />
      <title>{length}</title>
    </g>
  );
};

const Graph: React.FC<{ shortcut?: boolean; waves?: boolean; expanded?: boolean }> = ({ shortcut = false, waves = false, expanded = false }) => {
  const motion = useMotion();
  const edgeP = smooth(motion.action("edges"));
  const shortcutP = smooth(motion.action("shortcut"));
  const waveP = smooth(motion.action("search"));
  const meetP = smooth(motion.action("meet"));
  const expandP = smooth(motion.action("expand"));
  const visibleEdges = expanded ? edgeP * (0.45 + 0.55 * expandP) : edgeP;
  return (
    <svg width={W} height={1120} style={{ position: "absolute", left: 0, top: 0 }}>
      {EDGES.map(([a, b, label], i) => <Edge key={`${a}-${b}`} from={NODES[a]} to={NODES[b]} label={label} color={expanded ? theme.accent : `${theme.subtext}99`} opacity={visibleEdges * (0.45 + i * 0.07)} />)}
      {shortcut ? <g opacity={shortcutP}>
        <path d="M 180 690 Q 535 230 900 690" fill="none" stroke={theme.success} strokeWidth={13} strokeDasharray="22 18" />
        <path d="M 860 678 l 34 12 -27 23" fill={theme.success} />
        <text x="535" y="345" textAnchor="middle" fill={theme.success} fontFamily={theme.mono} fontSize="25" fontWeight="800">A → E · 16</text>
      </g> : null}
      {waves ? <g opacity={waveP}>
        <circle cx={180 + 355 * waveP} cy={690 - 130 * waveP} r="17" fill={theme.accent2} />
        <circle cx={900 - 365 * waveP} cy={690 - 120 * waveP} r="17" fill={theme.success} />
        <path d="M 200 690 Q 355 560 520 560" fill="none" stroke={theme.accent2} strokeWidth="6" strokeDasharray="13 14" />
        <path d="M 880 690 Q 740 570 550 565" fill="none" stroke={theme.success} strokeWidth="6" strokeDasharray="13 14" />
      </g> : null}
      {NODES.map((node, i) => <g key={node.label} opacity={0.75 + i * 0.04}>
        <circle cx={node.x} cy={node.y} r="42" fill={theme.panel} stroke={node.color} strokeWidth="4" />
        <circle cx={node.x} cy={node.y} r="9" fill={node.color} />
        <text x={node.x} y={node.y + 82} textAnchor="middle" fill={theme.text} fontFamily={theme.mono} fontSize="25" fontWeight="800">{node.label}</text>
      </g>)}
      {waves ? <g opacity={waveP}>
        <circle cx="535" cy="565" r={46 + 22 * meetP} fill="none" stroke={theme.warning} strokeWidth="4" />
        <text x="535" y="480" textAnchor="middle" fill={theme.warning} fontFamily={theme.mono} fontSize="22" fontWeight="800">ВСТРЕЧА</text>
      </g> : null}
    </svg>
  );
};

const GraphPhase: React.FC = () => {
  return (
    <>
      <Header icon="network" text="ДОРОЖНАЯ СЕТЬ → ГРАФ" color={theme.accent2} />
      <MotionGroup id="graph" index={0} action={{ preset: "pulse", cue: "graph" }}>
        <div data-motion-shape><Graph /></div>
      </MotionGroup>
      <MotionGroup id="weights" index={1} action={{ preset: "pulse", cue: "weight" }}>
        <div data-motion-shape><Badge text="ВЕС РЕБРА = ВРЕМЯ ИЛИ ДЛИНА" color={theme.accent2} /></div>
      </MotionGroup>
    </>
  );
};

const ShortcutPhase: React.FC = () => {
  const motion = useMotion();
  const p = smooth(motion.action("shortcut"));
  return (
    <>
      <Header icon="git-merge" text="ПРЕДРАСЧЁТ" color={theme.success} />
      <MotionGroup id="base-graph" index={0}>
        <div data-motion-shape style={{ opacity: 0.7 }}><Graph /></div>
      </MotionGroup>
      <MotionGroup id="shortcut" index={1} action={{ preset: "transfer", cue: "shortcut", from: { x: -70, y: -35 }, to: { x: 0, y: 0 } }}>
        <div data-motion-shape style={{ opacity: p }}><Graph shortcut /></div>
      </MotionGroup>
      <Badge text="СВЁРНУТЫЙ УЗЕЛ · ГОТОВАЯ СТОИМОСТЬ" color={theme.success} />
    </>
  );
};

const ExpressPhase: React.FC = () => {
  const motion = useMotion();
  const train = smooth(motion.action("express"));
  return (
    <>
      <Header icon="train-front" text="ЭКСПРЕСС НА СХЕМЕ" color={theme.warning} />
      <MotionGroup id="stations" index={0}>
        <Panel left={105} top={445} width={870} height={420} color={theme.warning}>
          <div style={{ position: "absolute", left: 60, top: 120, width: 750, borderTop: `8px solid ${theme.subtext}99` }} />
          <div style={{ position: "absolute", left: 80, top: 90, color: theme.accent2, ...mono, fontSize: 22 }}>СТАРТ</div>
          <div style={{ position: "absolute", right: 72, top: 90, color: theme.success, ...mono, fontSize: 22 }}>ФИНИШ</div>
          {[0, 1, 2, 3].map((i) => <div key={i} style={{ position: "absolute", left: 120 + i * 205, top: 96, width: 25, height: 50, borderLeft: `4px solid ${theme.subtext}88`, opacity: 0.7 }} />)}
          <div style={{ position: "absolute", left: 50, top: 215, right: 50, textAlign: "center", color: theme.subtext, fontSize: 23, ...mono }}>ПРОМЕЖУТОЧНЫЕ ОСТАНОВКИ</div>
        </Panel>
      </MotionGroup>
      <MotionGroup id="train" index={1} action={{ preset: "transfer", cue: "express", from: { x: -340, y: 0 }, to: { x: 310, y: 0 } }}>
        <div data-motion-shape style={{ position: "absolute", left: 270, top: 520, transform: `translateX(${train * 330}px)`, display: "flex", alignItems: "center", gap: 12, padding: "18px 25px", borderRadius: 18, background: `${theme.warning}20`, border: `3px solid ${theme.warning}`, color: theme.warning, fontSize: 23, ...mono }}>
          <IconGlyph name="train-front" size={39} color={theme.warning} /> ЭКСПРЕСС
        </div>
      </MotionGroup>
      <MotionGroup id="time" index={2} action={{ preset: "pulse", cue: "time" }}>
        <div data-motion-shape style={{ position: "absolute", left: CX, top: 930, transform: "translateX(-50%)", color: theme.success, fontSize: 28, ...mono }}>ВРЕМЯ УЖЕ ПОДПИСАНО</div>
      </MotionGroup>
    </>
  );
};

const QueryPhase: React.FC = () => {
  const motion = useMotion();
  return (
    <>
      <Header icon="search" text="ЗАПРОС ИДЁТ ПО УРОВНЯМ" color={theme.accent} />
      <MotionGroup id="query-graph" index={0}><div data-motion-shape><Graph waves /></div></MotionGroup>
      <Badge text="ДВЕ ВОЛНЫ · ОДНА ВСТРЕЧА" color={theme.warning} opacity={0.92} />
      <PulseRing x={535} y={565} triggerFrame={motion.cue("meet")} tone="warning" size={220} />
    </>
  );
};

const ExpandPhase: React.FC = () => {
  const motion = useMotion();
  const p = smooth(motion.action("expand"));
  return (
    <>
      <Header icon="route" text="КОРОТКАЯ СТРЕЛКА РАСКРЫТА" color={theme.success} />
      <MotionGroup id="shortcut-result" index={0} action={{ preset: "depart", cue: "expand", to: { x: 0, y: -40 } }}>
        <div data-motion-shape style={{ position: "absolute", left: 210, top: 430, width: 660, padding: "28px 30px", boxSizing: "border-box", borderRadius: 22, border: `3px dashed ${theme.warning}`, background: `${theme.warning}12`, color: theme.warning, textAlign: "center", fontSize: 25, opacity: 1 - 0.65 * p, ...mono }}>A → E · ГОТОВЫЙ ПУТЬ</div>
      </MotionGroup>
      <MotionGroup id="streets" index={1} action={{ preset: "transfer", cue: "expand", from: { x: 0, y: 35 }, to: { x: 0, y: 0 } }}>
        <div data-motion-shape style={{ position: "absolute", left: 125, top: 620, width: 830, opacity: 0.25 + 0.75 * p }}>
          <svg width="830" height="300">
            <path d="M 24 185 L 215 70 L 410 210 L 610 72 L 806 185" fill="none" stroke={theme.success} strokeWidth="12" strokeLinecap="round" />
            {[24, 215, 410, 610, 806].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 70 : 185} r="24" fill={theme.panel} stroke={theme.success} strokeWidth="5" />)}
            <path d="M 25 242 L 804 242" stroke={`${theme.subtext}55`} strokeWidth="3" strokeDasharray="10 14" />
          </svg>
          <div style={{ color: theme.subtext, fontSize: 22, textAlign: "center", ...mono }}>НАСТОЯЩИЕ УЛИЦЫ</div>
        </div>
      </MotionGroup>
      <Badge text="СОКРАЩЕНИЕ ДЛЯ ПОИСКА · РАСКРЫТИЕ ДЛЯ ЕЗДЫ" color={theme.success} />
      <PulseRing x={CX} y={775} triggerFrame={motion.cue("expand")} tone="success" size={260} />
    </>
  );
};

/** Reusable road-network visual: map → weighted graph → shortcuts → query → original streets. */
export const RouteHierarchyVisual: React.FC<Props> = ({ phase = "graph", impactLocal }) => {
  switch (phase) {
    case "map": return <MapPhase />;
    case "graph": return <GraphPhase />;
    case "shortcuts": return <ShortcutPhase />;
    case "express": return <ExpressPhase />;
    case "query": return <QueryPhase />;
    case "expand": return <ExpandPhase />;
    default: return null;
  }
};

import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

export type ConsistentHashPhase = "modulo" | "ring" | "move" | "virtual";

const W = layout.width;
const CX = W / 2;
const CY = 820;
const R = 300;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

const Header: React.FC<{ text: string; opacity: number }> = ({ text, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: 54,
      right: 54,
      top: 265,
      textAlign: "center",
      fontFamily: theme.mono,
      fontSize: 36,
      fontWeight: 800,
      letterSpacing: 2,
      color: theme.text,
      opacity,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

const Caption: React.FC<{ text: string; top?: number; color?: string; opacity?: number }> = ({
  text,
  top = 1290,
  color = theme.subtext,
  opacity = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left: 40,
      right: 40,
      top,
      textAlign: "center",
      fontFamily: theme.font,
      fontSize: 30,
      fontWeight: 700,
      color,
      opacity,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

const Badge: React.FC<{ text: string; color: string; top?: number; opacity?: number; scale?: number }> = ({
  text,
  color,
  top = 1390,
  opacity = 1,
  scale = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top,
      transform: `translateX(-50%) scale(${scale})`,
      padding: "14px 30px",
      borderRadius: 999,
      background: `${color}20`,
      border: `3px solid ${color}`,
      color,
      fontFamily: theme.font,
      fontSize: 32,
      fontWeight: 800,
      whiteSpace: "nowrap",
      opacity,
      boxShadow: `0 0 28px ${color}35`,
    }}
  >
    {text}
  </div>
);

const point = (angle: number, radius = R) => ({
  x: CX + radius * Math.cos(angle),
  y: CY + radius * Math.sin(angle),
});

const sectorPath = (inner: number, outer: number, start: number, end: number) => {
  const p = (radius: number, angle: number) => point(angle, radius);
  const a = p(outer, start);
  const b = p(outer, end);
  const c = p(inner, end);
  const d = p(inner, start);
  const largeArc = end - start > Math.PI ? 1 : 0;
  return `M ${a.x} ${a.y} A ${outer} ${outer} 0 ${largeArc} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${inner} ${inner} 0 ${largeArc} 0 ${d.x} ${d.y} Z`;
};

const Node: React.FC<{ label: string; angle: number; color: string; opacity: number; scale?: number }> = ({
  label,
  angle,
  color,
  opacity,
  scale = 1,
}) => {
  const p = point(angle, R + 10);
  return (
    <g opacity={opacity} transform={`translate(${p.x} ${p.y}) scale(${scale})`}>
      <circle r="38" fill={theme.panel} stroke={color} strokeWidth="5" />
      <circle r="9" fill={color} />
      <text y="78" textAnchor="middle" fill={color} fontFamily={theme.mono} fontSize="30" fontWeight="800">
        {label}
      </text>
    </g>
  );
};

const KeyDot: React.FC<{ label: string; angle: number; color: string; opacity: number; radius?: number }> = ({
  label,
  angle,
  color,
  opacity,
  radius = R - 10,
}) => {
  const p = point(angle, radius);
  return (
    <g opacity={opacity}>
      <circle cx={p.x} cy={p.y} r="16" fill={color} />
      <text x={p.x} y={p.y - 28} textAnchor="middle" fill={theme.text} fontFamily={theme.mono} fontSize="22">
        {label}
      </text>
    </g>
  );
};

const RingBase: React.FC<{ children: React.ReactNode; opacity: number }> = ({ children, opacity }) => (
  <svg width={W} height={1460} style={{ position: "absolute", inset: 0, opacity }}>
    <circle cx={CX} cy={CY} r={R + 22} fill="none" stroke={theme.panelBorder} strokeWidth="3" />
    <circle cx={CX} cy={CY} r={R - 38} fill={`${theme.panel}70`} stroke={theme.panelBorder} strokeWidth="2" />
    {children}
  </svg>
);

const ModuloPanel: React.FC<{
  left: number;
  title: string;
  servers: string[];
  moved: boolean;
  opacity: number;
}> = ({ left, title, servers, moved, opacity }) => {
  const keys = ["кот", "видео", "лог", "сессия"];
  return (
    <div
      style={{
        position: "absolute",
        left,
        top: 430,
        width: 430,
        height: 700,
        padding: "28px 24px",
        borderRadius: 24,
        background: theme.panel,
        border: `2px solid ${theme.panelBorder}`,
        opacity,
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontFamily: theme.mono, fontSize: 30, color: theme.text, textAlign: "center", fontWeight: 800 }}>
        {title}
      </div>
      <div style={{ marginTop: 34, display: "grid", gap: 18 }}>
        {servers.map((server, i) => (
          <div
            key={server}
            style={{
              display: "flex",
              alignItems: "center",
              minHeight: 86,
              padding: "0 18px",
              borderRadius: 16,
              background: `${i === servers.length - 1 && moved ? theme.danger : theme.accent}12`,
              border: `2px solid ${i === servers.length - 1 && moved ? theme.danger : theme.accent}88`,
            }}
          >
            <span style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 28, color: i === servers.length - 1 && moved ? theme.danger : theme.accent }}>
              {server}
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
              {keys.map((key, k) => (
                <span
                  key={key}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    background: moved && (k + i) % 2 === 0 ? theme.danger : theme.subtext,
                    opacity: moved && (k + i) % 2 === 0 ? 1 : 0.35,
                  }}
                />
              ))}
            </span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 38, textAlign: "center", fontFamily: theme.font, fontSize: 28, color: moved ? theme.danger : theme.subtext }}>
        {moved ? "почти всё переехало" : "ключи пересчитываются"}
      </div>
    </div>
  );
};

/** Согласованное хеширование: modulo против кольца, локальный перенос и виртуальные точки. */
export const ConsistentHashRingVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: ConsistentHashPhase;
}> = ({ local, fps, impactLocal, phase = "ring" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;

  if (phase === "modulo") {
    return (
      <>
        <Header text="ОДИН НОВЫЙ УЗЕЛ · ПОЧТИ ВСЁ СНАЧАЛА" opacity={enter} />
        <ModuloPanel left={70} title="modulo три" servers={["A", "B", "C"]} moved={false} opacity={enter} />
        <ModuloPanel left={580} title="modulo четыре" servers={["A", "B", "C", "D"]} moved={true} opacity={enter} />
        <Badge text="АДРЕСА КЛЮЧЕЙ ИЗМЕНИЛИСЬ" color={theme.danger} top={1190} opacity={hit ? pop : enter * 0.6} scale={0.95 + 0.05 * pop} />
      </>
    );
  }

  const nodes = phase === "move"
    ? [
        { label: "A", angle: -Math.PI / 2, color: theme.accent },
        { label: "B", angle: 0.12, color: theme.accent2 },
        { label: "+D", angle: 0.78, color: theme.success },
        { label: "C", angle: 2.35, color: theme.accent2 },
      ]
    : [
        { label: "A", angle: -Math.PI / 2, color: theme.accent },
        { label: "B", angle: 0.2, color: theme.accent2 },
        { label: "C", angle: 2.25, color: theme.accent2 },
      ];
  const keyAngles = phase === "move" ? [0.28, 0.46, 0.64, 1.22, 2.0, 3.0, 4.2] : [-0.8, 0.15, 0.75, 1.55, 2.7, 3.6, 4.6];
  const keyLabels = ["k1", "k2", "k3", "k4", "k5", "k6", "k7"];
  const tokenAngles = [-1.38, -0.98, -0.58, -0.17, 0.25, 0.66, 1.06, 1.48, 1.93, 2.38, 2.82, 3.22, 3.66, 4.04, 4.46, 4.86];
  const ownerColors = [theme.accent, theme.accent2, theme.success, theme.warning];

  return (
    <>
      <Header
        text={phase === "ring" ? "КОЛЬЦО ХЕШЕЙ" : phase === "move" ? "НОВЫЙ УЗЕЛ ЗАБИРАЕТ СЕКТОР" : "ВИРТУАЛЬНЫЕ ТОЧКИ"}
        opacity={enter}
      />
      <RingBase opacity={enter}>
        {phase === "move" ? (
          <path d={sectorPath(R - 54, R + 22, 0.12, 0.78)} fill={`${theme.success}35`} stroke={theme.success} strokeWidth="4" />
        ) : null}
        <circle cx={CX} cy={CY} r={R - 38} fill="none" stroke={theme.subtext} strokeWidth="2" strokeDasharray="8 16" opacity="0.55" />
        {phase === "virtual"
          ? tokenAngles.map((angle, i) => {
              const p = point(angle, R + 10);
              const c = ownerColors[i % ownerColors.length];
              return <circle key={angle} cx={p.x} cy={p.y} r="14" fill={c} opacity={smooth(clamp01((local - i * 2) / 18))} />;
            })
          : keyAngles.map((angle, i) => (
              <KeyDot
                key={keyLabels[i]}
                label={keyLabels[i]}
                angle={angle}
                color={phase === "move" && i < 3 ? theme.success : theme.accent}
                opacity={enter}
              />
            ))}
        {nodes.map((node) => (
          <Node key={node.label} label={node.label} angle={node.angle} color={node.color} opacity={enter} scale={node.label === "+D" && hit ? 1 + 0.14 * pop : 1} />
        ))}
        {phase === "ring" ? (
          <>
            <line x1={point(-0.8, R - 40).x} y1={point(-0.8, R - 40).y} x2={point(0.2, R + 10).x} y2={point(0.2, R + 10).y} stroke={theme.warning} strokeWidth="5" strokeDasharray="12 10" />
            <circle cx={CX} cy={CY} r="30" fill={theme.panel} stroke={theme.warning} strokeWidth="4" />
            <text x={CX} y={CY + 10} textAnchor="middle" fill={theme.warning} fontFamily={theme.mono} fontSize="24" fontWeight="800">ключ</text>
          </>
        ) : null}
      </RingBase>
      {phase === "ring" ? <Caption text="ключ → первый узел по часовой стрелке" color={theme.warning} /> : null}
      {phase === "move" ? (
        <>
          <Caption text="только зелёный сектор меняет владельца" color={theme.success} />
          <Badge text="≈ 25% КЛЮЧЕЙ" color={theme.success} opacity={hit ? pop : enter * 0.6} scale={0.94 + 0.06 * pop} />
          {hit ? <PulseRing x={point(0.45, R).x} y={point(0.45, R).y} triggerFrame={impactLocal} tone="success" size={250} /> : null}
        </>
      ) : null}
      {phase === "virtual" ? (
        <>
          <Caption text="много позиций одного сервера · нагрузка ровнее" color={theme.accent2} />
          <Badge text="ОДИН СЕРВЕР = МНОГО ТОЧЕК" color={theme.accent2} opacity={enter} />
        </>
      ) : null}
    </>
  );
};

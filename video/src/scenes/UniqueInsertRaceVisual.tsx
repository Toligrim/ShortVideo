import React from "react";
import { theme } from "../lib/theme";
import { MotionGroup, useMotion } from "../lib/motion/MotionStage";
import { mix } from "../lib/motion/curves";
import { IconGlyph } from "../primitives/IconGlyph";

export type UniqueInsertRacePhase = "request" | "check" | "insert" | "wait" | "conflict";
interface Props {
  local: number; fps: number; impactLocal: number; // legacy call contract
  phase?: UniqueInsertRacePhase; keyLabel?: string; indexLabel?: string;
}
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 700 };
const box: React.CSSProperties = { position: "absolute", boxSizing: "border-box", borderRadius: 24, background: theme.panel };
const titles: Record<UniqueInsertRacePhase, string> = {
  request: "ДВА ЗАПРОСА", check: "ПРОВЕРКА", insert: "ВСТАВКА", wait: "ОЖИДАНИЕ", conflict: "КОНФЛИКТ",
};
const Token: React.FC<{ x: number; y: number; label: string; value: string; color: string; status?: string; large?: boolean }> = ({ x, y, label, value, color, status, large = false }) => (
  <div data-motion-shape style={{ ...box, left: x, top: y, width: large ? 340 : 230, height: large ? 290 : 152, border: `3px solid ${color}` }}>
    <div style={{ position: "absolute", left: 24, top: 22, display: "flex", alignItems: "center", gap: 12, color, ...mono, fontSize: 24 }}>
      <IconGlyph name="user-round" size={30} color={color} />{label}
    </div>
    <div style={{ position: "absolute", left: 24, top: large ? 112 : 78, fontFamily: theme.font, color: theme.text, fontSize: large ? 32 : 23 }}>{value}</div>
    {status ? <div style={{ position: "absolute", left: 24, bottom: 26, color, fontSize: 23, ...mono }}>{status}</div> : null}
  </div>
);

/** Three tracked objects, stable backdrop, independent arrivals and word-driven actions.
 * Cues: act (mechanism starts), resolve (outcome). Both derive from alignment;
 * old episodes without cues use proportional positions inside the existing beat.
 */
export const UniqueInsertRaceVisual: React.FC<Props> = ({ phase = "check", keyLabel = "Космонавт", indexLabel = "42" }) => {
  const motion = useMotion();
  const act = motion.action("act", 0.3);
  const resolved = motion.action("resolve", 0.7);
  const key = keyLabel.length > 13 ? `${keyLabel.slice(0, 12)}…` : keyLabel;
  const request = phase === "request";
  const checking = phase === "check";
  const inserting = phase === "insert";
  const waiting = phase === "wait";
  const conflict = phase === "conflict";
  const rowColor = conflict || waiting ? theme.success : theme.accent2;
  const bColor = conflict ? theme.danger : theme.accent2;
  // The insert converges; wait parks B at the lock; conflict physically rejects B.
  const moveA = inserting ? { x: 200, y: 195 } : { x: 0, y: 0 };
  const moveB = request ? { x: 25, y: 70 } : inserting ? { x: -200, y: 195 } : waiting ? { x: -65, y: 0 } : conflict ? { x: 75, y: -55 } : { x: 0, y: 0 };
  const rowValue = checking ? "· пусто" : inserting && act < 0.98 ? "· пусто" : key;
  const aX = request ? 115 : inserting ? 130 : 145;
  const bX = request ? 625 : inserting ? 720 : waiting || conflict ? 750 : 705;
  const aY = request ? 505 : inserting ? 425 : waiting || conflict ? 930 : 420;
  const bY = request ? 505 : inserting ? 425 : waiting || conflict ? 720 : 420;
  return <>
    <div style={{ position: "absolute", top: 320, width: "100%", textAlign: "center", fontSize: 24, letterSpacing: 2, color: theme.subtext, ...mono }}>{titles[phase]}</div>
    {!request ? <MotionGroup id="index" index={0}>
      <div data-motion-shape style={{ ...box, left: waiting || conflict ? 105 : 190, top: 640, width: waiting || conflict ? 560 : 700, height: 260, border: `3px solid ${rowColor}` }}>
        <div style={{ position: "absolute", left: 28, top: 25, color: rowColor, display: "flex", gap: 14, alignItems: "center", fontSize: 25, ...mono }}>
          <IconGlyph name="database" size={32} color={rowColor} />UNIQUE INDEX
        </div>
        <div style={{ ...box, left: 28, top: 94, width: waiting || conflict ? 498 : 638, height: 124, border: `2px solid ${theme.panelBorder}`, display: "flex", alignItems: "center", gap: 32, padding: 24 }}>
          <span style={{ color: rowColor, fontSize: 24, ...mono }}>[{indexLabel.slice(0, 8)}]</span>
          <span style={{ color: theme.text, fontSize: 30, fontFamily: theme.font, opacity: inserting ? Math.max(0.15, act) : 1 }}>{rowValue}</span>
          {waiting ? <span style={{ opacity: 1 - resolved }}><IconGlyph name="lock-keyhole" size={34} color={theme.warning} /></span> : null}
        </div>
      </div>
    </MotionGroup> : null}
    <MotionGroup id="request-a" index={1} action={{ preset: request ? "pulse" : "transfer", cue: request ? "resolve" : "act", to: moveA }}>
      <div style={{ opacity: inserting ? 1 - act : 1 }}><Token x={aX} y={aY} label="ЗАПРОС A" value={key} large={request} color={theme.accent}
        status={request && resolved > 0 ? "ПРИНЯТО" : undefined} /></div>
    </MotionGroup>
    <MotionGroup id="request-b" index={2} action={{ preset: conflict || request ? "recoil" : "transfer", cue: request ? "resolve" : "act", to: moveB }}>
      <div style={{ opacity: inserting ? 1 - act : 1 }}><Token x={bX} y={bY} label="ЗАПРОС B" value={key} large={request} color={bColor}
        status={request && resolved > 0 ? "ОТКАЗ" : undefined} /></div>
    </MotionGroup>
    {checking ? <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {[0, 1].map(i => {
        const x = i === 0 ? 260 : 820;
        const arrival = { x: i === 0 ? 425 : 655, y: 640 };
        return <g key={i} opacity={act}>
          <path d={`M ${x} 572 L ${arrival.x} ${arrival.y}`} stroke={i === 0 ? theme.accent : theme.accent2} strokeWidth={4} fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - act} />
          <circle data-motion-actor={`probe-${i}`} cx={mix(x, arrival.x, act)} cy={mix(572, arrival.y, act)} r={11} fill={theme.warning} />
        </g>;
      })}
    </svg> : null}
    {waiting ? <MotionGroup id="wait-lock" index={3}>
      <div data-motion-shape style={{ position: "absolute", left: 615, top: 958, color: theme.warning, display: "flex", alignItems: "center", gap: 16, ...mono, fontSize: 26 }}>
        <svg width={48} height={48} viewBox="0 0 48 48">
          <circle cx={24} cy={24} r={21} stroke={theme.warning} strokeWidth={3} fill="none" />
          <path d="M 24 24 L 24 8" stroke={theme.warning} strokeWidth={3}
            transform={`rotate(${Math.min(1, Math.max(0, (motion.frame - motion.start) / Math.max(1, motion.cue("resolve", 0.7) - motion.start))) * 300} 24 24)`} />
        </svg>
        <span>{resolved >= 1 ? "COMMIT" : "B · WAIT"}</span>
      </div>
    </MotionGroup> : null}
    {conflict ? <MotionGroup id="rejection" index={3} action={{ preset: "pulse", cue: "resolve" }}>
      <div data-motion-shape style={{ position: "absolute", left: 620, top: 1050, display: "flex", alignItems: "center", gap: 14, color: theme.danger, opacity: act, fontSize: 24, ...mono }}>
        <IconGlyph name="circle-x" size={42} color={theme.danger} />UNIQUE VIOLATION
      </div>
    </MotionGroup> : null}
  </>;
};

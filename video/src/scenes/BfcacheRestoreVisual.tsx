import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { MotionGroup, useMotion } from "../lib/motion/MotionStage";
import { IconGlyph } from "../primitives/IconGlyph";

export type BfcacheRestorePhase =
  | "visit"
  | "snapshot"
  | "freeze"
  | "book"
  | "restore"
  | "ordinary-load";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: BfcacheRestorePhase;
}

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const phaseTitle: Record<BfcacheRestorePhase, string> = {
  visit: "VISIT · СОСТОЯНИЕ ЖИВО",
  snapshot: "SNAPSHOT · ПОЛНЫЙ ДОКУМЕНТ",
  freeze: "FREEZE · EXECUTION PAUSED",
  book: "АНАЛОГИЯ · КНИГА УЖЕ ОТКРЫТА",
  restore: "RESTORE · СНИМОК ВЕРНУЛСЯ",
  "ordinary-load": "ORDINARY LOAD · СНАЧАЛА ЗАНОВО",
};

const phaseTone: Record<BfcacheRestorePhase, string> = {
  visit: theme.accent,
  snapshot: theme.accent2,
  freeze: theme.warning,
  book: theme.warning,
  restore: theme.success,
  "ordinary-load": theme.danger,
};

const Header: React.FC<{ phase: BfcacheRestorePhase; enter: number }> = ({ phase, enter }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 305,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: phaseTone[phase],
      fontSize: 24,
      whiteSpace: "nowrap",
      opacity: enter,
      ...mono,
    }}
  >
    <IconGlyph
      name={phase === "book" ? "book-open" : phase === "ordinary-load" ? "loader-circle" : phase === "freeze" ? "pause" : "database"}
      size={30}
      color={phaseTone[phase]}
      strokeWidth={1.8}
    />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const Badge: React.FC<{ text: string; color: string; opacity: number; scale?: number }> = ({ text, color, opacity, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 1200,
      transform: `translateX(-50%) scale(${scale})`,
      padding: "14px 28px",
      borderRadius: 999,
      background: `${color}18`,
      border: `3px solid ${color}99`,
      boxShadow: `0 0 30px ${color}28`,
      color,
      opacity,
      whiteSpace: "nowrap",
      fontSize: 24,
      ...mono,
    }}
  >
    {text}
  </div>
);

const BrowserCard: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  compact?: boolean;
  blank?: boolean;
  opacity?: number;
}> = ({ left, top, width, height, compact = false, blank = false, opacity = 1 }) => (
  <div
    data-motion-shape
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      borderRadius: 24,
      background: `${theme.panel}F2`,
      border: `3px solid ${blank ? theme.danger : theme.accent}99`,
      boxShadow: `0 0 34px ${(blank ? theme.danger : theme.accent)}22`,
      overflow: "hidden",
      opacity,
      boxSizing: "border-box",
    }}
  >
    <div style={{ height: 52, borderBottom: `2px solid ${theme.panelBorder}`, display: "flex", alignItems: "center", gap: 9, padding: "0 20px", color: theme.subtext, ...mono, fontSize: compact ? 15 : 18 }}>
      {[theme.danger, theme.warning, theme.success].map((color) => <span key={color} style={{ width: 9, height: 9, borderRadius: "50%", background: color }} />)}
      <span style={{ marginLeft: 12, color: blank ? theme.danger : theme.subtext }}>{blank ? "REQUEST / document" : "article.example / story"}</span>
    </div>
    {blank ? (
      <div style={{ position: "absolute", inset: "52px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, color: theme.subtext, ...mono }}>
        <IconGlyph name="loader-circle" size={56} color={theme.warning} strokeWidth={1.7} />
        <span style={{ color: theme.warning, fontSize: 21 }}>BUILD DOCUMENT</span>
      </div>
    ) : (
      <>
        <div style={{ position: "absolute", left: 28, top: 84, color: theme.accent, fontSize: compact ? 17 : 21, ...mono }}>ARTICLE</div>
        <div style={{ position: "absolute", left: 28, top: 132, width: width * 0.6, height: compact ? 12 : 16, borderRadius: 8, background: `${theme.text}CC` }} />
        <div style={{ position: "absolute", left: 28, top: 170, width: width * 0.76, height: 8, borderRadius: 4, background: `${theme.subtext}66` }} />
        <div style={{ position: "absolute", left: 28, top: 198, width: width * 0.68, height: 8, borderRadius: 4, background: `${theme.subtext}55` }} />
        <div style={{ position: "absolute", left: 28, top: 246, width: width * 0.84, height: compact ? 70 : 118, borderRadius: 12, background: `${theme.accent2}12`, border: `2px solid ${theme.accent2}55` }} />
        <div style={{ position: "absolute", left: 28, top: compact ? 340 : 400, width: width * 0.55, height: 8, borderRadius: 4, background: `${theme.subtext}55` }} />
        <div style={{ position: "absolute", left: 28, top: compact ? 368 : 428, width: width * 0.73, height: 8, borderRadius: 4, background: `${theme.subtext}44` }} />
      </>
    )}
  </div>
);

const ScrollState: React.FC<{ left: number; top: number; compact?: boolean; color?: string }> = ({ left, top, compact = false, color = theme.accent }) => (
  <div data-motion-shape style={{ position: "absolute", left, top, width: compact ? 24 : 30, height: compact ? 230 : 330, borderRadius: 15, background: `${theme.subtext}20`, border: `2px solid ${theme.subtext}55` }}>
    <div style={{ position: "absolute", left: 4, top: compact ? 104 : 158, width: compact ? 12 : 18, height: compact ? 62 : 92, borderRadius: 10, background: color, boxShadow: `0 0 18px ${color}88` }} />
  </div>
);

const Field: React.FC<{ left: number; top: number; compact?: boolean; opacity?: number }> = ({ left, top, compact = false, opacity = 1 }) => (
  <div data-motion-shape style={{ position: "absolute", left, top, width: compact ? 220 : 340, height: compact ? 58 : 70, borderRadius: 12, border: `3px solid ${theme.success}AA`, background: `${theme.success}12`, color: theme.success, display: "flex", alignItems: "center", padding: "0 18px", fontSize: compact ? 18 : 22, opacity, ...mono }}>
    <span style={{ opacity: 0.6, marginRight: 10 }}>FIELD</span>
    <span style={{ color: theme.text }}>пара слов</span>
  </div>
);

const MemoryCard: React.FC<{ left: number; top: number; width?: number; height?: number; opacity?: number; compact?: boolean; showHeap?: boolean }> = ({ left, top, width = 350, height = 500, opacity = 1, compact = false, showHeap = true }) => (
  <div data-motion-shape style={{ position: "absolute", left, top, width, height, borderRadius: 22, border: `3px solid ${theme.accent2}`, background: `${theme.accent2}14`, boxShadow: `0 0 36px ${theme.accent2}26`, opacity, boxSizing: "border-box", padding: compact ? 20 : 26 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: theme.accent2, fontSize: compact ? 19 : 23, ...mono }}>
      <IconGlyph name="database" size={compact ? 25 : 30} color={theme.accent2} strokeWidth={1.8} />
      <span>IN-MEMORY</span>
    </div>
    <div style={{ marginTop: compact ? 28 : 38, height: compact ? 114 : 170, borderRadius: 14, border: `2px solid ${theme.accent}77`, background: `${theme.bg}AA`, padding: compact ? 14 : 18, ...mono }}>
      <div style={{ color: theme.accent, fontSize: compact ? 16 : 19 }}>DOCUMENT SNAPSHOT</div>
      <div style={{ marginTop: 16, color: theme.text, fontSize: compact ? 15 : 18 }}>scroll · 68%</div>
      <div style={{ marginTop: 9, color: theme.success, fontSize: compact ? 15 : 18 }}>field · filled</div>
    </div>
    {showHeap ? <>
      <div style={{ marginTop: compact ? 24 : 34, display: "flex", alignItems: "center", gap: 12, color: theme.warning, fontSize: compact ? 17 : 21, ...mono }}>
        <IconGlyph name="braces" size={compact ? 24 : 30} color={theme.warning} strokeWidth={1.8} />
        <span>JS HEAP</span>
      </div>
      <div style={{ marginTop: 16, height: 7, width: "74%", background: `${theme.warning}88`, borderRadius: 5 }} />
      <div style={{ marginTop: 10, height: 7, width: "48%", background: `${theme.warning}55`, borderRadius: 5 }} />
    </> : null}
  </div>
);

const Arrow: React.FC<{ x1: number; y1: number; x2: number; y2: number; color: string; opacity?: number; label?: string; dashed?: boolean }> = ({ x1, y1, x2, y2, color, opacity = 1, label, dashed = false }) => (
  <svg width={W} height={layout.height} style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity }}>
    <defs><marker id={`arrow-${color.replace("#", "")}`} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill={color} /></marker></defs>
    <path d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1 - 50}, ${(x1 + x2) / 2} ${y2 + 50}, ${x2} ${y2}`} stroke={color} strokeWidth={5} fill="none" strokeDasharray={dashed ? "12 12" : undefined} markerEnd={`url(#arrow-${color.replace("#", "")})`} />
    {label ? <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 18} fill={color} textAnchor="middle" style={{ ...mono, fontSize: 19 }}>{label}</text> : null}
  </svg>
);

const Book: React.FC<{ left: number; top: number; opacity?: number }> = ({ left, top, opacity = 1 }) => (
  <div data-motion-shape style={{ position: "absolute", left, top, width: 620, height: 310, opacity, transform: "perspective(900px) rotateX(7deg)" }}>
    <div style={{ position: "absolute", left: 0, top: 20, width: 298, height: 245, borderRadius: "18px 5px 5px 18px", background: "#E9D9B5", border: `4px solid ${theme.warning}`, transform: "rotate(-3deg)", boxShadow: `0 12px 18px ${theme.bg}88` }}>
      <PageLines />
    </div>
    <div style={{ position: "absolute", left: 302, top: 20, width: 298, height: 245, borderRadius: "5px 18px 18px 5px", background: "#F2E4C3", border: `4px solid ${theme.warning}`, transform: "rotate(3deg)", boxShadow: `0 12px 18px ${theme.bg}88` }}>
      <PageLines />
    </div>
    <div style={{ position: "absolute", left: 298, top: 20, width: 8, height: 245, background: `${theme.warning}AA` }} />
    <div style={{ position: "absolute", left: 232, top: 75, width: 158, height: 45, borderRadius: 8, background: `${theme.accent}44`, border: `2px solid ${theme.accent}`, color: theme.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, ...mono }}>PAGE 42</div>
  </div>
);

const PageLines: React.FC = () => (
  <>
    {[0, 1, 2, 3, 4].map((index) => <div key={index} style={{ position: "absolute", left: 24, right: 24 + (index % 2) * 18, top: 30 + index * 32, height: 6, borderRadius: 3, background: `${theme.bg}44` }} />)}
  </>
);

export const BfcacheRestoreVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "visit" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const motion = useMotion();
  const action = (id: string, fraction = 0.5) => motion.action(id, fraction);
  const cueLocal = (id: string, fraction = 0.6) => motion.cue(id, fraction) - motion.start;
  const ring = smooth((local - impactLocal) / 20);

  if (phase === "visit") {
    const state = action("state", 0.65);
    return <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Header phase={phase} enter={enter} />
      <MotionGroup id="document" index={0}><BrowserCard left={100} top={420} width={880} height={540} /></MotionGroup>
      <MotionGroup id="scroll" index={1}><ScrollState left={924} top={532} /></MotionGroup>
      <MotionGroup id="field" index={2} action={{ preset: "pulse", cue: "state" }}><Field left={350} top={820} opacity={0.9 + state * 0.1} /></MotionGroup>
      <MotionGroup id="history" index={3} action={{ preset: "transfer", cue: "back", from: { x: -90, y: 0 }, to: { x: 0, y: 0 } }}>
        <div data-motion-shape style={{ position: "absolute", left: 730, top: 1010, color: theme.accent, display: "flex", alignItems: "center", gap: 12, fontSize: 22, ...mono }}><IconGlyph name="undo-2" size={30} color={theme.accent} />НАЗАД</div>
      </MotionGroup>
      <Badge text="СОСТОЯНИЕ СОХРАНЕНО" color={theme.success} opacity={enter} scale={1 + ring * 0.04} />
    </div>;
  }

  if (phase === "snapshot") {
    const save = action("save", 0.45);
    const snap = action("snapshot", 0.6);
    const heap = action("heap", 0.72);
    return <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Header phase={phase} enter={enter} />
      <MotionGroup id="document" index={0} action={{ preset: "transfer", cue: "save", to: { x: -55, y: 0 } }}><BrowserCard left={80} top={450} width={450} height={490} compact opacity={1 - save * 0.35} /></MotionGroup>
      <Arrow x1={520} y1={680} x2={650} y2={680} color={theme.accent2} opacity={enter * save} label="SNAP" />
      <MotionGroup id="snapshot" index={1} action={{ preset: "pulse", cue: "snapshot" }}><MemoryCard left={640} top={425} opacity={snap} showHeap={false} /></MotionGroup>
      <MotionGroup id="heap" index={2} action={{ preset: "pulse", cue: "heap" }}>
        <div data-motion-shape style={{ position: "absolute", left: 710, top: 820, color: theme.warning, display: "flex", alignItems: "center", gap: 10, opacity: heap, fontSize: 18, ...mono }}><IconGlyph name="braces" size={24} color={theme.warning} strokeWidth={1.8} />JS HEAP · INSIDE</div>
      </MotionGroup>
      <Badge text="DOM + STATE + JS HEAP" color={theme.accent2} opacity={enter * snap} />
    </div>;
  }

  if (phase === "freeze") {
    const frozen = action("freeze", 0.4);
    const paused = action("pause", 0.72);
    return <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Header phase={phase} enter={enter} />
      <MotionGroup id="document" index={0} action={{ preset: "depart", cue: "freeze", to: { x: -120, y: 0 } }}><BrowserCard left={80} top={450} width={410} height={480} compact opacity={1 - frozen * 0.7} /></MotionGroup>
      <Arrow x1={490} y1={685} x2={600} y2={685} color={theme.warning} opacity={enter * frozen} label="PAUSE" />
      <MotionGroup id="snapshot" index={1} action={{ preset: "pulse", cue: "freeze" }}><MemoryCard left={620} top={435} width={380} height={490} compact opacity={frozen} /></MotionGroup>
      <MotionGroup id="execution" index={2} action={{ preset: "pulse", cue: "pause" }}>
        <div data-motion-shape style={{ position: "absolute", left: 392, top: 1000, display: "flex", alignItems: "center", gap: 14, color: theme.warning, opacity: paused, fontSize: 22, ...mono }}><IconGlyph name="pause-circle" size={36} color={theme.warning} />JS · PAUSED</div>
      </MotionGroup>
      <Badge text="СНИМОК ЗАМОРОЖЕН" color={theme.warning} opacity={enter * frozen} />
    </div>;
  }

  if (phase === "book") {
    const open = action("book", 0.55);
    const returned = action("return", 0.72);
    return <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Header phase={phase} enter={enter} />
      <div style={{ position: "absolute", left: 110, top: 900, width: 860, height: 90, borderRadius: 26, background: `${theme.warning}12`, border: `3px solid ${theme.warning}55`, opacity: enter }} />
      <MotionGroup id="book" index={0} action={{ preset: "pulse", cue: "book" }}><Book left={230} top={560} opacity={enter * (0.72 + open * 0.28)} /></MotionGroup>
      <MotionGroup id="return" index={1} action={{ preset: "transfer", cue: "table", from: { x: -100, y: -40 }, to: { x: 0, y: 0 } }}>
        <div data-motion-shape style={{ position: "absolute", left: 120, top: 760, color: theme.warning, display: "flex", alignItems: "center", gap: 10, opacity: 0.55 + returned * 0.45, fontSize: 21, ...mono }}><IconGlyph name="corner-down-right" size={34} color={theme.warning} />НА СТОЛ</div>
      </MotionGroup>
      <Badge text="УЖЕ ОТКРЫТАЯ СТРАНИЦА" color={theme.warning} opacity={enter} />
    </div>;
  }

  if (phase === "restore") {
    const restored = action("restore", 0.4);
    const resumed = action("resume", 0.68);
    return <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Header phase={phase} enter={enter} />
      <MotionGroup id="snapshot" index={0} action={{ preset: "depart", cue: "restore", to: { x: -100, y: 0 } }}><MemoryCard left={55} top={490} width={330} height={430} compact opacity={1 - restored * 0.75} /></MotionGroup>
      <Arrow x1={385} y1={700} x2={520} y2={700} color={theme.success} opacity={enter * restored} label="BACK" />
      <MotionGroup id="document" index={1} action={{ preset: "transfer", cue: "restore", from: { x: -160, y: 0 }, to: { x: 0, y: 0 } }}>
        <div data-motion-shape style={{ opacity: 0.45 + restored * 0.55 }}><BrowserCard left={520} top={430} width={450} height={500} compact /><ScrollState left={915} top={530} compact color={theme.success} /><Field left={630} top={785} compact /></div>
      </MotionGroup>
      <MotionGroup id="return" index={2} action={{ preset: "pulse", cue: "resume" }}>
        <div data-motion-shape style={{ position: "absolute", left: 640, top: 990, color: theme.success, display: "flex", alignItems: "center", gap: 12, opacity: resumed, fontSize: 22, ...mono }}><IconGlyph name="play-circle" size={36} color={theme.success} />JS · RUN</div>
      </MotionGroup>
      <Badge text="SCROLL + FIELD · PRESERVED" color={theme.success} opacity={enter * restored} />
    </div>;
  }

  const rebuild = action("rebuild", 0.42);
  const again = action("again", 0.72);
  const loadLocal = cueLocal("again", 0.72);
  const spinner = smooth((local - loadLocal) / 18);
  return <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
    <Header phase={phase} enter={enter} />
    <MotionGroup id="blockers" index={0} action={{ preset: "pulse", cue: "rebuild" }}>
      <div data-motion-shape style={{ position: "absolute", left: 80, top: 490, width: 360, height: 390, borderRadius: 22, border: `3px solid ${theme.danger}99`, background: `${theme.danger}12`, padding: 25, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: theme.danger, fontSize: 23, ...mono }}><IconGlyph name="triangle-alert" size={30} color={theme.danger} />BLOCKERS</div>
        <div style={{ marginTop: 48, color: theme.danger, fontSize: 25, ...mono }}>unload</div>
        <div style={{ marginTop: 22, color: theme.warning, fontSize: 22, ...mono }}>OPEN SOCKET</div>
        <div style={{ marginTop: 46, color: theme.subtext, fontSize: 18, lineHeight: 1.45, ...mono }}>no snapshot<br />allowed</div>
      </div>
    </MotionGroup>
    <Arrow x1={460} y1={685} x2={560} y2={685} color={theme.danger} opacity={enter * rebuild} label="NO CACHE" dashed />
    <MotionGroup id="request" index={1} action={{ preset: "transfer", cue: "rebuild", from: { x: -110, y: 0 }, to: { x: 0, y: 0 } }}>
      <div data-motion-shape style={{ position: "absolute", left: 510, top: 385, color: theme.danger, fontSize: 18, opacity: rebuild, ...mono }}>GET /document</div>
    </MotionGroup>
    <MotionGroup id="page" index={2} action={{ preset: "pulse", cue: "again" }}>
      <BrowserCard left={560} top={450} width={450} height={480} compact blank opacity={0.72 + again * 0.28} />
      <div data-motion-shape style={{ position: "absolute", left: 670, top: 1000, display: "flex", alignItems: "center", gap: 10, color: theme.warning, opacity: spinner, fontSize: 21, ...mono }}><IconGlyph name="loader-circle" size={30} color={theme.warning} />LOADING AGAIN</div>
    </MotionGroup>
    <Badge text="NO SNAPSHOT · ОПЯТЬ ЗАГРУЗКА" color={theme.danger} opacity={enter * rebuild} />
  </div>;
};

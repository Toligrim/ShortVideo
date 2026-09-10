import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type UniqueInsertRacePhase = "request" | "check" | "insert" | "wait" | "conflict";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: UniqueInsertRacePhase;
  keyLabel?: string;
  indexLabel?: string;
}

const W = layout.width;
const CX = W / 2;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.4,
};

const phaseTitle: Record<UniqueInsertRacePhase, string> = {
  request: "ДВА ЗАПРОСА · ОДИН НИК",
  check: "БАЗА ДАННЫХ · ПРОВЕРКА",
  insert: "UNIQUE INDEX · INSERT",
  wait: "КОНКУРИРУЮЩИЕ ТРАНЗАКЦИИ · WAIT",
  conflict: "UNIQUE INDEX · CONFLICT",
};

const phaseColor: Record<UniqueInsertRacePhase, string> = {
  request: theme.accent,
  check: theme.warning,
  insert: theme.accent2,
  wait: theme.warning,
  conflict: theme.danger,
};

const phaseIcon: Record<UniqueInsertRacePhase, string> = {
  request: "users",
  check: "search-check",
  insert: "database",
  wait: "clock-3",
  conflict: "circle-x",
};

const Header: React.FC<{ phase: UniqueInsertRacePhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 295,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: phaseColor[phase],
      opacity,
      whiteSpace: "nowrap",
      fontSize: 24,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={31} color={phaseColor[phase]} strokeWidth={1.8} />
    {phaseTitle[phase]}
  </div>
);

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  children: React.ReactNode;
}> = ({ left, top, width, height, color, opacity, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      borderRadius: 26,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 46px ${color}1F`,
      opacity,
    }}
  >
    {children}
  </div>
);

const Pill: React.FC<{
  x: number;
  y: number;
  text: string;
  color: string;
  opacity: number;
  scale?: number;
}> = ({ x, y, text, color, opacity, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: `translate(-50%, -50%) scale(${scale})`,
      padding: "13px 24px",
      borderRadius: 999,
      background: `${color}18`,
      border: `3px solid ${color}99`,
      color,
      opacity,
      whiteSpace: "nowrap",
      fontSize: 24,
      boxShadow: `0 0 34px ${color}25`,
      ...mono,
    }}
  >
    {text}
  </div>
);

const Caption: React.FC<{ text: string; color: string; opacity: number }> = ({ text, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 1225,
      transform: "translateX(-50%)",
      color,
      opacity,
      fontSize: 28,
      whiteSpace: "nowrap",
      ...mono,
    }}
  >
    {text}
  </div>
);

const IndexRow: React.FC<{
  x: number;
  y: number;
  width: number;
  indexLabel: string;
  value: string;
  color: string;
  opacity: number;
  locked?: boolean;
}> = ({ x, y, width, indexLabel, value, color, opacity, locked = false }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height: 122,
      borderRadius: 20,
      background: `${color}16`,
      border: `3px solid ${color}AA`,
      display: "flex",
      alignItems: "center",
      padding: "0 22px",
      gap: 18,
      color: theme.text,
      opacity,
      boxShadow: `0 0 32px ${color}2A`,
    }}
  >
    <span style={{ color, fontSize: 24, ...mono }}>[{indexLabel}]</span>
    <span style={{ fontSize: 30, fontWeight: 800 }}>{value}</span>
    {locked ? <IconGlyph name="lock-keyhole" size={30} color={theme.warning} strokeWidth={1.8} /> : null}
  </div>
);

const RequestCard: React.FC<{
  left: number;
  top: number;
  label: string;
  keyLabel: string;
  color: string;
  status: string;
  opacity: number;
  scale?: number;
}> = ({ left, top, label, keyLabel, color, status, opacity, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width: 382,
      height: 350,
      borderRadius: 28,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 44px ${color}22`,
      opacity,
      transform: `scale(${scale})`,
      transformOrigin: "center",
    }}
  >
    <div style={{ position: "absolute", left: 28, top: 24, display: "flex", alignItems: "center", gap: 12, color, fontSize: 22, ...mono }}>
      <IconGlyph name="user-round" size={30} color={color} strokeWidth={1.8} />
      {label}
    </div>
    <div style={{ position: "absolute", left: 28, top: 105, color: theme.subtext, fontSize: 19, ...mono }}>НИКНЕЙМ</div>
    <div style={{ position: "absolute", left: 28, top: 140, color: theme.text, fontSize: 33, fontWeight: 800 }}>{keyLabel}</div>
    <div
      style={{
        position: "absolute",
        left: 28,
        right: 28,
        top: 228,
        height: 68,
        borderRadius: 16,
        background: `${color}18`,
        border: `2px solid ${color}88`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color,
        fontSize: 22,
        ...mono,
      }}
    >
      {status}
    </div>
  </div>
);

const DatabasePanel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  indexLabel: string;
  value: string;
  locked?: boolean;
}> = ({ left, top, width, height, color, opacity, indexLabel, value, locked }) => (
  <Panel left={left} top={top} width={width} height={height} color={color} opacity={opacity}>
    <div style={{ position: "absolute", left: 28, top: 25, display: "flex", alignItems: "center", gap: 12, color, fontSize: 23, ...mono }}>
      <IconGlyph name="database" size={32} color={color} strokeWidth={1.8} />
      UNIQUE INDEX
    </div>
    <div style={{ position: "absolute", left: 28, top: 92, color: theme.subtext, fontSize: 19, ...mono }}>users · nickname</div>
    <IndexRow x={28} y={152} width={width - 56} indexLabel={indexLabel} value={value} color={color} opacity={opacity} locked={locked} />
  </Panel>
);

const ArrowLines: React.FC<{
  paths: string[];
  color: string;
  opacity: number;
  progress: number;
  dotPositions: [number, number][];
}> = ({ paths, color, opacity, progress, dotPositions }) => (
  <>
    <svg width={W} height={layout.height} style={{ position: "absolute", inset: 0, overflow: "visible", opacity }}>
      {paths.map((path) => <path key={path} d={path} fill="none" stroke={`${color}99`} strokeWidth="4" strokeDasharray="12 16" />)}
      {dotPositions.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={11} fill={color} opacity={0.25 + progress * 0.75} />)}
    </svg>
  </>
);

/** Параметрическая гонка за одним значением в уникальном индексе. */
export const UniqueInsertRaceVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "check",
  keyLabel = "Космонавт",
  indexLabel = "42",
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const impact = Math.max(0, local - impactLocal);
  const key = keyLabel.length > 13 ? `${keyLabel.slice(0, 12)}…` : keyLabel;

  if (phase === "request") {
    const result = smooth(impact / 22);
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <RequestCard left={75} top={470} label="ЗАПРОС A" keyLabel={key} color={theme.accent} status={result > 0.45 ? "ПРИНЯТО" : "СВОБОДНО"} opacity={enter} scale={0.96 + result * 0.04} />
        <RequestCard left={623} top={470} label="ЗАПРОС B" keyLabel={key} color={result > 0.45 ? theme.danger : theme.accent2} status={result > 0.45 ? "ОТКАЗ" : "СВОБОДНО"} opacity={enter * (1 - result * 0.24)} scale={0.96 + (1 - result) * 0.04} />
        <Caption text={result > 0.45 ? "ОДИН ПОБЕДИТЕЛЬ" : "ДВА ЭКРАНА"} color={result > 0.45 ? theme.success : theme.accent} opacity={enter} />
        {result > 0.45 ? <PulseRing x={266} y={734} triggerFrame={impactLocal} tone="success" size={170} /> : null}
      </>
    );
  }

  if (phase === "check") {
    const progress = smooth(local / Math.max(impactLocal, 1));
    const rowX = 178;
    const rowY = 587;
    const rowCenterY = rowY + 61;
    const dotA: [number, number] = [interpolate(progress, [0, 1], [250, 650]), interpolate(progress, [0, 1], [510, rowCenterY])];
    const dotB: [number, number] = [interpolate(progress, [0, 1], [830, 570]), interpolate(progress, [0, 1], [510, rowCenterY])];
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <DatabasePanel left={rowX} top={435} width={724} height={520} color={theme.warning} opacity={enter} indexLabel={indexLabel} value="· пусто" />
        <Pill x={225} y={510} text="A · CHECK" color={theme.accent} opacity={enter} />
        <Pill x={855} y={510} text="B · CHECK" color={theme.accent2} opacity={enter} />
        <ArrowLines
          paths={["M 225 540 C 340 540, 430 600, 650 648", "M 855 540 C 740 540, 650 600, 650 648"]}
          color={theme.warning}
          opacity={enter * progress}
          progress={progress}
          dotPositions={[dotA, dotB]}
        />
        <Caption text="ОБА ЧИТАЮТ ПУСТО" color={theme.warning} opacity={enter} />
      </>
    );
  }

  if (phase === "insert") {
    const progress = smooth(local / Math.max(impactLocal, 1));
    const rowX = 190;
    const rowY = 592;
    const rowCenterY = rowY + 61;
    const dotA: [number, number] = [interpolate(progress, [0, 1], [155, 505]), interpolate(progress, [0, 1], [664, rowCenterY])];
    const dotB: [number, number] = [interpolate(progress, [0, 1], [925, 575]), interpolate(progress, [0, 1], [824, rowCenterY])];
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <DatabasePanel left={rowX} top={440} width={700} height={530} color={theme.accent2} opacity={enter} indexLabel={indexLabel} value={key} />
        <Pill x={125} y={664} text="A" color={theme.accent} opacity={enter} scale={0.96 + 0.04 * progress} />
        <Pill x={955} y={824} text="B" color={theme.warning} opacity={enter} scale={0.96 + 0.04 * progress} />
        <ArrowLines
          paths={["M 150 664 C 300 610, 390 620, 505 653", "M 930 824 C 790 870, 685 700, 575 653"]}
          color={theme.accent2}
          opacity={enter * progress}
          progress={progress}
          dotPositions={[dotA, dotB]}
        />
        <Caption text="ОДНА ЯЧЕЙКА" color={theme.accent2} opacity={enter} />
      </>
    );
  }

  if (phase === "wait") {
    const commit = smooth(local / Math.max(impactLocal, 1));
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <DatabasePanel left={105} top={450} width={560} height={560} color={theme.success} opacity={enter} indexLabel={indexLabel} value={commit > 0.55 ? key : "A · pending"} locked={commit < 0.8} />
        <Pill x={385} y={1070} text={commit > 0.55 ? "A · COMMIT" : "A · INSERT"} color={theme.success} opacity={enter} />
        <Panel left={705} top={540} width={270} height={300} color={theme.warning} opacity={enter}>
          <div style={{ position: "absolute", left: 0, top: 36, width: "100%", textAlign: "center" }}><IconGlyph name="clock-3" size={66} color={theme.warning} strokeWidth={1.8} /></div>
          <div style={{ position: "absolute", left: 0, top: 126, width: "100%", textAlign: "center", color: theme.warning, fontSize: 26, ...mono }}>B · WAIT</div>
          <div style={{ position: "absolute", left: 0, top: 205, width: "100%", textAlign: "center", color: theme.subtext, fontSize: 18, ...mono }}>idx {indexLabel}</div>
        </Panel>
        <ArrowLines
          paths={["M 705 690 C 660 690, 640 670, 610 663"]}
          color={theme.warning}
          opacity={enter}
          progress={commit}
          dotPositions={[[interpolate(commit, [0, 1], [705, 610]), interpolate(commit, [0, 1], [690, 663])]]}
        />
        <Caption text="B ЖДЁТ A" color={theme.warning} opacity={enter} />
      </>
    );
  }

  const loser = spring({ frame: impact, fps, config: { damping: 11, mass: 0.72 } });
  return (
    <>
      <Header phase={phase} opacity={enter} />
      <DatabasePanel left={90} top={445} width={500} height={540} color={theme.success} opacity={enter} indexLabel={indexLabel} value={key} />
      <Pill x={340} y={1050} text="A · COMMIT" color={theme.success} opacity={enter} />
      <Panel left={650} top={520} width={335} height={355} color={theme.danger} opacity={enter * loser}>
        <div style={{ position: "absolute", left: 0, top: 34, width: "100%", textAlign: "center" }}><IconGlyph name="circle-x" size={70} color={theme.danger} strokeWidth={1.8} /></div>
        <div style={{ position: "absolute", left: 0, top: 132, width: "100%", textAlign: "center", color: theme.danger, fontSize: 27, ...mono }}>B · INSERT</div>
        <div style={{ position: "absolute", left: 0, top: 204, width: "100%", textAlign: "center", color: theme.text, fontSize: 21, ...mono }}>UNIQUE VIOLATION</div>
        <div style={{ position: "absolute", left: 0, top: 268, width: "100%", textAlign: "center", color: theme.subtext, fontSize: 18, ...mono }}>копии нет</div>
      </Panel>
      <ArrowLines
        paths={["M 650 695 C 605 695, 580 675, 555 658"]}
        color={theme.danger}
        opacity={enter * loser}
        progress={loser}
        dotPositions={[[interpolate(loser, [0, 1], [650, 565]), 695]]}
      />
      <Caption text="ВСТАВКА B · ОТКАЗ" color={theme.danger} opacity={enter * loser} />
    </>
  );
};

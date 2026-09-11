import React from "react";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { MotionGroup, useMotion } from "../lib/motion/MotionStage";
import { PulseRing } from "../lib/Motion";

export type AudioTimeStretchPhase =
  | "symptom"
  | "wave"
  | "filmstrip"
  | "windows"
  | "preserve"
  | "result";

interface Props {
  local: number;
  dur: number;
  fps: number;
  impactFrame: number;
  phase?: AudioTimeStretchPhase;
}

const W = layout.width;
const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.2,
};

const WAVE = [0.02, 0.34, -0.48, 0.68, -0.2, -0.72, 0.5, 0.12, -0.58, 0.42, 0.76, -0.28, -0.54, 0.18, 0.62, -0.38, -0.12, 0.46];

const phaseTitle: Record<AudioTimeStretchPhase, string> = {
  symptom: "СИМПТОМ · 2× БЕЗ БУРУНДУКА",
  wave: "СЫРАЯ ВОЛНА · БЫСТРЕЕ = ВЫШЕ",
  filmstrip: "МОНТАЖ · ФРАГМЕНТЫ БЛИЖЕ",
  windows: "КОРОТКИЕ ОКНА · ФОРМА ВОЛНЫ",
  preserve: "ВНУТРИ ОКНА · ПЕРИОД ПРЕЖНИЙ",
  result: "ИТОГ · ВРЕМЯ ↓, ТОН =",
};

const phaseColor: Record<AudioTimeStretchPhase, string> = {
  symptom: theme.accent,
  wave: theme.danger,
  filmstrip: theme.accent2,
  windows: theme.accent,
  preserve: theme.warning,
  result: theme.success,
};

const phaseIcon: Record<AudioTimeStretchPhase, string> = {
  symptom: "smartphone",
  wave: "waves",
  filmstrip: "scissors",
  windows: "columns-3",
  preserve: "ruler",
  result: "check-circle-2",
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const Header: React.FC<{ phase: AudioTimeStretchPhase }> = ({ phase }) => (
  <div
    style={{
      position: "absolute",
      left: 32,
      right: 32,
      top: 224,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      color: phaseColor[phase],
      fontSize: 22,
      whiteSpace: "nowrap",
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={30} color={phaseColor[phase]} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const Panel: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  children: React.ReactNode;
}> = ({ x, y, width, height, color, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 26,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 18px 48px ${color}1D`,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const Label: React.FC<{ x: number; y: number; text: string; color?: string; size?: number }> = ({ x, y, text, color = theme.subtext, size = 18 }) => (
  <div style={{ position: "absolute", left: x, top: y, color, fontSize: size, whiteSpace: "nowrap", ...mono }}>
    {text}
  </div>
);

const Waveform: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  scaleX?: number;
  opacity?: number;
  phaseShift?: number;
}> = ({ x, y, width, height, color, scaleX = 1, opacity = 1, phaseShift = 0 }) => {
  const points = WAVE.map((value, index) => {
    const motion = 0.08 * Math.sin(phaseShift + index * 0.7);
    const px = (index / (WAVE.length - 1)) * width;
    const py = height / 2 - (value + motion) * height * 0.42;
    return `${px},${py}`;
  }).join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", left: x, top: y, overflow: "visible", opacity, transform: `scaleX(${scaleX})`, transformOrigin: "left center" }}
    >
      <polyline points={points} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const Badge: React.FC<{ text: string; color: string; opacity?: number }> = ({ text, color, opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: 70,
      top: 1178,
      width: 940,
      minHeight: 72,
      boxSizing: "border-box",
      padding: "15px 24px",
      borderRadius: 999,
      background: `${color}16`,
      border: `3px solid ${color}99`,
      color,
      textAlign: "center",
      whiteSpace: "nowrap",
      opacity,
      fontSize: 21,
      ...mono,
    }}
  >
    {text}
  </div>
);

const FilmFrame: React.FC<{ x: number; y: number; width: number; color: string; index: number }> = ({ x, y, width, color, index }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height: 224,
      boxSizing: "border-box",
      borderRadius: 14,
      background: `${theme.bg}E8`,
      border: `3px solid ${color}99`,
    }}
  >
    <div style={{ position: "absolute", left: 12, right: 12, top: 16, height: 11, borderTop: `4px dotted ${color}99` }} />
    <div style={{ position: "absolute", left: 12, right: 12, bottom: 16, height: 11, borderTop: `4px dotted ${color}99` }} />
    <Label x={17} y={32} text={`КАДР ${index + 1}`} color={color} size={15} />
    <Waveform x={18} y={92} width={width - 36} height={60} color={color} />
  </div>
);

const Window: React.FC<{ x: number; y: number; width: number; color: string; label: string; opacity?: number }> = ({ x, y, width, color, label, opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height: 210,
      boxSizing: "border-box",
      borderRadius: 18,
      background: `${color}18`,
      border: `3px solid ${color}BB`,
      opacity,
    }}
  >
    <Label x={16} y={20} text={label} color={color} size={16} />
    <Waveform x={18} y={88} width={width - 36} height={60} color={color} />
  </div>
);

const SymptomPhase: React.FC<{ impactFrame: number; motionFrame: number; fps: number }> = ({ impactFrame, motionFrame, fps }) => {
  const motion = useMotion();
  const short = motion.action("short");
  const phaseShift = motionFrame / fps;
  return (
    <>
      <Header phase="symptom" />
      <MotionGroup id="phone" index={0} action={{ preset: "pulse", cue: "speed" }}>
        <Panel x={70} y={420} width={430} height={470} color={theme.accent}>
          <div style={{ position: "absolute", left: 34, top: 22 }}>
            <IconGlyph name="smartphone" size={68} color={theme.accent} strokeWidth={1.6} />
          </div>
          <div style={{ position: "absolute", left: 122, top: 39, color: theme.accent, ...mono, fontSize: 20 }}>ГОЛОСОВОЕ</div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 116, textAlign: "center", color: theme.text, ...mono, fontSize: 66 }}>2×</div>
          <Label x={42} y={208} text="СКОРОСТЬ" color={theme.subtext} />
          <Waveform x={42} y={270} width={346} height={72} color={theme.accent} phaseShift={phaseShift} />
          <Label x={42} y={378} text="ЗАПИСЬ КОРОЧЕ" color={theme.accent} />
        </Panel>
      </MotionGroup>
      <MotionGroup id="myth" index={1} action={{ preset: "recoil", cue: "short", to: { x: 28, y: 0 } }}>
        <Panel x={580} y={420} width={430} height={470} color={theme.danger}>
          <IconGlyph name="bird" size={68} color={theme.danger} strokeWidth={1.6} />
          <div style={{ position: "absolute", left: 40, top: 28, color: theme.danger, ...mono, fontSize: 20 }}>ГИПОТЕЗА</div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 124, textAlign: "center", color: theme.text, ...mono, fontSize: 46 }}>ПИСК?</div>
          <Waveform x={42} y={270} width={346} height={72} color={theme.danger} scaleX={0.68} phaseShift={phaseShift + 0.7} />
          <Label x={42} y={378} text="ТОН ВЫШЕ?" color={theme.danger} />
        </Panel>
      </MotionGroup>
      <Badge text="2× · ВРЕМЯ КОРОЧЕ, НЕ ГОЛОС ВЫШЕ" color={theme.accent} opacity={0.92 - short * 0.04} />
      <PulseRing x={790} y={650} triggerFrame={impactFrame} tone="accent" size={220} />
    </>
  );
};

const WavePhase: React.FC<{ impactFrame: number; motionFrame: number; fps: number }> = ({ impactFrame, motionFrame, fps }) => {
  const motion = useMotion();
  const accelerate = motion.action("accelerate");
  const higher = motion.action("higher");
  const phaseShift = motionFrame / fps;
  const fastScale = 0.66 + 0.1 * (1 - accelerate);
  return (
    <>
      <Header phase="wave" />
      <MotionGroup id="source-wave" index={0}>
        <Panel x={70} y={440} width={430} height={370} color={theme.accent}>
          <Label x={34} y={30} text="ИСПОЛЬЗУЕМ ВОЛНУ" color={theme.accent} size={19} />
          <Label x={34} y={88} text="ОДИН ПЕРИОД" color={theme.subtext} size={17} />
          <Waveform x={34} y={166} width={360} height={84} color={theme.accent} phaseShift={phaseShift} />
          <Label x={34} y={300} text="ШАГ КОЛЕБАНИЙ" color={theme.accent} />
        </Panel>
      </MotionGroup>
      <MotionGroup id="fast-wave" index={1} action={{ preset: "pulse", cue: "accelerate" }}>
        <Panel x={580} y={440} width={430} height={370} color={theme.danger}>
          <Label x={34} y={30} text="ПРОИГРАЛИ БЫСТРЕЕ" color={theme.danger} size={19} />
          <Label x={34} y={88} text="ПИКИ БЛИЖЕ" color={theme.subtext} size={17} />
          <Waveform x={34} y={166} width={360} height={84} color={theme.danger} scaleX={fastScale} phaseShift={phaseShift + 0.7} />
          <Label x={34} y={300} text="ТОН ↑" color={theme.danger} />
        </Panel>
      </MotionGroup>
      <MotionGroup id="higher" index={2} action={{ preset: "pulse", cue: "higher" }}>
        <div style={{ position: "absolute", left: 500, top: 600, width: 80, textAlign: "center", color: theme.danger, fontSize: 38, opacity: 0.7 + 0.3 * higher }}>→</div>
      </MotionGroup>
      <Badge text="УСКОРИЛИ САМУ ВОЛНУ → ВЫШЕ ТОН" color={theme.danger} />
      <PulseRing x={795} y={625} triggerFrame={impactFrame} tone="danger" size={220} />
    </>
  );
};

const FilmstripPhase: React.FC<{ impactFrame: number }> = ({ impactFrame }) => {
  const motion = useMotion();
  const joins = motion.action("compress");
  const gap = 42 - 25 * joins;
  const frameWidth = 190;
  const startX = (W - (frameWidth * 4 + gap * 3)) / 2;
  return (
    <>
      <Header phase="filmstrip" />
      <MotionGroup id="strip" index={0} action={{ preset: "transfer", cue: "compress", from: { x: -70, y: 0 }, to: { x: 0, y: 0 } }}>
        <Panel x={58} y={430} width={964} height={470} color={theme.accent2}>
          <Label x={36} y={28} text="КИНОПЛЁНКА" color={theme.accent2} size={20} />
          {[0, 1, 2, 3].map((index) => (
            <FilmFrame key={index} x={startX - 58 + index * (frameWidth + gap)} y={128} width={frameWidth} color={index === 2 ? theme.success : theme.accent2} index={index} />
          ))}
          <div style={{ position: "absolute", left: 36, right: 36, bottom: 38, borderTop: `3px dashed ${theme.accent2}88` }} />
        </Panel>
      </MotionGroup>
      <MotionGroup id="editor" index={1} action={{ preset: "pulse", cue: "compress" }}>
        <div style={{ position: "absolute", left: 438, top: 942, width: 204, height: 64, borderRadius: 16, border: `2px solid ${theme.warning}88`, background: `${theme.warning}14`, color: theme.warning, textAlign: "center", lineHeight: "60px", ...mono, fontSize: 18 }}>МОНТАЖЁР</div>
      </MotionGroup>
      <Badge text="ФРАГМЕНТЫ СБЛИЗИЛИ · КАДР НЕ РАСТЯНУЛИ" color={theme.accent2} />
      <PulseRing x={540} y={650} triggerFrame={impactFrame} tone="accent2" size={230} />
    </>
  );
};

const WindowsPhase: React.FC<{ impactFrame: number; motionFrame: number; fps: number }> = ({ impactFrame, motionFrame, fps }) => {
  const motion = useMotion();
  const reveal = motion.action("windows");
  const similar = motion.action("similar");
  const phaseShift = motionFrame / fps;
  const overlap = 70 * reveal;
  return (
    <>
      <Header phase="windows" />
      <Panel x={58} y={408} width={964} height={590} color={theme.accent}>
        <Label x={34} y={30} text="ДОРОЖКА РЕЧИ" color={theme.accent} size={20} />
        <Waveform x={72} y={140} width={820} height={92} color={theme.subtext} phaseShift={phaseShift} opacity={0.55} />
        <MotionGroup id="window-set" index={0} action={{ preset: "transfer", cue: "windows", to: { x: 24, y: 0 } }}>
          <Window x={80} y={300} width={275} color={theme.accent} label="ОКНО A" />
          <Window x={365 - overlap} y={300} width={275} color={theme.accent2} label="ОКНО B" opacity={0.82} />
          <Window x={650 - overlap * 2} y={300} width={275} color={theme.success} label="ОКНО C" opacity={0.72} />
        </MotionGroup>
        <MotionGroup id="match" index={1} action={{ preset: "pulse", cue: "similar" }}>
          <div style={{ position: "absolute", left: 390, top: 254, width: 242, height: 5, background: theme.warning, opacity: 0.5 + 0.5 * similar, borderRadius: 5 }} />
          <Label x={422} y={232} text="ПОХОЖАЯ ФОРМА" color={theme.warning} size={16} />
        </MotionGroup>
      </Panel>
      <Badge text="КОРОТКИЕ ОКНА · СОВПАДЕНИЕ · ВНАХЛЁСТ" color={theme.accent} />
      <PulseRing x={610} y={660} triggerFrame={impactFrame} tone="accent" size={230} />
    </>
  );
};

const PreservePhase: React.FC<{ impactFrame: number; motionFrame: number; fps: number }> = ({ impactFrame, motionFrame, fps }) => {
  const motion = useMotion();
  const unchanged = motion.action("unchanged");
  const shift = motion.action("shift");
  const overlap = motion.action("overlap");
  const phaseShift = motionFrame / fps;
  const step = 150 - 45 * shift;
  return (
    <>
      <Header phase="preserve" />
      <MotionGroup id="local-window" index={0} action={{ preset: "pulse", cue: "unchanged" }}>
        <Panel x={58} y={430} width={432} height={490} color={theme.warning}>
          <Label x={30} y={28} text="ВНУТРИ ОКНА" color={theme.warning} size={20} />
          <Label x={30} y={92} text="ЛОКАЛЬНЫЙ ПЕРИОД" color={theme.subtext} size={17} />
          <Waveform x={30} y={205} width={370} height={100} color={theme.warning} phaseShift={phaseShift} />
          <Label x={30} y={370} text="ШАГ НЕ МЕНЯЕТСЯ" color={theme.warning} />
        </Panel>
      </MotionGroup>
      <MotionGroup id="window-step" index={1} action={{ preset: "transfer", cue: "shift", from: { x: -40, y: 0 }, to: { x: 0, y: 0 } }}>
        <Panel x={548} y={430} width={474} height={490} color={theme.accent2}>
          <Label x={30} y={28} text="МЕЖДУ ОКНАМИ" color={theme.accent2} size={20} />
          <Label x={30} y={92} text="ШАГ СТАЛ МЕНЬШЕ" color={theme.subtext} size={17} />
          <Window x={36} y={164} width={120} color={theme.accent2} label="A" />
          <Window x={36 + step} y={164} width={120} color={theme.accent} label="B" opacity={0.82} />
          <Window x={36 + step * 2} y={164} width={120} color={theme.success} label="C" opacity={0.72} />
        </Panel>
      </MotionGroup>
      <MotionGroup id="overlap-zone" index={2} action={{ preset: "pulse", cue: "overlap" }}>
        <Label x={640} y={954} text="ПЕРЕКРЫТИЕ ↑" color={theme.success} size={18} />
      </MotionGroup>
      <Badge text="ЛОКАЛЬНЫЙ ПЕРИОД · СОХРАНЁН" color={theme.warning} />
      <PulseRing x={780} y={650} triggerFrame={impactFrame} tone="warning" size={220} />
    </>
  );
};

const ResultPhase: React.FC<{ impactFrame: number; motionFrame: number; fps: number }> = ({ impactFrame, motionFrame, fps }) => {
  const motion = useMotion();
  const falls = motion.action("falls");
  const tone = motion.action("tone");
  const phaseShift = motionFrame / fps;
  const shortWidth = 350 + 100 * (1 - falls);
  return (
    <>
      <Header phase="result" />
      <MotionGroup id="message" index={0} action={{ preset: "transfer", cue: "falls", from: { x: 0, y: 24 }, to: { x: 0, y: 0 } }}>
        <Panel x={58} y={410} width={964} height={560} color={theme.success}>
          <Label x={34} y={30} text="ОДНА И ТА ЖЕ РЕЧЬ" color={theme.subtext} size={19} />
          <Label x={72} y={128} text="1× · ДЛИННЕЕ" color={theme.accent} size={18} />
          <Waveform x={72} y={190} width={740} height={82} color={theme.accent} phaseShift={phaseShift} />
          <div style={{ position: "absolute", left: 72, top: 286, width: 740, borderTop: `3px dashed ${theme.subtext}66` }} />
          <Label x={72} y={346} text="2× · КОРОЧЕ" color={theme.success} size={18} />
          <Waveform x={72} y={408} width={shortWidth} height={82} color={theme.success} phaseShift={phaseShift + 0.3} />
          <div style={{ position: "absolute", left: 842, top: 182, height: 318, borderLeft: `3px solid ${theme.success}66` }} />
          <Label x={862} y={318} text="ТОН" color={theme.success} size={18} />
          <div style={{ position: "absolute", left: 862, top: 380, color: theme.success, ...mono, fontSize: 38, transform: `scale(${1 + 0.05 * tone})` }}>≡</div>
        </Panel>
      </MotionGroup>
      <Badge text="ВРЕМЯ ↓ · ЛОКАЛЬНЫЙ ТОН = ПРЕЖНИЙ" color={theme.success} />
      <PulseRing x={700} y={700} triggerFrame={impactFrame} tone="success" size={240} />
    </>
  );
};

export const AudioTimeStretchVisual: React.FC<Props> = ({ local, dur, fps, impactFrame, phase = "symptom" }) => {
  const motion = useMotion();
  const motionFrame = motion.frame;
  void local;
  void dur;
  switch (phase) {
    case "wave":
      return <WavePhase impactFrame={impactFrame} motionFrame={motionFrame} fps={fps} />;
    case "filmstrip":
      return <FilmstripPhase impactFrame={impactFrame} />;
    case "windows":
      return <WindowsPhase impactFrame={impactFrame} motionFrame={motionFrame} fps={fps} />;
    case "preserve":
      return <PreservePhase impactFrame={impactFrame} motionFrame={motionFrame} fps={fps} />;
    case "result":
      return <ResultPhase impactFrame={impactFrame} motionFrame={motionFrame} fps={fps} />;
    case "symptom":
    default:
      return <SymptomPhase impactFrame={impactFrame} motionFrame={motionFrame} fps={fps} />;
  }
};

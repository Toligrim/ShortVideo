import React from "react";
import { layout, theme } from "../lib/theme";
import { MotionGroup, useMotion } from "../lib/motion/MotionStage";
import { PulseRing } from "../lib/Motion";
import { Badge } from "../primitives/Badge";
import { IconGlyph } from "../primitives/IconGlyph";

export type ChargeEnergyPathPhase = "paradox" | "cell-rating" | "boost-loss" | "result";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: ChargeEnergyPathPhase;
  capacity?: string;
  voltage?: string;
  energy?: string;
  idealOutput?: string;
  realOutput?: string;
  outputVoltage?: string;
}

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const panel = (color: string): React.CSSProperties => ({
  position: "absolute",
  boxSizing: "border-box",
  borderRadius: 26,
  background: `${theme.panel}F2`,
  border: `3px solid ${color}77`,
  boxShadow: `0 0 40px ${color}1F`,
});

const Arrow: React.FC<{ x1: number; y1: number; x2: number; y2: number; color: string; progress: number }> = ({
  x1,
  y1,
  x2,
  y2,
  color,
  progress,
}) => (
  <svg width={W} height={layout.height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
    <path
      d={`M ${x1} ${y1} L ${x2} ${y2}`}
      fill="none"
      stroke={color}
      strokeWidth={6}
      strokeLinecap="round"
      strokeDasharray="16 14"
      strokeDashoffset={-progress * 28}
      opacity={0.75}
    />
    <path d={`M ${x2} ${y2} l -18 -10 M ${x2} ${y2} l -18 10`} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" />
  </svg>
);

const BatteryPack: React.FC<{ left: number; top: number; width: number; height: number; label: string; color: string }> = ({
  left,
  top,
  width,
  height,
  label,
  color,
}) => (
  <div style={{ ...panel(color), left, top, width, height }} data-motion-shape>
    <div style={{ position: "absolute", left: width / 2 - 36, top: -22, width: 72, height: 23, borderRadius: "10px 10px 0 0", background: `${color}66`, border: `3px solid ${color}AA`, borderBottom: "none" }} />
    <div style={{ position: "absolute", left: 28, top: 28, color, fontSize: 22, ...mono }}>ЯЧЕЙКИ Li-ion</div>
    <div style={{ position: "absolute", left: 30, right: 30, top: 90, height: height - 166, display: "flex", alignItems: "stretch", gap: 12 }}>
      {[0, 1, 2, 3].map((cell) => (
        <div key={cell} style={{ flex: 1, borderRadius: 12, border: `2px solid ${color}99`, background: `linear-gradient(180deg, ${color}66, ${color}16)` }} />
      ))}
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 27, textAlign: "center", color: theme.text, fontSize: 28, ...mono }}>{label}</div>
  </div>
);

const Phone: React.FC<{ left: number; top: number; width: number; height: number; value: string; opacity?: number }> = ({
  left,
  top,
  width,
  height,
  value,
  opacity = 1,
}) => (
  <div style={{ ...panel(theme.accent), left, top, width, height, opacity }} data-motion-shape>
    <div style={{ position: "absolute", left: width / 2 - 30, top: 12, width: 60, height: 8, borderRadius: 10, background: theme.panelBorder }} />
    <div style={{ position: "absolute", left: 24, right: 24, top: 48, bottom: 46, borderRadius: 18, border: `2px solid ${theme.accent}88`, background: `${theme.accent}0C`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
      <IconGlyph name="smartphone" size={48} color={theme.accent} strokeWidth={1.7} />
      <div style={{ color: theme.text, fontSize: 27, textAlign: "center", ...mono }}>{value}</div>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 14, textAlign: "center", color: theme.accent, fontSize: 20, ...mono }}>ТЕЛЕФОН</div>
  </div>
);

export const ChargeEnergyPathVisual: React.FC<Props> = ({
  impactLocal,
  phase = "paradox",
  capacity = "20 000 мА·ч",
  voltage = "3,7 В",
  energy = "74 Вт·ч",
  idealOutput = "14 800 мА·ч",
  realOutput = "≈12 600 мА·ч",
  outputVoltage = "5 В",
}) => {
  const motion = useMotion();

  if (phase === "paradox") {
    const shortfall = smooth(motion.action("shortfall", 0.7));
    return (
      <>
        <MotionGroup id="package" index={0} action={{ preset: "pulse", cue: "show" }}>
          <div style={{ ...panel(theme.accent2), left: 80, top: 470, width: 390, height: 330 }} data-motion-shape>
            <IconGlyph name="package" size={70} color={theme.accent2} strokeWidth={1.6} />
            <div style={{ position: "absolute", left: 0, right: 0, top: 112, textAlign: "center", color: theme.accent2, fontSize: 24, ...mono }}>НА КОРОБКЕ</div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 48, textAlign: "center", color: theme.text, fontSize: 38, ...mono }}>{capacity}</div>
          </div>
        </MotionGroup>
        <Arrow x1={485} y1={635} x2={620} y2={635} color={theme.warning} progress={shortfall} />
        <MotionGroup id="phone" index={1} action={{ preset: "recoil", cue: "shortfall", to: { x: 18, y: 0 } }}>
          <Phone left={630} top={415} width={330} height={500} value={shortfall > 0.45 ? realOutput : "?"} />
        </MotionGroup>
        <Badge label="ЦИФРА ≠ ВЫХОД" x={W / 2} y={1200} tone="warning" enterFrame={0} />
        <PulseRing x={795} y={665} triggerFrame={impactLocal} tone="warning" size={220} />
      </>
    );
  }

  if (phase === "cell-rating") {
    const rate = smooth(motion.action("rate", 0.3));
    const energyP = smooth(motion.action("energy", 0.7));
    return (
      <>
        <MotionGroup id="cells" index={0} action={{ preset: "transfer", cue: "rate", from: { x: -100, y: 0 }, to: { x: 0, y: 0 } }}>
          <BatteryPack left={65} top={475} width={390} height={360} label={capacity} color={theme.accent2} />
        </MotionGroup>
        <Arrow x1={475} y1={655} x2={535} y2={655} color={theme.accent} progress={rate} />
        <MotionGroup id="formula" index={1} action={{ preset: "pulse", cue: "energy" }}>
          <div style={{ ...panel(theme.success), left: 545, top: 475, width: 470, height: 360 }} data-motion-shape>
            <div style={{ position: "absolute", left: 0, right: 0, top: 40, textAlign: "center", color: theme.success, fontSize: 24, ...mono }}>ЗАРЯД × НАПРЯЖЕНИЕ</div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 125, textAlign: "center", color: theme.text, fontSize: 31, ...mono }}>{capacity} × {voltage}</div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 52, textAlign: "center", color: theme.success, fontSize: 43, ...mono, opacity: 0.35 + energyP * 0.65 }}>{energy}</div>
          </div>
        </MotionGroup>
        <Badge label="Q × V = Вт·ч" x={W / 2} y={1200} tone="success" enterFrame={0} />
        <PulseRing x={780} y={655} triggerFrame={impactLocal} tone="success" size={210} />
      </>
    );
  }

  if (phase === "boost-loss") {
    const boost = smooth(motion.action("boost", 0.3));
    const dotProgress = Math.max(0.04, boost);
    const dot = (i: number) => {
      const t = (dotProgress + i * 0.17) % 1;
      if (t < 0.5) return { x: 330 + t * 150, y: 660 };
      return { x: 405 + (t - 0.5) * 600, y: 660 };
    };
    return (
      <>
        <MotionGroup id="source" index={0} action={{ preset: "pulse", cue: "boost" }}>
          <BatteryPack left={40} top={505} width={270} height={320} label={voltage} color={theme.accent2} />
        </MotionGroup>
        <MotionGroup id="converter" index={1} action={{ preset: "pulse", cue: "boost" }}>
          <div style={{ ...panel(theme.warning), left: 370, top: 560, width: 250, height: 210 }} data-motion-shape>
            <IconGlyph name="zap" size={54} color={theme.warning} strokeWidth={1.7} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 34, textAlign: "center", color: theme.warning, fontSize: 24, ...mono }}>BOOST</div>
          </div>
        </MotionGroup>
        <MotionGroup id="output" index={2} action={{ preset: "transfer", cue: "usb", from: { x: 45, y: 0 }, to: { x: 0, y: 0 } }}>
          <Phone left={720} top={475} width={300} height={380} value={`USB · ${outputVoltage}`} />
        </MotionGroup>
        <MotionGroup id="flow" index={3} action={{ preset: "transfer", cue: "boost", from: { x: -30, y: 0 }, to: { x: 30, y: 0 } }}>
          <svg width={W} height={layout.height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <path d="M 310 660 H 720" fill="none" stroke={`${theme.success}66`} strokeWidth={5} strokeDasharray="18 15" />
            {Array.from({ length: 5 }).map((_, i) => {
              const p = dot(i);
              return <circle key={i} data-motion-shape cx={p.x} cy={p.y} r={11} fill={theme.success} opacity={0.55 + 0.1 * i} />;
            })}
          </svg>
        </MotionGroup>
        <PulseRing x={870} y={665} triggerFrame={impactLocal} tone="accent" size={210} />
      </>
    );
  }

  const loss = smooth(motion.action("loss", 0.7));
  const realValue = loss > 0.5 ? realOutput : idealOutput;
  return (
    <>
      <MotionGroup id="ideal" index={0} action={{ preset: "pulse", cue: "ideal" }}>
        <div style={{ ...panel(theme.accent2), left: 55, top: 485, width: 440, height: 340 }} data-motion-shape>
          <div style={{ position: "absolute", left: 0, right: 0, top: 38, textAlign: "center", color: theme.accent2, fontSize: 25, ...mono }}>ИДЕАЛЬНО</div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 120, textAlign: "center", color: theme.text, fontSize: 39, ...mono }}>{energy}</div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 48, textAlign: "center", color: theme.accent2, fontSize: 32, ...mono }}>{idealOutput}</div>
        </div>
      </MotionGroup>
      <MotionGroup id="real" index={1} action={{ preset: "transfer", cue: "loss", from: { x: 80, y: 0 }, to: { x: 0, y: 0 } }}>
        <div style={{ ...panel(theme.success), left: 585, top: 485, width: 440, height: 340 }} data-motion-shape>
          <div style={{ position: "absolute", left: 0, right: 0, top: 38, textAlign: "center", color: theme.success, fontSize: 25, ...mono }}>USB-ВЫХОД</div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 120, textAlign: "center", color: theme.text, fontSize: 39, ...mono }}>{realValue}</div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 48, textAlign: "center", color: theme.success, fontSize: 25, ...mono }}>ПОСЛЕ ПРЕОБРАЗОВАНИЯ</div>
        </div>
      </MotionGroup>
      <MotionGroup id="loss" index={2} action={{ preset: "depart", cue: "loss", to: { x: 0, y: 105 } }}>
        <div style={{ position: "absolute", left: W / 2, top: 895, transform: "translateX(-50%)", color: theme.warning, fontSize: 28, ...mono }} data-motion-shape>
          −15% ЭНЕРГИИ
        </div>
      </MotionGroup>
      <Badge label="ПОТЕРИ УМЕНЬШАЮТ ВЫХОД" x={W / 2} y={1200} tone="warning" enterFrame={0} />
      <PulseRing x={805} y={655} triggerFrame={impactLocal} tone="success" size={220} />
    </>
  );
};

export default ChargeEnergyPathVisual;

import React from "react";
import { layout, theme } from "../lib/theme";
import { MotionGroup, useMotion } from "../lib/motion/MotionStage";
import { PulseRing } from "../lib/Motion";
import { Badge } from "../primitives/Badge";
import { IconGlyph } from "../primitives/IconGlyph";

export type BinaryFractionRoundingPhase = "symptom" | "grid" | "repeat" | "round" | "sum" | "exact";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: BinaryFractionRoundingPhase;
}

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };
const panel = (color: string): React.CSSProperties => ({
  position: "absolute",
  boxSizing: "border-box",
  borderRadius: 26,
  background: `${theme.panel}F2`,
  border: `3px solid ${color}88`,
  boxShadow: `0 18px 48px ${color}20`,
});

const phaseTitle: Record<BinaryFractionRoundingPhase, string> = {
  symptom: "ЭКРАН ПОКАЗЫВАЕТ ХВОСТ",
  grid: "КОНЕЧНАЯ ДВОИЧНАЯ ШКАЛА",
  repeat: "ДРОБЬ ПОВТОРЯЕТСЯ",
  round: "БЛИЖАЙШЕЕ ПРЕДСТАВИМОЕ",
  sum: "СУММА ДВУХ ПРИБЛИЖЕНИЙ",
  exact: "ДЛЯ ДЕНЕГ — ТОЧНО",
};

const phaseColor: Record<BinaryFractionRoundingPhase, string> = {
  symptom: theme.danger,
  grid: theme.accent,
  repeat: theme.accent2,
  round: theme.warning,
  sum: theme.danger,
  exact: theme.success,
};

const phaseIcon: Record<BinaryFractionRoundingPhase, string> = {
  symptom: "terminal",
  grid: "ruler",
  repeat: "repeat-2",
  round: "scissors",
  sum: "plus",
  exact: "coins",
};

const Header: React.FC<{ phase: BinaryFractionRoundingPhase }> = ({ phase }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 225,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: phaseColor[phase],
      fontSize: 22,
      whiteSpace: "nowrap",
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={29} color={phaseColor[phase]} strokeWidth={1.8} />
    {phaseTitle[phase]}
  </div>
);

const Label: React.FC<{ left: number; top: number; text: string; color?: string; size?: number }> = ({
  left,
  top,
  text,
  color = theme.subtext,
  size = 20,
}) => (
  <div style={{ position: "absolute", left, top, color, fontSize: size, whiteSpace: "nowrap", ...mono }}>
    {text}
  </div>
);

const SymptomPhase: React.FC<{ impactLocal: number }> = ({ impactLocal }) => (
  <>
    <MotionGroup id="screen" index={0} action={{ preset: "pulse", cue: "screen" }}>
      <div style={{ ...panel(theme.danger), left: 70, top: 445, width: 940, height: 340, background: "#090D14" }} data-motion-shape>
        <div style={{ position: "absolute", left: 30, top: 24, color: theme.danger, fontSize: 22, ...mono }}>JS · CONSOLE</div>
        <div style={{ position: "absolute", left: 48, top: 105, color: theme.subtext, fontSize: 29, ...mono }}>0.1 + 0.2 =</div>
        <div style={{ position: "absolute", left: 48, top: 190, color: theme.text, fontSize: 42, ...mono }}>0.30000000000000004</div>
      </div>
    </MotionGroup>
    <MotionGroup id="tail" index={1} action={{ preset: "pulse", cue: "tail" }}>
      <div style={{ position: "absolute", left: 758, top: 618, color: theme.warning, fontSize: 42, ...mono }} data-motion-shape>
        00000004
      </div>
    </MotionGroup>
    <MotionGroup id="question" index={2} action={{ preset: "pulse", cue: "question" }}>
      <div style={{ position: "absolute", left: 900, top: 350, color: theme.warning, fontSize: 100, lineHeight: 1 }} data-motion-shape>
        ?
      </div>
    </MotionGroup>
    <Badge label="ДЛИННЫЙ ХВОСТ" x={W / 2} y={1200} tone="warning" />
    <PulseRing x={820} y={650} triggerFrame={impactLocal} tone="danger" size={220} />
  </>
);

const GridPhase: React.FC<{ impactLocal: number }> = ({ impactLocal }) => {
  const ticks = [120, 260, 400, 540, 680, 820, 960];
  return (
    <>
      <MotionGroup id="ruler" index={0} action={{ preset: "pulse", cue: "mechanism" }}>
        <div style={{ ...panel(theme.accent), left: 58, top: 455, width: 964, height: 420 }} data-motion-shape>
          <Label left={34} top={30} text="ДЕЛЕНИЯ" color={theme.accent} />
          <div style={{ position: "absolute", left: 62, right: 62, top: 210, height: 8, borderRadius: 8, background: `${theme.subtext}66` }}>
            {ticks.map((x, index) => (
              <div key={x} style={{ position: "absolute", left: x - 120, top: index % 2 ? -18 : -34, width: 4, height: index % 2 ? 42 : 74, borderRadius: 4, background: theme.accent, opacity: 0.75 }} />
            ))}
          </div>
          <Label left={62} top={260} text="0" size={18} />
          <Label left={500} top={260} text="0,1" color={theme.text} size={26} />
          <Label left={906} top={260} text="1" size={18} />
          <Label left={285} top={330} text="доступные двоичные отметки" size={18} />
        </div>
      </MotionGroup>
      <MotionGroup id="pointer" index={1} action={{ preset: "transfer", cue: "nearest", to: { x: 140, y: 0 } }}>
        <div style={{ position: "absolute", left: 400, top: 590, color: theme.warning, fontSize: 26, ...mono }} data-motion-shape>
          <div style={{ width: 0, height: 0, borderLeft: "14px solid transparent", borderRight: "14px solid transparent", borderBottom: `25px solid ${theme.warning}`, transform: "translateX(-12px)" }} />
          <div style={{ marginTop: 12, marginLeft: -25, whiteSpace: "nowrap" }}>0,1</div>
        </div>
      </MotionGroup>
      <MotionGroup id="marker" index={2} action={{ preset: "pulse", cue: "nearest" }}>
        <div style={{ position: "absolute", left: 540, top: 625, width: 46, height: 46, borderRadius: "50%", border: `4px solid ${theme.success}`, boxShadow: `0 0 30px ${theme.success}88` }} data-motion-shape />
      </MotionGroup>
      <Badge label="БЛИЖАЙШАЯ ОТМЕТКА" x={W / 2} y={1200} tone="success" />
      <PulseRing x={540} y={645} triggerFrame={impactLocal} tone="success" size={210} />
    </>
  );
};

const RepeatPhase: React.FC<{ motion: ReturnType<typeof useMotion>; impactLocal: number }> = ({ motion, impactLocal }) => {
  const repeat = motion.action("repeat", 0.6);
  return (
    <>
      <MotionGroup id="fraction" index={0} action={{ preset: "pulse", cue: "fraction" }}>
        <div style={{ ...panel(theme.accent2), left: 48, top: 470, width: 984, height: 300 }} data-motion-shape>
          <Label left={34} top={32} text="0,1 В ДВОИЧНОМ ВИДЕ" color={theme.accent2} size={21} />
          <div style={{ position: "absolute", left: 34, top: 126, color: theme.text, fontSize: 39, ...mono, whiteSpace: "nowrap" }}>
            0 . 0001&nbsp; 1001&nbsp; 1001&nbsp; 1001 …
          </div>
        </div>
      </MotionGroup>
      <MotionGroup id="cycle" index={1} action={{ preset: "pulse", cue: "repeat" }}>
        <div style={{ position: "absolute", left: 530, top: 584, width: 448, height: 78, border: `3px solid ${theme.warning}`, borderRadius: 16, opacity: 0.45 + repeat * 0.55 }} data-motion-shape />
      </MotionGroup>
      <MotionGroup id="loop" index={2} action={{ preset: "transfer", cue: "repeat", from: { x: -110, y: 15 }, to: { x: 0, y: 0 } }}>
        <svg width={W} height={layout.height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} data-motion-shape>
          <path d="M 925 705 C 925 800 545 800 545 705" fill="none" stroke={theme.warning} strokeWidth={5} strokeDasharray="14 12" opacity={0.35 + repeat * 0.65} />
          <path d="M 545 705 l 18 -11 M 545 705 l 18 11" fill="none" stroke={theme.warning} strokeWidth={5} strokeLinecap="round" opacity={0.35 + repeat * 0.65} />
        </svg>
      </MotionGroup>
      <Badge label="ЦИКЛ 1001" x={W / 2} y={1200} tone="warning" />
      <PulseRing x={745} y={625} triggerFrame={impactLocal} tone="accent2" size={210} />
    </>
  );
};

const RoundPhase: React.FC<{ motion: ReturnType<typeof useMotion>; impactLocal: number }> = ({ motion, impactLocal }) => {
  const rounded = motion.action("round", 0.3);
  const saved = motion.action("saved", 0.7);
  const more = motion.action("more", 0.8);
  return (
    <>
      <MotionGroup id="tail" index={0} action={{ preset: "depart", cue: "round", to: { x: 0, y: 105 } }}>
        <div style={{ ...panel(theme.accent2), left: 55, top: 475, width: 410, height: 310 }} data-motion-shape>
          <Label left={28} top={30} text="БЕСКОНЕЧНЫЙ ХВОСТ" color={theme.accent2} size={20} />
          <div style={{ position: "absolute", left: 25, right: 20, top: 125, color: theme.text, fontSize: 26, ...mono, whiteSpace: "nowrap" }}>
            0.0001 1001 1001…
          </div>
        </div>
      </MotionGroup>
      <div style={{ position: "absolute", left: 495, top: 570, color: theme.warning, opacity: 0.35 + rounded * 0.65 }}>
        <IconGlyph name="scissors" size={82} color={theme.warning} strokeWidth={1.5} />
      </div>
      <MotionGroup id="stored" index={1} action={{ preset: "transfer", cue: "round", from: { x: -120, y: 0 }, to: { x: 0, y: 0 } }}>
        <div style={{ ...panel(theme.success), left: 615, top: 475, width: 410, height: 310, opacity: 0.35 + saved * 0.65 }} data-motion-shape>
          <Label left={28} top={30} text="СОХРАНЕНО" color={theme.success} size={20} />
          <div style={{ position: "absolute", left: 22, right: 22, top: 112, color: theme.text, fontSize: 24, ...mono, whiteSpace: "nowrap" }}>
            0.10000000000000000555…
          </div>
        </div>
      </MotionGroup>
      <MotionGroup id="compare" index={2} action={{ preset: "pulse", cue: "more" }}>
        <div style={{ position: "absolute", left: 390, top: 865, color: theme.warning, fontSize: 28, opacity: 0.35 + more * 0.65, ...mono }} data-motion-shape>
          0,1 &lt; сохранённое
        </div>
      </MotionGroup>
      <Badge label="ПРИБЛИЖЕНИЕ" x={W / 2} y={1200} tone="warning" />
      <PulseRing x={820} y={630} triggerFrame={impactLocal} tone="warning" size={210} />
    </>
  );
};

const SumPhase: React.FC<{ motion: ReturnType<typeof useMotion>; impactLocal: number }> = ({ motion, impactLocal }) => {
  const exact = motion.action("exact", 0.45);
  const tail = motion.action("tail", 0.8);
  return (
    <>
      <MotionGroup id="left" index={0} action={{ preset: "transfer", cue: "add", to: { x: 170, y: 50 } }}>
        <div style={{ ...panel(theme.accent), left: 36, top: 425, width: 320, height: 205 }} data-motion-shape>
          <Label left={24} top={24} text="0,1 ≈" color={theme.accent} size={23} />
          <div style={{ position: "absolute", left: 20, top: 100, color: theme.text, fontSize: 20, ...mono, whiteSpace: "nowrap" }}>0.100000000000…</div>
        </div>
      </MotionGroup>
      <MotionGroup id="right" index={1} action={{ preset: "transfer", cue: "add", to: { x: -170, y: 50 } }}>
        <div style={{ ...panel(theme.accent2), left: 724, top: 425, width: 320, height: 205 }} data-motion-shape>
          <Label left={24} top={24} text="0,2 ≈" color={theme.accent2} size={23} />
          <div style={{ position: "absolute", left: 20, top: 100, color: theme.text, fontSize: 20, ...mono, whiteSpace: "nowrap" }}>0.200000000000…</div>
        </div>
      </MotionGroup>
      <MotionGroup id="adder" index={2} action={{ preset: "pulse", cue: "exact" }}>
        <div style={{ ...panel(theme.warning), left: 405, top: 570, width: 270, height: 160 }} data-motion-shape>
          <div style={{ position: "absolute", left: 0, right: 0, top: 39, textAlign: "center", color: theme.warning, fontSize: 58, ...mono }}>+</div>
          <Label left={73} top={112} text="ТОЧНАЯ СУММА" color={theme.text} size={17} />
        </div>
      </MotionGroup>
      <MotionGroup id="choice" index={3} action={{ preset: "transfer", cue: "tie", from: { x: 0, y: 80 }, to: { x: 0, y: 0 } }}>
        <div style={{ ...panel(theme.danger), left: 48, top: 820, width: 984, height: 285 }} data-motion-shape>
          <Label left={32} top={24} text="РОВНО МЕЖДУ ДВУМЯ ОТМЕТКАМИ" color={theme.danger} size={20} />
          <div style={{ position: "absolute", left: 112, right: 112, top: 130, height: 5, borderRadius: 5, background: `${theme.subtext}66` }}>
            <div style={{ position: "absolute", left: 0, top: -19, width: 4, height: 42, borderRadius: 4, background: theme.subtext }} />
            <div style={{ position: "absolute", left: "50%", top: -28, width: 5, height: 60, borderRadius: 5, background: theme.warning, opacity: 0.35 + exact * 0.65 }} />
            <div style={{ position: "absolute", right: 0, top: -19, width: 4, height: 42, borderRadius: 4, background: theme.success, opacity: 0.35 + tail * 0.65 }} />
          </div>
          <Label left={28} top={174} text="нижняя · …0111" color={theme.subtext} size={17} />
          <Label left={374} top={92} text="точная сумма" color={theme.warning} size={19} />
          <Label left={500} top={174} text="верхняя · 0.30000000000000004" color={theme.success} size={16} />
          <div style={{ position: "absolute", left: 286, bottom: 24, color: theme.success, fontSize: 18, ...mono, opacity: 0.35 + exact * 0.65 }}>при ничьей → младший бит = 0</div>
        </div>
      </MotionGroup>
      <PulseRing x={540} y={650} triggerFrame={impactLocal} tone="danger" size={220} />
    </>
  );
};

const ExactPhase: React.FC<{ motion: ReturnType<typeof useMotion>; impactLocal: number }> = ({ motion, impactLocal }) => {
  const decimal = motion.action("decimal", 0.7);
  return (
    <>
      <MotionGroup id="money" index={0} action={{ preset: "transfer", cue: "money", from: { x: -100, y: 0 }, to: { x: 0, y: 0 } }}>
        <div style={{ ...panel(theme.accent), left: 58, top: 460, width: 450, height: 320 }} data-motion-shape>
          <IconGlyph name="coins" size={62} color={theme.accent} strokeWidth={1.6} />
          <Label left={28} top={120} text="ЦЕЛЫЕ КОПЕЙКИ" color={theme.accent} size={24} />
          <div style={{ position: "absolute", left: 28, top: 205, color: theme.text, fontSize: 34, ...mono }}>10 + 20 = 30</div>
        </div>
      </MotionGroup>
      <MotionGroup id="decimal" index={1} action={{ preset: "pulse", cue: "decimal" }}>
        <div style={{ ...panel(theme.success), left: 572, top: 460, width: 450, height: 320, opacity: 0.45 + decimal * 0.55 }} data-motion-shape>
          <Label left={28} top={36} text="DECIMAL" color={theme.success} size={28} />
          <div style={{ position: "absolute", left: 28, top: 132, color: theme.text, fontSize: 34, ...mono }}>0,10 + 0,20 = 0,30</div>
          <Label left={28} top={238} text="ТОЧНО" color={theme.success} size={24} />
        </div>
      </MotionGroup>
      <Badge label="КОПЕЙКИ · DECIMAL" x={W / 2} y={1200} tone="success" />
      <PulseRing x={800} y={620} triggerFrame={impactLocal} tone="success" size={210} />
    </>
  );
};

export const BinaryFractionRoundingVisual: React.FC<Props> = ({ phase = "symptom", impactLocal }) => {
  const motion = useMotion();
  return (
    <>
      <Header phase={phase} />
      {phase === "symptom" ? <SymptomPhase impactLocal={impactLocal} /> : null}
      {phase === "grid" ? <GridPhase impactLocal={impactLocal} /> : null}
      {phase === "repeat" ? <RepeatPhase motion={motion} impactLocal={impactLocal} /> : null}
      {phase === "round" ? <RoundPhase motion={motion} impactLocal={impactLocal} /> : null}
      {phase === "sum" ? <SumPhase motion={motion} impactLocal={impactLocal} /> : null}
      {phase === "exact" ? <ExactPhase motion={motion} impactLocal={impactLocal} /> : null}
    </>
  );
};

export default BinaryFractionRoundingVisual;

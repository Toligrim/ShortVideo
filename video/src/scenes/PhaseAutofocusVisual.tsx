import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";
import { MotionGroup, useMotion } from "../lib/motion/MotionStage";

export type PhaseAutofocusPhase = "symptom" | "split" | "compare" | "drive" | "scale" | "contrast";
export type PhaseAutofocusVariant = "intake" | "slices" | "generic" | "sony";

interface Props { local: number; fps: number; impactLocal: number; phase?: PhaseAutofocusPhase; variant?: PhaseAutofocusVariant; }
const W = layout.width;
const H = layout.height;
const CX = W / 2;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1.1 };

const phaseTitle: Record<PhaseAutofocusPhase, string> = {
  symptom: "СИМПТОМ · РЕЗКОСТЬ ПОЧТИ СРАЗУ",
  split: "СЕНСОР · ДВА СРЕЗА СВЕТА",
  compare: "СРАВНЕНИЕ · СДВИГ РИСУНКА",
  drive: "ПРИВОД · НАПРАВЛЕНИЕ И ШАГ",
  scale: "МОБИЛЬНЫЙ ПРИМЕР · 192 ТОЧКИ",
  contrast: "ЧЕСТНЫЙ КОНТРАСТ · ПОИСК МАКСИМУМА",
};
const phaseColor: Record<PhaseAutofocusPhase, string> = {
  symptom: theme.accent, split: theme.accent2, compare: theme.warning,
  drive: theme.success, scale: theme.accent, contrast: theme.danger,
};
const phaseIcon: Record<PhaseAutofocusPhase, string> = {
  symptom: "camera", split: "scan-line", compare: "git-compare-arrows",
  drive: "move-horizontal", scale: "grid-2x2", contrast: "search",
};
const phaseBadge: Record<PhaseAutofocusPhase, string> = {
  symptom: "ЛИНЗА СДВИНУЛАСЬ · МАЛЫЙ ШАГ",
  split: "ОДНА МИКРОЛИНЗА · ДВЕ ПОЛОВИНЫ",
  compare: "СДВИГ ΔΦ → ИЗМЕРИМЫЙ",
  drive: "ПРИВОД ПОЛУЧИЛ СТОРОНУ И ВЕЛИЧИНУ",
  scale: "ПРИМЕР СЕНСОРА С ФАЗОВЫМИ ТОЧКАМИ",
  contrast: "КОНТРАСТНЫЙ ПОИСК МОЖЕТ ОХОТИТЬСЯ",
};

const Header: React.FC<{ phase: PhaseAutofocusPhase; opacity: number }> = ({ phase, opacity }) => (
  <div style={{ position: "absolute", left: CX, top: 300, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12, color: phaseColor[phase], opacity, whiteSpace: "nowrap", fontSize: 23, ...mono }}>
    <IconGlyph name={phaseIcon[phase]} size={30} color={phaseColor[phase]} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const Badge: React.FC<{ phase: PhaseAutofocusPhase; opacity: number; pop: number }> = ({ phase, opacity, pop }) => (
  <div style={{ position: "absolute", left: 64, top: 1190, width: 952, minHeight: 76, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: "13px 24px", borderRadius: 999, background: `${phaseColor[phase]}16`, border: `3px solid ${phaseColor[phase]}99`, color: phaseColor[phase], opacity, transform: `scale(${0.97 + pop * 0.03})`, boxShadow: `0 0 34px ${phaseColor[phase]}22`, whiteSpace: "nowrap", fontSize: 21, ...mono }}>
    {phaseBadge[phase]}
  </div>
);

const Label: React.FC<{ x: number; y: number; children: React.ReactNode; color?: string; size?: number; anchor?: "start" | "middle" | "end"; opacity?: number }> = ({ x, y, children, color = theme.subtext, size = 20, anchor = "start", opacity = 1 }) => (
  <text x={x} y={y} fill={color} fontFamily={theme.mono} fontSize={size} fontWeight={800} textAnchor={anchor} opacity={opacity}>{children}</text>
);

const Panel: React.FC<{ color: string }> = ({ color }) => (
  <div style={{ position: "absolute", left: 58, top: 390, width: 964, height: 680, borderRadius: 30, background: `${theme.panel}E8`, border: `3px solid ${color}77`, boxShadow: `0 0 38px ${color}1C`, overflow: "hidden" }} />
);

const Arrow: React.FC<{ x1: number; y1: number; x2: number; y2: number; color: string; label?: string; opacity?: number }> = ({ x1, y1, x2, y2, color, label, opacity = 1 }) => {
  const dx = x2 - x1; const dy = y2 - y1; const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length; const uy = dy / length; const px = -uy; const py = ux;
  const points = [[x2, y2], [x2 - ux * 21 + px * 10, y2 - uy * 21 + py * 10], [x2 - ux * 21 - px * 10, y2 - uy * 21 - py * 10]].map(([x, y]) => `${x},${y}`).join(" ");
  return <g opacity={opacity}><line x1={x1} y1={y1} x2={x2 - ux * 8} y2={y2 - uy * 8} stroke={color} strokeWidth={6} strokeLinecap="round" /><polygon points={points} fill={color} />{label ? <Label x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 17} color={color} size={19} anchor="middle">{label}</Label> : null}</g>;
};

const Face: React.FC<{ cx: number; cy: number; color: string; opacity?: number }> = ({ cx, cy, color, opacity = 1 }) => (
  <g opacity={opacity}><circle cx={cx} cy={cy} r={108} fill={`${color}12`} stroke={color} strokeWidth={5} /><circle cx={cx - 35} cy={cy - 14} r={9} fill={color} /><circle cx={cx + 35} cy={cy - 14} r={9} fill={color} /><path d={`M ${cx - 44} ${cy + 38} Q ${cx} ${cy + 69} ${cx + 44} ${cy + 38}`} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" /><Label x={cx} y={cy + 157} color={color} size={19} anchor="middle">ЛИЦО / ОБЪЕКТ</Label></g>
);

const Pattern: React.FC<{ x: number; y: number; color: string; opacity?: number; scale?: number }> = ({ x, y, color, opacity = 1, scale = 1 }) => {
  const bars = [42, 80, 26, 68, 50, 92];
  return <g opacity={opacity} transform={`translate(${x} ${y}) scale(${scale})`}>{bars.map((height, index) => <rect key={index} x={index * 78} y={46 - height / 2} width={28} height={height} rx={8} fill={color} />)}</g>;
};

const SensorHalf: React.FC<{ x: number; y: number; width: number; color: string; label: string; opacity?: number }> = ({ x, y, width, color, label, opacity = 1 }) => (
  <g opacity={opacity}><rect x={x} y={y} width={width} height={180} rx={18} fill={`${color}12`} stroke={color} strokeWidth={4} /><circle cx={x + width / 2} cy={y + 90} r={42} fill={`${color}25`} stroke={color} strokeWidth={5} /><Label x={x + width / 2} y={y + 238} color={color} size={19} anchor="middle">{label}</Label></g>
);

const MotionSvg: React.FC<{ children: React.ReactNode }> = ({ children }) => <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>{children}</svg>;

const SymptomBody: React.FC = () => {
  const motion = useMotion(); const lock = motion.action("lock");
  return <><Panel color={theme.accent} />
    <MotionGroup id="phone" index={0}><div data-motion-shape style={{ position: "absolute", left: 125, top: 485 }}><svg width="360" height="480" viewBox="0 0 360 480"><rect x="4" y="4" width="352" height="472" rx="42" fill={`${theme.bg}CC`} stroke={theme.accent} strokeWidth="6" /><rect x="34" y="72" width="292" height="320" rx="22" fill="#090D15" stroke={`${theme.accent}66`} strokeWidth="4" /><rect x="136" y="28" width="88" height="14" rx="7" fill={theme.panelBorder} /><Label x={180} y={445} color={theme.accent} size={19} anchor="middle">ТЕЛЕФОН</Label></svg></div></MotionGroup>
    <MotionGroup id="subject" index={1}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><Face cx={305} cy={712} color={theme.success} /></MotionSvg></div></MotionGroup>
    <MotionGroup id="lens" index={2} action={{ preset: "transfer", cue: "shift", from: { x: -8, y: 0 }, to: { x: 8, y: 0 } }}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><circle cx={305} cy={535} r={42} fill={`${theme.accent2}30`} stroke={theme.accent2} strokeWidth={6} /><ellipse cx={305} cy={535} rx={18} ry={32} fill={`${theme.accent}66`} stroke={theme.accent} strokeWidth={4} /><Label x={305} y={605} color={theme.accent2} size={18} anchor="middle">ЛИНЗА</Label><Arrow x1={380} y1={535} x2={640} y2={600} color={theme.accent2} label="фокус" opacity={0.8} /></MotionSvg></div></MotionGroup>
    <MotionGroup id="focus" index={3} action={{ preset: "pulse", cue: "lock" }}><div data-motion-shape style={{ position: "absolute", inset: 0, opacity: 0.8 + lock * 0.2 }}><MotionSvg><circle cx={305} cy={712} r={143} fill="none" stroke={theme.success} strokeWidth={5} strokeDasharray="18 12" /></MotionSvg></div></MotionGroup>
    <MotionSvg><Label x={710} y={555} color={theme.subtext} size={21} anchor="middle">НАЖАЛ · ЖДУ?</Label><Label x={710} y={620} color={theme.text} size={27} anchor="middle">РЕЗКОСТЬ</Label><Arrow x1={650} y1={700} x2={785} y2={700} color={theme.success} label="заперта" opacity={0.9} /></MotionSvg>
  </>;
};

const SplitBody: React.FC<{ variant: "intake" | "slices" }> = ({ variant }) => {
  const motion = useMotion(); const slice = motion.action("slice");
  const slices = variant === "slices";
  return <><Panel color={theme.accent2} />
    <MotionGroup id="microlens" index={0} action={{ preset: "pulse", cue: "sensor" }}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><circle cx={540} cy={slices ? 585 : 485} r={76} fill={`${theme.accent}22`} stroke={theme.accent} strokeWidth={6} /><ellipse cx={540} cy={slices ? 585 : 485} rx={29} ry={62} fill={`${theme.accent2}44`} stroke={theme.accent2} strokeWidth={5} /><Label x={540} y={slices ? 702 : 602} color={theme.accent} size={21} anchor="middle">МИКРОЛИНЗА</Label></MotionSvg></div></MotionGroup>
    <MotionGroup id="rays" index={1} action={{ preset: "transfer", cue: "slice", from: { x: -26, y: 0 }, to: { x: 0, y: 0 } }}><div data-motion-shape style={{ position: "absolute", inset: 0, opacity: 0.38 + 0.62 * slice }}><MotionSvg><path d={slices ? "M 250 410 L 500 545 L 335 748" : "M 510 532 L 390 748"} fill="none" stroke={theme.accent} strokeWidth={8} strokeLinecap="round" /><path d={slices ? "M 830 410 L 580 545 L 745 748" : "M 570 532 L 690 748"} fill="none" stroke={theme.accent2} strokeWidth={8} strokeLinecap="round" /><Label x={slices ? 330 : 415} y={slices ? 585 : 670} color={theme.accent} size={19} anchor="middle">{slices ? "СВЕТ 1" : "СРЕЗ 1"}</Label><Label x={slices ? 750 : 665} y={slices ? 585 : 670} color={theme.accent2} size={19} anchor="middle">{slices ? "СВЕТ 2" : "СРЕЗ 2"}</Label></MotionSvg></div></MotionGroup>
    <MotionGroup id="left-half" index={2}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><SensorHalf x={slices ? 145 : 235} y={748} width={slices ? 380 : 300} color={theme.accent} label="ФОТОДИОД 1" /></MotionSvg></div></MotionGroup>
    <MotionGroup id="right-half" index={3}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><SensorHalf x={slices ? 555 : 545} y={748} width={slices ? 380 : 300} color={theme.accent2} label="ФОТОДИОД 2" /></MotionSvg></div></MotionGroup>
  </>;
};

const CompareBody: React.FC = () => {
  const motion = useMotion(); const measure = motion.action("measure");
  return <><Panel color={theme.warning} />
    <MotionGroup id="pattern-a" index={0}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><Pattern x={150} y={565} color={theme.accent} /><Label x={150} y={650} color={theme.accent} size={20}>ПОЛОВИНА 1</Label></MotionSvg></div></MotionGroup>
    <MotionGroup id="pattern-b" index={1} action={{ preset: "transfer", cue: "measure", from: { x: 54, y: 0 }, to: { x: 0, y: 0 } }}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><Pattern x={150} y={775} color={theme.accent2} /><Label x={150} y={860} color={theme.accent2} size={20}>ПОЛОВИНА 2</Label></MotionSvg></div></MotionGroup>
    <MotionGroup id="measure" index={2} action={{ preset: "pulse", cue: "measure" }}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><line x1={820} y1={585} x2={820} y2={815} stroke={theme.warning} strokeWidth={5} strokeDasharray="12 12" opacity={0.55 + measure * 0.45} /><Arrow x1={820} y1={565} x2={820} y2={545} color={theme.warning} opacity={0.9} /><Arrow x1={820} y1={835} x2={820} y2={855} color={theme.warning} opacity={0.9} /><Label x={820} y={930} color={theme.warning} size={23} anchor="middle">СДВИГ ΔΦ</Label></MotionSvg></div></MotionGroup>
    <MotionSvg><Label x={540} y={1015} color={theme.text} size={23} anchor="middle">ОДИН УЗОР · ДВА ПОЛОЖЕНИЯ</Label></MotionSvg>
  </>;
};

const DriveBody: React.FC = () => {
  const motion = useMotion(); const direction = motion.action("direction"); const step = motion.action("step");
  return <><Panel color={theme.success} />
    <MotionGroup id="rail" index={0}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><line x1={210} y1={720} x2={880} y2={720} stroke={`${theme.subtext}66`} strokeWidth={6} /><circle cx={210} cy={720} r={16} fill={theme.subtext} /><circle cx={880} cy={720} r={16} fill={theme.success} /><Label x={210} y={795} color={theme.subtext} size={19} anchor="middle">РАСФОКУС</Label><Label x={880} y={795} color={theme.success} size={19} anchor="middle">РЕЗКО</Label></MotionSvg></div></MotionGroup>
    <MotionGroup id="lens" index={1} action={{ preset: "transfer", cue: "step", from: { x: 0, y: 0 }, to: { x: 350, y: 0 } }}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><circle cx={335} cy={720} r={76} fill={`${theme.accent}25`} stroke={theme.accent} strokeWidth={7} /><ellipse cx={335} cy={720} rx={30} ry={63} fill={`${theme.accent2}55`} stroke={theme.accent2} strokeWidth={5} /><Label x={335} y={850} color={theme.accent} size={21} anchor="middle">ЛИНЗА</Label></MotionSvg></div></MotionGroup>
    <MotionGroup id="direction" index={2} action={{ preset: "transfer", cue: "direction", from: { x: 0, y: 0 }, to: { x: 160, y: 0 } }}><div data-motion-shape style={{ position: "absolute", inset: 0, opacity: 0.3 + 0.7 * direction }}><MotionSvg><Arrow x1={300} y1={515} x2={660} y2={515} color={theme.warning} label="СТОРОНА" /></MotionSvg></div></MotionGroup>
    <MotionGroup id="focus" index={3} action={{ preset: "pulse", cue: "step" }}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><circle cx={880} cy={720} r={44 + 10 * step} fill="none" stroke={theme.success} strokeWidth={5} strokeDasharray="12 9" /></MotionSvg></div></MotionGroup>
    <MotionSvg><Label x={540} y={965} color={theme.text} size={25} anchor="middle">Δ ЛИНЗЫ = НАПРАВЛЕНИЕ + ВЕЛИЧИНА</Label></MotionSvg>
  </>;
};

const ScaleBody: React.FC<{ variant: "generic" | "sony" }> = ({ variant }) => {
  const motion = useMotion(); const points = motion.action("points");
  const sony = variant === "sony";
  const columns = sony ? 12 : 6;
  const count = sony ? 48 : 24;
  const startX = sony ? 265 : 315;
  const gapX = sony ? 48 : 90;
  const dots = Array.from({ length: count }, (_, index) => ({ x: startX + (index % columns) * gapX, y: 530 + Math.floor(index / columns) * 62, color: index % 2 ? theme.accent2 : theme.accent }));
  return <><Panel color={theme.accent} />
    <MotionGroup id="grid" index={0}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><rect x={230} y={475} width={620} height={300} rx={26} fill={`${theme.bg}AA`} stroke={`${theme.accent}77`} strokeWidth={4} /><line x1={540} y1={475} x2={540} y2={775} stroke={`${theme.subtext}55`} strokeWidth={3} strokeDasharray="10 10" /><Label x={540} y={440} color={theme.accent} size={22} anchor="middle">СЕНСОР С ДВУМЯ ПОЛОВИНАМИ</Label></MotionSvg></div></MotionGroup>
    <MotionGroup id="points" index={1} action={{ preset: "pulse", cue: "points" }}><div data-motion-shape style={{ position: "absolute", inset: 0, opacity: 0.4 + 0.6 * points }}><MotionSvg>{dots.map((dot, index) => <circle key={index} cx={dot.x} cy={dot.y} r={8 + 3 * points} fill={dot.color} />)}<Label x={540} y={910} color={theme.text} size={sony ? 42 : 34} anchor="middle">{sony ? "192" : "ТОЧКИ"}</Label><Label x={540} y={950} color={theme.accent} size={19} anchor="middle">{sony ? "ТОЧКИ ФАЗОВОГО АВТОФОКУСА" : "ПИКСЕЛИ С ДВУМЯ ПОЛОВИНАМИ"}</Label></MotionSvg></div></MotionGroup>
    <MotionGroup id="fact" index={2}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><Label x={540} y={1010} color={theme.subtext} size={19} anchor="middle">{sony ? "СЕНСОР СМАРТФОНА · 2014" : "ПРИМЕР ЗАВИСИТ ОТ СЕНСОРА"}</Label></MotionSvg></div></MotionGroup>
  </>;
};

const ContrastBody: React.FC = () => {
  const motion = useMotion(); const hunt = motion.action("hunt");
  return <><Panel color={theme.danger} />
    <MotionGroup id="phase-result" index={0}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><rect x={100} y={500} width={390} height={360} rx={24} fill={`${theme.success}10`} stroke={`${theme.success}88`} strokeWidth={4} /><Pattern x={145} y={625} color={theme.success} scale={0.58} /><Pattern x={145} y={765} color={theme.success} scale={0.58} /><Label x={295} y={550} color={theme.success} size={22} anchor="middle">ФАЗА</Label><Label x={295} y={900} color={theme.success} size={19} anchor="middle">СДВИГ ИЗМЕРЕН</Label></MotionSvg></div></MotionGroup>
    <MotionGroup id="contrast-search" index={1}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><rect x={575} y={500} width={400} height={360} rx={24} fill={`${theme.danger}10`} stroke={`${theme.danger}88`} strokeWidth={4} /><path d="M 625 780 C 685 740, 710 650, 760 700 C 820 760, 850 575, 930 620" fill="none" stroke={theme.danger} strokeWidth={6} /><line x1={625} y1={790} x2={930} y2={790} stroke={`${theme.subtext}77`} strokeWidth={3} /><Label x={775} y={550} color={theme.danger} size={22} anchor="middle">КОНТРАСТ</Label><Label x={775} y={900} color={theme.danger} size={19} anchor="middle">ПРОБУЕТ ПОЗИЦИИ</Label></MotionSvg></div></MotionGroup>
    <MotionGroup id="contrast-lens" index={2} action={{ preset: "transfer", cue: "hunt", from: { x: -55, y: 0 }, to: { x: 150, y: 0 } }}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><circle cx={695} cy={700} r={26} fill={theme.warning} stroke={theme.text} strokeWidth={4} /><Arrow x1={613} y1={700} x2={660} y2={700} color={theme.warning} opacity={0.9} /></MotionSvg></div></MotionGroup>
    <MotionGroup id="peak" index={3} action={{ preset: "pulse", cue: "hunt" }}><div data-motion-shape style={{ position: "absolute", inset: 0 }}><MotionSvg><circle cx={850} cy={620} r={38} fill="none" stroke={theme.warning} strokeWidth={5} strokeDasharray="10 8" /></MotionSvg></div></MotionGroup>
  </>;
};

export const PhaseAutofocusVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "symptom", variant = "sony" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 16, mass: 0.78 } });
  const pop = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.65 } });
  let body: React.ReactNode;
  if (phase === "symptom") body = <SymptomBody />;
  else if (phase === "split") body = <SplitBody variant={variant === "slices" ? "slices" : "intake"} />;
  else if (phase === "compare") body = <CompareBody />;
  else if (phase === "drive") body = <DriveBody />;
  else if (phase === "scale") body = <ScaleBody variant={variant === "generic" ? "generic" : "sony"} />;
  else body = <ContrastBody />;
  return <div style={{ position: "relative", width: W, height: H, overflow: "hidden" }}><div style={{ position: "absolute", inset: 0, background: theme.bg, opacity: enter * 0.35 }} /><Header phase={phase} opacity={enter} /><div style={{ position: "absolute", inset: 0, opacity: enter }}>{body}</div><Badge phase={phase} opacity={enter} pop={pop} /><PulseRing x={CX} y={1050} triggerFrame={impactLocal} tone={phase === "contrast" ? "danger" : phase === "drive" ? "success" : "accent"} size={170} /></div>;
};

import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

export type OisStabilizationPhase =
  | "handheld"
  | "cart"
  | "gyro"
  | "countermove"
  | "suspension"
  | "actuator"
  | "hold";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: OisStabilizationPhase;
};

const W = layout.width;
const H = layout.height;
const CX = W / 2;

const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.2,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const phaseTitle: Record<OisStabilizationPhase, string> = {
  handheld: "РУКИ ТРЯСУТСЯ · ЛИЦО ДЕРЖИТСЯ",
  cart: "ТЕЛЕЖКА ВПРАВО · ФОНАРЬ ВЛЕВО",
  gyro: "ГИРОСКОП СНИМАЕТ ПОВОРОТ",
  countermove: "КОРПУС → · ЛИНЗА ←",
  suspension: "ЛИНЗА НА МИНИ-ПОДВЕСЕ",
  actuator: "ЭЛЕКТРОМАГНИТ ДВИГАЕТ ЛИНЗУ",
  hold: "СВЕТОВОЙ РИСУНОК НА МАТРИЦЕ",
};

const phaseColor: Record<OisStabilizationPhase, string> = {
  handheld: theme.danger,
  cart: theme.warning,
  gyro: theme.accent,
  countermove: theme.accent2,
  suspension: theme.accent2,
  actuator: theme.warning,
  hold: theme.success,
};

const phaseIcon: Record<OisStabilizationPhase, string> = {
  handheld: "hand",
  cart: "lamp-desk",
  gyro: "gauge",
  countermove: "move-horizontal",
  suspension: "orbit",
  actuator: "magnet",
  hold: "focus",
};

const phaseBadge: Record<OisStabilizationPhase, string> = {
  handheld: "КОРПУС ДРОЖИТ · КАДР НЕ УЕЗЖАЕТ",
  cart: "ПРОТИВОДВИЖЕНИЕ СОХРАНЯЕТ СВЕТ",
  gyro: "УГЛОВОЕ ДВИЖЕНИЕ → ИЗМЕРЕНИЕ",
  countermove: "ПРОТИВОДВИЖЕНИЕ ЛИНЗЫ",
  suspension: "ЛИНЗА НЕ ЗАКРЕПЛЕНА ЖЁСТКО",
  actuator: "ПРИВОД ДАЁТ ФИЗИЧЕСКИЙ СДВИГ",
  hold: "СВЕТ ПОПАДАЕТ ТУДА ЖЕ",
};

const SvgLayer: React.FC<{
  children: React.ReactNode;
  opacity?: number;
  offsetX: number;
  offsetY: number;
}> = ({ children, opacity = 1, offsetX, offsetY }) => (
  <svg
    width={W}
    height={H}
    viewBox={`0 0 ${W} ${H}`}
    style={{ position: "absolute", left: offsetX, top: offsetY, overflow: "visible", opacity }}
  >
    {children}
  </svg>
);

const Arrow: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  label?: string;
  opacity?: number;
  dashed?: boolean;
}> = ({ x1, y1, x2, y2, color, label, opacity = 1, dashed = false }) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const head = 22;
  const wing = 10;
  const points = [
    [x2, y2],
    [x2 - ux * head + px * wing, y2 - uy * head + py * wing],
    [x2 - ux * head - px * wing, y2 - uy * head - py * wing],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
  return (
    <g opacity={opacity}>
      <line
        x1={x1}
        y1={y1}
        x2={x2 - ux * 8}
        y2={y2 - uy * 8}
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={dashed ? "12 12" : undefined}
      />
      <polygon points={points} fill={color} />
      {label ? (
        <text
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2 - 18}
          fill={color}
          fontFamily={theme.mono}
          fontSize={20}
          fontWeight={800}
          textAnchor="middle"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
};

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  children: React.ReactNode;
}> = ({ left, top, width, height, color, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      borderRadius: 28,
      background: `${theme.panel}EE`,
      border: `3px solid ${color}77`,
      boxShadow: `0 0 38px ${color}1C`,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const Header: React.FC<{ phase: OisStabilizationPhase; enter: number }> = ({ phase, enter }) => {
  const color = phaseColor[phase];
  return (
    <div
      style={{
        position: "absolute",
        left: CX,
        top: 224,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        color,
        fontSize: 23,
        whiteSpace: "nowrap",
        opacity: enter,
        ...mono,
      }}
    >
      <IconGlyph name={phaseIcon[phase]} size={30} color={color} strokeWidth={1.8} />
      <span>{phaseTitle[phase]}</span>
    </div>
  );
};

const Badge: React.FC<{ phase: OisStabilizationPhase; opacity: number; pop: number }> = ({ phase, opacity, pop }) => {
  const color = phaseColor[phase];
  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        top: 1190,
        width: 952,
        minHeight: 76,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "13px 24px",
        borderRadius: 999,
        background: `${color}16`,
        border: `3px solid ${color}99`,
        color,
        fontSize: 22,
        textAlign: "center",
        whiteSpace: "nowrap",
        opacity,
        transform: `scale(${0.97 + pop * 0.03})`,
        boxShadow: `0 0 34px ${color}22`,
        ...mono,
      }}
    >
      {phaseBadge[phase]}
    </div>
  );
};

const Label: React.FC<{
  x: number;
  y: number;
  children: React.ReactNode;
  color?: string;
  size?: number;
  anchor?: "start" | "middle" | "end";
  opacity?: number;
}> = ({ x, y, children, color = theme.subtext, size = 20, anchor = "start", opacity = 1 }) => (
  <text
    x={x}
    y={y}
    fill={color}
    fontFamily={theme.mono}
    fontSize={size}
    fontWeight={800}
    textAnchor={anchor}
    opacity={opacity}
  >
    {children}
  </text>
);

const PhoneShell: React.FC<{
  x: number;
  y: number;
  rotation?: number;
  opacity?: number;
  color?: string;
  ghost?: boolean;
}> = ({ x, y, rotation = 0, opacity = 1, color = theme.accent, ghost = false }) => (
  <g transform={`translate(${x} ${y}) rotate(${rotation} 100 170)`} opacity={opacity}>
    <rect
      x={0}
      y={0}
      width={200}
      height={340}
      rx={34}
      fill={ghost ? "none" : theme.panel}
      stroke={color}
      strokeWidth={ghost ? 4 : 5}
      strokeDasharray={ghost ? "14 12" : undefined}
    />
    {!ghost ? <rect x={18} y={28} width={164} height={268} rx={22} fill="#090D15" stroke={`${color}40`} strokeWidth={2} /> : null}
    <rect x={128} y={45} width={43} height={68} rx={11} fill={ghost ? "none" : `${theme.panelBorder}`} stroke={color} strokeWidth={3} />
    <circle cx={150} cy={64} r={11} fill={color} />
    <circle cx={150} cy={92} r={8} fill={`${color}99`} />
    {!ghost ? <Label x={100} y={324} color={color} size={18} anchor="middle">КОРПУС</Label> : null}
  </g>
);

const FaceTarget: React.FC<{ cx: number; cy: number; color: string; opacity?: number; ghost?: boolean }> = ({
  cx,
  cy,
  color,
  opacity = 1,
  ghost = false,
}) => (
  <g opacity={opacity}>
    <circle cx={cx} cy={cy} r={104} fill={ghost ? "none" : `${color}12`} stroke={color} strokeWidth={ghost ? 4 : 5} strokeDasharray={ghost ? "14 12" : undefined} />
    <circle cx={cx - 35} cy={cy - 12} r={9} fill={color} />
    <circle cx={cx + 35} cy={cy - 12} r={9} fill={color} />
    <path d={`M ${cx - 42} ${cy + 42} Q ${cx} ${cy + 70} ${cx + 42} ${cy + 42}`} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" />
    <Label x={cx} y={cy + 152} color={color} size={18} anchor="middle">ЛИЦО</Label>
  </g>
);

const CameraHousing: React.FC<{
  x: number;
  y: number;
  lensOffset?: number;
  opacity?: number;
  color?: string;
  showMatrix?: boolean;
}> = ({ x, y, lensOffset = 0, opacity = 1, color = theme.accent2, showMatrix = true }) => {
  const lensX = x + 250 + lensOffset;
  const lensY = y + 210;
  const matrixX = x + 650;
  return (
    <g opacity={opacity}>
      <rect x={x} y={y} width={720} height={420} rx={32} fill={`${theme.panel}DD`} stroke={`${color}88`} strokeWidth={4} />
      <rect x={x + 46} y={y + 66} width={628} height={290} rx={22} fill="#090D15" stroke={`${color}30`} strokeWidth={2} />
      <circle cx={lensX} cy={lensY} r={82} fill={`${color}18`} stroke={color} strokeWidth={7} />
      <ellipse cx={lensX} cy={lensY} rx={38} ry={72} fill={`${theme.accent}35`} stroke={theme.accent} strokeWidth={5} />
      <path d={`M ${lensX - 16} ${lensY - 48} Q ${lensX + 18} ${lensY} ${lensX - 16} ${lensY + 48}`} fill="none" stroke={theme.text} strokeWidth={4} opacity={0.8} />
      {showMatrix ? (
        <>
          <line x1={matrixX} y1={y + 100} x2={matrixX} y2={y + 320} stroke={theme.success} strokeWidth={8} />
          <line x1={matrixX - 18} y1={lensY} x2={matrixX + 18} y2={lensY} stroke={theme.success} strokeWidth={4} />
          <line x1={matrixX} y1={lensY - 18} x2={matrixX} y2={lensY + 18} stroke={theme.success} strokeWidth={4} />
          <Label x={matrixX} y={y + 386} color={theme.success} size={18} anchor="middle">МАТРИЦА</Label>
        </>
      ) : null}
      <Label x={x + 28} y={y + 40} color={color} size={19}>КАМЕРА ВНУТРИ ТЕЛЕФОНА</Label>
    </g>
  );
};

const SpringLine: React.FC<{ x1: number; y1: number; x2: number; y2: number; color: string; opacity?: number }> = ({
  x1,
  y1,
  x2,
  y2,
  color,
  opacity = 1,
}) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const points: string[] = [`${x1},${y1}`];
  const turns = 7;
  for (let i = 1; i < turns; i++) {
    const t = i / turns;
    const side = i % 2 === 0 ? -1 : 1;
    points.push(`${x1 + dx * t + px * side * 16},${y1 + dy * t + py * side * 16}`);
  }
  points.push(`${x2},${y2}`);
  return <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={5} opacity={opacity} strokeLinecap="round" strokeLinejoin="round" />;
};

const OisVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "handheld" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 16, mass: 0.78 } });
  const pop = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.65 } });
  const color = phaseColor[phase];
  const pulse = 0.5 + 0.5 * Math.sin(local / 9);
  const impactP = smooth((local - impactLocal) / 12);

  let body: React.ReactNode;
  let ring: React.ReactNode = null;

  if (phase === "handheld") {
    const shake = 18 * Math.sin(local / 3.2);
    const tilt = 3.5 * Math.sin(local / 5.4);
    body = (
      <>
        <Panel left={58} top={398} width={430} height={650} color={theme.danger}>
          <SvgLayer offsetX={-58} offsetY={-398}>
            <path d="M 130 1040 C 112 890, 145 770, 220 700 C 270 650, 355 674, 410 744 L 494 882 L 468 1048 Z" fill="#D99A7A" opacity={0.45} />
            <g transform={`translate(${145 + shake} 540) rotate(${tilt} 100 170)`}>
              <PhoneShell x={0} y={0} color={theme.danger} />
            </g>
            <Arrow x1={155} y1={470} x2={285} y2={430} color={theme.danger} label="трясётся" opacity={0.9} />
            <Arrow x1={285} y1={435} x2={168} y2={485} color={theme.danger} opacity={0.7} dashed />
            <Label x={270} y={1008} color={theme.danger} size={20} anchor="middle">РУКИ</Label>
          </SvgLayer>
        </Panel>
        <Panel left={548} top={398} width={474} height={650} color={theme.success}>
          <SvgLayer offsetX={-548} offsetY={-398}>
            <rect x={584} y={478} width={402} height={398} rx={22} fill="#090D15" stroke={`${theme.success}66`} strokeWidth={4} />
            <FaceTarget cx={785} cy={670} color={theme.success} />
            <FaceTarget cx={785 + 28 * Math.sin(local / 3.2)} cy={670} color={theme.danger} opacity={0.42} ghost />
            <Label x={785} y={924} color={theme.success} size={21} anchor="middle">ГОТОВОЕ ВИДЕО</Label>
            <Label x={785} y={972} color={theme.subtext} size={18} anchor="middle">ЛИЦО ПОЧТИ НА МЕСТЕ</Label>
          </SvgLayer>
        </Panel>
        {local >= impactLocal ? <PulseRing x={785} y={670} triggerFrame={impactLocal} tone="success" size={210} /> : null}
      </>
    );
  } else if (phase === "cart") {
    const cartP = smooth((local - impactLocal) / 10);
    const cartShift = 54 * cartP;
    const lampShift = -38 * cartP;
    body = (
      <>
        <Panel left={58} top={404} width={964} height={638} color={theme.warning}>
          <SvgLayer offsetX={-58} offsetY={-404}>
            <rect x={92} y={482} width={900} height={410} rx={22} fill="#101622" stroke={`${theme.warning}35`} strokeWidth={3} />
            <line x1={116} y1={892} x2={970} y2={892} stroke={`${theme.subtext}66`} strokeWidth={4} />
            <circle cx={808} cy={657} r={78} fill={`${theme.warning}25`} stroke={theme.warning} strokeWidth={5} />
            <circle cx={808} cy={657} r={26} fill={theme.warning} opacity={0.9} />
            <Label x={808} y={790} color={theme.warning} size={20} anchor="middle">ПЯТНО СВЕТА · НЕ УЕЗЖАЕТ</Label>
            <g transform={`translate(${220 + cartShift} 742)`}>
              <rect x={0} y={60} width={490} height={90} rx={20} fill={`${theme.panel}`} stroke={theme.warning} strokeWidth={5} />
              <circle cx={82} cy={164} r={28} fill={theme.panel} stroke={theme.warning} strokeWidth={5} />
              <circle cx={405} cy={164} r={28} fill={theme.panel} stroke={theme.warning} strokeWidth={5} />
              <rect x={120 + lampShift} y={-28} width={190} height={82} rx={20} fill={`${theme.panel}`} stroke={theme.accent} strokeWidth={5} />
              <path d={`M ${276 + lampShift} -26 L ${344 + lampShift} -66 L ${398 + lampShift} -20 L ${330 + lampShift} 12 Z`} fill={`${theme.accent}33`} stroke={theme.accent} strokeWidth={5} />
              <circle cx={376 + lampShift} cy={-25} r={24} fill={theme.warning} />
              <Label x={246 + lampShift} y={100} color={theme.accent} size={19} anchor="middle">ФОНАРЬ</Label>
              <Label x={245} y={124} color={theme.warning} size={19} anchor="middle">ТЕЛЕЖКА</Label>
            </g>
            <Arrow x1={336} y1={676} x2={494} y2={676} color={theme.warning} label="вправо" />
            <Arrow x1={700} y1={654} x2={586} y2={654} color={theme.accent} label="влево" />
          </SvgLayer>
        </Panel>
        <Panel left={222} top={1072} width={636} height={72} color={theme.accent2}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: theme.accent2, fontSize: 20, ...mono }}>
            ТА ЖЕ ИДЕЯ · ТОЛЬКО ВНУТРИ КАМЕРЫ
          </div>
        </Panel>
      </>
    );
  } else if (phase === "gyro") {
    const tilt = 6 + 3 * Math.sin(local / 16);
    body = (
      <>
        <Panel left={58} top={414} width={420} height={610} color={theme.accent}>
          <SvgLayer offsetX={-58} offsetY={-414}>
            <PhoneShell x={164} y={532} rotation={tilt} color={theme.accent} />
            <Arrow x1={138} y1={478} x2={340} y2={446} color={theme.danger} label="поворот вправо" />
            <path d="M 132 524 A 170 170 0 0 1 350 480" fill="none" stroke={theme.danger} strokeWidth={6} strokeDasharray="14 11" />
            <Label x={270} y={972} color={theme.accent} size={20} anchor="middle">КОРПУС ТЕЛЕФОНА</Label>
          </SvgLayer>
        </Panel>
        <Panel left={548} top={414} width={474} height={610} color={theme.accent}>
          <SvgLayer offsetX={-548} offsetY={-414}>
            <circle cx={785} cy={660} r={132} fill={`${theme.accent}0C`} stroke={`${theme.accent}88`} strokeWidth={5} />
            <line x1={653} y1={660} x2={917} y2={660} stroke={`${theme.accent}55`} strokeWidth={4} />
            <line x1={785} y1={528} x2={785} y2={792} stroke={`${theme.accent}55`} strokeWidth={4} />
            <circle cx={785} cy={660} r={38 + pulse * 8} fill={`${theme.accent}22`} stroke={theme.accent} strokeWidth={5} />
            <path d="M 785 660 C 835 588, 892 598, 916 644" fill="none" stroke={theme.warning} strokeWidth={8} strokeLinecap="round" />
            <Arrow x1={875} y1={560} x2={925} y2={628} color={theme.warning} label="ω" />
            <Label x={785} y={848} color={theme.accent} size={23} anchor="middle">ГИРОСКОП</Label>
            <Label x={785} y={890} color={theme.subtext} size={18} anchor="middle">ИЗМЕРЯЕТ УГЛОВОЕ ДВИЖЕНИЕ</Label>
            <Arrow x1={466} y1={720} x2={640} y2={690} color={theme.accent} opacity={0.8} dashed />
          </SvgLayer>
        </Panel>
        {local >= impactLocal ? <PulseRing x={785} y={660} triggerFrame={impactLocal} tone="accent" size={250} /> : null}
      </>
    );
  } else if (phase === "countermove") {
    const bodyTilt = 5.5 + 1.5 * Math.sin(local / 14);
    const lensOffset = -42 * impactP;
    const lensX = 80 + 250 + lensOffset;
    const lensY = 520 + 210;
    body = (
      <>
        <Panel left={58} top={394} width={964} height={668} color={theme.accent2}>
          <SvgLayer offsetX={-58} offsetY={-394}>
            <g transform={`translate(116 470) rotate(${bodyTilt} 400 210)`} opacity={0.86}>
              <rect x={0} y={0} width={800} height={420} rx={34} fill={`${theme.panel}CC`} stroke={theme.danger} strokeWidth={5} />
              <rect x={46} y={72} width={708} height={278} rx={24} fill="#090D15" stroke={`${theme.danger}35`} strokeWidth={3} />
              <Label x={105} y={118} color={theme.danger} size={22}>КОРПУС ТЕЛЕФОНА</Label>
              <rect x={520} y={126} width={132} height={180} rx={22} fill={`${theme.danger}12`} stroke={`${theme.danger}88`} strokeWidth={3} />
            </g>
            <Arrow x1={205} y1={438} x2={376} y2={405} color={theme.danger} label="корпус →" />
            <line x1={118} y1={730} x2={930} y2={730} stroke={`${theme.subtext}35`} strokeWidth={3} strokeDasharray="12 12" />
            <circle cx={151} cy={730} r={46} fill={`${theme.warning}22`} stroke={theme.warning} strokeWidth={5} />
            <Label x={151} y={817} color={theme.warning} size={18} anchor="middle">СЦЕНА</Label>
            <path d={`M 197 730 Q ${lensX - 100} ${lensY - 90} ${lensX} ${lensY}`} fill="none" stroke={theme.warning} strokeWidth={6} />
            <path d={`M ${lensX} ${lensY} Q ${lensX + 130} ${lensY - 40} 862 730`} fill="none" stroke={theme.success} strokeWidth={6} />
            <circle cx={lensX} cy={lensY} r={76} fill={`${theme.accent2}20`} stroke={theme.accent2} strokeWidth={7} />
            <ellipse cx={lensX} cy={lensY} rx={32} ry={65} fill={`${theme.accent}42`} stroke={theme.accent} strokeWidth={5} />
            <Label x={lensX} y={848} color={theme.accent2} size={20} anchor="middle">ЛИНЗА</Label>
            <line x1={862} y1={602} x2={862} y2={858} stroke={theme.success} strokeWidth={9} />
            <circle cx={862} cy={730} r={21 + pop * 9} fill={theme.success} />
            <Label x={862} y={900} color={theme.success} size={19} anchor="middle">СВЕТОВОЙ РИСУНОК</Label>
            <Arrow x1={650} y1={988} x2={538} y2={988} color={theme.accent2} label="линза ←" />
          </SvgLayer>
        </Panel>
        {local >= impactLocal ? <PulseRing x={862} y={730} triggerFrame={impactLocal} tone="success" size={220} /> : null}
      </>
    );
  } else if (phase === "suspension") {
    const lensShift = 28 * Math.sin(local / 11);
    const housingX = 170;
    const housingY = 470;
    const lensX = 540 + lensShift;
    const lensY = 690;
    body = (
      <>
        <Panel left={58} top={392} width={964} height={680} color={theme.accent2}>
          <SvgLayer offsetX={-58} offsetY={-392}>
            <rect x={housingX} y={housingY} width={740} height={460} rx={40} fill={`${theme.panel}DD`} stroke={theme.accent2} strokeWidth={5} />
            <rect x={housingX + 46} y={housingY + 58} width={648} height={342} rx={26} fill="#090D15" stroke={`${theme.accent2}35`} strokeWidth={3} />
            <SpringLine x1={housingX + 100} y1={housingY + 105} x2={lensX - 74} y2={lensY - 62} color={theme.accent} />
            <SpringLine x1={housingX + 640} y1={housingY + 105} x2={lensX + 74} y2={lensY - 62} color={theme.accent} />
            <SpringLine x1={housingX + 100} y1={housingY + 355} x2={lensX - 74} y2={lensY + 62} color={theme.accent} />
            <SpringLine x1={housingX + 640} y1={housingY + 355} x2={lensX + 74} y2={lensY + 62} color={theme.accent} />
            <circle cx={lensX} cy={lensY} r={96} fill={`${theme.accent2}20`} stroke={theme.accent2} strokeWidth={7} />
            <ellipse cx={lensX} cy={lensY} rx={36} ry={78} fill={`${theme.accent}42`} stroke={theme.accent} strokeWidth={5} />
            <Label x={housingX + 34} y={housingY + 38} color={theme.accent2} size={21}>КОРПУС КАМЕРЫ</Label>
            <Label x={lensX} y={lensY + 145} color={theme.accent} size={21} anchor="middle">ЛИНЗА</Label>
            <Label x={540} y={990} color={theme.accent2} size={20} anchor="middle">УПРУГИЕ ЭЛЕМЕНТЫ ДЕРЖАТ УЗЕЛ</Label>
            <line x1={820} y1={516} x2={884} y2={580} stroke={theme.danger} strokeWidth={8} />
            <line x1={884} y1={516} x2={820} y2={580} stroke={theme.danger} strokeWidth={8} />
            <Label x={852} y={622} color={theme.danger} size={17} anchor="middle">НЕ КЛЕЙ</Label>
          </SvgLayer>
        </Panel>
        {local >= impactLocal ? <PulseRing x={lensX} y={lensY} triggerFrame={impactLocal} tone="accent2" size={230} /> : null}
      </>
    );
  } else if (phase === "actuator") {
    const move = -38 * impactP;
    const lensX = 540 + move;
    body = (
      <>
        <Panel left={58} top={394} width={964} height={680} color={theme.warning}>
          <SvgLayer offsetX={-58} offsetY={-394}>
            <rect x={152} y={470} width={776} height={460} rx={40} fill={`${theme.panel}DD`} stroke={theme.warning} strokeWidth={5} />
            <rect x={190} y={540} width={210} height={230} rx={24} fill={`${theme.accent2}18`} stroke={theme.accent2} strokeWidth={5} />
            <rect x={680} y={540} width={210} height={230} rx={24} fill={`${theme.accent2}18`} stroke={theme.accent2} strokeWidth={5} />
            {Array.from({ length: 4 }).map((_, i) => (
              <line key={i} x1={225 + i * 42} y1={575} x2={225 + i * 42} y2={738} stroke={theme.accent2} strokeWidth={8} strokeLinecap="round" />
            ))}
            {Array.from({ length: 4 }).map((_, i) => (
              <line key={i} x1={715 + i * 42} y1={575} x2={715 + i * 42} y2={738} stroke={theme.accent2} strokeWidth={8} strokeLinecap="round" />
            ))}
            <Label x={295} y={820} color={theme.accent2} size={18} anchor="middle">МАГНИТ</Label>
            <Label x={785} y={820} color={theme.accent2} size={18} anchor="middle">МАГНИТ</Label>
            <circle cx={lensX} cy={655} r={92} fill={`${theme.accent}20`} stroke={theme.accent} strokeWidth={7} />
            <ellipse cx={lensX} cy={655} rx={36} ry={74} fill={`${theme.accent}52`} stroke={theme.accent} strokeWidth={5} />
            <Label x={lensX} y={805} color={theme.accent} size={20} anchor="middle">ЛИНЗА</Label>
            <Arrow x1={420} y1={655} x2={lensX - 110} y2={655} color={theme.warning} label="толкает" />
            <Arrow x1={690} y1={655} x2={lensX + 110} y2={655} color={theme.warning} label="толкает" />
            <Arrow x1={700} y1={950} x2={560} y2={950} color={theme.accent} label="сдвиг влево" />
            <Label x={540} y={510} color={theme.warning} size={21} anchor="middle">ЭЛЕКТРОМАГНИТНЫЙ ПРИВОД</Label>
          </SvgLayer>
        </Panel>
        {local >= impactLocal ? <PulseRing x={lensX} y={655} triggerFrame={impactLocal} tone="warning" size={230} /> : null}
      </>
    );
  } else {
    const bodyJitter = 16 * Math.sin(local / 3.8);
    body = (
      <>
        <Panel left={58} top={394} width={964} height={680} color={theme.success}>
          <SvgLayer offsetX={-58} offsetY={-394}>
            <FaceTarget cx={178} cy={670} color={theme.warning} />
            <Label x={178} y={872} color={theme.warning} size={19} anchor="middle">СЦЕНА</Label>
            <g transform={`translate(${350 + bodyJitter} 488) rotate(${4 * Math.sin(local / 6)} 100 170)`} opacity={0.35}>
              <PhoneShell x={0} y={0} color={theme.danger} ghost />
            </g>
            <g transform={`translate(${380 + bodyJitter} 488) rotate(${4 * Math.sin(local / 6)} 100 170)`}>
              <PhoneShell x={0} y={0} color={theme.success} />
            </g>
            <Arrow x1={350} y1={438} x2={508} y2={410} color={theme.danger} label="корпус дрожит" />
            <line x1={650} y1={542} x2={650} y2={842} stroke={theme.success} strokeWidth={10} />
            <circle cx={650} cy={692} r={22 + pop * 10} fill={theme.success} />
            <circle cx={650} cy={692} r={58 + pulse * 8} fill="none" stroke={`${theme.success}66`} strokeWidth={4} />
            <path d="M 274 670 C 378 620, 482 615, 628 692" fill="none" stroke={theme.warning} strokeWidth={6} />
            <path d="M 274 670 C 378 720, 482 722, 628 692" fill="none" stroke={theme.warning} strokeWidth={3} strokeDasharray="10 12" opacity={0.45} />
            <Label x={650} y={900} color={theme.success} size={22} anchor="middle">СВЕТОВОЙ РИСУНОК</Label>
            <Label x={650} y={940} color={theme.subtext} size={18} anchor="middle">ОДНО И ТО ЖЕ МЕСТО НА МАТРИЦЕ</Label>
          </SvgLayer>
        </Panel>
        {local >= impactLocal ? <PulseRing x={650} y={692} triggerFrame={impactLocal} tone="success" size={240} /> : null}
      </>
    );
  }

  ring = local >= impactLocal ? <PulseRing x={CX} y={1040} triggerFrame={impactLocal} tone={phase === "handheld" ? "danger" : "accent"} size={180} /> : null;

  return (
    <div style={{ position: "relative", width: W, height: H, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: theme.bg, opacity: enter * 0.35 }} />
      <Header phase={phase} enter={enter} />
      <div style={{ position: "absolute", inset: 0, opacity: enter }}>{body}</div>
      <Badge phase={phase} opacity={enter} pop={pop} />
      {ring}
    </div>
  );
};

export const OisStabilizationVisual = OisVisual;

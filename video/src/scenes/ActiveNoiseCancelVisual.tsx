import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type ActiveNoiseCancelPhase =
  | "life"
  | "swing"
  | "listen"
  | "antiphase"
  | "ear-zone"
  | "speech";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: ActiveNoiseCancelPhase;
}

const W = layout.width;
const H = layout.height;
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

const phaseTitle: Record<ActiveNoiseCancelPhase, string> = {
  life: "ЖИЗНЬ · САМОЛЁТ И СОСЕД",
  swing: "АНАЛОГИЯ · ТОЛЧОК НАВСТРЕЧУ",
  listen: "ВНЕШНИЙ МИКРОФОН · СЛУШАЕТ ГУЛ",
  antiphase: "ЭЛЕКТРОНИКА · СТРОИТ −ВОЛНУ",
  "ear-zone": "ЗОНА КОНТРОЛЯ · У УХА",
  speech: "СРАВНЕНИЕ · ГУЛ И РЕЧЬ",
};

const phaseColor: Record<ActiveNoiseCancelPhase, string> = {
  life: theme.accent,
  swing: theme.warning,
  listen: theme.accent,
  antiphase: theme.accent2,
  "ear-zone": theme.success,
  speech: theme.warning,
};

const phaseIcon: Record<ActiveNoiseCancelPhase, string> = {
  life: "headphones",
  swing: "move-horizontal",
  listen: "mic-2",
  antiphase: "cpu",
  "ear-zone": "ear",
  speech: "audio-lines",
};

const PhaseHeader: React.FC<{ phase: ActiveNoiseCancelPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: 32,
      right: 32,
      top: 222,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
      color: phaseColor[phase],
      opacity,
      whiteSpace: "nowrap",
      fontSize: 22,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={30} color={phaseColor[phase]} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const FramePanel: React.FC<{
  color: string;
  opacity: number;
  y?: number;
  height?: number;
}> = ({ color, opacity, y = 360, height = 710 }) => (
  <div
    style={{
      position: "absolute",
      left: 70,
      top: y,
      width: 940,
      height,
      boxSizing: "border-box",
      borderRadius: 28,
      background: `${theme.panel}E8`,
      border: `3px solid ${color}66`,
      boxShadow: `0 0 46px ${color}18`,
      opacity,
    }}
  />
);

const Badge: React.FC<{ text: string; color: string; opacity: number; scale?: number }> = ({
  text,
  color,
  opacity,
  scale = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left: 70,
      top: 1170,
      width: 940,
      minHeight: 78,
      boxSizing: "border-box",
      padding: "16px 24px",
      borderRadius: 999,
      background: `${color}16`,
      border: `3px solid ${color}99`,
      color,
      textAlign: "center",
      whiteSpace: "nowrap",
      opacity,
      transform: `scale(${0.96 + 0.04 * scale})`,
      boxShadow: `0 0 34px ${color}26`,
      ...mono,
      fontSize: 21,
    }}
  >
    {text}
  </div>
);

const Card: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  icon: string;
  title: string;
  detail?: string;
  opacity: number;
  scale?: number;
  children?: React.ReactNode;
}> = ({ x, y, width, height, color, icon, title, detail, opacity, scale = 1, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height,
      boxSizing: "border-box",
      padding: "18px 16px",
      borderRadius: 22,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 28px ${color}20`,
      opacity,
      transform: `scale(${scale})`,
      transformOrigin: "center",
      textAlign: "center",
    }}
  >
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, color, ...mono, fontSize: 17 }}>
      <IconGlyph name={icon} size={27} color={color} strokeWidth={1.8} />
      <span>{title}</span>
    </div>
    {detail ? <div style={{ marginTop: 12, color: theme.text, ...mono, fontSize: 22 }}>{detail}</div> : null}
    {children}
  </div>
);

const Arrow: React.FC<{
  d: string;
  head: string;
  color: string;
  opacity: number;
  dash?: string;
  width?: number;
}> = ({ d, head, color, opacity, dash = "", width = 5 }) => (
  <svg
    width={W}
    height={H}
    viewBox={`0 0 ${W} ${H}`}
    style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
  >
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} opacity={opacity} />
    <path d={head} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />
  </svg>
);

const WaveTrace: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  motion: number;
  amplitude?: number;
  kind?: "hum" | "speech";
  invert?: boolean;
  dash?: string;
  thickness?: number;
}> = ({
  x,
  y,
  width,
  height,
  color,
  opacity,
  motion,
  amplitude = 0.8,
  kind = "hum",
  invert = false,
  dash = "",
  thickness = 5,
}) => {
  const points = Array.from({ length: 56 }, (_, index) => {
    const t = index / 55;
    const hum = Math.sin(index * 0.48 + motion) * 0.72;
    const speech = Math.sin(index * 1.05 + motion) * 0.46 + Math.sin(index * 0.39 + motion * 1.4) * 0.28 + Math.sin(index * 2.1 + motion * 0.7) * 0.12;
    const value = (kind === "speech" ? speech : hum) * amplitude * (invert ? -1 : 1);
    const px = t * width;
    const py = height / 2 - value * height * 0.46;
    return `${px},${py}`;
  }).join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", left: x, top: y, overflow: "visible", opacity }}
    >
      <polyline points={points} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
    </svg>
  );
};

const LaneLabel: React.FC<{ x: number; y: number; text: string; color: string; opacity: number }> = ({ x, y, text, color, opacity }) => (
  <div style={{ position: "absolute", left: x, top: y, color, opacity, ...mono, fontSize: 17, whiteSpace: "nowrap" }}>{text}</div>
);

const LifePhase: React.FC<{ enter: number; pop: number; motion: number; impactLocal: number }> = ({ enter, pop, motion, impactLocal }) => (
  <>
    <FramePanel color={theme.accent} opacity={enter} />
    <Card x={92} y={475} width={270} height={330} color={theme.warning} icon="plane" title="ДВИГАТЕЛЬ" detail="НИЗКИЙ ГУЛ" opacity={enter}>
      <WaveTrace x={114} y={640} width={226} height={70} color={theme.warning} opacity={enter} motion={motion} amplitude={0.92} />
      <LaneLabel x={23} y={275} text="СТАБИЛЬНЫЙ" color={theme.warning} opacity={enter} />
    </Card>
    <Card x={405} y={450} width={270} height={380} color={theme.accent} icon="headphones" title="НАУШНИКИ" detail="ЗОНА У УХА" opacity={enter} scale={0.98 + 0.02 * pop}>
      <div style={{ position: "absolute", left: 70, top: 128, width: 130, height: 130, borderRadius: "50%", border: `5px solid ${theme.accent}99`, boxShadow: `0 0 30px ${theme.accent}33` }} />
      <IconGlyph name="ear" size={72} color={theme.text} strokeWidth={1.5} />
      <div style={{ position: "absolute", left: 22, right: 22, bottom: 24, color: theme.accent, ...mono, fontSize: 16 }}>СЛУШАЕТ ОБА</div>
    </Card>
    <Card x={718} y={475} width={270} height={330} color={theme.accent2} icon="user-round" title="СОСЕД" detail="РЕЧЬ СБОКУ" opacity={enter}>
      <WaveTrace x={740} y={640} width={226} height={70} color={theme.accent2} opacity={enter} motion={motion + 0.8} kind="speech" amplitude={0.82} />
      <LaneLabel x={23} y={275} text="МЕНЯЕТСЯ" color={theme.accent2} opacity={enter} />
    </Card>
    <Arrow d="M 365 640 C 390 640 394 620 405 620" head="M 389 606 L 405 620 L 388 635" color={theme.warning} opacity={enter} dash="13 10" />
    <Arrow d="M 718 672 C 694 672 693 695 675 695" head="M 693 681 L 675 695 L 695 708" color={theme.accent2} opacity={enter} dash="13 10" />
    <Badge text="ОДНИ НАУШНИКИ · ДВА РАЗНЫХ ЗВУКА" color={theme.accent} opacity={enter * (0.78 + 0.22 * pop)} scale={pop} />
    <PulseRing x={540} y={640} triggerFrame={impactLocal} tone="accent" size={190} />
  </>
);

const SwingPhase: React.FC<{ enter: number; pop: number; motion: number; impactLocal: number }> = ({ enter, pop, motion, impactLocal }) => {
  const damp = 1 - 0.55 * smooth(pop);
  const seatX = 540 + Math.sin(motion * 0.62) * 154 * damp;
  const seatY = 720 - Math.cos(motion * 0.62) * 35 * damp;
  return (
    <>
      <FramePanel color={theme.warning} opacity={enter} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: enter }}>
        <path d="M 285 700 Q 540 405 795 700" fill="none" stroke={`${theme.accent2}66`} strokeWidth={4} strokeDasharray="14 12" />
        <path d={`M ${540 - 125 * damp} 700 Q 540 ${520 + 95 * (1 - damp)} ${540 + 125 * damp} 700`} fill="none" stroke={theme.success} strokeWidth={6} strokeLinecap="round" opacity={0.8 + 0.2 * pop} />
        <line x1="360" y1="485" x2="720" y2="485" stroke={theme.subtext} strokeWidth={10} strokeLinecap="round" />
        <line x1="400" y1="485" x2={seatX - 42} y2={seatY} stroke={theme.subtext} strokeWidth={5} />
        <line x1="680" y1="485" x2={seatX + 42} y2={seatY} stroke={theme.subtext} strokeWidth={5} />
        <rect x={seatX - 56} y={seatY} width="112" height="24" rx="10" fill={theme.warning} />
        <path d="M 835 628 C 760 634 718 654 665 676" fill="none" stroke={theme.warning} strokeWidth={7} strokeLinecap="round" />
        <path d="M 687 658 L 665 676 L 694 680" fill="none" stroke={theme.warning} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ position: "absolute", left: 350, top: 402, color: theme.accent2, opacity: enter, ...mono, fontSize: 17 }}>ПРЕЖНИЙ РАЗМАХ</div>
      <div style={{ position: "absolute", left: 437, top: 780, color: theme.success, opacity: enter * (0.55 + 0.45 * pop), ...mono, fontSize: 17 }}>НОВЫЙ РАЗМАХ МЕНЬШЕ</div>
      <Card x={150} y={865} width={780} height={145} color={theme.warning} icon="move-horizontal" title="ЖЕСТ СО ЗВУКОМ" detail="ТОЧНО НАВСТРЕЧУ → АМПЛИТУДА НИЖЕ" opacity={enter * (0.88 + 0.12 * pop)} scale={0.98 + 0.02 * pop} />
      <Badge text="ПРОТИВОФА́ЗА = ТОЛЧОК НАВСТРЕЧУ" color={theme.warning} opacity={enter * (0.78 + 0.22 * pop)} scale={pop} />
      <PulseRing x={665} y={676} triggerFrame={impactLocal} tone="warning" size={180} />
    </>
  );
};

const ListenPhase: React.FC<{ enter: number; pop: number; motion: number; impactLocal: number }> = ({ enter, pop, motion, impactLocal }) => (
  <>
    <FramePanel color={theme.accent} opacity={enter} />
    <Card x={95} y={490} width={285} height={285} color={theme.warning} icon="plane" title="САМОЛЁТ" detail="ГУДИТ СНАРУЖИ" opacity={enter}>
      <WaveTrace x={119} y={650} width={236} height={70} color={theme.warning} opacity={enter} motion={motion} amplitude={0.9} />
      <LaneLabel x={21} y={238} text="ВОЛНА →" color={theme.warning} opacity={enter} />
    </Card>
    <Arrow d="M 380 635 C 470 635 500 650 600 650" head="M 577 636 L 600 650 L 577 664" color={theme.warning} opacity={enter} dash="15 11" />
    <div style={{ position: "absolute", left: 410, top: 555, width: 205, height: 170, borderRadius: 22, background: `${theme.bg}E8`, border: `3px solid ${theme.accent}99`, opacity: enter, textAlign: "center" }}>
      <IconGlyph name="mic-2" size={58} color={theme.accent} strokeWidth={1.7} />
      <div style={{ marginTop: 11, color: theme.accent, ...mono, fontSize: 16 }}>СЛУШАЕТ</div>
      <div style={{ marginTop: 10, color: theme.text, ...mono, fontSize: 18 }}>ГУДЯЩУЮ ВОЛНУ</div>
    </div>
    <Arrow d="M 615 640 C 650 640 666 620 690 620" head="M 668 606 L 690 620 L 668 634" color={theme.accent} opacity={enter} />
    <Card x={690} y={430} width={300} height={390} color={theme.accent} icon="headphones" title="НАУШНИК" detail="НАРУЖНЫЙ МИКРОФОН" opacity={enter} scale={0.98 + 0.02 * pop}>
      <div style={{ position: "absolute", left: 72, top: 135, width: 152, height: 152, borderRadius: "50%", border: `5px solid ${theme.accent}77` }} />
      <IconGlyph name="ear" size={74} color={theme.text} strokeWidth={1.5} />
      <div style={{ position: "absolute", left: 35, right: 35, bottom: 28, color: theme.accent, ...mono, fontSize: 16 }}>МИКРОФОН СНАРУЖИ УХА</div>
    </Card>
    <div style={{ position: "absolute", left: 250, top: 860, width: 575, height: 120, borderRadius: 20, background: `${theme.accent}10`, border: `2px solid ${theme.accent}66`, opacity: enter, textAlign: "center" }}>
      <div style={{ marginTop: 22, color: theme.accent, ...mono, fontSize: 21 }}>СНАЧАЛА · СЛЫШИМ ВНЕШНИЙ ШУМ</div>
      <div style={{ marginTop: 13, color: theme.subtext, ...mono, fontSize: 16 }}>не голос внутри головы</div>
    </div>
    <Badge text="ВНЕШНИЙ МИКРОФОН СНИМАЕТ ГУЛ ДО УХА" color={theme.accent} opacity={enter * (0.78 + 0.22 * pop)} scale={pop} />
    <PulseRing x={840} y={620} triggerFrame={impactLocal} tone="accent" size={210} />
  </>
);

const AntiphasePhase: React.FC<{ enter: number; pop: number; motion: number; impactLocal: number }> = ({ enter, pop, motion, impactLocal }) => (
  <>
    <FramePanel color={theme.accent2} opacity={enter} />
    <Card x={82} y={475} width={270} height={355} color={theme.warning} icon="waves" title="ГУДЯЩАЯ ВОЛНА" detail="+" opacity={enter}>
      <WaveTrace x={106} y={615} width={222} height={76} color={theme.warning} opacity={enter} motion={motion} amplitude={0.84} />
      <LaneLabel x={27} y={286} text="ТОЛКАЕТ ВПЕРЁД" color={theme.warning} opacity={enter} />
    </Card>
    <Arrow d="M 352 652 L 408 652" head="M 389 638 L 408 652 L 389 666" color={theme.warning} opacity={enter} />
    <Card x={408} y={475} width={264} height={355} color={theme.accent2} icon="cpu" title="ЭЛЕКТРОНИКА" detail="ПЕРЕВОРАЧИВАЕТ" opacity={enter} scale={0.98 + 0.02 * pop}>
      <div style={{ position: "absolute", left: 92, top: 135, width: 78, height: 92, borderRadius: 17, background: `${theme.accent2}18`, border: `3px solid ${theme.accent2}99`, color: theme.accent2, ...mono, fontSize: 55, lineHeight: "86px" }}>−</div>
      <LaneLabel x={31} y={286} text="ЗНАК → НАОБОРОТ" color={theme.accent2} opacity={enter} />
    </Card>
    <Arrow d="M 672 652 L 728 652" head="M 709 638 L 728 652 L 709 666" color={theme.accent2} opacity={enter} />
    <Card x={728} y={475} width={270} height={355} color={theme.accent2} icon="volume-2" title="ДИНАМИК" detail="−" opacity={enter} scale={0.98 + 0.02 * pop}>
      <WaveTrace x={752} y={615} width={222} height={76} color={theme.accent2} opacity={enter} motion={motion} amplitude={0.84} invert />
      <LaneLabel x={25} y={286} text="ТОЛКАЕТ НАЗАД" color={theme.accent2} opacity={enter} />
    </Card>
    <div style={{ position: "absolute", left: 173, top: 895, width: 735, height: 108, borderRadius: 18, background: `${theme.accent2}0E`, border: `2px solid ${theme.accent2}66`, opacity: enter, textAlign: "center" }}>
      <div style={{ marginTop: 18, color: theme.text, ...mono, fontSize: 21 }}>ОДИН РИТМ · ПРОТИВОПОЛОЖНЫЙ ПОДЪЁМ</div>
      <WaveTrace x={225} y={945} width={330} height={35} color={theme.warning} opacity={enter} motion={motion} amplitude={0.65} thickness={4} />
      <WaveTrace x={525} y={945} width={330} height={35} color={theme.accent2} opacity={enter} motion={motion} amplitude={0.65} invert thickness={4} />
    </div>
    <Badge text="ЭЛЕКТРОНИКА СТРОИТ ВТОРУЮ · ОБРАТНУЮ ВОЛНУ" color={theme.accent2} opacity={enter * (0.78 + 0.22 * pop)} scale={pop} />
    <PulseRing x={540} y={652} triggerFrame={impactLocal} tone="accent2" size={190} />
  </>
);

const EarZonePhase: React.FC<{ enter: number; pop: number; motion: number; impactLocal: number }> = ({ enter, pop, motion, impactLocal }) => (
  <>
    <FramePanel color={theme.success} opacity={enter} />
    <div style={{ position: "absolute", left: 100, top: 414, color: theme.subtext, opacity: enter, ...mono, fontSize: 16 }}>В КОМНАТЕ · ВОЛНА НЕ ПРОПАЛА</div>
    <WaveTrace x={105} y={468} width={320} height={58} color={theme.warning} opacity={enter * 0.62} motion={motion} amplitude={0.82} dash="10 9" thickness={4} />
    <Card x={92} y={555} width={235} height={250} color={theme.warning} icon="waves" title="ГУДИТ СНАРУЖИ" detail="+ ВОЛНА" opacity={enter}>
      <WaveTrace x={113} y={690} width={193} height={56} color={theme.warning} opacity={enter} motion={motion} amplitude={0.84} />
    </Card>
    <Arrow d="M 328 681 C 365 681 375 640 408 640" head="M 385 626 L 408 640 L 385 654" color={theme.warning} opacity={enter} dash="13 10" />
    <div style={{ position: "absolute", left: 382, top: 475, width: 585, height: 400, borderRadius: 26, background: `${theme.success}0B`, border: `4px solid ${theme.success}99`, opacity: enter, boxShadow: `0 0 34px ${theme.success}24` }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 22, textAlign: "center", color: theme.success, ...mono, fontSize: 20 }}>ЗОНА КОНТРОЛЯ · ТОЛЬКО ЗДЕСЬ</div>
      <div style={{ position: "absolute", left: 52, top: 120, width: 112, height: 112, borderRadius: "50%", border: `4px solid ${theme.success}66` }}>
        <IconGlyph name="ear" size={65} color={theme.text} strokeWidth={1.5} />
      </div>
      <WaveTrace x={195} y={120} width={160} height={80} color={theme.warning} opacity={enter} motion={motion} amplitude={0.78} />
      <WaveTrace x={195} y={120} width={160} height={80} color={theme.accent2} opacity={enter} motion={motion} amplitude={0.78} invert />
      <Arrow d="M 355 160 L 405 160" head="M 388 146 L 405 160 L 388 174" color={theme.success} opacity={enter} />
      <WaveTrace x={407} y={145} width={130} height={30} color={theme.success} opacity={enter * (0.35 + 0.65 * pop)} motion={motion} amplitude={0.16} thickness={4} />
      <div style={{ position: "absolute", left: 32, right: 32, top: 265, color: theme.text, ...mono, fontSize: 18, textAlign: "center" }}>две волны → меньшая сумма</div>
    </div>
    <div style={{ position: "absolute", left: 146, top: 910, width: 788, height: 120, display: "flex", alignItems: "center", justifyContent: "space-between", opacity: enter }}>
      <div style={{ color: theme.subtext, ...mono, fontSize: 17 }}>АМПЛИТУДА СНАРУЖИ</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 70 }}>
        {[58, 45, 62, 52, 66].map((height, index) => <div key={index} style={{ width: 14, height, borderRadius: 7, background: theme.warning, boxShadow: `0 0 12px ${theme.warning}55` }} />)}
      </div>
      <div style={{ color: theme.success, ...mono, fontSize: 17 }}>У УХА · МЕНЬШЕ</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 70 }}>
        {[15, 11, 17, 12, 14].map((height, index) => <div key={index} style={{ width: 14, height, borderRadius: 7, background: theme.success, boxShadow: `0 0 12px ${theme.success}66` }} />)}
      </div>
    </div>
    <Badge text="СЛОЖЕНИЕ У УХА · КОМНАТА НЕ СТАЛА ТИШЕ" color={theme.success} opacity={enter * (0.78 + 0.22 * pop)} scale={pop} />
    <PulseRing x={780} y={635} triggerFrame={impactLocal} tone="success" size={220} />
  </>
);

const ComparisonLane: React.FC<{
  y: number;
  label: string;
  color: string;
  kind: "hum" | "speech";
  resultAmplitude: number;
  resultColor: string;
  enter: number;
  motion: number;
}> = ({ y, label, color, kind, resultAmplitude, resultColor, enter, motion }) => (
  <div style={{ position: "absolute", left: 95, top: y, width: 890, height: 220, borderRadius: 20, background: `${theme.bg}D9`, border: `2px solid ${color}66`, opacity: enter }}>
    <div style={{ position: "absolute", left: 22, top: 20, color, ...mono, fontSize: 18 }}>{label}</div>
    <div style={{ position: "absolute", left: 22, top: 64, color: theme.subtext, ...mono, fontSize: 14 }}>ВХОД</div>
    <WaveTrace x={88} y={91} width={310} height={74} color={color} opacity={enter} motion={motion} kind={kind} amplitude={0.86} />
    <Arrow d="M 410 128 L 490 128" head="M 470 114 L 490 128 L 470 142" color={theme.subtext} opacity={enter} dash="12 9" width={4} />
    <div style={{ position: "absolute", left: 492, top: 62, color: theme.subtext, ...mono, fontSize: 14 }}>У УХА</div>
    <WaveTrace x={555} y={91} width={310} height={74} color={resultColor} opacity={enter} motion={motion + 0.2} kind={kind} amplitude={resultAmplitude} thickness={5} />
    <div style={{ position: "absolute", right: 20, bottom: 20, color: resultColor, ...mono, fontSize: 16 }}>{kind === "hum" ? "ПОДАВЛЕН" : "ОСТАЛАСЬ"}</div>
  </div>
);

const SpeechPhase: React.FC<{ enter: number; pop: number; motion: number; impactLocal: number }> = ({ enter, pop, motion, impactLocal }) => (
  <>
    <FramePanel color={theme.warning} opacity={enter} />
    <ComparisonLane y={445} label="СТАБИЛЬНЫЙ НИЗКИЙ ГУЛ" color={theme.warning} kind="hum" resultAmplitude={0.16} resultColor={theme.success} enter={enter} motion={motion} />
    <ComparisonLane y={725} label="РЕЧЬ СБОКУ · МЕНЯЕТСЯ" color={theme.accent2} kind="speech" resultAmplitude={0.72} resultColor={theme.warning} enter={enter} motion={motion + 1.1} />
    <div style={{ position: "absolute", left: 120, top: 980, width: 840, textAlign: "center", color: theme.text, opacity: enter, ...mono, fontSize: 20 }}>
      <span style={{ color: theme.success }}>СТАБИЛЬНЫЙ ГУЛ</span> легче предсказать, чем меняющуюся речь
    </div>
    <Badge text="ГУЛ ↓ · РЕЧЬ СБОКУ ОСТАЁТСЯ" color={theme.warning} opacity={enter * (0.78 + 0.22 * pop)} scale={pop} />
    <PulseRing x={820} y={835} triggerFrame={impactLocal} tone="warning" size={210} />
  </>
);

/** Активное шумоподавление: внешний гул → противофаза → локальное сложение у уха. */
export const ActiveNoiseCancelVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "life" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  const motion = local / 8;

  return (
    <>
      <PhaseHeader phase={phase} opacity={enter} />
      {phase === "life" ? <LifePhase enter={enter} pop={pop} motion={motion} impactLocal={impactLocal} /> : null}
      {phase === "swing" ? <SwingPhase enter={enter} pop={pop} motion={motion} impactLocal={impactLocal} /> : null}
      {phase === "listen" ? <ListenPhase enter={enter} pop={pop} motion={motion} impactLocal={impactLocal} /> : null}
      {phase === "antiphase" ? <AntiphasePhase enter={enter} pop={pop} motion={motion} impactLocal={impactLocal} /> : null}
      {phase === "ear-zone" ? <EarZonePhase enter={enter} pop={pop} motion={motion} impactLocal={impactLocal} /> : null}
      {phase === "speech" ? <SpeechPhase enter={enter} pop={pop} motion={motion} impactLocal={impactLocal} /> : null}
    </>
  );
};

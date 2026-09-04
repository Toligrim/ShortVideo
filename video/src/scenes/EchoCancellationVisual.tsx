import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type EchoCancellationPhase = "mixture" | "path" | "subtract" | "loop";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: EchoCancellationPhase;
}

const W = layout.width;
const H = layout.height;
const CX = W / 2;
const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.5,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const phaseTitle: Record<EchoCancellationPhase, string> = {
  mixture: "МИКРОФОН · СМЕСЬ ДВУХ СИГНАЛОВ",
  path: "АКУСТИЧЕСКИЙ ПУТЬ · АДАПТИВНЫЙ ФИЛЬТР",
  subtract: "AEC · ПРОГНОЗ ВЫЧИТАЕТСЯ ИЗ ЗАХВАТА",
  loop: "ВИДЕОЗВОНОК · ЭХО НЕ УХОДИТ В ПЕТЛЮ",
};

const phaseColor: Record<EchoCancellationPhase, string> = {
  mixture: theme.accent,
  path: theme.accent2,
  subtract: theme.success,
  loop: theme.warning,
};

const phaseIcon: Record<EchoCancellationPhase, string> = {
  mixture: "mic-2",
  path: "route",
  subtract: "minus",
  loop: "circle-stop",
};

const PhaseHeader: React.FC<{ phase: EchoCancellationPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: 34,
      right: 34,
      top: 222,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
      color: phaseColor[phase],
      opacity,
      whiteSpace: "nowrap",
      fontSize: 23,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={30} color={phaseColor[phase]} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const FramePanel: React.FC<{
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color: string;
  opacity: number;
}> = ({ x = 70, y = 370, width = 940, height = 710, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 28,
      background: `${theme.panel}D9`,
      border: `3px solid ${color}66`,
      boxShadow: `0 0 44px ${color}18`,
      opacity,
    }}
  />
);

const SignalCard: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  icon: string;
  title: string;
  detail: string;
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
      padding: "20px 18px",
      borderRadius: 23,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 30px ${color}20`,
      opacity,
      transform: `scale(${scale})`,
      transformOrigin: "center",
      textAlign: "center",
    }}
  >
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 9, color, ...mono, fontSize: 19 }}>
      <IconGlyph name={icon} size={28} color={color} strokeWidth={1.8} />
      <span>{title}</span>
    </div>
    <div style={{ marginTop: 14, color: theme.text, ...mono, fontSize: 24 }}>{detail}</div>
    {children}
  </div>
);

const Tag: React.FC<{
  x: number;
  y: number;
  text: string;
  color: string;
  opacity: number;
  width?: number;
}> = ({ x, y, text, color, opacity, width }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      padding: "10px 15px",
      boxSizing: "border-box",
      borderRadius: 14,
      background: `${color}16`,
      border: `2px solid ${color}77`,
      color,
      opacity,
      textAlign: "center",
      whiteSpace: "nowrap",
      ...mono,
      fontSize: 17,
    }}
  >
    {text}
  </div>
);

const ArrowPath: React.FC<{
  d: string;
  head?: string;
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
    {head ? <path d={head} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} /> : null}
  </svg>
);

const WAVE = [-0.08, 0.38, -0.22, 0.62, -0.52, 0.12, 0.48, -0.36, 0.18, -0.62, 0.44, -0.16, 0.34, -0.46, 0.14, 0.52, -0.28, 0.06, 0.4, -0.18];

const SignalWave: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  motion: number;
  seed?: number;
  thickness?: number;
}> = ({ x, y, width, height, color, opacity, motion, seed = 0, thickness = 5 }) => {
  const points = WAVE.map((value, index) => {
    const wobble = 0.1 * Math.sin(motion * 0.7 + index * 0.9 + seed);
    const px = (index / (WAVE.length - 1)) * width;
    const py = height / 2 - (value + wobble) * height * 0.42;
    return `${px},${py}`;
  }).join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", left: x, top: y, overflow: "visible", opacity }}
    >
      <polyline points={points} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const StatusBadge: React.FC<{ text: string; color: string; opacity: number; scale?: number }> = ({ text, color, opacity, scale = 1 }) => (
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
      fontSize: 22,
    }}
  >
    {text}
  </div>
);

const MixturePhase: React.FC<{ enter: number; pop: number; motion: number; impactLocal: number }> = ({ enter, pop, motion, impactLocal }) => (
  <>
    <FramePanel color={theme.accent} opacity={enter} />
    <SignalCard x={100} y={465} width={290} height={215} color={theme.accent2} icon="volume-2" title="ДИНАМИК" detail="PLAY x[n]" opacity={enter}>
      <div style={{ position: "absolute", left: 24, right: 24, bottom: 28, color: theme.accent2, ...mono, fontSize: 16 }}>ГОЛОС СОБЕСЕДНИКА</div>
      <SignalWave x={126} y={590} width={238} height={46} color={theme.accent2} opacity={enter} motion={motion} seed={1} thickness={4} />
    </SignalCard>
    <SignalCard x={100} y={785} width={290} height={215} color={theme.accent} icon="mic-2" title="СВОЙ ГОЛОС" detail="s[n]" opacity={enter}>
      <div style={{ position: "absolute", left: 24, right: 24, bottom: 28, color: theme.accent, ...mono, fontSize: 16 }}>ЛОКАЛЬНАЯ РЕЧЬ</div>
      <SignalWave x={126} y={910} width={238} height={46} color={theme.accent} opacity={enter} motion={motion + 1.4} seed={2} thickness={4} />
    </SignalCard>
    <ArrowPath d="M 392 570 C 480 570 520 650 610 690" head="M 585 677 L 610 690 L 584 703" color={theme.accent2} opacity={enter * 0.9} dash="14 12" />
    <ArrowPath d="M 392 885 C 490 885 520 810 610 770" head="M 585 756 L 610 770 L 584 784" color={theme.accent} opacity={enter * 0.9} dash="14 12" />
    <SignalCard x={610} y={590} width={350} height={330} color={theme.success} icon="mic" title="МИКРОФОН · ЗАХВАТ" detail="d[n]" opacity={enter} scale={0.98 + 0.02 * pop}>
      <div style={{ position: "absolute", left: 30, right: 30, top: 100, height: 110, borderRadius: 16, background: `${theme.bg}D9`, border: `2px solid ${theme.panelBorder}` }} />
      <SignalWave x={642} y={638} width={286} height={42} color={theme.accent} opacity={enter} motion={motion} seed={3} thickness={4} />
      <SignalWave x={642} y={700} width={286} height={42} color={theme.accent2} opacity={enter} motion={motion + 0.8} seed={4} thickness={4} />
      <div style={{ position: "absolute", left: 30, right: 30, bottom: 27, color: theme.success, ...mono, fontSize: 18 }}>СМЕСЬ · s[n] + h[n]·x[n]</div>
    </SignalCard>
    <StatusBadge text="ЗАХВАТ d[n] = СВОЙ ГОЛОС + ЭХО" color={theme.accent} opacity={enter * (0.78 + 0.22 * pop)} scale={pop} />
    <PulseRing x={785} y={755} triggerFrame={impactLocal} tone="accent" size={230} />
  </>
);

const PathPhase: React.FC<{ enter: number; pop: number; motion: number; impactLocal: number }> = ({ enter, pop, motion, impactLocal }) => (
  <>
    <FramePanel color={theme.accent2} opacity={enter} />
    <SignalCard x={95} y={485} width={255} height={230} color={theme.accent2} icon="volume-2" title="ДИНАМИК" detail="PLAY x[n]" opacity={enter}>
      <div style={{ position: "absolute", left: 20, right: 20, bottom: 27, color: theme.accent2, ...mono, fontSize: 16 }}>СИГНАЛ ИЗВЕСТЕН</div>
      <SignalWave x={118} y={620} width={210} height={43} color={theme.accent2} opacity={enter} motion={motion} seed={5} thickness={4} />
    </SignalCard>
    <SignalCard x={730} y={485} width={255} height={230} color={theme.accent} icon="mic-2" title="МИКРОФОН" detail="CAPTURE d[n]" opacity={enter}>
      <div style={{ position: "absolute", left: 20, right: 20, bottom: 27, color: theme.accent, ...mono, fontSize: 16 }}>СЛУШАЕТ ПУТЬ</div>
      <SignalWave x={753} y={620} width={210} height={43} color={theme.warning} opacity={enter} motion={motion + 1} seed={6} thickness={4} />
    </SignalCard>
    <ArrowPath d="M 350 600 C 450 525 620 525 730 600" head="M 703 585 L 730 600 L 702 615" color={theme.accent2} opacity={enter} dash="16 13" />
    <div style={{ position: "absolute", left: 390, top: 470, width: 300, height: 270, borderRadius: 22, border: `2px dashed ${theme.warning}66`, background: `${theme.warning}08`, opacity: enter }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 28, textAlign: "center", color: theme.warning, ...mono, fontSize: 20 }}>КОМНАТА</div>
      <div style={{ position: "absolute", left: 124, top: 61 }}>
        <IconGlyph name="door-open" size={52} color={theme.warning} strokeWidth={1.6} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 92, textAlign: "center", color: theme.subtext, ...mono, fontSize: 16 }}>ПУТЬ h[n]</div>
      <SignalWave x={425} y={575} width={230} height={58} color={theme.warning} opacity={enter} motion={motion + 0.4} seed={7} thickness={5} />
    </div>
    <Tag x={385} y={765} text="ЗАДЕРЖКА τ" color={theme.warning} opacity={enter} width={170} />
    <Tag x={570} y={765} text="ОСЛАБЛЕНИЕ α" color={theme.warning} opacity={enter} width={185} />
    <Tag x={445} y={840} text="ОТРАЖЕНИЯ" color={theme.accent2} opacity={enter} width={190} />
    <div style={{ position: "absolute", left: 180, top: 925, width: 720, height: 125, borderRadius: 20, background: `${theme.accent2}12`, border: `2px solid ${theme.accent2}77`, opacity: enter, textAlign: "center" }}>
      <div style={{ marginTop: 21, color: theme.accent2, ...mono, fontSize: 20 }}>АДАПТИВНЫЙ ФИЛЬТР · h[n]</div>
      <div style={{ marginTop: 13, color: theme.text, ...mono, fontSize: 18 }}>τ · α · отражения → оценка пути</div>
      <div style={{ position: "absolute", right: 28, top: 28, display: "flex", alignItems: "flex-end", gap: 7, height: 64 }}>
        {[25, 43, 33, 58, 39].map((height, index) => (
          <div key={height} style={{ width: 12, height: height * (0.78 + 0.22 * pop), borderRadius: 6, background: index === 3 ? theme.success : theme.accent2, boxShadow: `0 0 14px ${index === 3 ? theme.success : theme.accent2}66` }} />
        ))}
      </div>
    </div>
    <StatusBadge text="ФИЛЬТР УЧИТ ПУТЬ: ДИНАМИК → МИКРОФОН" color={theme.accent2} opacity={enter * (0.8 + 0.2 * pop)} scale={pop} />
    <PulseRing x={540} y={605} triggerFrame={impactLocal} tone="accent2" size={250} />
  </>
);

const SubtractPhase: React.FC<{ enter: number; pop: number; motion: number; impactLocal: number }> = ({ enter, pop, motion, impactLocal }) => (
  <>
    <FramePanel color={theme.success} opacity={enter} />
    <SignalCard x={78} y={475} width={290} height={385} color={theme.warning} icon="mic-2" title="ЗАХВАТ" detail="d[n]" opacity={enter}>
      <div style={{ position: "absolute", left: 25, right: 25, top: 107, height: 138, borderRadius: 16, background: `${theme.bg}D9`, border: `2px solid ${theme.panelBorder}` }} />
      <SignalWave x={105} y={535} width={236} height={46} color={theme.accent} opacity={enter} motion={motion} seed={8} thickness={4} />
      <SignalWave x={105} y={607} width={236} height={46} color={theme.accent2} opacity={enter} motion={motion + 1} seed={9} thickness={4} />
      <div style={{ position: "absolute", left: 20, right: 20, bottom: 35, color: theme.warning, ...mono, fontSize: 17 }}>s[n] + h[n]·x[n]</div>
    </SignalCard>
    <ArrowPath d="M 368 665 L 405 665" head="M 390 651 L 405 665 L 390 679" color={theme.warning} opacity={enter} />
    <div style={{ position: "absolute", left: 405, top: 620, width: 75, height: 90, borderRadius: 18, background: `${theme.success}18`, border: `3px solid ${theme.success}99`, color: theme.success, ...mono, fontSize: 56, textAlign: "center", lineHeight: "84px", opacity: enter * (0.75 + 0.25 * pop) }}>−</div>
    <ArrowPath d="M 480 665 L 512 665" head="M 498 651 L 512 665 L 498 679" color={theme.success} opacity={enter} />
    <SignalCard x={512} y={475} width={260} height={385} color={theme.accent2} icon="waves" title="ПРОГНОЗ" detail="ŷ[n]" opacity={enter} scale={0.98 + 0.02 * pop}>
      <div style={{ position: "absolute", left: 22, right: 22, top: 112, height: 138, borderRadius: 16, background: `${theme.bg}D9`, border: `2px solid ${theme.panelBorder}` }} />
      <SignalWave x={536} y={548} width={212} height={62} color={theme.accent2} opacity={enter * (0.55 + 0.45 * pop)} motion={motion + 1.7} seed={10} thickness={5} />
      <div style={{ position: "absolute", left: 15, right: 15, bottom: 87, color: theme.accent2, ...mono, fontSize: 17 }}>ĥ[n] · x[n]</div>
      <div style={{ position: "absolute", left: 15, right: 15, bottom: 35, color: theme.subtext, ...mono, fontSize: 15 }}>СИГНАЛ, НЕ ТЕКСТ</div>
    </SignalCard>
    <ArrowPath d="M 772 665 L 812 665" head="M 797 651 L 812 665 L 797 679" color={theme.success} opacity={enter} />
    <SignalCard x={812} y={475} width={190} height={385} color={theme.success} icon="check-circle-2" title="ОСТАТОК" detail="s[n]" opacity={enter * (0.72 + 0.28 * pop)} scale={0.96 + 0.04 * pop}>
      <div style={{ position: "absolute", left: 16, right: 16, top: 112, height: 138, borderRadius: 16, background: `${theme.bg}D9`, border: `2px solid ${theme.panelBorder}` }} />
      <SignalWave x={829} y={548} width={156} height={62} color={theme.success} opacity={enter * (0.55 + 0.45 * pop)} motion={motion + 2.2} seed={11} thickness={5} />
      <div style={{ position: "absolute", left: 10, right: 10, bottom: 50, color: theme.success, ...mono, fontSize: 16 }}>РЕЧЬ ОСТАЛАСЬ</div>
    </SignalCard>
    <div style={{ position: "absolute", left: CX, top: 930, transform: "translateX(-50%)", color: theme.text, ...mono, fontSize: 29, opacity: enter }}>d[n] − ŷ[n] = <span style={{ color: theme.success }}>s[n]</span></div>
    <StatusBadge text="ПРОГНОЗ ЭХА ВЫЧТЕН · РЕЧЬ СОХРАНЕНА" color={theme.success} opacity={enter * (0.78 + 0.22 * pop)} scale={pop} />
    <PulseRing x={907} y={665} triggerFrame={impactLocal} tone="success" size={220} />
  </>
);

const LoopPhase: React.FC<{ enter: number; pop: number; motion: number; impactLocal: number }> = ({ enter, pop, motion, impactLocal }) => (
  <>
    <FramePanel color={theme.warning} opacity={enter} />
    <SignalCard x={95} y={470} width={255} height={225} color={theme.accent2} icon="phone-call" title="СОБЕСЕДНИК" detail="ДАЛЬНИЙ ГОЛОС" opacity={enter}>
      <SignalWave x={118} y={614} width={210} height={44} color={theme.accent2} opacity={enter} motion={motion} seed={12} thickness={4} />
    </SignalCard>
    <SignalCard x={415} y={470} width={255} height={225} color={theme.accent2} icon="volume-2" title="ДИНАМИК" detail="ГОЛОС ВЫШЕЛ" opacity={enter}>
      <SignalWave x={438} y={614} width={210} height={44} color={theme.accent2} opacity={enter} motion={motion + 0.6} seed={13} thickness={4} />
    </SignalCard>
    <SignalCard x={735} y={470} width={255} height={225} color={theme.warning} icon="mic-2" title="МИКРОФОН" detail="ОДИН ВОЗВРАТ" opacity={enter}>
      <SignalWave x={758} y={614} width={210} height={44} color={theme.warning} opacity={enter} motion={motion + 1.2} seed={14} thickness={4} />
    </SignalCard>
    <ArrowPath d="M 350 580 L 415 580" head="M 397 566 L 415 580 L 397 594" color={theme.accent2} opacity={enter} />
    <ArrowPath d="M 670 610 C 760 690 820 730 855 770" head="M 830 760 L 855 770 L 836 790" color={theme.warning} opacity={enter} dash="15 11" />
    <Tag x={505} y={735} text="АКУСТИЧЕСКИЙ ВОЗВРАТ" color={theme.warning} opacity={enter} width={270} />
    <div style={{ position: "absolute", left: 390, top: 850, width: 300, height: 145, borderRadius: 21, background: `${theme.success}14`, border: `3px solid ${theme.success}99`, opacity: enter * (0.7 + 0.3 * pop), textAlign: "center", transform: `scale(${0.96 + 0.04 * pop})` }}>
      <div style={{ marginTop: 21, display: "flex", justifyContent: "center", alignItems: "center", gap: 9, color: theme.success, ...mono, fontSize: 21 }}>
        <IconGlyph name="shield-check" size={29} color={theme.success} strokeWidth={1.8} />
        AEC · СТОП
      </div>
      <div style={{ marginTop: 14, color: theme.text, ...mono, fontSize: 17 }}>ЭХО ✕ ОТПРАВКИ</div>
    </div>
    <ArrowPath d="M 540 850 C 720 790 760 900 690 920" head="M 708 905 L 690 920 L 713 928" color={theme.success} opacity={enter * (0.65 + 0.35 * pop)} dash="13 10" />
    <ArrowPath d="M 390 922 C 285 922 270 785 300 695" head="M 286 720 L 300 695 L 311 723" color={theme.danger} opacity={enter * (1 - 0.78 * pop)} dash="12 13" />
    <div style={{ position: "absolute", left: 277, top: 884, color: theme.danger, ...mono, fontSize: 19, opacity: enter * (1 - 0.74 * pop) }}>ЭХО ✕</div>
    <StatusBadge text="ПЕТЛЯ ОСТАНОВЛЕНА ДО ОТПРАВКИ" color={theme.success} opacity={enter * (0.78 + 0.22 * pop)} scale={pop} />
    <PulseRing x={540} y={920} triggerFrame={impactLocal} tone="success" size={250} />
  </>
);

/** Буквальное эхоподавление: render-сигнал → акустический путь → прогноз → вычитание. */
export const EchoCancellationVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "mixture" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  const motion = local / 8;

  return (
    <>
      <PhaseHeader phase={phase} opacity={enter} />
      {phase === "mixture" ? <MixturePhase enter={enter} pop={pop} motion={motion} impactLocal={impactLocal} /> : null}
      {phase === "path" ? <PathPhase enter={enter} pop={pop} motion={motion} impactLocal={impactLocal} /> : null}
      {phase === "subtract" ? <SubtractPhase enter={enter} pop={pop} motion={motion} impactLocal={impactLocal} /> : null}
      {phase === "loop" ? <LoopPhase enter={enter} pop={pop} motion={motion} impactLocal={impactLocal} /> : null}
    </>
  );
};

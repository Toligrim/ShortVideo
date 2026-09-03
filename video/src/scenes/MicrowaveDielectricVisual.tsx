import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type MicrowaveDielectricPhase = "contrast" | "field" | "dipoles" | "losses" | "afterheat";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: MicrowaveDielectricPhase;
};

const W = layout.width;
const H = layout.height;
const CX = W / 2;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1.5 };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const panel = (tone: string): React.CSSProperties => ({
  position: "absolute",
  borderRadius: 28,
  background: `${theme.panel}EA`,
  border: `3px solid ${tone}66`,
  boxShadow: `0 0 42px ${tone}1C`,
});

const PhaseHeader: React.FC<{
  text: string;
  icon: string;
  color: string;
  opacity: number;
}> = ({ text, icon, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 240,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color,
      fontSize: 23,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    <IconGlyph name={icon} size={30} color={color} strokeWidth={1.8} />
    <span>{text}</span>
  </div>
);

const StatusBadge: React.FC<{
  text: string;
  color: string;
  opacity: number;
}> = ({ text, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 1190,
      transform: "translateX(-50%)",
      padding: "15px 30px",
      borderRadius: 999,
      background: `${color}18`,
      border: `2px solid ${color}99`,
      color,
      fontSize: 24,
      whiteSpace: "nowrap",
      opacity,
      boxShadow: `0 0 34px ${color}26`,
      ...mono,
    }}
  >
    {text}
  </div>
);

const WaveArrow: React.FC<{
  x: number;
  y: number;
  direction: "right" | "left";
  opacity: number;
  shift: number;
}> = ({ x, y, direction, opacity, shift }) => {
  const sign = direction === "right" ? 1 : -1;
  const start = direction === "right" ? x : x + 190;
  const end = direction === "right" ? x + 190 : x;
  return (
    <g opacity={opacity} transform={`translate(${shift * sign} 0)`}>
      <path
        d={`M ${start} ${y} C ${start + 28 * sign} ${y - 22}, ${start + 60 * sign} ${y + 22}, ${start + 92 * sign} ${y} S ${end - 28 * sign} ${y - 22}, ${end} ${y}`}
        fill="none"
        stroke={theme.accent}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray="14 12"
      />
      <path
        d={direction === "right" ? `M ${end - 18} ${y - 12} L ${end} ${y} L ${end - 18} ${y + 12}` : `M ${end + 18} ${y - 12} L ${end} ${y} L ${end + 18} ${y + 12}`}
        fill="none"
        stroke={theme.accent}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
};

const FoodAndPlate: React.FC<{
  x: number;
  y: number;
  scale?: number;
  hot?: boolean;
  opacity?: number;
}> = ({ x, y, scale = 1, hot = true, opacity = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity}>
    <ellipse cx="0" cy="52" rx="288" ry="72" fill={`${theme.text}0C`} stroke={`${theme.text}88`} strokeWidth="5" />
    <ellipse cx="0" cy="25" rx="230" ry="58" fill={`${hot ? theme.warning : theme.subtext}28`} stroke={hot ? theme.warning : theme.subtext} strokeWidth="4" />
    <ellipse cx="0" cy="20" rx="194" ry="43" fill={hot ? `${theme.warning}66` : `${theme.subtext}20`} />
    {hot ? (
      <>
        <path d="M -92 -22 C -130 -64 -76 -83 -101 -120" fill="none" stroke={theme.text} strokeWidth="5" strokeLinecap="round" opacity="0.75" />
        <path d="M 0 -30 C -34 -75 25 -90 -2 -133" fill="none" stroke={theme.text} strokeWidth="5" strokeLinecap="round" opacity="0.7" />
        <path d="M 92 -22 C 56 -65 113 -82 87 -119" fill="none" stroke={theme.text} strokeWidth="5" strokeLinecap="round" opacity="0.7" />
      </>
    ) : null}
  </g>
);

const Dipole: React.FC<{
  x: number;
  y: number;
  angle: number;
  scale?: number;
  opacity?: number;
}> = ({ x, y, angle, scale = 1, opacity = 1 }) => (
  <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`} opacity={opacity}>
    <line x1="0" y1="0" x2="-30" y2="-35" stroke={theme.subtext} strokeWidth="6" strokeLinecap="round" />
    <line x1="0" y1="0" x2="30" y2="-35" stroke={theme.subtext} strokeWidth="6" strokeLinecap="round" />
    <circle cx="0" cy="0" r="17" fill={theme.danger} stroke={theme.text} strokeWidth="3" />
    <circle cx="-30" cy="-35" r="11" fill={theme.text} stroke={theme.accent} strokeWidth="3" />
    <circle cx="30" cy="-35" r="11" fill={theme.text} stroke={theme.accent} strokeWidth="3" />
    <line x1="0" y1="20" x2="0" y2="-72" stroke={theme.accent} strokeWidth="4" strokeLinecap="round" />
    <path d="M -11 -58 L 0 -76 L 11 -58" fill="none" stroke={theme.accent} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  </g>
);

const Compass: React.FC<{ x: number; y: number; opacity: number }> = ({ x, y, opacity }) => (
  <g opacity={opacity}>
    <circle cx={x} cy={y} r="42" fill={`${theme.panel}CC`} stroke={theme.warning} strokeWidth="4" />
    <line x1={x - 26} y1={y} x2={x + 25} y2={y} stroke={theme.warning} strokeWidth="6" strokeLinecap="round" />
    <path d={`M ${x + 25} ${y - 11} L ${x + 39} ${y} L ${x + 25} ${y + 11}`} fill="none" stroke={theme.warning} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx={x} cy={y} r="6" fill={theme.warning} />
  </g>
);

const CavityShell: React.FC<{ opacity: number; active: boolean; pulse: number }> = ({ opacity, active, pulse }) => (
  <g opacity={opacity}>
    <rect x="86" y="380" width="908" height="680" rx="30" fill={`${theme.panel}E8`} stroke={`${theme.accent2}88`} strokeWidth="4" />
    <rect x="120" y="434" width="840" height="544" rx="24" fill={`${theme.bg}AA`} stroke={`${theme.subtext}55`} strokeWidth="3" />
    <text x="540" y="420" textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontWeight="800" fontSize="20" letterSpacing="2">
      МЕТАЛЛИЧЕСКАЯ КАМЕРА · 2,45 ГГЦ
    </text>
    <g transform="translate(540 735)">
      <ellipse cx="0" cy="48" rx="290" ry="70" fill={`${theme.text}0C`} stroke={`${theme.text}66`} strokeWidth="5" />
      <ellipse cx="0" cy="18" rx="232" ry="55" fill={`${theme.warning}42`} stroke={`${theme.warning}AA`} strokeWidth="4" />
      <ellipse cx="0" cy="12" rx="196" ry="39" fill={`${theme.warning}55`} />
      <path d="M -93 -22 C -126 -58 -74 -84 -98 -118 M 0 -30 C -32 -72 24 -92 -1 -130 M 93 -22 C 60 -60 111 -83 86 -118" fill="none" stroke={theme.text} strokeWidth="5" strokeLinecap="round" opacity="0.65" />
      <text x="0" y="105" textAnchor="middle" fill={theme.text} fontFamily={theme.mono} fontWeight="800" fontSize="23" letterSpacing="2">
        ГОРЯЧАЯ ЕДА
      </text>
    </g>
    <text x="205" y="1008" textAnchor="middle" fill={theme.accent2} fontFamily={theme.mono} fontWeight="800" fontSize="22" letterSpacing="1">
      ТАРЕЛКА
    </text>
    <text x="875" y="1008" textAnchor="middle" fill={theme.warning} fontFamily={theme.mono} fontWeight="800" fontSize="22" letterSpacing="1">
      ЕДА
    </text>
    {active ? (
      <g opacity={0.5 + 0.5 * pulse}>
        <path d="M 144 560 C 230 500 310 620 390 560 S 550 500 630 560 S 790 620 940 540" fill="none" stroke={theme.accent} strokeWidth="5" strokeDasharray="16 14" />
        <path d="M 144 650 C 230 590 310 710 390 650 S 550 590 630 650 S 790 710 940 630" fill="none" stroke={theme.accent} strokeWidth="5" strokeDasharray="16 14" />
        <path d="M 144 740 C 230 680 310 800 390 740 S 550 680 630 740 S 790 800 940 720" fill="none" stroke={theme.accent} strokeWidth="5" strokeDasharray="16 14" />
      </g>
    ) : null}
  </g>
);

/** Поглощение микроволн: горячая еда, полярные молекулы и слабее греющаяся посуда. */
export const MicrowaveDielectricVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "contrast" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const pop = local >= impactLocal ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  const reveal = smooth(local / Math.max(impactLocal, 1));
  const titles: Record<MicrowaveDielectricPhase, { text: string; icon: string; color: string }> = {
    contrast: { text: "ЕДА ГОРЯЧАЯ · ТАРЕЛКА ПОЧТИ ХОЛОДНАЯ", icon: "flame", color: theme.warning },
    field: { text: "ПЕРЕМЕННОЕ МИКРОВОЛНОВОЕ ПОЛЕ", icon: "waves", color: theme.accent },
    dipoles: { text: "ПОЛЯРНЫЕ МОЛЕКУЛЫ ВОДЫ ПЕРЕОРИЕНТИРУЮТСЯ", icon: "rotate-cw", color: theme.accent },
    losses: { text: "ДИЭЛЕКТРИЧЕСКИЕ ПОТЕРИ РАЗНЫЕ", icon: "scale", color: theme.accent2 },
    afterheat: { text: "ТАРЕЛКА ДОГРЕВАЕТСЯ ПОСЛЕ ЕДЫ", icon: "thermometer", color: theme.success },
  };
  const title = titles[phase];

  if (phase === "contrast") {
    return (
      <div style={{ position: "absolute", inset: 0, opacity: enter }}>
        <PhaseHeader {...title} opacity={enter} />
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <CavityShell opacity={enter} active={false} pulse={0} />
          <g opacity={enter}>
            <rect x="145" y="478" width="235" height="122" rx="18" fill={`${theme.warning}12`} stroke={`${theme.warning}88`} strokeWidth="3" />
            <text x="262" y="522" textAnchor="middle" fill={theme.warning} fontFamily={theme.mono} fontWeight="800" fontSize="24" letterSpacing="2">СУП</text>
            <text x="262" y="563" textAnchor="middle" fill={theme.text} fontFamily={theme.mono} fontWeight="800" fontSize="25">ОБЖИГА́ЕТ</text>
            <rect x="700" y="478" width="235" height="122" rx="18" fill={`${theme.accent2}12`} stroke={`${theme.accent2}88`} strokeWidth="3" />
            <text x="817" y="522" textAnchor="middle" fill={theme.accent2} fontFamily={theme.mono} fontWeight="800" fontSize="22" letterSpacing="1">ТАРЕЛКА</text>
            <text x="817" y="563" textAnchor="middle" fill={theme.text} fontFamily={theme.mono} fontWeight="800" fontSize="23">ПОЧТИ ХОЛОДНА</text>
            <path d="M 392 540 C 480 510 600 510 688 540" fill="none" stroke={theme.subtext} strokeWidth="4" strokeDasharray="10 12" />
            <text x="540" y="527" textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontWeight="800" fontSize="20">ЭНЕРГИЯ?</text>
          </g>
        </svg>
        <StatusBadge text="КТО ПОЛУЧАЕТ ЭНЕРГИЮ ПОЛЯ?" color={theme.warning} opacity={enter * (0.75 + pop * 0.25)} />
        <PulseRing x={540} y={735} triggerFrame={impactLocal} tone="warning" size={210} />
      </div>
    );
  }

  if (phase === "field") {
    const shift = (local * 5) % 54;
    return (
      <div style={{ position: "absolute", inset: 0, opacity: enter }}>
        <PhaseHeader {...title} opacity={enter} />
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <CavityShell opacity={enter} active={true} pulse={0.8} />
          <g opacity={enter * (0.7 + reveal * 0.3)}>
            {[500, 590, 680, 770, 860].map((y, i) => (
              <WaveArrow key={y} x={145} y={y} direction={i % 2 === 0 ? "right" : "left"} opacity={0.82} shift={shift} />
            ))}
            <text x="540" y="925" textAnchor="middle" fill={theme.accent} fontFamily={theme.mono} fontWeight="800" fontSize="24" letterSpacing="2">E(t): → ← → ←</text>
          </g>
        </svg>
        <StatusBadge text="ПОЛЕ МЕНЯЕТ НАПРАВЛЕНИЕ" color={theme.accent} opacity={enter} />
        <PulseRing x={540} y={735} triggerFrame={impactLocal} tone="accent" size={210} />
      </div>
    );
  }

  if (phase === "dipoles") {
    const align = smooth(local / Math.max(impactLocal, 1));
    const moleculePositions = [
      [190, 560], [370, 560], [520, 560], [190, 790], [370, 790], [520, 790],
    ];
    const molecules = moleculePositions.map(([x, y], i) => {
      const startAngle = [-36, 20, 58, 30, -24, 44][i];
      const angle = startAngle * (1 - align) + (-90 + 8 * Math.sin(local / 7 + i)) * align;
      return <Dipole key={`${x}-${y}`} x={x} y={y} angle={angle} scale={0.9} opacity={0.75 + 0.25 * align} />;
    });
    return (
      <div style={{ position: "absolute", inset: 0, opacity: enter }}>
        <PhaseHeader {...title} opacity={enter} />
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <rect x="78" y="380" width="566" height="680" rx="30" fill={`${theme.panel}EA`} stroke={`${theme.accent}88`} strokeWidth="4" />
          <text x="361" y="430" textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontWeight="800" fontSize="21" letterSpacing="2">H₂O · ПОЛЯРНАЯ МОЛЕКУЛА</text>
          <line x1="118" y1="690" x2="600" y2="690" stroke={`${theme.accent}44`} strokeWidth="3" strokeDasharray="10 12" />
          <path d="M 112 474 L 600 474 M 112 930 L 600 930" stroke={theme.accent} strokeWidth="4" strokeDasharray="14 13" opacity="0.62" />
          <path d="M 570 458 L 602 474 L 570 490 M 570 914 L 602 930 L 570 946" fill="none" stroke={theme.accent} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {molecules}
          <rect x="684" y="380" width="318" height="680" rx="30" fill={`${theme.panel}EA`} stroke={`${theme.warning}88`} strokeWidth="4" />
          <text x="843" y="430" textAnchor="middle" fill={theme.warning} fontFamily={theme.mono} fontWeight="800" fontSize="22" letterSpacing="2">АНАЛОГИЯ</text>
          <text x="843" y="470" textAnchor="middle" fill={theme.text} fontFamily={theme.mono} fontWeight="800" fontSize="20">СТРЕЛКИ-КОМПАСЫ</text>
          <Compass x={765} y={610} opacity={enter} />
          <Compass x={843} y={730} opacity={enter} />
          <Compass x={921} y={850} opacity={enter} />
          <line x1="731" y1="970" x2="955" y2="970" stroke={theme.warning} strokeWidth="4" strokeDasharray="12 10" />
          <path d="M 931 956 L 958 970 L 931 984" fill="none" stroke={theme.warning} strokeWidth="4" strokeLinecap="round" />
          <text x="843" y="1015" textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontWeight="800" fontSize="18">ПОЛЕ ЗАДАЁТ НАПРАВЛЕНИЕ</text>
        </svg>
        <StatusBadge text="ПОЛЕ ДЁРГАЕТ МОЛЕКУЛЫ ТУДА́ И ОБРА́ТНО" color={theme.accent} opacity={enter} />
        <PulseRing x={370} y={690} triggerFrame={impactLocal} tone="accent" size={180} />
      </div>
    );
  }

  if (phase === "losses") {
    const waterDots = Array.from({ length: 18 }, (_, i) => ({ x: 145 + (i % 6) * 62, y: 570 + Math.floor(i / 6) * 68 }));
    const glassDots = Array.from({ length: 5 }, (_, i) => ({ x: 690 + i * 52, y: 690 + (i % 2) * 68 }));
    return (
      <div style={{ position: "absolute", inset: 0, opacity: enter }}>
        <PhaseHeader {...title} opacity={enter} />
        <div style={{ ...panel(theme.accent), left: 68, top: 380, width: 446, height: 680, opacity: enter }}>
          <div style={{ position: "absolute", left: 0, top: 33, width: "100%", textAlign: "center", color: theme.accent, fontSize: 27, ...mono }}>ВОДА · ЕДА</div>
          <div style={{ position: "absolute", left: 0, top: 80, width: "100%", textAlign: "center", color: theme.subtext, fontSize: 18, ...mono }}>ПОЛЕ ПОГЛОЩАЕТСЯ</div>
          <svg width="446" height="680" viewBox="0 0 446 680" style={{ position: "absolute", inset: 0 }}>
            <path d="M 40 220 C 120 170 170 270 240 220 S 355 170 410 220" fill="none" stroke={theme.accent} strokeWidth="5" strokeDasharray="14 10" opacity="0.75" />
            <path d="M 40 270 C 120 220 170 320 240 270 S 355 220 410 270" fill="none" stroke={theme.accent} strokeWidth="5" strokeDasharray="14 10" opacity="0.75" />
            {waterDots.map((dot, i) => <circle key={i} cx={dot.x - 68} cy={dot.y - 380} r="10" fill={theme.warning} opacity={0.65 + 0.3 * Math.sin(local / 6 + i)} />)}
            <text x="223" y="465" textAnchor="middle" fill={theme.warning} fontFamily={theme.mono} fontWeight="800" fontSize="26">ПОТЕРИ · ВЫШЕ</text>
            <rect x="62" y="500" width="322" height="27" rx="13" fill={`${theme.panelBorder}`} />
            <rect x="62" y="500" width="276" height="27" rx="13" fill={theme.warning} />
            <text x="223" y="590" textAnchor="middle" fill={theme.success} fontFamily={theme.mono} fontWeight="800" fontSize="23">ЭНЕРГИЯ → ТЕПЛО</text>
          </svg>
        </div>
        <div style={{ ...panel(theme.accent2), left: 566, top: 380, width: 446, height: 680, opacity: enter }}>
          <div style={{ position: "absolute", left: 0, top: 33, width: "100%", textAlign: "center", color: theme.accent2, fontSize: 25, ...mono }}>СТЕКЛО / КЕРАМИКА</div>
          <div style={{ position: "absolute", left: 0, top: 80, width: "100%", textAlign: "center", color: theme.subtext, fontSize: 18, ...mono }}>ПОЛЕ ПРОХОДИТ СЛАБЕЕ</div>
          <svg width="446" height="680" viewBox="0 0 446 680" style={{ position: "absolute", inset: 0 }}>
            <path d="M 40 220 C 120 170 170 270 240 220 S 355 170 410 220" fill="none" stroke={theme.accent} strokeWidth="5" strokeDasharray="14 10" opacity="0.52" />
            <path d="M 40 270 C 120 220 170 320 240 270 S 355 220 410 270" fill="none" stroke={theme.accent} strokeWidth="5" strokeDasharray="14 10" opacity="0.52" />
            {glassDots.map((dot, i) => <circle key={i} cx={dot.x - 566} cy={dot.y - 380} r="9" fill={theme.accent2} opacity={0.42 + 0.12 * Math.sin(local / 6 + i)} />)}
            <text x="223" y="465" textAnchor="middle" fill={theme.accent2} fontFamily={theme.mono} fontWeight="800" fontSize="26">ПОТЕРИ · НИЖЕ</text>
            <rect x="62" y="500" width="322" height="27" rx="13" fill={`${theme.panelBorder}`} />
            <rect x="62" y="500" width="104" height="27" rx="13" fill={theme.accent2} />
            <text x="223" y="590" textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontWeight="800" fontSize="21">МЕНЬШЕ НАГРЕВА</text>
          </svg>
        </div>
        <StatusBadge text="ТАРЕЛКА ПОЛУЧАЕТ МЕНЬШЕ ЭНЕРГИИ НАПРЯМУЮ" color={theme.accent2} opacity={enter * (0.8 + pop * 0.2)} />
        <PulseRing x={540} y={720} triggerFrame={impactLocal} tone="accent2" size={200} />
      </div>
    );
  }

  // afterheat — прямой нагрев посуды слабее, но горячая еда и контакт догревают её.
  const sourceP = smooth(local / Math.max(impactLocal, 1));
  return (
    <div style={{ position: "absolute", inset: 0, opacity: enter }}>
      <PhaseHeader {...title} opacity={enter} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <rect x="92" y="380" width="896" height="680" rx="30" fill={`${theme.panel}EA`} stroke={`${theme.success}88`} strokeWidth="4" />
        <text x="540" y="430" textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontWeight="800" fontSize="21" letterSpacing="2">ПОСЛЕ ЦИКЛА НАГРЕВА</text>
        <FoodAndPlate x={690} y={735} scale={0.82} hot={true} opacity={enter} />
        <text x="690" y="895" textAnchor="middle" fill={theme.success} fontFamily={theme.mono} fontWeight="800" fontSize="23" letterSpacing="2">ТАРЕЛКА ТЕПЛЕЕТ</text>
        <g opacity={enter * sourceP}>
          <rect x="136" y="500" width="250" height="104" rx="18" fill={`${theme.warning}12`} stroke={`${theme.warning}88`} strokeWidth="3" />
          <text x="261" y="542" textAnchor="middle" fill={theme.warning} fontFamily={theme.mono} fontWeight="800" fontSize="23">ГОРЯЧАЯ ЕДА</text>
          <text x="261" y="579" textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontWeight="800" fontSize="18">ПЕРЕДАЁТ ТЕПЛО</text>
          <path d="M 390 552 C 480 552 520 640 580 675" fill="none" stroke={theme.warning} strokeWidth="5" strokeDasharray="12 10" />
          <path d="M 565 661 L 586 678 L 559 682" fill="none" stroke={theme.warning} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="136" y="700" width="250" height="104" rx="18" fill={`${theme.accent}12`} stroke={`${theme.accent}88`} strokeWidth="3" />
          <text x="261" y="742" textAnchor="middle" fill={theme.accent} fontFamily={theme.mono} fontWeight="800" fontSize="23">ВЛАГА</text>
          <text x="261" y="779" textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontWeight="800" fontSize="18">ПАР И КОНТАКТ</text>
          <path d="M 390 752 C 475 750 515 730 580 730" fill="none" stroke={theme.accent} strokeWidth="5" strokeDasharray="12 10" />
          <path d="M 560 716 L 586 730 L 560 744" fill="none" stroke={theme.accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="136" y="900" width="250" height="104" rx="18" fill={`${theme.accent2}12`} stroke={`${theme.accent2}88`} strokeWidth="3" />
          <text x="261" y="942" textAnchor="middle" fill={theme.accent2} fontFamily={theme.mono} fontWeight="800" fontSize="23">МАТЕРИАЛ</text>
          <text x="261" y="979" textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontWeight="800" fontSize="18">ТОЖЕ ПОГЛОЩАЕТ</text>
          <path d="M 390 952 C 480 952 530 860 600 820" fill="none" stroke={theme.accent2} strokeWidth="5" strokeDasharray="12 10" />
          <path d="M 585 816 L 610 812 L 598 834" fill="none" stroke={theme.accent2} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
      <StatusBadge text="«ПОЧТИ» НЕ ЗНАЧИТ «НИКОГДА́»" color={theme.success} opacity={enter * (0.78 + pop * 0.22)} />
      <PulseRing x={690} y={735} triggerFrame={impactLocal} tone="success" size={190} />
    </div>
  );
};

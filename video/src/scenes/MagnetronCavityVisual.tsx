import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type MagnetronCavityPhase = "electrons" | "resonance" | "waveguide";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: MagnetronCavityPhase;
};

const W = layout.width;
const H = layout.height;
const CX = W / 2;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1.4 };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const Header: React.FC<{ text: string; color: string; icon: string; opacity: number }> = ({ text, color, icon, opacity }) => (
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

const Badge: React.FC<{ text: string; color: string; opacity: number }> = ({ text, color, opacity }) => (
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
      boxShadow: `0 0 36px ${color}26`,
      ...mono,
    }}
  >
    {text}
  </div>
);

/** Поперечный разрез магнетрона: катод, электронный поток, резонаторные камеры
 *  и волновод, который вводит возбуждённые волны в металлическую камеру. */
export const MagnetronCavityVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "electrons" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const pop = local >= impactLocal ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  const reveal = smooth(local / Math.max(impactLocal, 1));
  const magnetronX = 315;
  const magnetronY = 730;
  const waveShift = -local * 4;
  const phaseMeta: Record<MagnetronCavityPhase, { text: string; color: string; icon: string; badge: string }> = {
    electrons: {
      text: "МАГНЕТРОН · ЭЛЕКТРОНЫ В ВАКУУМЕ",
      color: theme.accent,
      icon: "orbit",
      badge: "МАГНИТНОЕ ПОЛЕ ЗАКРУЧИВАЕТ ЭЛЕКТРОНЫ",
    },
    resonance: {
      text: "РЕЗОНАТОРНЫЕ КАМЕРЫ ВОЗБУЖДАЮТ ВОЛНЫ",
      color: theme.warning,
      icon: "radio",
      badge: "КАМЕРЫ ПРЕВРАЩАЮТ ДВИЖЕНИЕ В МИКРОВОЛНЫ",
    },
    waveguide: {
      text: "ВОЛНОВОД ВВОДИТ ВОЛНЫ В КАМЕРУ",
      color: theme.success,
      icon: "arrow-right",
      badge: "МИКРОВОЛНЫ УШЛИ В МЕТАЛЛИЧЕСКУЮ КАМЕРУ",
    },
  };
  const meta = phaseMeta[phase];
  const cavityGlow = phase === "resonance" ? 0.9 : 0.56;
  const guideGlow = phase === "waveguide" ? 1 : 0.62;

  return (
    <div style={{ position: "absolute", inset: 0, opacity: enter }}>
      <Header text={meta.text} color={meta.color} icon={meta.icon} opacity={enter} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {/* panels / vacuum tube */}
        <rect x="62" y="380" width="560" height="700" rx="30" fill={`${theme.panel}EA`} stroke={`${theme.accent}66`} strokeWidth="4" />
        <rect x="657" y="380" width="361" height="700" rx="30" fill={`${theme.panel}EA`} stroke={`${theme.success}66`} strokeWidth="4" />
        <text x="342" y="424" textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontWeight="800" fontSize="21" letterSpacing="2">ВАКУУМНАЯ ЛАМПА · РАЗРЕЗ</text>
        <text x="838" y="424" textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontWeight="800" fontSize="21" letterSpacing="2">МЕТАЛЛИЧЕСКАЯ КАМЕРА</text>

        {/* magnetic field lines around the active tube */}
        <g opacity={enter * (0.45 + 0.35 * reveal)}>
          <path d="M 112 600 C 20 670 20 790 112 860" fill="none" stroke={theme.accent2} strokeWidth="5" strokeDasharray="12 13" />
          <path d="M 520 600 C 610 670 610 790 520 860" fill="none" stroke={theme.accent2} strokeWidth="5" strokeDasharray="12 13" />
          <text x="107" y="570" textAnchor="middle" fill={theme.accent2} fontFamily={theme.mono} fontWeight="800" fontSize="28">B ⟳</text>
          <text x="537" y="570" textAnchor="middle" fill={theme.accent2} fontFamily={theme.mono} fontWeight="800" fontSize="19" letterSpacing="1">МАГНИТНОЕ ПОЛЕ</text>
        </g>

        {/* anode block and eight resonator cavities */}
        <circle cx={magnetronX} cy={magnetronY} r="226" fill={`${theme.bg}CC`} stroke={`${theme.accent}88`} strokeWidth="5" />
        <circle cx={magnetronX} cy={magnetronY} r="151" fill={`${theme.panel}DD`} stroke={`${theme.warning}${Math.round(cavityGlow * 255).toString(16).padStart(2, "0")}`} strokeWidth="7" />
        {Array.from({ length: 8 }).map((_, i) => {
          const active = phase === "resonance" || i % 2 === 0;
          const color = active ? theme.warning : theme.subtext;
          const opacity = enter * (active ? cavityGlow : 0.48);
          return (
            <g key={i} opacity={opacity} transform={`rotate(${i * 45} ${magnetronX} ${magnetronY})`}>
              <rect x={magnetronX - 27} y={magnetronY - 222} width="54" height="83" rx="12" fill={`${color}22`} stroke={color} strokeWidth="4" />
              <line x1={magnetronX} y1={magnetronY - 139} x2={magnetronX} y2={magnetronY - 112} stroke={color} strokeWidth="7" strokeLinecap="round" />
            </g>
          );
        })}
        <text x={magnetronX} y="480" textAnchor="middle" fill={theme.warning} fontFamily={theme.mono} fontWeight="800" fontSize="19" letterSpacing="1">АНОД · РЕЗОНАТОРЫ</text>

        {/* electrons orbiting the cathode */}
        <ellipse cx={magnetronX} cy={magnetronY} rx="105" ry="128" fill="none" stroke={`${theme.accent}99`} strokeWidth="4" strokeDasharray="14 12" strokeDashoffset={waveShift} />
        <ellipse cx={magnetronX} cy={magnetronY} rx="125" ry="150" fill="none" stroke={`${theme.accent}55`} strokeWidth="3" strokeDasharray="8 16" strokeDashoffset={-waveShift * 0.8} />
        {Array.from({ length: 7 }).map((_, i) => {
          const theta = local / 11 + i * (Math.PI * 2 / 7);
          const radiusX = 105 + (i % 2) * 20;
          const radiusY = 128 + (i % 2) * 22;
          const x = magnetronX + radiusX * Math.cos(theta);
          const y = magnetronY + radiusY * Math.sin(theta);
          return (
            <g key={`electron-${i}`} opacity={enter * (0.72 + 0.28 * Math.sin(local / 6 + i))}>
              <circle cx={x} cy={y} r="11" fill={theme.accent} stroke={theme.text} strokeWidth="2" />
              <text x={x} y={y + 6} textAnchor="middle" fill={theme.bg} fontFamily={theme.mono} fontWeight="800" fontSize="13">e⁻</text>
            </g>
          );
        })}
        <circle cx={magnetronX} cy={magnetronY} r="58" fill={`${theme.danger}44`} stroke={theme.danger} strokeWidth="5" />
        <text x={magnetronX} y={magnetronY - 5} textAnchor="middle" fill={theme.danger} fontFamily={theme.mono} fontWeight="800" fontSize="23">− КАТОД</text>
        <text x={magnetronX} y={magnetronY + 25} textAnchor="middle" fill={theme.text} fontFamily={theme.mono} fontWeight="800" fontSize="17">ЭЛЕКТРОНЫ</text>

        {/* outlet from the resonators into a waveguide */}
        <rect x="535" y="680" width="170" height="105" rx="18" fill={`${theme.bg}EE`} stroke={`${theme.success}${Math.round(guideGlow * 255).toString(16).padStart(2, "0")}`} strokeWidth="5" />
        <text x="620" y="662" textAnchor="middle" fill={theme.success} fontFamily={theme.mono} fontWeight="800" fontSize="19" letterSpacing="1">ВОЛНОВОД</text>
        <path d="M 548 732 C 570 698 590 766 612 732 S 655 698 692 732" fill="none" stroke={theme.success} strokeWidth="6" strokeDasharray="18 13" strokeDashoffset={waveShift} opacity={enter * guideGlow} />
        <path d="M 688 715 L 705 732 L 688 749" fill="none" stroke={theme.success} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity={enter * guideGlow} />

        {/* chamber that receives the wave */}
        <rect x="722" y="500" width="232" height="420" rx="24" fill={`${theme.bg}BB`} stroke={`${theme.subtext}88`} strokeWidth="4" />
        <rect x="747" y="548" width="182" height="310" rx="16" fill={`${theme.accent}0A`} stroke={`${theme.accent}44`} strokeWidth="3" />
        <path d="M 760 610 C 790 565 820 655 850 610 S 910 565 920 610" fill="none" stroke={theme.accent} strokeWidth="5" strokeDasharray="16 13" strokeDashoffset={waveShift} opacity={enter * (0.52 + guideGlow * 0.4)} />
        <path d="M 760 700 C 790 655 820 745 850 700 S 910 655 920 700" fill="none" stroke={theme.accent} strokeWidth="5" strokeDasharray="16 13" strokeDashoffset={waveShift * 1.1} opacity={enter * (0.52 + guideGlow * 0.4)} />
        <path d="M 760 790 C 790 745 820 835 850 790 S 910 745 920 790" fill="none" stroke={theme.accent} strokeWidth="5" strokeDasharray="16 13" strokeDashoffset={waveShift * 1.2} opacity={enter * (0.52 + guideGlow * 0.4)} />
        <text x="838" y="958" textAnchor="middle" fill={theme.accent} fontFamily={theme.mono} fontWeight="800" fontSize="20" letterSpacing="1">МИКРОВОЛНЫ</text>
        <text x="838" y="992" textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontWeight="800" fontSize="18">2,45 ГГЦ</text>
      </svg>
      <Badge text={meta.badge} color={meta.color} opacity={enter * (0.78 + pop * 0.22)} />
      <PulseRing x={phase === "waveguide" ? 620 : magnetronX} y={phase === "waveguide" ? 732 : 505} triggerFrame={impactLocal} tone={phase === "resonance" ? "warning" : phase === "waveguide" ? "success" : "accent"} size={190} />
    </div>
  );
};

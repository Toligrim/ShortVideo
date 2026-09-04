import React from "react";
import { random, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type AudioFingerprintPhase = "noise" | "map" | "peaks" | "pair" | "vote";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: AudioFingerprintPhase;
}

const W = layout.width;
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

const phaseTitle: Record<AudioFingerprintPhase, string> = {
  noise: "ШУМНАЯ ЗАПИСЬ · КАФЕ",
  map: "ОТПЕЧАТОК · КАРТА МАРШРУТА",
  peaks: "СПЕКТРОГРАММА · ЛОКАЛЬНЫЕ ПИКИ",
  pair: "ПАРА · ДВЕ ЧАСТОТЫ + ВРЕМЯ",
  vote: "ГОЛОСОВАНИЕ · ОБЩИЙ СДВИГ",
};

const phaseColor: Record<AudioFingerprintPhase, string> = {
  noise: theme.warning,
  map: theme.accent2,
  peaks: theme.accent,
  pair: theme.success,
  vote: theme.success,
};

const phaseIcon: Record<AudioFingerprintPhase, string> = {
  noise: "mic-2",
  map: "map",
  peaks: "scan-search",
  pair: "link-2",
  vote: "check-circle-2",
};

const PEAKS = [
  { x: 0.16, y: 0.63 },
  { x: 0.31, y: 0.31 },
  { x: 0.46, y: 0.72 },
  { x: 0.62, y: 0.42 },
  { x: 0.79, y: 0.68 },
  { x: 0.88, y: 0.25 },
];

const Header: React.FC<{ phase: AudioFingerprintPhase; enter: number }> = ({ phase, enter }) => {
  const color = phaseColor[phase];
  return (
    <div
      style={{
        position: "absolute",
        left: CX,
        top: 228,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        color,
        ...mono,
        fontSize: 23,
        whiteSpace: "nowrap",
        opacity: enter,
      }}
    >
      <IconGlyph name={phaseIcon[phase]} size={30} color={color} strokeWidth={1.8} />
      <span>{phaseTitle[phase]}</span>
    </div>
  );
};

const Panel: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  enter: number;
  children: React.ReactNode;
}> = ({ x, y, width, height, color, enter, children }) => (
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
      boxShadow: `0 0 38px ${color}1E`,
      opacity: enter,
      transform: `translateY(${(1 - enter) * 26}px)`,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const PanelTitle: React.FC<{ text: string; color: string; icon?: string }> = ({ text, color, icon }) => (
  <div
    style={{
      position: "absolute",
      left: 28,
      right: 28,
      top: 22,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      color,
      ...mono,
      fontSize: 20,
      whiteSpace: "nowrap",
    }}
  >
    {icon ? <IconGlyph name={icon} size={28} color={color} strokeWidth={1.8} /> : null}
    <span>{text}</span>
  </div>
);

const BottomBadge: React.FC<{ text: string; color: string; opacity: number; scale?: number }> = ({
  text,
  color,
  opacity,
  scale = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left: 70,
      top: 1165,
      width: 940,
      minHeight: 78,
      boxSizing: "border-box",
      padding: "16px 28px",
      borderRadius: 999,
      background: `${color}16`,
      border: `3px solid ${color}99`,
      color,
      textAlign: "center",
      ...mono,
      fontSize: 22,
      whiteSpace: "nowrap",
      opacity,
      transform: `scale(${0.96 + 0.04 * scale})`,
      boxShadow: `0 0 34px ${color}24`,
    }}
  >
    {text}
  </div>
);

const SourceChip: React.FC<{
  x: number;
  icon: string;
  text: string;
  color: string;
  opacity: number;
}> = ({ x, icon, text, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: 78,
      width: 274,
      height: 56,
      boxSizing: "border-box",
      borderRadius: 15,
      background: `${color}16`,
      border: `2px solid ${color}66`,
      color,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      ...mono,
      fontSize: 17,
      whiteSpace: "nowrap",
      opacity,
    }}
  >
    <IconGlyph name={icon} size={24} color={color} strokeWidth={1.8} />
    <span>{text}</span>
  </div>
);

const PeakDot: React.FC<{
  x: number;
  y: number;
  color: string;
  opacity: number;
  size?: number;
  label?: string;
  labelSide?: "left" | "right";
}> = ({ x, y, color, opacity, size = 22, label, labelSide = "right" }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: size,
      height: size,
      borderRadius: "50%",
      background: color,
      border: `4px solid ${theme.bg}`,
      boxShadow: `0 0 18px ${color}`,
      transform: "translate(-50%, -50%)",
      opacity,
      zIndex: 4,
    }}
  >
    {label ? (
      <span
        style={{
          position: "absolute",
          top: -29,
          left: labelSide === "right" ? 20 : undefined,
          right: labelSide === "left" ? 20 : undefined,
          color,
          ...mono,
          fontSize: 17,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    ) : null}
  </div>
);

const Lamp: React.FC<{ x: number; y: number; color: string; opacity: number; label: string }> = ({
  x,
  y,
  color,
  opacity,
  label,
}) => (
  <div style={{ position: "absolute", left: x, top: y, width: 86, height: 106, opacity }}>
    <div
      style={{
        position: "absolute",
        left: 28,
        top: 12,
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 26px ${color}, 0 0 52px ${color}88`,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 40,
        top: 38,
        width: 5,
        height: 48,
        background: `${color}CC`,
        borderRadius: 5,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 20,
        top: 84,
        width: 44,
        height: 6,
        borderRadius: 6,
        background: `${color}AA`,
      }}
    />
    <div style={{ position: "absolute", top: 94, left: 0, width: 86, textAlign: "center", color, ...mono, fontSize: 15 }}>
      {label}
    </div>
  </div>
);

const Spectrogram: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  pointOpacity: number;
  pointScale?: number;
  compact?: boolean;
  withAxes?: boolean;
  withMask?: boolean;
  activePair?: boolean;
}> = ({ x, y, width, height, pointOpacity, pointScale = 1, compact = false, withAxes = false, withMask = false, activePair = false }) => {
  const cols = compact ? 8 : 12;
  const rows = compact ? 6 : 8;
  const cellGap = compact ? 4 : 5;
  const innerX = compact ? 22 : 48;
  const innerY = compact ? 22 : 36;
  const gridWidth = width - innerX - (compact ? 18 : 28);
  const gridHeight = height - innerY - (compact ? 16 : 38);
  const pairA = { x: innerX + gridWidth * 0.27, y: innerY + gridHeight * 0.34 };
  const pairB = { x: innerX + gridWidth * 0.71, y: innerY + gridHeight * 0.67 };

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        borderRadius: compact ? 16 : 18,
        background: `${theme.bg}E8`,
        border: `2px solid ${theme.panelBorder}`,
        overflow: "visible",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: innerX,
          top: innerY,
          width: gridWidth,
          height: gridHeight,
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: cellGap,
          opacity: 0.9,
        }}
      >
        {Array.from({ length: cols * rows }).map((_, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const ridge = (row === 2 && col % 3 !== 0) || (row === 5 && col % 4 === 1);
          const intensity = 0.12 + random(`spectrogram-cell-${compact ? "small" : "large"}-${i}`) * 0.28 + (ridge ? 0.16 : 0);
          const cellColor = row % 3 === 0 ? theme.accent2 : row % 2 === 0 ? theme.accent : theme.warning;
          return (
            <div
              key={i}
              style={{
                borderRadius: compact ? 4 : 6,
                background: `${cellColor}${Math.round(intensity * 255).toString(16).padStart(2, "0")}`,
                boxShadow: ridge ? `0 0 16px ${cellColor}22` : "none",
              }}
            />
          );
        })}
      </div>

      {withMask
        ? [
            { left: 0.45, top: 0.12, width: 0.18, height: 0.16 },
            { left: 0.65, top: 0.72, width: 0.2, height: 0.13 },
            { left: 0.08, top: 0.45, width: 0.12, height: 0.18 },
          ].map((mask, i) => (
            <div
              key={`mask-${i}`}
              style={{
                position: "absolute",
                left: innerX + gridWidth * mask.left,
                top: innerY + gridHeight * mask.top,
                width: gridWidth * mask.width,
                height: gridHeight * mask.height,
                borderRadius: 8,
                background: `${theme.danger}2C`,
                border: `2px dashed ${theme.danger}66`,
                opacity: 0.82,
              }}
            />
          ))
        : null}

      {PEAKS.map((peak, i) => {
        const px = innerX + gridWidth * peak.x;
        const py = innerY + gridHeight * peak.y;
        const isPair = activePair && (i === 1 || i === 4);
        return (
          <PeakDot
            key={`peak-${i}`}
            x={px}
            y={py}
            color={isPair ? theme.success : theme.accent}
            opacity={pointOpacity * (isPair ? 1 : 0.72)}
            size={(compact ? 16 : 22) * pointScale}
          />
        );
      })}

      {withAxes ? (
        <>
          <span style={{ position: "absolute", left: innerX + gridWidth / 2 - 38, top: height - 29, color: theme.subtext, ...mono, fontSize: 16, whiteSpace: "nowrap" }}>
            ВРЕМЯ →
          </span>
          <span style={{ position: "absolute", left: 8, top: innerY + gridHeight / 2 + 40, color: theme.subtext, ...mono, fontSize: 15, transform: "rotate(-90deg)", transformOrigin: "left top", whiteSpace: "nowrap" }}>
            ВЫСОТА ЗВУКА ↑
          </span>
        </>
      ) : null}
      {activePair ? (
        <>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none", zIndex: 3 }}>
            <line x1={pairA.x} y1={pairA.y} x2={pairB.x} y2={pairB.y} stroke={theme.success} strokeWidth={5} strokeLinecap="round" strokeDasharray="14 10" opacity={pointOpacity} />
            <line x1={pairA.x} y1={height - 62} x2={pairB.x} y2={height - 62} stroke={theme.success} strokeWidth={3} strokeDasharray="8 7" opacity={pointOpacity * 0.9} />
          </svg>
          <span style={{ position: "absolute", left: (pairA.x + pairB.x) / 2 - 56, top: height - 91, color: theme.success, ...mono, fontSize: 16, whiteSpace: "nowrap", opacity: pointOpacity }}>
            Δt = 0,42 с
          </span>
          <span style={{ position: "absolute", left: pairA.x - 19, top: pairA.y - 31, color: theme.success, ...mono, fontSize: 15, whiteSpace: "nowrap", opacity: pointOpacity }}>
            420 ГЦ
          </span>
          <span style={{ position: "absolute", left: pairB.x - 20, top: pairB.y - 31, color: theme.success, ...mono, fontSize: 15, whiteSpace: "nowrap", opacity: pointOpacity }}>
            860 ГЦ
          </span>
        </>
      ) : null}
    </div>
  );
};

const NoisePhase: React.FC<{ enter: number; pop: number; impactLocal: number }> = ({ enter, pop, impactLocal }) => {
  const bars = Array.from({ length: 48 });
  return (
    <>
      <Panel x={70} y={365} width={940} height={670} color={theme.warning} enter={enter}>
        <PanelTitle text="ЗАПРОС С ТЕЛЕФОНА" color={theme.warning} icon="smartphone" />
        <SourceChip x={30} icon="coffee" text="КОФЕМОЛКА" color={theme.warning} opacity={enter} />
        <SourceChip x={333} icon="messages-square" text="РАЗГОВОРЫ" color={theme.danger} opacity={enter} />
        <SourceChip x={636} icon="music-2" text="ПЕСНЯ В ФОНЕ" color={theme.accent} opacity={enter} />

        <div
          style={{
            position: "absolute",
            left: 32,
            top: 176,
            width: 178,
            height: 304,
            borderRadius: 22,
            background: `${theme.bg}E8`,
            border: `3px solid ${theme.warning}66`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 13,
          }}
        >
          <div style={{ width: 66, height: 112, borderRadius: 15, border: `4px solid ${theme.warning}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 28px ${theme.warning}33` }}>
            <IconGlyph name="mic-2" size={40} color={theme.warning} strokeWidth={1.7} />
          </div>
          <div style={{ color: theme.warning, ...mono, fontSize: 20 }}>ШАЗАМ</div>
          <div style={{ color: theme.subtext, ...mono, fontSize: 16 }}>СЛУШАЕТ</div>
          <div style={{ width: 90, height: 5, borderRadius: 5, background: `${theme.warning}88` }} />
          <div style={{ color: theme.success, ...mono, fontSize: 15, opacity: 0.25 + 0.75 * pop }}>ОТКЛИК НАЙДЕН</div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 240,
            top: 176,
            width: 666,
            height: 304,
            borderRadius: 20,
            background: `${theme.bg}E8`,
            border: `2px solid ${theme.panelBorder}`,
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", left: 22, top: 18, color: theme.subtext, ...mono, fontSize: 16 }}>ЗАПИСЬ · ШУМ + СИГНАЛ</div>
          <div style={{ position: "absolute", left: 22, right: 22, top: 70, height: 172, display: "flex", alignItems: "center", gap: 4 }}>
            {bars.map((_, i) => {
              const noise = 0.35 + random(`cafe-noise-${i}`) * 0.65;
              const song = 0.18 + Math.abs(Math.sin(i * 0.57)) * 0.22;
              const height = 22 + noise * 116 + song * 30;
              const color = i % 7 === 0 || i % 11 === 0 ? theme.danger : theme.warning;
              return (
                <div key={i} style={{ flex: 1, height, minWidth: 4, borderRadius: 8, background: `${color}${i % 5 === 0 ? "CC" : "66"}`, boxShadow: `0 0 12px ${color}22` }} />
              );
            })}
          </div>
          <div style={{ position: "absolute", left: 22, right: 22, top: 155, height: 3, background: `${theme.accent}99`, boxShadow: `0 0 16px ${theme.accent}99`, transform: "skewY(-2deg)" }} />
          <div style={{ position: "absolute", left: 22, bottom: 20, color: theme.danger, ...mono, fontSize: 17 }}>ГРОМКО: КОФЕ + ГОЛОСА</div>
          <div style={{ position: "absolute", right: 22, bottom: 20, color: theme.accent, ...mono, fontSize: 17 }}>ПЕСНЯ ЕЩЁ ЕСТЬ</div>
        </div>

        <div style={{ position: "absolute", left: 34, right: 34, bottom: 26, display: "flex", alignItems: "center", justifyContent: "space-between", color: theme.subtext, ...mono, fontSize: 17 }}>
          <span>МИКРОФОН ЛОВИТ ВСЁ</span>
          <span style={{ color: theme.warning }}>СИГНАЛ НЕ ИСЧЕЗ</span>
        </div>
      </Panel>
      <div style={{ position: "absolute", left: 70, top: 1070, width: 940, textAlign: "center", color: theme.subtext, ...mono, fontSize: 18, opacity: enter }}>
        ШУМ МАСКИРУЕТ ПЕСНЮ, НО НЕ СТИРАЕТ ЕЁ
      </div>
      <BottomBadge text="ШУМ КАФЕ · ТЕЛЕФОН ИЩЕТ ОТКЛИК" color={theme.warning} opacity={enter * (0.78 + 0.22 * pop)} scale={pop} />
      <PulseRing x={191} y={693} triggerFrame={impactLocal} tone="warning" size={110} />
    </>
  );
};

const MapPhase: React.FC<{ enter: number; pop: number; impactLocal: number }> = ({ enter, pop, impactLocal }) => {
  const landmarks = [
    { x: 96, y: 96, label: "ОРИЕНТИР 1" },
    { x: 300, y: 205, label: "ОРИЕНТИР 2" },
    { x: 540, y: 92, label: "ОРИЕНТИР 3" },
    { x: 735, y: 225, label: "ОРИЕНТИР 4" },
  ];
  const route = "M 60 280 C 170 150, 240 350, 350 250 S 520 120, 640 250 S 750 380, 820 150";
  return (
    <>
      <Panel x={70} y={365} width={940} height={670} color={theme.accent2} enter={enter}>
        <PanelTitle text="НЕ ВСЯ УЛИЦА · РЕДКИЕ ОРИЕНТИРЫ" color={theme.accent2} icon="map" />
        <div style={{ position: "absolute", left: 30, top: 79, color: theme.subtext, ...mono, fontSize: 16 }}>КАРТА МАРШРУТА</div>
        <div style={{ position: "absolute", right: 30, top: 72, padding: "8px 13px", borderRadius: 12, background: `${theme.accent2}18`, border: `2px solid ${theme.accent2}66`, color: theme.accent2, ...mono, fontSize: 16 }}>4 ТОЧКИ</div>
        <div style={{ position: "absolute", left: 30, top: 118, width: 880, height: 460, borderRadius: 18, background: `${theme.bg}E8`, border: `2px solid ${theme.panelBorder}`, overflow: "hidden" }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={`street-h-${i}`} style={{ position: "absolute", left: -80, top: 40 + i * 69, width: 1040, height: 2, background: `${theme.panelBorder}99`, transform: `rotate(${i % 2 === 0 ? -6 : 5}deg)` }} />
          ))}
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={`street-v-${i}`} style={{ position: "absolute", left: 100 + i * 180, top: -80, width: 2, height: 620, background: `${theme.panelBorder}99`, transform: `rotate(${i % 2 === 0 ? 7 : -8}deg)` }} />
          ))}
          <svg width={880} height={460} viewBox="0 0 880 460" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <path d={route} fill="none" stroke={`${theme.accent2}44`} strokeWidth={20} strokeLinecap="round" />
            <path d={route} fill="none" stroke={theme.accent2} strokeWidth={5} strokeDasharray="18 13" strokeLinecap="round" opacity={0.7 + pop * 0.3} />
          </svg>
          {Array.from({ length: 22 }).map((_, i) => {
            const x = 38 + random(`map-small-point-${i}`) * 800;
            const y = 30 + random(`map-small-point-y-${i}`) * 390;
            return <div key={`small-${i}`} style={{ position: "absolute", left: x, top: y, width: 8, height: 8, borderRadius: "50%", background: `${theme.subtext}66` }} />;
          })}
          {landmarks.map((landmark, i) => (
            <Lamp key={landmark.label} x={landmark.x} y={landmark.y} color={i === 1 ? theme.warning : theme.accent2} opacity={enter * (0.2 + 0.8 * pop)} label={landmark.label} />
          ))}
          <div style={{ position: "absolute", left: 30, bottom: 19, color: theme.subtext, ...mono, fontSize: 16 }}>СЕРЫЕ ЛИНИИ = ВСЯ УЛИЦА</div>
          <div style={{ position: "absolute", right: 28, bottom: 19, color: theme.accent2, ...mono, fontSize: 16 }}>ЯРКИЕ ФОНАРИ = ОРИЕНТИРЫ</div>
        </div>
        <div style={{ position: "absolute", left: 30, right: 30, bottom: 25, display: "flex", justifyContent: "space-between", color: theme.subtext, ...mono, fontSize: 17 }}>
          <span>ХРАНИТЬ ВЕСЬ МАРШРУТ НЕ НУЖНО</span>
          <span style={{ color: theme.accent2 }}>ОСТАЮТСЯ РЕДКИЕ ТОЧКИ</span>
        </div>
      </Panel>
      <BottomBadge text="КАРТА ПУТИ · ТОЛЬКО РЕДКИЕ ОРИЕНТИРЫ" color={theme.accent2} opacity={enter} scale={pop} />
      <PulseRing x={442} y={714} triggerFrame={impactLocal} tone="accent2" size={150} />
    </>
  );
};

const PeaksPhase: React.FC<{ enter: number; pop: number; impactLocal: number }> = ({ enter, pop, impactLocal }) => (
  <>
    <Panel x={70} y={365} width={940} height={670} color={theme.accent} enter={enter}>
      <PanelTitle text="КАРТА ВРЕМЕНИ И ВЫСОТЫ ЗВУКА" color={theme.accent} icon="scan-search" />
      <div style={{ position: "absolute", left: 30, top: 80, color: theme.danger, ...mono, fontSize: 16 }}>ШУМОВОЙ ФОН</div>
      <div style={{ position: "absolute", right: 30, top: 72, padding: "8px 13px", borderRadius: 12, background: `${theme.accent}18`, border: `2px solid ${theme.accent}66`, color: theme.accent, ...mono, fontSize: 16 }}>ПИКИ = ОРИЕНТИРЫ</div>
      <Spectrogram x={30} y={116} width={880} height={472} pointOpacity={enter * (0.2 + 0.8 * pop)} withAxes withMask />
      <div style={{ position: "absolute", left: 30, bottom: 25, color: theme.subtext, ...mono, fontSize: 17 }}>ОСТАВЛЯЕМ ТОЛЬКО ЛОКАЛЬНЫЕ МАКСИМУМЫ</div>
    </Panel>
    <div style={{ position: "absolute", left: 70, top: 1070, width: 940, textAlign: "center", color: theme.subtext, ...mono, fontSize: 18, opacity: enter }}>СВЕТЛЫЕ ТОЧКИ ДЕРЖАТСЯ ДАЖЕ СКВОЗЬ ШУМ</div>
    <BottomBadge text="ШУМ СКРЫВАЕТ ЧАСТЬ · УСТОЙЧИВЫЕ ПИКИ ОСТАЮТСЯ" color={theme.accent} opacity={enter} scale={pop} />
    <PulseRing x={646} y={684} triggerFrame={impactLocal} tone="accent" size={150} />
  </>
);

const PairPhase: React.FC<{ enter: number; pop: number; impactLocal: number }> = ({ enter, pop, impactLocal }) => (
  <>
    <Panel x={70} y={365} width={600} height={670} color={theme.success} enter={enter}>
      <PanelTitle text="БЛИЖАЙШИЙ ПИК · ПАРА" color={theme.success} icon="link-2" />
      <Spectrogram x={28} y={100} width={544} height={490} pointOpacity={enter * (0.25 + 0.75 * pop)} compact activePair />
      <div style={{ position: "absolute", left: 28, right: 28, bottom: 24, color: theme.subtext, ...mono, fontSize: 16, textAlign: "center" }}>СОЕДИНИЛИ ДВЕ ТОЧКИ ВМЕСТЕ</div>
    </Panel>
    <Panel x={700} y={430} width={310} height={505} color={theme.success} enter={enter * (0.86 + 0.14 * pop)}>
      <PanelTitle text="КОРОТКИЙ КОД" color={theme.success} icon="code-2" />
      <div style={{ position: "absolute", left: 26, right: 26, top: 102, height: 90, borderRadius: 15, background: `${theme.success}15`, border: `2px solid ${theme.success}66`, display: "flex", alignItems: "center", justifyContent: "center", color: theme.success, ...mono, fontSize: 24 }}>ПАРА</div>
      <div style={{ position: "absolute", left: 28, right: 28, top: 220, display: "grid", gap: 16, color: theme.text, ...mono, fontSize: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: theme.subtext }}>f₁</span><span>420 ГЦ</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: theme.subtext }}>f₂</span><span>860 ГЦ</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: theme.subtext }}>Δt</span><span>0,42 С</span></div>
      </div>
      <div style={{ position: "absolute", left: 28, right: 28, bottom: 32, textAlign: "center", color: theme.success, ...mono, fontSize: 16 }}>ЧАСТОТЫ + ПРОМЕЖУТОК</div>
    </Panel>
    <BottomBadge text="ПАРА = ДВЕ ЧАСТОТЫ + ПРОМЕЖУТОК" color={theme.success} opacity={enter} scale={pop} />
    <PulseRing x={362} y={710} triggerFrame={impactLocal} tone="success" size={160} />
  </>
);

const VotePhase: React.FC<{ enter: number; pop: number; impactLocal: number }> = ({ enter, pop, impactLocal }) => {
  const rows = [
    { label: "ПЕСНЯ А", color: theme.subtext, pairs: [[52, 178], [280, 465]] },
    { label: "ПЕСНЯ Б", color: theme.success, pairs: [[48, 198], [178, 328], [308, 458], [438, 588], [568, 718]] },
    { label: "ПЕСНЯ В", color: theme.subtext, pairs: [[88, 248], [380, 512]] },
    { label: "ПЕСНЯ Г", color: theme.subtext, pairs: [[145, 310], [470, 560]] },
  ];
  const timelineX = 192;
  const timelineW = 680;
  const rowTop = 154;
  const rowStep = 99;
  const reveal = smooth(pop);
  return (
    <>
      <Panel x={70} y={365} width={940} height={690} color={theme.success} enter={enter}>
        <PanelTitle text="СОВПАДЕНИЯ ПО КАНДИДАТАМ" color={theme.success} icon="check-circle-2" />
        <div style={{ position: "absolute", left: 30, top: 78, color: theme.subtext, ...mono, fontSize: 16 }}>КАЖДАЯ ЛИНИЯ = ПАРА ПИКОВ</div>
        <div style={{ position: "absolute", right: 30, top: 71, padding: "8px 13px", borderRadius: 12, background: `${theme.success}18`, border: `2px solid ${theme.success}88`, color: theme.success, ...mono, fontSize: 16, opacity: 0.35 + reveal * 0.65 }}>ОДИНАКОВЫЙ СДВИГ</div>
        {rows.map((row, rowIndex) => {
          const correct = rowIndex === 1;
          const y = rowTop + rowIndex * rowStep;
          return (
            <div key={row.label} style={{ position: "absolute", left: 30, top: y, width: 880, height: 76, borderRadius: 15, background: correct ? `${theme.success}12` : `${theme.bg}66`, border: `2px solid ${correct ? theme.success : theme.panelBorder}${correct ? "99" : "AA"}` }}>
              <div style={{ position: "absolute", left: 18, top: 25, width: 125, color: row.color, ...mono, fontSize: 17 }}>{row.label}</div>
              <div style={{ position: "absolute", left: timelineX - 30, top: 0, width: timelineW, height: 76 }}>
                <div style={{ position: "absolute", left: 0, right: 0, top: 37, borderTop: `2px solid ${theme.panelBorder}` }} />
                {row.pairs.map(([source, target], pairIndex) => (
                  <React.Fragment key={`${row.label}-${pairIndex}`}>
                    <div style={{ position: "absolute", left: source, top: 30, width: 14, height: 14, borderRadius: "50%", background: row.color, boxShadow: correct ? `0 0 12px ${row.color}` : "none", opacity: 0.35 + (correct ? reveal * 0.65 : pairIndex === 0 ? reveal * 0.5 : 0.12) }} />
                    <div style={{ position: "absolute", left: target, top: 30, width: 14, height: 14, borderRadius: "50%", background: row.color, boxShadow: correct ? `0 0 12px ${row.color}` : "none", opacity: 0.35 + (correct ? reveal * 0.65 : pairIndex === 0 ? reveal * 0.5 : 0.12) }} />
                    <div style={{ position: "absolute", left: source + 7, top: 36, width: Math.max(10, target - source - 14), height: 4, borderRadius: 4, background: row.color, transformOrigin: "left center", transform: `scaleX(${correct ? reveal : pairIndex === 0 ? reveal : 0.22})`, opacity: correct ? 0.9 : 0.28 }} />
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })}
        <div style={{ position: "absolute", left: 30, right: 30, bottom: 24, display: "flex", justifyContent: "space-between", color: theme.subtext, ...mono, fontSize: 17 }}>
          <span>РАЗНЫЕ КАНДИДАТЫ</span>
          <span style={{ color: theme.success }}>ПЕСНЯ Б СОБРАЛА БОЛЬШЕ ВСЕХ</span>
        </div>
      </Panel>
      <BottomBadge text="ТЫСЯЧИ ПАР · ОДИН ОБЩИЙ СДВИГ" color={theme.success} opacity={enter * (0.78 + reveal * 0.22)} scale={reveal} />
      <PulseRing x={385} y={654} triggerFrame={impactLocal} tone="success" size={180} />
    </>
  );
};

/** Audio fingerprint: noisy recording → sparse peaks → paired coordinates → one voted time shift. */
export const AudioFingerprintVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "noise" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;

  return (
    <>
      <Header phase={phase} enter={enter} />
      {phase === "noise" ? <NoisePhase enter={enter} pop={pop} impactLocal={impactLocal} /> : null}
      {phase === "map" ? <MapPhase enter={enter} pop={pop} impactLocal={impactLocal} /> : null}
      {phase === "peaks" ? <PeaksPhase enter={enter} pop={pop} impactLocal={impactLocal} /> : null}
      {phase === "pair" ? <PairPhase enter={enter} pop={pop} impactLocal={impactLocal} /> : null}
      {phase === "vote" ? <VotePhase enter={enter} pop={pop} impactLocal={impactLocal} /> : null}
    </>
  );
};

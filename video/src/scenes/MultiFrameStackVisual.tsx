import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

export type MultiFrameStackPhase = "compare" | "long" | "capture" | "align" | "average" | "reject" | "fifteen";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: MultiFrameStackPhase;
};

const W = layout.width;
const CX = W / 2;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };

const phaseTitle: Record<MultiFrameStackPhase, string> = {
  compare: "ГЛАЗ ПРОТИВ КАМЕРЫ · НОЧНОЙ РЕЖИМ",
  long: "ДЛИННАЯ ВЫДЕРЖКА · ДВИЖЕНИЕ МЕШАЕТ",
  capture: "СЕРИЯ · КОРОТКИЕ КАДРЫ",
  align: "ВЫРАВНИВАНИЕ · ОДНА ОПОРНАЯ ПОЗИЦИЯ",
  average: "СЛОЖЕНИЕ → УСРЕДНЕНИЕ",
  reject: "ПЛОХИЕ СОВПАДЕНИЯ · ОТБОР",
  fifteen: "ДО 15 КАДРОВ · ОДИН РЕЗУЛЬТАТ",
};

const phaseColor: Record<MultiFrameStackPhase, string> = {
  compare: theme.accent,
  long: theme.danger,
  capture: theme.accent2,
  align: theme.warning,
  average: theme.success,
  reject: theme.danger,
  fifteen: theme.success,
};

const phaseIcon: Record<MultiFrameStackPhase, string> = {
  compare: "eye",
  long: "move",
  capture: "camera",
  align: "crosshair",
  average: "layers",
  reject: "filter",
  fifteen: "layers",
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
      borderRadius: 26,
      background: `${theme.panel}EE`,
      border: `3px solid ${color}77`,
      boxShadow: `0 0 38px ${color}1C`,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const SceneSketch: React.FC<{
  light?: number;
  noise?: number;
  tint?: string;
  motion?: number;
}> = ({ light = 0.65, noise = 0.2, tint = theme.accent, motion = 0 }) => {
  const safeLight = clamp01(light);
  const safeNoise = clamp01(noise);
  const dots = [
    [20, 26],
    [44, 116],
    [78, 44],
    [105, 22],
    [128, 110],
    [154, 52],
    [184, 28],
    [208, 102],
    [232, 62],
    [62, 142],
    [173, 132],
  ];
  return (
    <svg viewBox="0 0 250 166" width="100%" height="100%" style={{ display: "block" }}>
      <rect width="250" height="166" fill="#090D15" />
      <circle cx="205" cy="34" r="21" fill={theme.warning} opacity={0.08 + safeLight * 0.18} />
      <path
        d="M 20 143 C 51 123, 71 126, 94 142 M 67 145 C 89 99, 111 76, 132 55 C 144 43, 151 30, 154 18 M 105 102 C 125 92, 143 88, 161 91"
        fill="none"
        stroke={tint}
        strokeWidth={3 + safeLight * 2}
        strokeLinecap="round"
        opacity={0.18 + safeLight * 0.82}
        transform={`translate(${motion}px, ${motion * -0.35}px)`}
      />
      <path
        d="M 172 76 h 40 v 39 h -40 z M 181 87 h 9 v 10 h -9 z M 195 87 h 9 v 10 h -9 z M 181 103 h 9 v 10 h -9 z M 195 103 h 9 v 10 h -9 z"
        fill={theme.warning}
        stroke={theme.warning}
        strokeWidth={2}
        opacity={0.12 + safeLight * 0.78}
        transform={`translate(${motion * 0.45}px, ${motion * -0.2}px)`}
      />
      {dots.map(([x, y], index) => (
        <circle
          key={index}
          cx={x + (index % 2 === 0 ? motion * 0.3 : -motion * 0.25)}
          cy={y}
          r={2 + (index % 3)}
          fill={index % 2 === 0 ? theme.danger : theme.accent2}
          opacity={safeNoise * (0.35 + ((index * 17) % 7) / 12)}
        />
      ))}
      <path d="M 0 151 H 250" stroke={theme.panelBorder} strokeWidth={2} opacity={0.85} />
    </svg>
  );
};

const Header: React.FC<{ phase: MultiFrameStackPhase; enter: number }> = ({ phase, enter }) => {
  const color = phaseColor[phase];
  return (
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
        opacity: enter,
        ...mono,
      }}
    >
      <IconGlyph name={phaseIcon[phase]} size={29} color={color} strokeWidth={1.8} />
      <span>{phaseTitle[phase]}</span>
    </div>
  );
};

const SmallLabel: React.FC<{
  left: number;
  top: number;
  text: string;
  color?: string;
  size?: number;
}> = ({ left, top, text, color = theme.subtext, size = 18 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      color,
      fontSize: size,
      whiteSpace: "nowrap",
      ...mono,
    }}
  >
    {text}
  </div>
);

const BurstTile: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
  light?: number;
  noise?: number;
  tint?: string;
  motion?: number;
  opacity?: number;
  labelOpacity?: number;
  transform?: string;
  borderColor?: string;
}> = ({
  left,
  top,
  width,
  height,
  label,
  light = 0.62,
  noise = 0.18,
  tint = theme.accent,
  motion = 0,
  opacity = 1,
  labelOpacity = 1,
  transform = "none",
  borderColor,
}) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      borderRadius: 18,
      overflow: "hidden",
      background: "#090D15",
      border: `3px solid ${borderColor ?? tint}99`,
      boxShadow: `0 0 22px ${(borderColor ?? tint)}24`,
      opacity,
      transform,
    }}
  >
    <div style={{ position: "absolute", left: 14, top: 10, zIndex: 2, color: tint, fontSize: 16, opacity: labelOpacity, ...mono }}>
      {label}
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, top: 34, bottom: 0 }}>
      <SceneSketch light={light} noise={noise} tint={tint} motion={motion} />
    </div>
  </div>
);

const BottomBadge: React.FC<{
  text: string;
  color: string;
  opacity: number;
  scale?: number;
}> = ({ text, color, opacity, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 1190,
      transform: `translateX(-50%) scale(${scale})`,
      padding: "14px 28px",
      borderRadius: 999,
      background: `${color}18`,
      border: `3px solid ${color}`,
      color,
      fontSize: 25,
      whiteSpace: "nowrap",
      opacity,
      boxShadow: `0 0 32px ${color}3C`,
      ...mono,
    }}
  >
    {text}
  </div>
);

const ComparePhase: React.FC<{ enter: number; pop: number; impactLocal: number }> = ({ enter, pop, impactLocal }) => (
  <>
    <Panel left={70} top={370} width={410} height={610} color={theme.subtext}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 32, textAlign: "center", color: theme.subtext, fontSize: 29, ...mono }}>
        ГЛАЗ
      </div>
      <div style={{ position: "absolute", left: 28, right: 28, top: 94, height: 350, borderRadius: 18, overflow: "hidden", opacity: enter }}>
        <SceneSketch light={0.1} noise={0.1} tint={theme.subtext} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, background: "rgba(0,0,0,0.36)" }} />
      </div>
      <div style={{ position: "absolute", left: "50%", top: 456, transform: "translateX(-50%)" }}>
        <IconGlyph name="eye" size={54} color={theme.subtext} strokeWidth={1.6} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 522, textAlign: "center", color: theme.subtext, fontSize: 22, ...mono }}>
        чёрный двор
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 565, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>
        мало фотонов за миг
      </div>
    </Panel>

    <Panel left={600} top={370} width={410} height={610} color={theme.accent}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 32, textAlign: "center", color: theme.accent, fontSize: 27, ...mono }}>
        ТЕЛЕФОН
      </div>
      <div style={{ position: "absolute", left: 28, right: 28, top: 94, height: 350, borderRadius: 18, overflow: "hidden", opacity: enter }}>
        <SceneSketch light={1} noise={0.06} tint={theme.accent} />
        <div style={{ position: "absolute", left: 18, top: 18, padding: "7px 12px", borderRadius: 999, background: `${theme.accent}22`, color: theme.accent, fontSize: 15, ...mono }}>
          NIGHT MODE
        </div>
      </div>
      <div style={{ position: "absolute", left: "50%", top: 456, transform: "translateX(-50%)" }}>
        <IconGlyph name="smartphone" size={54} color={theme.accent} strokeWidth={1.6} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 522, textAlign: "center", color: theme.accent, fontSize: 22, ...mono }}>
        ветки · окна
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 565, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>
        больше света из попыток
      </div>
    </Panel>

    <div style={{ position: "absolute", left: CX, top: 650, transform: "translate(-50%, -50%)", color: theme.warning, fontSize: 60, ...mono }}>
      →
    </div>
    <BottomBadge text="НОЧНОЙ РЕЖИМ СОБИРАЕТ СВЕТ" color={theme.accent} opacity={enter * (0.78 + 0.22 * pop)} scale={0.94 + pop * 0.06} />
    <PulseRing x={CX} y={650} triggerFrame={impactLocal} tone="accent" size={230} />
  </>
);

const LongExposurePhase: React.FC<{ local: number; enter: number; impactLocal: number }> = ({ local, enter, impactLocal }) => {
  const drift = 10 + Math.sin(local / 8) * 6;
  return (
    <>
      <Header phase="long" enter={enter} />
      <Panel left={78} top={390} width={430} height={590} color={theme.danger}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 32, textAlign: "center", color: theme.danger, fontSize: 25, ...mono }}>ОДИН КАДР</div>
        <div style={{ position: "absolute", left: 35, top: 100, width: 360, height: 300, overflow: "hidden", borderRadius: 18, filter: "blur(5px)" }}>
          <SceneSketch light={0.34} noise={0.58} tint={theme.danger} motion={drift} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 445, textAlign: "center", color: theme.subtext, fontSize: 21, ...mono }}>движение растягивает свет</div>
        <div style={{ position: "absolute", left: "50%", top: 500, transform: "translateX(-50%)", color: theme.danger, fontSize: 22, ...mono, whiteSpace: "nowrap" }}>ДЛИННАЯ ВЫДЕРЖКА</div>
      </Panel>
      <div style={{ position: "absolute", left: 535, top: 640, color: theme.danger, fontSize: 58, ...mono }}>→</div>
      <Panel left={625} top={450} width={360} height={350} color={theme.danger}>
        <div style={{ position: "absolute", left: 28, right: 28, top: 42, textAlign: "center", color: theme.danger, fontSize: 24, ...mono }}>РАЗМАЗАННЫЙ КАДР</div>
        <div style={{ position: "absolute", left: 35, top: 120, width: 290, height: 130, overflow: "hidden", borderRadius: 14, filter: "blur(8px)" }}>
          <SceneSketch light={0.22} noise={0.7} tint={theme.danger} motion={24} />
        </div>
      </Panel>
      <BottomBadge text="БОЛЬШЕ ВРЕМЕНИ ≠ РЕЗЧЕ" color={theme.danger} opacity={enter} />
      <PulseRing x={805} y={625} triggerFrame={impactLocal} tone="danger" size={210} />
    </>
  );
};

const CapturePhase: React.FC<{ local: number; enter: number; impactLocal: number; fps: number }> = ({ local, enter, impactLocal, fps }) => {
  const frameLabels = ["КАДР 01", "КАДР 02", "КАДР 03", "КАДР 04", "КАДР 05", "КАДР 06"];
  const framePositions = [
    [344, 380],
    [560, 380],
    [776, 380],
    [344, 602],
    [560, 602],
    [776, 602],
  ];
  return (
    <>
      <Header phase="capture" enter={enter} />
      <Panel left={70} top={410} width={225} height={410} color={theme.accent2}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 42, textAlign: "center", color: theme.accent2, fontSize: 22, ...mono }}>
          КАМЕРА
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 122, textAlign: "center" }}>
          <IconGlyph name="camera" size={82} color={theme.accent2} strokeWidth={1.5} />
        </div>
        <div style={{ position: "absolute", left: 22, right: 22, top: 246, textAlign: "center", color: theme.text, fontSize: 19, ...mono }}>
          короткая
          <br />
          экспозиция
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 344, textAlign: "center", color: theme.warning, fontSize: 20, ...mono }}>
          серия →
        </div>
      </Panel>
      {framePositions.map(([left, top], index) => {
        const p = spring({ frame: Math.max(0, local - index * 4), fps, config: { damping: 14, mass: 0.72 } });
        const motion = index % 3 === 0 ? -7 : index % 3 === 1 ? 4 : 8;
        return (
          <BurstTile
            key={frameLabels[index]}
            left={left}
            top={top}
            width={194}
            height={192}
            label={frameLabels[index]}
            light={0.42 + index * 0.045}
            noise={0.42 - index * 0.025}
            tint={index % 2 === 0 ? theme.accent : theme.accent2}
            motion={motion}
            opacity={enter * p}
            transform={`translateY(${(1 - p) * 28}px) scale(${0.88 + p * 0.12})`}
          />
        );
      })}
      <div style={{ position: "absolute", left: 344, top: 838, width: 626, height: 4, background: theme.panelBorder, opacity: enter }}>
        <div style={{ width: "100%", height: "100%", background: theme.accent2, transformOrigin: "left", transform: `scaleX(${smooth((local + 8) / 38)})` }} />
      </div>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} style={{ position: "absolute", left: 344 + index * 125, top: 824, width: 30, height: 30, borderRadius: "50%", background: index <= Math.floor(clamp01((local + 8) / 38) * 6) ? theme.accent2 : theme.panelBorder, border: `3px solid ${theme.accent2}99`, opacity: enter }} />
      ))}
      <SmallLabel left={344} top={876} text="каждый кадр короче · дрожь меняется" color={theme.subtext} size={18} />
      <BottomBadge text="15 × 1/15 с · НЕ ОДИН ДЛИННЫЙ КАДР" color={theme.accent2} opacity={enter} />
      <PulseRing x={650} y={838} triggerFrame={impactLocal} tone="accent2" size={190} />
    </>
  );
};

const AlignPhase: React.FC<{ local: number; enter: number; impactLocal: number; fps: number }> = ({ local, enter, impactLocal, fps }) => {
  const alignP = smooth((local - impactLocal + 8) / 34);
  const offsets = [
    [-48, -24],
    [28, -18],
    [-34, 26],
    [42, 30],
    [4, -38],
  ];
  return (
    <>
      <Header phase="align" enter={enter} />
      <SmallLabel left={88} top={350} text="СЫРЫЕ КАДРЫ" color={theme.subtext} size={19} />
      {offsets.map(([ox, oy], index) => {
        const p = spring({ frame: Math.max(0, local - index * 3), fps, config: { damping: 15, mass: 0.8 } });
        const x = 112 + ox * (1 - alignP);
        const y = 424 + oy * (1 - alignP);
        return (
          <BurstTile
            key={index}
            left={x}
            top={y}
            width={282}
            height={190}
            label={`КАДР 0${index + 1}`}
            light={0.55}
            noise={0.2}
            tint={theme.accent}
            motion={ox * 0.12}
            opacity={enter * p * (0.72 + alignP * 0.28)}
            labelOpacity={clamp01(1 - alignP * 1.7)}
            borderColor={alignP > 0.55 ? theme.success : theme.accent}
          />
        );
      })}
      <svg width={W} height={layout.height} viewBox={`0 0 ${W} ${layout.height}`} style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: enter }}>
        {[0, 1, 2, 3, 4].map((index) => {
          const [ox, oy] = offsets[index];
          const x1 = 394 + ox * (1 - alignP);
          const y1 = 515 + oy * (1 - alignP);
          return <path key={index} d={`M ${x1} ${y1} C 520 ${y1}, 535 520, 590 520`} fill="none" stroke={alignP > 0.55 ? theme.success : theme.warning} strokeWidth={3} strokeDasharray="10 10" opacity={0.65} />;
        })}
      </svg>
      <Panel left={625} top={390} width={360} height={460} color={alignP > 0.55 ? theme.success : theme.warning}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 40, textAlign: "center", color: alignP > 0.55 ? theme.success : theme.warning, fontSize: 22, ...mono }}>
          ОПОРНЫЙ КАДР
        </div>
        <div style={{ position: "absolute", left: 34, top: 100, width: 292, height: 194, border: `3px solid ${alignP > 0.55 ? theme.success : theme.warning}`, borderRadius: 16, overflow: "hidden" }}>
          <SceneSketch light={0.78} noise={0.12} tint={alignP > 0.55 ? theme.success : theme.warning} />
          <div style={{ position: "absolute", left: "50%", top: "50%", width: 96, height: 96, transform: "translate(-50%, -50%)", border: `3px solid ${alignP > 0.55 ? theme.success : theme.warning}`, borderRadius: 12, opacity: 0.9 }} />
          <div style={{ position: "absolute", left: "50%", top: "50%", width: 10, height: 10, transform: "translate(-50%, -50%)", borderRadius: "50%", background: alignP > 0.55 ? theme.success : theme.warning, boxShadow: `0 0 22px ${alignP > 0.55 ? theme.success : theme.warning}` }} />
        </div>
        <div style={{ position: "absolute", left: 28, right: 28, top: 330, textAlign: "center", color: theme.subtext, fontSize: 19, ...mono }}>
          {alignP > 0.55 ? "линии совпали" : "ищем одинаковую позицию"}
        </div>
      </Panel>
      <BottomBadge text={alignP > 0.55 ? "КАДРЫ СОВМЕЩЕНЫ" : "СМЕЩЕНИЯ ИЩУТСЯ"} color={alignP > 0.55 ? theme.success : theme.warning} opacity={enter} scale={0.94 + (alignP > 0.55 ? 0.06 : 0)} />
      <PulseRing x={775} y={585} triggerFrame={impactLocal} tone="warning" size={190} />
    </>
  );
};

const AveragePhase: React.FC<{ local: number; enter: number; impactLocal: number; fps: number }> = ({ local, enter, impactLocal, fps }) => {
  const averageP = smooth((local - impactLocal + 8) / 34);
  const sheetOffsets = [-30, -15, 0, 14, 28];
  return (
    <>
      <Header phase="average" enter={enter} />
      <Panel left={62} top={380} width={446} height={610} color={theme.accent2}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 32, textAlign: "center", color: theme.accent2, fontSize: 24, ...mono }}>
          ПРОЗРАЧНЫЕ ЛИСТЫ
        </div>
        <div style={{ position: "absolute", left: 44, top: 100, width: 358, height: 340 }}>
          {sheetOffsets.map((offset, index) => {
            const p = spring({ frame: Math.max(0, local - index * 3), fps, config: { damping: 14, mass: 0.75 } });
            const drift = offset * (1 - averageP);
            return (
              <div key={index} style={{ position: "absolute", left: drift, top: drift * -0.22, width: 358, height: 250, opacity: enter * p * (0.23 + averageP * 0.1), transform: `scale(${0.96 + p * 0.04})`, border: `3px solid ${theme.accent2}`, borderRadius: 16, overflow: "hidden" }}>
                <SceneSketch light={0.55 + averageP * 0.28} noise={0.38} tint={theme.accent2} motion={offset * 0.08} />
              </div>
            );
          })}
          <div style={{ position: "absolute", left: 0, right: 0, top: 280, textAlign: "center", color: theme.accent2, fontSize: 22, ...mono }}>
            кадр 1 + кадр 2 + … + кадр 15
          </div>
        </div>
        <div style={{ position: "absolute", left: 32, right: 32, bottom: 42, textAlign: "center", color: theme.subtext, fontSize: 19, ...mono }}>
          одинаковый рисунок остаётся
        </div>
      </Panel>
      <div style={{ position: "absolute", left: 540, top: 650, transform: "translate(-50%, -50%)", color: theme.success, fontSize: 58, ...mono }}>
        →
      </div>
      <Panel left={572} top={380} width={446} height={610} color={theme.success}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 32, textAlign: "center", color: theme.success, fontSize: 24, ...mono }}>
          ОДИН РЕЗУЛЬТАТ
        </div>
        <div style={{ position: "absolute", left: 42, top: 100, width: 362, height: 250, borderRadius: 16, overflow: "hidden", border: `3px solid ${theme.success}`, boxShadow: `0 0 ${24 + averageP * 24}px ${theme.success}55` }}>
          <SceneSketch light={0.3 + averageP * 0.7} noise={0.38 - averageP * 0.3} tint={theme.success} />
        </div>
        <div style={{ position: "absolute", left: 32, right: 32, top: 402, textAlign: "center", color: theme.success, fontSize: 23, ...mono }}>
          совпавшие линии → ярче
        </div>
        <div style={{ position: "absolute", left: 32, right: 32, top: 460, textAlign: "center", color: theme.subtext, fontSize: 20, ...mono }}>
          случайный шум → тише
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 42, textAlign: "center", color: theme.success, fontSize: 20, ...mono }}>
          полезный свет усилился
        </div>
      </Panel>
      <BottomBadge text="СОВПАЛО → ЯРЧЕ · ШУМ → ТИШЕ" color={theme.success} opacity={enter} scale={0.94 + averageP * 0.06} />
      <PulseRing x={795} y={625} triggerFrame={impactLocal} tone="success" size={210} />
    </>
  );
};

const RejectPhase: React.FC<{ local: number; enter: number; impactLocal: number; fps: number }> = ({ local, enter, impactLocal, fps }) => {
  const rejectP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const acceptedP = spring({ frame: Math.max(0, local - impactLocal - 8), fps, config: { damping: 14, mass: 0.75 } });
  const cards = [
    { label: "УЧАСТОК A", tint: theme.danger, bad: true, noise: 0.58, motion: -18 },
    { label: "УЧАСТОК B", tint: theme.success, bad: false, noise: 0.16, motion: 0 },
    { label: "УЧАСТОК C", tint: theme.danger, bad: true, noise: 0.52, motion: 21 },
  ];
  return (
    <>
      <Header phase="reject" enter={enter} />
      {cards.map((card, index) => {
        const x = 58 + index * 330;
        return (
          <React.Fragment key={card.label}>
            <BurstTile
              left={x}
              top={410}
              width={294}
              height={300}
              label={card.label}
              light={card.bad ? 0.32 : 0.72}
              noise={card.noise}
              tint={card.tint}
              motion={card.motion}
              opacity={enter}
              borderColor={card.tint}
            />
            {card.bad ? (
              <div style={{ position: "absolute", left: x + 147, top: 564, transform: `translate(-50%, -50%) scale(${0.65 + rejectP * 0.35})`, width: 90, height: 90, borderRadius: "50%", background: `${theme.danger}D9`, display: "flex", alignItems: "center", justifyContent: "center", opacity: enter * rejectP, boxShadow: `0 0 32px ${theme.danger}88` }}>
                <IconGlyph name="x" size={58} color="#260A0A" strokeWidth={3} />
              </div>
            ) : (
              <div style={{ position: "absolute", left: x + 147, top: 728, transform: `translateX(-50%) scale(${0.85 + acceptedP * 0.15})`, color: theme.success, fontSize: 21, ...mono }}>
                ПРИНЯТ
              </div>
            )}
          </React.Fragment>
        );
      })}
      <svg width={W} height={layout.height} viewBox={`0 0 ${W} ${layout.height}`} style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: enter * acceptedP }}>
        <path d="M 550 710 C 550 790, 540 800, 540 850" fill="none" stroke={theme.success} strokeWidth={5} strokeDasharray="12 9" />
        <polygon points="526,840 554,840 540,862" fill={theme.success} />
      </svg>
      <Panel left={330} top={850} width={420} height={215} color={theme.success}>
        <div style={{ position: "absolute", left: 24, top: 22, color: theme.success, fontSize: 20, ...mono }}>В ИТОГ ПОПАДАЕТ</div>
        <div style={{ position: "absolute", left: 24, top: 62, width: 170, height: 116, borderRadius: 12, overflow: "hidden" }}>
          <SceneSketch light={0.82} noise={0.08} tint={theme.success} />
        </div>
        <div style={{ position: "absolute", left: 220, top: 78, color: theme.success, fontSize: 23, ...mono }}>совпавший</div>
        <div style={{ position: "absolute", left: 220, top: 120, color: theme.text, fontSize: 23, ...mono }}>свет</div>
      </Panel>
      <SmallLabel left={58} top={776} text="плохое совпадение" color={theme.danger} size={18} />
      <SmallLabel left={388} top={776} text="совпало" color={theme.success} size={18} />
      <SmallLabel left={718} top={776} text="плохое совпадение" color={theme.danger} size={18} />
      <BottomBadge text="ПЛОХИЕ УЧАСТКИ ОТБРОШЕНЫ" color={theme.danger} opacity={enter * (0.72 + rejectP * 0.28)} scale={0.94 + rejectP * 0.06} />
      <PulseRing x={205} y={564} triggerFrame={impactLocal} tone="danger" size={170} />
    </>
  );
};

const FifteenPhase: React.FC<{ local: number; enter: number; impactLocal: number; fps: number }> = ({ local, enter, impactLocal, fps }) => (
  <>
    <Header phase="fifteen" enter={enter} />
    {Array.from({ length: 15 }).map((_, index) => {
      const p = spring({ frame: Math.max(0, local - index * 2), fps, config: { damping: 15, mass: 0.65 } });
      const row = Math.floor(index / 5);
      const col = index % 5;
      const rejected = index === 11;
      const left = 72 + col * 194;
      const top = 390 + row * 205;
      return (
        <React.Fragment key={index}>
          <BurstTile
            left={left}
            top={top}
            width={172}
            height={170}
            label={`КАДР ${String(index + 1).padStart(2, "0")}`}
            light={0.42 + (index % 4) * 0.08}
            noise={rejected ? 0.62 : 0.22}
            tint={rejected ? theme.danger : theme.accent}
            motion={rejected ? 18 : 0}
            borderColor={rejected ? theme.danger : theme.accent}
            opacity={enter * p}
            transform={`translateY(${(1 - p) * 28}px) scale(${0.9 + p * 0.1})`}
          />
          {rejected ? (
            <div style={{ position: "absolute", left: left + 86, top: top + 88, transform: `translate(-50%, -50%) scale(${0.7 + p * 0.3})`, width: 50, height: 50, borderRadius: "50%", background: `${theme.danger}DD`, display: "flex", alignItems: "center", justifyContent: "center", opacity: enter * p, boxShadow: `0 0 22px ${theme.danger}88` }}>
              <IconGlyph name="x" size={32} color="#260A0A" strokeWidth={3} />
            </div>
          ) : null}
        </React.Fragment>
      );
    })}
    <SmallLabel left={72} top={1040} text="до пятнадцати коротких экспозиций" color={theme.subtext} size={22} />
    <BottomBadge text="ПЛОХОЙ УЧАСТОК → ОТБРОШЕН" color={theme.success} opacity={enter} />
    <PulseRing x={72 + (11 % 5) * 194 + 86} y={390 + Math.floor(11 / 5) * 205 + 88} triggerFrame={impactLocal} tone="danger" size={150} />
  </>
);

/** Буквальная цепочка Night mode: burst → выравнивание → сложение → отбрасывание. */
export const MultiFrameStackVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "capture" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {phase === "compare" ? <><Header phase="compare" enter={enter} /><ComparePhase enter={enter} pop={pop} impactLocal={impactLocal} /></> : null}
      {phase === "long" ? <LongExposurePhase local={local} enter={enter} impactLocal={impactLocal} /> : null}
      {phase === "capture" ? <CapturePhase local={local} enter={enter} impactLocal={impactLocal} fps={fps} /> : null}
      {phase === "align" ? <AlignPhase local={local} enter={enter} impactLocal={impactLocal} fps={fps} /> : null}
      {phase === "average" ? <AveragePhase local={local} enter={enter} impactLocal={impactLocal} fps={fps} /> : null}
      {phase === "reject" ? <RejectPhase local={local} enter={enter} impactLocal={impactLocal} fps={fps} /> : null}
      {phase === "fifteen" ? <FifteenPhase local={local} enter={enter} impactLocal={impactLocal} fps={fps} /> : null}
    </div>
  );
};

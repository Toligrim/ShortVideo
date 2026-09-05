import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type QuantizationLossPhase =
  | "sharp"
  | "copy"
  | "block"
  | "coefficients"
  | "quantize"
  | "zero"
  | "tail"
  | "rebuild";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: QuantizationLossPhase;
};

const W = layout.width;
const CX = W / 2;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.1,
};

const phaseTitle: Record<QuantizationLossPhase, string> = {
  sharp: "ИСХОДНИК · КАДР РЕЗКИЙ",
  copy: "ПОСЛЕ ОТПРАВКИ · ЧЁТКИЙ → МЫЛЬНЫЙ",
  block: "ВИДЕОКОДЕК · БЕРЁТ УЧАСТОК КАДРА",
  coefficients: "ЯРКОСТЬ → КРУПНЫЕ И МЕЛКИЕ ПЕРЕПАДЫ",
  quantize: "КВАНТИЗАЦИЯ · ЛАСТИК ДЛЯ КОЭФФИЦИЕНТОВ",
  zero: "СЛАБЫЕ ПЕРЕПАДЫ → НУЛЬ",
  tail: "ХВОСТ КОЭФФИЦИЕНТОВ · НЕ ЗАПИСЫВАЕТСЯ",
  rebuild: "СБОРКА · ОСТАЛОСЬ ТОЛЬКО СОХРАНЁННОЕ",
};

const phaseColor: Record<QuantizationLossPhase, string> = {
  sharp: theme.accent,
  copy: theme.danger,
  block: theme.accent2,
  coefficients: theme.accent,
  quantize: theme.warning,
  zero: theme.danger,
  tail: theme.danger,
  rebuild: theme.success,
};

const phaseIcon: Record<QuantizationLossPhase, string> = {
  sharp: "video",
  copy: "copy",
  block: "scan",
  coefficients: "bar-chart-3",
  quantize: "eraser",
  zero: "circle-off",
  tail: "list",
  rebuild: "layers",
};

const rawCoefficients = [
  36, 22, 14, 9, 5, 3, 2, 1,
  18, 13, 8, 5, 3, 2, 1, 1,
  12, 8, 5, 3, 2, 1, 1, 1,
  8, 5, 3, 2, 1, 1, 1, 0,
  5, 3, 2, 1, 1, 1, 0, 0,
  3, 2, 1, 1, 1, 0, 0, 0,
  2, 1, 1, 0, 0, 0, 0, 0,
  1, 1, 0, 0, 0, 0, 0, 0,
];

const spatialBrightness = [
  2, 3, 3, 4, 5, 6, 6, 5,
  2, 3, 4, 5, 6, 7, 7, 5,
  1, 2, 4, 6, 7, 8, 7, 4,
  1, 2, 5, 7, 8, 8, 6, 3,
  1, 3, 6, 8, 8, 7, 4, 2,
  2, 4, 7, 8, 7, 5, 3, 2,
  3, 5, 7, 7, 5, 3, 2, 2,
  4, 6, 7, 6, 4, 3, 2, 2,
];

const Header: React.FC<{ phase: QuantizationLossPhase; enter: number }> = ({ phase, enter }) => {
  const color = phaseColor[phase];
  return (
    <div
      style={{
        position: "absolute",
        left: CX,
        top: 236,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        color,
        fontSize: 22,
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

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  opacity?: number;
  children: React.ReactNode;
}> = ({ left, top, width, height, color, opacity = 1, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 26,
      background: `${theme.panel}EE`,
      border: `3px solid ${color}77`,
      boxShadow: `0 0 38px ${color}1C`,
      overflow: "hidden",
      opacity,
    }}
  >
    {children}
  </div>
);

const SmallLabel: React.FC<{
  left: number;
  top: number;
  text: string;
  color?: string;
  size?: number;
  opacity?: number;
}> = ({ left, top, text, color = theme.subtext, size = 18, opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      color,
      fontSize: size,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    {text}
  </div>
);

const Badge: React.FC<{
  text: string;
  color: string;
  opacity: number;
  scale?: number;
}> = ({ text, color, opacity, scale = 1 }) => (
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
      padding: "14px 24px",
      borderRadius: 999,
      background: `${color}16`,
      border: `3px solid ${color}99`,
      color,
      fontSize: 23,
      textAlign: "center",
      whiteSpace: "nowrap",
      opacity,
      transform: `scale(${scale})`,
      boxShadow: `0 0 34px ${color}24`,
      ...mono,
    }}
  >
    {text}
  </div>
);

/** A deliberately simple frame illustration: hair, a readable sign and leaves. */
const VideoFrame: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
  detail?: number;
  blur?: number;
  color?: string;
  opacity?: number;
}> = ({ left, top, width, height, label, detail = 1, blur = 0, color = theme.accent, opacity = 1 }) => {
  const detailP = clamp01(detail);
  const hairCount = Math.round(2 + detailP * 7);
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        borderRadius: 24,
        background: "#090D15",
        border: `3px solid ${color}99`,
        boxShadow: `0 0 32px ${color}24`,
        overflow: "hidden",
        opacity,
      }}
    >
      <div style={{ position: "absolute", left: 20, top: 16, color, fontSize: 18, ...mono }}>{label}</div>
      <svg
        viewBox="0 0 440 300"
        width="100%"
        height="calc(100% - 52px)"
        style={{ position: "absolute", left: 0, bottom: 0, display: "block", filter: `blur(${blur}px) saturate(${0.65 + detailP * 0.35})` }}
      >
        <rect width="440" height="300" fill="#0B111C" />
        <path d="M0 190 C90 162 145 190 214 175 C290 157 340 180 440 145 V300 H0 Z" fill="#16283A" />
        <path d="M0 232 C72 212 123 224 188 211 C271 195 353 216 440 188 V300 H0 Z" fill="#10202F" opacity="0.92" />

        <circle cx="218" cy="146" r="68" fill="#DCA47C" opacity={0.38 + detailP * 0.26} />
        <path d="M155 145 C157 83 194 55 244 67 C282 76 296 111 288 156 C267 129 244 114 211 115 C188 116 170 127 155 145 Z" fill="#2A1C23" opacity="0.9" />
        {Array.from({ length: hairCount }).map((_, i) => {
          const x = 161 + i * 14;
          return (
            <path
              key={i}
              d={`M ${x} ${134 - (i % 3) * 7} C ${x - 10} ${92 + (i % 2) * 8}, ${x + 4} ${60 + (i % 4) * 7}, ${x + 15} ${43 + (i % 3) * 8}`}
              fill="none"
              stroke={theme.text}
              strokeWidth={2.2}
              strokeLinecap="round"
              opacity={0.25 + detailP * 0.7}
            />
          );
        })}
        <circle cx="194" cy="145" r="5" fill={theme.text} opacity={0.3 + detailP * 0.65} />
        <circle cx="243" cy="145" r="5" fill={theme.text} opacity={0.3 + detailP * 0.65} />
        <path d="M207 173 Q220 181 233 173" fill="none" stroke="#8C4E57" strokeWidth="4" strokeLinecap="round" opacity={0.45 + detailP * 0.4} />

        <rect x="24" y="30" width="126" height="42" rx="10" fill={`${theme.accent}16`} stroke={`${theme.accent}AA`} strokeWidth="2" />
        <text x="39" y="57" fill={theme.accent} fontFamily={theme.mono} fontWeight="800" fontSize="21" letterSpacing="1">НАДПИСЬ</text>
        <path d="M38 82 H135 M38 91 H112" stroke={theme.text} strokeWidth="3" strokeLinecap="round" opacity={0.22 + detailP * 0.68} />

        <path d="M326 268 C333 226 345 188 371 152" fill="none" stroke={theme.success} strokeWidth="4" opacity={0.45 + detailP * 0.45} />
        {[0, 1, 2, 3].map((i) => (
          <ellipse
            key={i}
            cx={335 + i * 22}
            cy={220 - i * 23}
            rx={22}
            ry={11}
            transform={`rotate(${-25 + i * 5} ${335 + i * 22} ${220 - i * 23})`}
            fill={`${theme.success}${detailP > 0.5 ? "88" : "42"}`}
            stroke={theme.success}
            strokeWidth="2"
            opacity={0.35 + detailP * 0.6}
          />
        ))}
        <path d="M22 278 H418" stroke={theme.panelBorder} strokeWidth="2" />
      </svg>
    </div>
  );
};

const CoefficientGrid: React.FC<{
  left: number;
  top: number;
  size: number;
  values: number[];
  kind: "spatial" | "coeff";
  color: string;
  reveal?: number;
  zeroP?: number;
  label?: string;
}> = ({ left, top, size, values, kind, color, reveal = 1, zeroP = 0, label }) => {
  const gap = 5;
  const cell = (size - gap * 7) / 8;
  return (
    <div style={{ position: "absolute", left, top, width: size, height: size }}>
      {label ? <div style={{ position: "absolute", left: 0, top: -36, color, fontSize: 18, ...mono }}>{label}</div> : null}
      <div
        style={{
          width: size,
          height: size,
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gap,
        }}
      >
        {values.map((value, i) => {
          const revealP = smooth((reveal - i * 0.008) / 0.72);
          const weak = kind === "coeff" && value <= 5;
          const zeroed = weak && zeroP > 0.45;
          const valueText = zeroed ? "0" : kind === "coeff" ? String(value) : "";
          const spatialP = value / 8;
          const cellColor = kind === "spatial"
            ? value >= 6 ? theme.accent : value >= 4 ? theme.accent2 : theme.subtext
            : value >= 10 ? theme.accent : value >= 5 ? theme.accent2 : theme.subtext;
          return (
            <div
              key={i}
              style={{
                width: cell,
                height: cell,
                boxSizing: "border-box",
                borderRadius: 8,
                border: `2px solid ${cellColor}${zeroed ? "55" : "99"}`,
                background: kind === "spatial" ? `${cellColor}${Math.round(8 + spatialP * 30).toString(16).padStart(2, "0")}` : `${cellColor}${zeroed ? "08" : value >= 10 ? "28" : "12"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: zeroed ? theme.danger : cellColor,
                fontSize: kind === "coeff" ? Math.max(14, Math.min(22, cell * 0.42)) : 13,
                opacity: 0.25 + revealP * 0.75,
                transform: `scale(${0.82 + revealP * 0.18})`,
                boxShadow: kind === "coeff" && !zeroed && value >= 10 ? `0 0 16px ${cellColor}35` : "none",
                ...mono,
              }}
            >
              {kind === "spatial" ? <span style={{ opacity: 0.35 + spatialP * 0.55 }}>·</span> : valueText}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Arrow: React.FC<{ left: number; top: number; color: string; opacity?: number; label?: string }> = ({ left, top, color, opacity = 1, label }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width: 110,
      textAlign: "center",
      color,
      opacity,
    }}
  >
    <div style={{ fontFamily: theme.font, fontSize: 68, lineHeight: 0.9 }}>→</div>
    {label ? <div style={{ ...mono, fontSize: 15, marginTop: 12, whiteSpace: "nowrap" }}>{label}</div> : null}
  </div>
);

const DetailChip: React.FC<{
  left: number;
  top: number;
  width: number;
  text: string;
  color: string;
  lost: number;
}> = ({ left, top, width, text, color, lost }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height: 92,
      boxSizing: "border-box",
      borderRadius: 18,
      border: `3px solid ${lost > 0.5 ? theme.danger : color}99`,
      background: `${lost > 0.5 ? theme.danger : color}${lost > 0.5 ? "12" : "0A"}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: lost > 0.5 ? theme.danger : color,
      fontSize: 17,
      textAlign: "center",
      opacity: 0.3 + lost * 0.7,
      transform: `scale(${1 + lost * 0.025})`,
      ...mono,
    }}
  >
    <span>{text}</span>
    {lost > 0.5 ? <span style={{ position: "absolute", left: 16, right: 16, height: 3, background: theme.danger, transform: "rotate(-9deg)" }} /> : null}
  </div>
);

const SharpPhase: React.FC<{ enter: number; impactLocal: number }> = ({ enter, impactLocal }) => (
  <>
    <Header phase="sharp" enter={enter} />
    <VideoFrame left={100} top={390} width={880} height={590} label="ИСХОДНИК" detail={1} color={theme.accent} opacity={enter} />
    <SmallLabel left={CX - 170} top={1010} text="ВОЛОСЫ · НАДПИСЬ · ЛИСТОЧКИ" color={theme.accent} size={23} />
    <Badge text="ВСЁ РЕЗКО" color={theme.accent} opacity={enter} />
    <PulseRing x={CX} y={680} triggerFrame={impactLocal} tone="accent" size={260} />
  </>
);

const CopyPhase: React.FC<{ local: number; enter: number; impactLocal: number }> = ({ local, enter, impactLocal }) => {
  const reveal = smooth(clamp01((local - 7) / 24));
  return (
    <>
      <Header phase="copy" enter={enter} />
      <VideoFrame left={50} top={410} width={450} height={500} label="ИСХОДНИК · РЕЗКО" detail={1} color={theme.accent} opacity={enter} />
      <VideoFrame left={580} top={410} width={450} height={500} label="КОПИЯ · МЫЛЬНАЯ" detail={0.18} blur={2.5} color={theme.danger} opacity={enter * (0.3 + reveal * 0.7)} />
      <Arrow left={485} top={610} color={theme.warning} opacity={enter} label="ОТПРАВКА" />
      <SmallLabel left={CX - 75} top={950} text="ФАЙЛ МЕНЬШЕ" color={theme.warning} size={19} />
      <Badge text="РЕЗКОЕ → МЫЛЬНАЯ КОПИЯ" color={theme.danger} opacity={enter} scale={0.98 + reveal * 0.02} />
      <PulseRing x={805} y={650} triggerFrame={impactLocal} tone="danger" size={230} />
    </>
  );
};

const BlockPhase: React.FC<{ local: number; enter: number; impactLocal: number }> = ({ local, enter, impactLocal }) => {
  const reveal = smooth(clamp01((local - 5) / 28));
  return (
    <>
      <Header phase="block" enter={enter} />
      <Panel left={50} top={400} width={430} height={600} color={theme.accent} opacity={enter}>
        <SmallLabel left={30} top={30} text="УЧАСТОК КАДРА" color={theme.accent} size={21} />
        <VideoFrame left={30} top={76} width={370} height={440} label="КАДР" detail={0.92} color={theme.accent} />
      </Panel>
      <Arrow left={468} top={620} color={theme.accent2} opacity={enter} label="БЕРЁТ" />
      <Panel left={600} top={400} width={430} height={600} color={theme.accent2} opacity={enter}>
        <SmallLabel left={30} top={30} text="БЛОК КАДРА" color={theme.accent2} size={21} />
        <CoefficientGrid left={35} top={145} size={360} values={spatialBrightness} kind="spatial" color={theme.accent2} reveal={reveal} label="ЯРКОСТЬ" />
        <SmallLabel left={30} top={540} text="КЛЕТКА ЗА КЛЕТКОЙ" color={theme.subtext} size={17} />
      </Panel>
      <Badge text="КАЖДЫЙ УЧАСТОК → СВОЯ СХЕМА" color={theme.accent2} opacity={enter} />
      <PulseRing x={815} y={680} triggerFrame={impactLocal} tone="accent2" size={230} />
    </>
  );
};

const CoefficientsPhase: React.FC<{ local: number; enter: number; impactLocal: number }> = ({ local, enter, impactLocal }) => {
  const reveal = smooth(clamp01((local - 6) / 32));
  return (
    <>
      <Header phase="coefficients" enter={enter} />
      <Panel left={45} top={415} width={420} height={535} color={theme.accent} opacity={enter}>
        <SmallLabel left={28} top={30} text="ПЕРЕПАДЫ ЯРКОСТИ" color={theme.accent} size={20} />
        <CoefficientGrid left={30} top={125} size={350} values={spatialBrightness} kind="spatial" color={theme.accent} reveal={1} />
        <SmallLabel left={28} top={465} text="КРУПНЫЕ + МЕЛКИЕ" color={theme.subtext} size={17} />
      </Panel>
      <Arrow left={475} top={625} color={theme.warning} opacity={enter * (0.35 + reveal * 0.65)} label="РАСКЛАДЫВАЕТ" />
      <Panel left={615} top={415} width={420} height={535} color={theme.accent2} opacity={enter}>
        <SmallLabel left={28} top={30} text="КОЭФФИЦИЕНТЫ" color={theme.accent2} size={20} />
        <CoefficientGrid left={30} top={125} size={350} values={rawCoefficients} kind="coeff" color={theme.accent2} reveal={reveal} />
        <SmallLabel left={28} top={465} text="СИЛЬНЫЕ ↑ · СЛАБЫЕ ↓" color={theme.subtext} size={17} />
      </Panel>
      <Badge text="КРУПНЫЕ И МЕЛКИЕ ПЕРЕПАДЫ" color={theme.accent} opacity={enter} />
      <PulseRing x={825} y={680} triggerFrame={impactLocal} tone="accent" size={230} />
    </>
  );
};

const QuantizePhase: React.FC<{ local: number; enter: number; impactLocal: number }> = ({ local, enter, impactLocal }) => {
  const resultP = smooth(clamp01((local - impactLocal - 2) / 24));
  const eraserP = smooth(clamp01((local - 8) / 38));
  const eraserX = interpolate(eraserP, [0, 1], [430, 635]);
  return (
    <>
      <Header phase="quantize" enter={enter} />
      <Panel left={45} top={410} width={430} height={545} color={theme.accent2} opacity={enter}>
        <SmallLabel left={28} top={30} text="ДО КВАНТИЗАЦИИ" color={theme.accent2} size={20} />
        <CoefficientGrid left={38} top={132} size={350} values={rawCoefficients} kind="coeff" color={theme.accent2} />
      </Panel>
      <Panel left={605} top={410} width={430} height={545} color={theme.warning} opacity={enter * (0.35 + resultP * 0.65)}>
        <SmallLabel left={28} top={30} text="ПОСЛЕ ОКРУГЛЕНИЯ" color={theme.warning} size={20} />
        <CoefficientGrid left={38} top={132} size={350} values={rawCoefficients} kind="coeff" color={theme.warning} zeroP={resultP} />
        <SmallLabel left={28} top={495} text="МЕНЬШЕ ДАННЫХ" color={theme.warning} size={18} />
      </Panel>
      <div
        style={{
          position: "absolute",
          left: eraserX,
          top: 655,
          width: 132,
          height: 86,
          borderRadius: 16,
          background: `${theme.warning}28`,
          border: `4px solid ${theme.warning}`,
          boxShadow: `0 0 34px ${theme.warning}66`,
          transform: "rotate(-12deg)",
          opacity: enter * (0.15 + eraserP * 0.85),
        }}
      >
        <div style={{ color: theme.warning, textAlign: "center", marginTop: 27, fontSize: 18, ...mono }}>ЛАСТИК</div>
      </div>
      <Badge text="ТОНКИЕ ШТРИХИ СТИРАЮТСЯ · КОНТУР ОСТАЁТСЯ" color={theme.warning} opacity={enter * (0.5 + resultP * 0.5)} />
      <PulseRing x={CX} y={695} triggerFrame={impactLocal} tone="warning" size={230} />
    </>
  );
};

const ZeroPhase: React.FC<{ local: number; fps: number; enter: number; impactLocal: number }> = ({ local, fps, enter, impactLocal }) => {
  const zeroP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  return (
    <>
      <Header phase="zero" enter={enter} />
      <Panel left={45} top={405} width={430} height={535} color={theme.accent2} opacity={enter}>
        <SmallLabel left={28} top={30} text="ПЕРЕПАДЫ ДО" color={theme.accent2} size={20} />
        <CoefficientGrid left={38} top={126} size={350} values={rawCoefficients} kind="coeff" color={theme.accent2} />
      </Panel>
      <Arrow left={480} top={620} color={theme.danger} opacity={enter} label="ОКРУГЛЯЕТ" />
      <Panel left={605} top={405} width={430} height={535} color={theme.danger} opacity={enter}>
        <SmallLabel left={28} top={30} text="СЛАБЫЕ → 0" color={theme.danger} size={20} />
        <CoefficientGrid left={38} top={126} size={350} values={rawCoefficients} kind="coeff" color={theme.danger} zeroP={zeroP} />
      </Panel>
      <DetailChip left={45} top={985} width={300} text="ГРАНИЦА ВОЛОСА" color={theme.accent} lost={zeroP} />
      <DetailChip left={390} top={985} width={300} text="ТЕКСТ ВДАЛИ" color={theme.accent2} lost={zeroP} />
      <DetailChip left={735} top={985} width={300} text="ЗЕРНО ТКАНИ" color={theme.warning} lost={zeroP} />
      <Badge text="ЭТО УЖЕ НЕ СПРЯТАНО, А НЕ ЗАПИСАНО" color={theme.danger} opacity={enter * (0.45 + zeroP * 0.55)} scale={0.98 + zeroP * 0.02} />
      <PulseRing x={820} y={680} triggerFrame={impactLocal} tone="danger" size={240} />
    </>
  );
};

const TailPhase: React.FC<{ local: number; fps: number; enter: number; impactLocal: number }> = ({ local, fps, enter, impactLocal }) => {
  const tailP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const values = [36, 22, 13, 9, 5, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return (
    <>
      <Header phase="tail" enter={enter} />
      <Panel left={50} top={430} width={980} height={390} color={theme.danger} opacity={enter}>
        <SmallLabel left={30} top={30} text="КВАНТОВАННЫЕ КОЭФФИЦИЕНТЫ" color={theme.danger} size={21} />
        <div style={{ position: "absolute", left: 30, top: 112, display: "grid", gridTemplateColumns: "repeat(16, 1fr)", gap: 8 }}>
          {values.map((value, i) => {
            const afterEnd = i >= 7;
            const opacity = afterEnd ? 1 - tailP * 0.8 : 1;
            const color = afterEnd ? theme.danger : i === 6 ? theme.warning : theme.accent;
            return (
              <div
                key={i}
                style={{
                  width: 48,
                  height: 94,
                  borderRadius: 12,
                  border: `3px solid ${color}${afterEnd ? "66" : "CC"}`,
                  background: `${color}${afterEnd ? "0A" : "20"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color,
                  opacity,
                  fontSize: 22,
                  ...mono,
                }}
              >
                {afterEnd ? (tailP > 0.5 ? "×" : "0") : value}
              </div>
            );
          })}
        </div>
        <div
          style={{
            position: "absolute",
            left: 30 + 7 * 56 - 3,
            top: 95,
            width: 4,
            height: 132,
            background: theme.warning,
            boxShadow: `0 0 18px ${theme.warning}`,
            opacity: enter,
          }}
        />
        <div style={{ position: "absolute", left: 30 + 6 * 56 - 10, top: 250, color: theme.warning, fontSize: 18, ...mono }}>EOB</div>
        <SmallLabel left={30} top={312} text="ХРАНИМ ДО ПОСЛЕДНЕГО НЕНУЛЕВОГО" color={theme.subtext} size={18} />
      </Panel>
      <Arrow left={472} top={870} color={theme.danger} opacity={enter * (0.35 + tailP * 0.65)} label="ХВОСТ УХОДИТ" />
      <div
        style={{
          position: "absolute",
          left: 690,
          top: 850,
          width: 300,
          height: 120,
          borderRadius: 20,
          border: `3px solid ${theme.accent}99`,
          background: `${theme.accent}12`,
          color: theme.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          fontSize: 20,
          opacity: enter,
          ...mono,
        }}
      >
        ЗАПИСАНО
        <br />
        ДО EOB
      </div>
      <Badge text="ХВОСТ → НЕ ЗАПИСАН" color={theme.danger} opacity={enter * (0.45 + tailP * 0.55)} scale={0.98 + tailP * 0.02} />
      <PulseRing x={30 + 6 * 56 + 24} y={590} triggerFrame={impactLocal} tone="warning" size={220} />
    </>
  );
};

const RebuildPhase: React.FC<{ local: number; fps: number; enter: number; impactLocal: number }> = ({ local, fps, enter, impactLocal }) => {
  const buildP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 13, mass: 0.7 } });
  return (
    <>
      <Header phase="rebuild" enter={enter} />
      <Panel left={45} top={420} width={360} height={500} color={theme.accent2} opacity={enter}>
        <SmallLabel left={28} top={30} text="ОСТАЛОСЬ" color={theme.accent2} size={20} />
        <CoefficientGrid left={32} top={125} size={290} values={rawCoefficients} kind="coeff" color={theme.accent2} zeroP={1} />
        <SmallLabel left={28} top={430} text="ТОЛЬКО НЕНУЛЕВЫЕ" color={theme.subtext} size={17} />
      </Panel>
      <Arrow left={412} top={620} color={theme.success} opacity={enter * (0.35 + buildP * 0.65)} label="СОБИРАЕТСЯ" />
      <VideoFrame left={595} top={410} width={440} height={510} label="КАДР ПОСЛЕ СБОРКИ" detail={0.18} blur={1.7} color={theme.success} opacity={enter * (0.35 + buildP * 0.65)} />
      <SmallLabel left={620} top={950} text="КОНТУРЫ СГЛАЖЕНЫ" color={theme.success} size={18} opacity={enter} />
      <SmallLabel left={620} top={1000} text="МЕЛКИЙ ТЕКСТ ПЛЫВЁТ" color={theme.danger} size={18} opacity={enter} />
      <Badge text="СОБРАНО ИЗ ОСТАВШЕГОСЯ · ВОССТАНОВИТЬ НЕЛЬЗЯ" color={theme.success} opacity={enter * (0.45 + buildP * 0.55)} scale={0.95 + buildP * 0.05} />
      <PulseRing x={815} y={660} triggerFrame={impactLocal} tone="success" size={240} />
    </>
  );
};

export const QuantizationLossVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "sharp" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });

  if (phase === "sharp") return <SharpPhase enter={enter} impactLocal={impactLocal} />;
  if (phase === "copy") return <CopyPhase local={local} enter={enter} impactLocal={impactLocal} />;
  if (phase === "block") return <BlockPhase local={local} enter={enter} impactLocal={impactLocal} />;
  if (phase === "coefficients") return <CoefficientsPhase local={local} enter={enter} impactLocal={impactLocal} />;
  if (phase === "quantize") return <QuantizePhase local={local} enter={enter} impactLocal={impactLocal} />;
  if (phase === "zero") return <ZeroPhase local={local} fps={fps} enter={enter} impactLocal={impactLocal} />;
  if (phase === "tail") return <TailPhase local={local} fps={fps} enter={enter} impactLocal={impactLocal} />;
  return <RebuildPhase local={local} fps={fps} enter={enter} impactLocal={impactLocal} />;
};

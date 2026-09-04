import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { Badge } from "../primitives/Badge";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type NfcCardCoilPhase = "tap" | "inside" | "no-battery";

const W = layout.width;
const CARD_VIEW_W = 800;
const CARD_VIEW_H = 500;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1.5 };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => value * value * (3 - 2 * value);

/** Плоская карта с настоящей графикой инлея: катушка, соединения и чип. */
export const NfcCardGraphic: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  opacity?: number;
  interior?: boolean;
  active?: boolean;
  dim?: boolean;
  showLoad?: boolean;
  loadOn?: boolean;
  shiftX?: number;
  zIndex?: number;
}> = ({
  left,
  top,
  width,
  height,
  opacity = 1,
  interior = false,
  active = false,
  dim = false,
  showLoad = false,
  loadOn = false,
  shiftX = 0,
  zIndex = 2,
}) => {
  const mainColor = dim ? theme.subtext : active ? theme.accent : theme.accent2;
  const chipColor = dim ? theme.subtext : active ? theme.success : theme.warning;
  const cardFill = dim ? `${theme.panel}CC` : `${theme.panel}F2`;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        opacity,
        zIndex,
        transform: `translateX(${shiftX}px)`,
        transformOrigin: "center center",
        filter: dim ? "grayscale(0.55)" : undefined,
      }}
    >
      <svg width={width} height={height} viewBox={`0 0 ${CARD_VIEW_W} ${CARD_VIEW_H}`}>
        <rect
          x="14"
          y="14"
          width="772"
          height="472"
          rx="38"
          fill={cardFill}
          stroke={mainColor}
          strokeWidth="7"
          opacity={dim ? 0.72 : 1}
        />
        <rect x="25" y="25" width="750" height="450" rx="30" fill="none" stroke={`${theme.text}18`} strokeWidth="3" />
        {interior ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <rect
                key={`coil-${i}`}
                x={68 + i * 24}
                y={62 + i * 22}
                width={486 - i * 42}
                height={348 - i * 44}
                rx={24 - i * 2}
                fill="none"
                stroke={mainColor}
                strokeWidth={i === 0 ? 8 : 5}
                opacity={0.95 - i * 0.08}
              />
            ))}
            <path d="M 554 236 H 594 V 252 H 620" fill="none" stroke={mainColor} strokeWidth="8" />
            <path d="M 554 272 H 594 V 252" fill="none" stroke={mainColor} strokeWidth="4" opacity="0.55" />
            <text x="96" y="446" fill={mainColor} fontFamily={theme.mono} fontSize="24" fontWeight="800" letterSpacing="2">
              ПЛОСКАЯ КАТУШКА · INLAY
            </text>
          </>
        ) : (
          <>
            <rect x="83" y="183" width="155" height="116" rx="15" fill={`${chipColor}20`} stroke={chipColor} strokeWidth="5" />
            <path d="M 114 183 V 299 M 155 183 V 299 M 196 183 V 299 M 83 222 H 238 M 83 260 H 238" stroke={chipColor} strokeWidth="4" opacity="0.85" />
            <path d="M 635 170 A 92 92 0 0 1 635 330 M 667 202 A 58 58 0 0 1 667 298 M 696 225 A 28 28 0 0 1 696 275" fill="none" stroke={mainColor} strokeWidth="10" strokeLinecap="round" />
            <text x="83" y="365" fill={chipColor} fontFamily={theme.mono} fontSize="24" fontWeight="800" letterSpacing="2">
              ЧИП
            </text>
            <text x="505" y="424" fill={mainColor} fontFamily={theme.mono} fontSize="25" fontWeight="800" letterSpacing="2">
              БЕСКОНТАКТНАЯ КАРТА
            </text>
          </>
        )}
        <rect x="620" y="207" width="116" height="88" rx="14" fill={`${chipColor}1A`} stroke={chipColor} strokeWidth="5" opacity={interior ? 1 : 0} />
        <text x="678" y="260" textAnchor="middle" fill={chipColor} fontFamily={theme.mono} fontSize="22" fontWeight="800" opacity={interior ? 1 : 0}>
          CHIP
        </text>
        {showLoad ? (
          <>
            <path d="M 500 382 H 558 V 410 H 612" fill="none" stroke={loadOn ? theme.warning : theme.subtext} strokeWidth="6" strokeDasharray={loadOn ? undefined : "12 9"} />
            <rect x="612" y="380" width="108" height="62" rx="12" fill={`${loadOn ? theme.warning : theme.subtext}20`} stroke={loadOn ? theme.warning : theme.subtext} strokeWidth="5" />
            <text x="666" y="418" textAnchor="middle" fill={loadOn ? theme.warning : theme.subtext} fontFamily={theme.mono} fontSize="22" fontWeight="800">
              LOAD {loadOn ? "ON" : "OFF"}
            </text>
          </>
        ) : null}
      </svg>
    </div>
  );
};

/** Ридер с отдельной площадкой-катушкой, чтобы поле не превращалось в generic diagram. */
export const NfcReaderGraphic: React.FC<{
  left: number;
  top: number;
  width?: number;
  height?: number;
  opacity?: number;
  active?: boolean;
  dim?: boolean;
}> = ({ left, top, width = 230, height = 400, opacity = 1, active = false, dim = false }) => {
  const color = dim ? theme.subtext : active ? theme.accent : theme.accent2;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        opacity,
        borderRadius: 28,
        border: `5px solid ${color}`,
        background: `${theme.panel}F2`,
        boxShadow: active ? `0 0 42px ${color}66` : `0 0 22px ${color}22`,
        boxSizing: "border-box",
      }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, top: 28, textAlign: "center", color, fontSize: 20, ...mono }}>
        ТЕРМИНАЛ
      </div>
      <div
        style={{
          position: "absolute",
          left: 34,
          right: 34,
          top: 83,
          height: 112,
          borderRadius: 14,
          border: `3px solid ${theme.panelBorder}`,
          background: `${theme.bg}B8`,
        }}
      >
        <div style={{ marginTop: 28, textAlign: "center", color: active ? theme.success : theme.subtext, fontSize: 22, ...mono }}>
          {active ? "ГОТОВ" : "ЖДУ КАРТУ"}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 32,
          right: 32,
          top: 230,
          height: 92,
          borderRadius: 22,
          border: `4px solid ${color}`,
          background: `${color}12`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={116} height={72} viewBox="0 0 116 72" aria-label="Катушка считывателя">
          {[0, 1, 2].map((i) => (
            <rect
              key={`reader-coil-${i}`}
              x={8 + i * 18}
              y={8 + i * 9}
              width={100 - i * 36}
              height={56 - i * 18}
              rx={16 - i * 4}
              fill="none"
              stroke={color}
              strokeWidth={i === 0 ? 5 : 4}
              opacity={0.9 - i * 0.15}
            />
          ))}
          <circle cx="58" cy="36" r="4" fill={color} />
        </svg>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 27, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>
        СЧИТЫВАТЕЛЬ
      </div>
    </div>
  );
};

const Header: React.FC<{ text: string; opacity: number }> = ({ text, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 245,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 13,
      color: theme.subtext,
      fontSize: 24,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    <IconGlyph name="credit-card" size={32} color={theme.accent} strokeWidth={1.8} />
    <span>{text}</span>
  </div>
);

const BatteryCrossed: React.FC<{ left: number; top: number; opacity: number }> = ({ left, top, opacity }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width: 260,
      height: 190,
      borderRadius: 24,
      border: `3px solid ${theme.danger}`,
      background: `${theme.danger}12`,
      opacity,
      textAlign: "center",
    }}
  >
    <IconGlyph name="battery" size={62} color={theme.danger} strokeWidth={1.8} />
    <div style={{ color: theme.danger, fontSize: 21, marginTop: 6, ...mono }}>БАТАРЕЙКА</div>
    <div style={{ position: "absolute", left: 22, right: 22, top: 91, borderTop: `6px solid ${theme.danger}`, transform: "rotate(-28deg)" }} />
    <div style={{ position: "absolute", left: 22, right: 22, top: 91, borderTop: `6px solid ${theme.danger}`, transform: "rotate(28deg)" }} />
  </div>
);

/** NFC-карта: реальный инлей и катушка раскрываются вместо абстрактного значка карты. */
export const NfcCardCoilVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: NfcCardCoilPhase;
}> = ({ local, fps, impactLocal, phase = "tap" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const phaseTitle: Record<NfcCardCoilPhase, string> = {
    tap: "КАРТА ПОДНОСИТСЯ К СЧИТЫВАТЕЛЮ",
    inside: "ВНУТРИ ПЛАСТИКА — ПЛОСКАЯ КАТУШКА",
    "no-battery": "ЧИП ЕСТЬ · БАТАРЕЙКИ НЕТ",
  };

  if (phase === "tap") {
    const approach = smooth(clamp01(local / Math.max(impactLocal, 1)));
    const cardShift = interpolate(approach, [0, 1], [0, 245], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const paid = local >= impactLocal;
    return (
      <>
        <Header text={phaseTitle[phase]} opacity={enter} />
        <NfcReaderGraphic left={805} top={535} width={225} height={410} active={paid} opacity={enter} />
        <div style={{ position: "absolute", left: 330, top: 718, width: 445, borderTop: `4px dashed ${theme.accent}66`, opacity: enter }} />
        <NfcCardGraphic left={62} top={548} width={620} height={388} shiftX={cardShift} active={paid} opacity={enter} />
        <Badge label={paid ? "ПЛАТЁЖ ПРОШЁЛ" : "ПОДНЕСИ КАРТУ"} x={540} y={1190} tone={paid ? "success" : "accent"} enterFrame={paid ? impactLocal : 0} />
        {paid ? <PulseRing x={795} y={738} triggerFrame={impactLocal} tone="success" size={220} /> : null}
      </>
    );
  }

  if (phase === "inside") {
    return (
      <>
        <Header text={phaseTitle[phase]} opacity={enter} />
        <NfcCardGraphic left={98} top={450} width={884} height={552} interior active opacity={enter} />
        <div style={{ position: "absolute", left: 160, top: 1050, color: theme.accent, fontSize: 25, ...mono }}>АНТЕННА</div>
        <div style={{ position: "absolute", left: 732, top: 1050, color: theme.warning, fontSize: 25, ...mono }}>ЧИП</div>
        <Badge label="КАТУШКА СОЕДИНЕНА С ЧИПОМ" x={540} y={1220} tone="accent" enterFrame={0} />
        <PulseRing x={540} y={730} triggerFrame={impactLocal} tone="accent" size={320} />
      </>
    );
  }

  return (
    <>
      <Header text={phaseTitle[phase]} opacity={enter} />
      <NfcCardGraphic left={55} top={490} width={590} height={369} interior active opacity={enter} />
      <div style={{ position: "absolute", left: 270, top: 900, color: theme.success, fontSize: 24, ...mono }}>ЭНЕРГИЯ → ЧИП</div>
      <BatteryCrossed left={735} top={600} opacity={enter} />
      <Badge label="РАДИОПИТАНИЕ · БЕЗ БАТАРЕЙКИ" x={540} y={1195} tone="success" enterFrame={0} />
      <PulseRing x={365} y={675} triggerFrame={impactLocal} tone="success" size={260} />
    </>
  );
};

export default NfcCardCoilVisual;

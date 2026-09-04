import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { Badge } from "../primitives/Badge";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";
import { NfcCardGraphic, NfcReaderGraphic } from "./NfcCardCoilVisual";

export type NfcFieldResponsePhase = "question" | "off" | "field" | "near" | "power" | "load" | "reply";

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1.5 };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => value * value * (3 - 2 * value);

const phaseTitle: Record<NfcFieldResponsePhase, string> = {
  question: "КУДА ДЕЛАСЬ ЭНЕРГИЯ?",
  off: "НЕТ ПОЛЯ · НЕТ ОТВЕТА",
  field: "СЧИТЫВАТЕЛЬ СОЗДАЁТ ПЕРЕМЕННОЕ ПОЛЕ",
  near: "КАТУШКИ РЯДОМ · СВЯЗЬ ЕСТЬ",
  power: "НАВЕДЁННЫЙ ТОК ПИТАЕТ ЧИП",
  load: "LOAD MODULATION · НАГРУЗКА",
  reply: "ТЕРМИНАЛ ВИДИТ ИЗМЕНЕНИЕ ТОКА",
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
    <IconGlyph name="radio-tower" size={32} color={theme.accent} strokeWidth={1.8} />
    <span>{text}</span>
  </div>
);

const FieldLines: React.FC<{
  readerX: number;
  cardLeft: number;
  opacity: number;
  response?: boolean;
  local: number;
}> = ({ readerX, cardLeft, opacity, response = false, local }) => {
  const startX = readerX + 225;
  const endX = cardLeft;
  const travel = clamp01((local % 36) / 36);
  return (
    <svg width={W} height={layout.height} viewBox={`0 0 ${W} ${layout.height}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const y = 600 + i * 58;
        const bend = i % 2 === 0 ? -82 : 82;
        return (
          <path
            key={`field-${i}`}
            d={`M ${startX} ${y} C ${startX + 90} ${y + bend} ${endX - 90} ${y - bend} ${endX} ${y}`}
            fill="none"
            stroke={response ? theme.warning : theme.accent}
            strokeWidth={response ? 4 : 5}
            strokeDasharray={response ? "12 13" : undefined}
            opacity={0.45 + 0.1 * Math.sin(local / 8 + i)}
          />
        );
      })}
      {Array.from({ length: 5 }).map((_, i) => {
        const y = 600 + i * 58;
        const bend = i % 2 === 0 ? -82 : 82;
        const t = (travel + i * 0.17) % 1;
        const x = startX + (endX - startX) * t;
        const curveY = y + bend * 4 * t * (1 - t);
        return <circle key={`field-dot-${i}`} cx={x} cy={curveY} r={response ? 8 : 10} fill={response ? theme.warning : theme.accent} />;
      })}
      <text x={(startX + endX) / 2} y={520} textAnchor="middle" fill={response ? theme.warning : theme.accent} fontFamily={theme.mono} fontSize="22" fontWeight="800" letterSpacing="2">
        {response ? "ОТВЕТ →" : "B-ПОЛЕ ↕"}
      </text>
    </svg>
  );
};

const ReturnSignal: React.FC<{ readerX: number; cardLeft: number; opacity: number; local: number }> = ({ readerX, cardLeft, opacity, local }) => {
  const p = clamp01((local % 42) / 42);
  const y = 930;
  const x = cardLeft + (readerX + 225 - cardLeft) * p;
  return (
    <svg width={W} height={layout.height} viewBox={`0 0 ${W} ${layout.height}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity }}>
      <path d={`M ${cardLeft} ${y} C ${cardLeft - 90} ${y + 60} ${readerX + 315} ${y - 60} ${readerX + 225} ${y}`} fill="none" stroke={theme.success} strokeWidth="4" strokeDasharray="10 12" />
      <circle cx={x} cy={y} r="9" fill={theme.success} />
      <text x={(cardLeft + readerX + 225) / 2} y={1000} textAnchor="middle" fill={theme.success} fontFamily={theme.mono} fontSize="20" fontWeight="800" letterSpacing="1">
        МАЛОЕ ИЗМЕНЕНИЕ В ОБРАТНУЮ СТОРОНУ
      </text>
    </svg>
  );
};

const LoadPanel: React.FC<{ left: number; top: number; on: boolean; opacity: number }> = ({ left, top, on, opacity }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width: 265,
      height: 100,
      borderRadius: 18,
      border: `3px solid ${on ? theme.warning : theme.subtext}`,
      background: `${on ? theme.warning : theme.subtext}16`,
      color: on ? theme.warning : theme.subtext,
      opacity,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      fontSize: 24,
      ...mono,
    }}
  >
    <IconGlyph name={on ? "lightbulb" : "lightbulb-off"} size={40} color={on ? theme.warning : theme.subtext} strokeWidth={1.8} />
    <span>НАГРУЗКА {on ? "ВКЛ" : "ВЫКЛ"}</span>
  </div>
);

const ResponseWave: React.FC<{ left: number; top: number; opacity: number; local: number }> = ({ left, top, opacity, local }) => {
  const phase = (local % 28) / 28;
  const points = Array.from({ length: 15 }).map((_, i) => {
    const x = i * 20;
    const y = 32 + Math.sin((i / 14) * Math.PI * 4 + phase * Math.PI * 2) * (i % 3 === 0 ? 25 : 12);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={340} height={95} viewBox="0 0 340 95" style={{ position: "absolute", left, top, overflow: "visible", opacity }}>
      <polyline points={points} fill="none" stroke={theme.warning} strokeWidth="5" />
      <text x="170" y="90" textAnchor="middle" fill={theme.warning} fontFamily={theme.mono} fontSize="19" fontWeight="800" letterSpacing="1">
        ΔI · КРОШЕЧНЫЕ ИЗМЕНЕНИЯ
      </text>
    </svg>
  );
};

/** Поле, питание и load modulation — один причинный NFC-конвейер, не generic-диаграмма. */
export const NfcFieldResponseVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: NfcFieldResponsePhase;
}> = ({ local, fps, impactLocal, phase = "field" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const progress = smooth(clamp01(local / Math.max(impactLocal, 1)));

  if (phase === "question") {
    return (
      <>
        <Header text={phaseTitle[phase]} opacity={enter} />
        <NfcCardGraphic left={560} top={520} width={470} height={294} interior dim opacity={enter} />
        <div style={{ position: "absolute", left: 365, top: 720, transform: "translate(-50%, -50%)", color: theme.warning, fontSize: 132, fontWeight: 900, fontFamily: theme.mono, opacity: enter }}>
          ?
        </div>
        <div style={{ position: "absolute", left: 536, top: 900, transform: "translateX(-50%)", color: theme.subtext, fontSize: 25, ...mono }}>
          ЧИП ЖДЁТ ИСТОЧНИК
        </div>
        <Badge label="СЕЙЧАС РАСКРОЕМ" x={540} y={1190} tone="warning" enterFrame={0} />
      </>
    );
  }

  if (phase === "off") {
    const readerX = interpolate(progress, [0, 1], [150, -205], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const cardLeft = 610;
    return (
      <>
        <Header text={phaseTitle[phase]} opacity={enter} />
        <NfcReaderGraphic left={readerX} top={535} active={false} dim opacity={enter} />
        <NfcCardGraphic left={cardLeft} top={545} width={430} height={269} interior dim opacity={enter} />
        <div style={{ position: "absolute", left: 515, top: 735, transform: "translate(-50%, -50%)", color: theme.danger, fontSize: 92, fontWeight: 900, fontFamily: theme.mono, opacity: enter }}>
          ×
        </div>
        <Badge label="КАРТА НЕ ОТВЕЧАЕТ" x={540} y={1190} tone="danger" enterFrame={0} />
        <PulseRing x={820} y={725} triggerFrame={impactLocal} tone="danger" size={220} />
      </>
    );
  }

  const isNear = phase === "near";
  const isPower = phase === "power";
  const isLoad = phase === "load";
  const isReply = phase === "reply";
  const readerX = isNear ? 180 : 70;
  const cardLeft = isNear ? 505 : 560;
  const cardTop = isPower || isLoad || isReply ? 525 : 545;
  const cardWidth = isNear ? 475 : 455;
  const cardHeight = cardWidth * 0.625;
  const loadOn = Math.floor(Math.max(0, local - impactLocal) / 9) % 2 === 0;
  const fieldOpacity = enter * (phase === "field" ? 1 : 0.82);
  const responseOpacity = isLoad || isReply ? enter : 0;

  return (
    <>
      <Header text={phaseTitle[phase]} opacity={enter} />
      <NfcReaderGraphic left={readerX} top={535} active opacity={enter} />
      <NfcCardGraphic
        left={cardLeft}
        top={cardTop}
        width={cardWidth}
        height={cardHeight}
        interior
        active={isPower || isLoad || isReply || isNear}
        showLoad={isLoad || isReply}
        loadOn={isLoad ? loadOn : isReply}
        opacity={enter}
      />
      <FieldLines readerX={readerX} cardLeft={cardLeft} opacity={fieldOpacity} response={false} local={local} />
      {isLoad || isReply ? <ReturnSignal readerX={readerX} cardLeft={cardLeft} opacity={responseOpacity} local={local} /> : null}
      {isLoad ? <LoadPanel left={545} top={1030} on={loadOn} opacity={enter} /> : null}
      {isReply ? <ResponseWave left={338} top={1040} opacity={enter} local={local} /> : null}
      {isNear ? (
        <>
          <div style={{ position: "absolute", left: 393, top: 770, width: 110, borderTop: `3px dashed ${theme.success}`, opacity: enter }} />
          <div style={{ position: "absolute", left: 448, top: 800, transform: "translateX(-50%)", color: theme.success, fontSize: 20, whiteSpace: "nowrap", ...mono }}>
            БЛИЗКАЯ ЗОНА
          </div>
        </>
      ) : null}
      {isPower ? (
        <div style={{ position: "absolute", left: 605, top: 1015, width: 390, height: 84, borderRadius: 18, border: `3px solid ${theme.success}`, background: `${theme.success}16`, color: theme.success, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, opacity: enter, fontSize: 25, ...mono }}>
          <IconGlyph name="zap" size={38} color={theme.success} strokeWidth={1.8} />
          ПИТАНИЕ БЕЗ БАТАРЕЙКИ
        </div>
      ) : null}
      {phase === "field" ? <Badge label="ТЕРМИНАЛ ВКЛЮЧИЛ ПОЛЕ" x={540} y={1190} tone="accent" enterFrame={0} /> : null}
      {isNear ? <Badge label="РАБОТАЕТ ТОЛЬКО РЯДОМ" x={540} y={1190} tone="success" enterFrame={0} /> : null}
      {isPower ? <Badge label="ПОЛЕ → НАВЕДЁННЫЙ ТОК → ПИТАНИЕ ЧИПА" x={540} y={1190} tone="success" enterFrame={0} /> : null}
      {isLoad ? <Badge label="НАГРУЗКА ВКЛ / ВЫКЛ → СИГНАЛ МЕНЯЕТСЯ" x={540} y={1190} tone="warning" enterFrame={0} /> : null}
      {isReply ? <Badge label="ОТВЕТ КАРТЫ ДОШЁЛ ДО ТЕРМИНАЛА" x={540} y={1190} tone="success" enterFrame={0} /> : null}
      {isPower || isNear ? <PulseRing x={cardLeft + 225} y={700} triggerFrame={impactLocal} tone="success" size={230} /> : null}
      {isLoad ? <PulseRing x={cardLeft + 225} y={700} triggerFrame={impactLocal} tone="warning" size={220} /> : null}
      {isReply ? <PulseRing x={readerX + 225} y={700} triggerFrame={impactLocal} tone="success" size={220} /> : null}
    </>
  );
};

export default NfcFieldResponseVisual;

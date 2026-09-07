import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { stripStress } from "../lib/stress";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type AdaptiveBitratePhase = "variants" | "ladder" | "choose" | "measure" | "buffer" | "downshift" | "frozen" | "switch";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: AdaptiveBitratePhase;
}

const W = layout.width;
const CX = W / 2;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const phaseTitle: Record<AdaptiveBitratePhase, string> = {
  variants: "ОДИН СЕГМЕНТ · НЕСКОЛЬКО СТУПЕНЕЙ",
  ladder: "ЛЕСТНИЦА АДАПТИВНОГО БИТРЕЙТА",
  choose: "ПЛЕЕР ВЫБИРАЕТ ВАРИАНТ",
  measure: "ПЛЕЕР СРАВНИВАЕТ ДОСТАВКУ И ЗАПАС",
  buffer: "БУФЕР ТАЕТ · РЕШЕНИЕ ЕЩЁ ВПЕРЕДИ",
  downshift: "ЗАПАС МАЛ · ВЫБИРАЕМ СТУПЕНЬ НИЖЕ",
  frozen: "УЖЕ СКАЧАННОЕ НЕ ОБЛЕГЧИТЬ",
  switch: "СЛЕДУЮЩИЙ КУСОЧЕК · КАЧЕСТВО МЕНЯЕТСЯ ЗДЕСЬ",
};

const phaseIcon: Record<AdaptiveBitratePhase, string> = {
  variants: "layers",
  ladder: "layers",
  choose: "mouse-pointer-2",
  measure: "gauge",
  buffer: "hourglass",
  downshift: "arrow-down",
  frozen: "lock-keyhole",
  switch: "replace",
};

const phaseTone: Record<AdaptiveBitratePhase, string> = {
  variants: theme.accent2,
  ladder: theme.accent2,
  choose: theme.accent,
  measure: theme.accent,
  buffer: theme.warning,
  downshift: theme.warning,
  frozen: theme.danger,
  switch: theme.success,
};

const Header: React.FC<{ phase: AdaptiveBitratePhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 224,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: phaseTone[phase],
      fontSize: 21,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={30} color={phaseTone[phase]} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  children: React.ReactNode;
}> = ({ left, top, width, height, color, opacity, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 26,
      background: `${theme.panel}F0`,
      border: `3px solid ${color}77`,
      boxShadow: `0 14px 48px ${color}20`,
      opacity,
    }}
  >
    {children}
  </div>
);

const StepCard: React.FC<{
  top: number;
  quality: string;
  bitrate: string;
  color: string;
  active: boolean;
  opacity: number;
  label?: string;
}> = ({ top, quality, bitrate, color, active, opacity, label }) => (
  <div
    style={{
      position: "absolute",
      left: 26,
      top,
      width: 438,
      height: 88,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "0 18px",
      borderRadius: 16,
      border: `2px solid ${color}${active ? "DD" : "55"}`,
      background: `${color}${active ? "22" : "0D"}`,
      opacity,
      color: active ? theme.text : theme.subtext,
      ...mono,
    }}
  >
    <div style={{ width: 100, flexShrink: 0, color, fontSize: 26, whiteSpace: "nowrap" }}>{quality}</div>
    <div style={{ flexShrink: 0, fontSize: 16, whiteSpace: "nowrap" }}>{stripStress(`SEG-08 · ${bitrate}`)}</div>
    {label ? <div style={{ marginLeft: "auto", flexShrink: 0, color, fontSize: 16, whiteSpace: "nowrap" }}>{label}</div> : null}
  </div>
);

const CurrentSegment: React.FC<{ phase: AdaptiveBitratePhase; opacity: number }> = ({ phase, opacity }) => {
  const frozen = phase === "frozen" || phase === "switch";
  const progress = phase === "switch" ? 0.94 : 0.74;
  return (
    <Panel left={76} top={398} width={390} height={548} color={phase === "frozen" ? theme.danger : phase === "switch" ? theme.success : theme.accent} opacity={opacity}>
      <div style={{ position: "absolute", left: 26, top: 24, display: "flex", alignItems: "center", gap: 10, color: phase === "frozen" ? theme.danger : theme.accent, fontSize: 20, ...mono }}>
        <IconGlyph name="square-play" size={28} color={phase === "frozen" ? theme.danger : theme.accent} strokeWidth={1.8} />
        ТЕКУЩИЙ СЕГМЕНТ
      </div>
      <div style={{ position: "absolute", left: 26, top: 88, width: 338, height: 210, borderRadius: 18, background: "linear-gradient(145deg, #29465B 0%, #111923 78%)", border: `2px solid ${theme.panelBorder}` }}>
        <div style={{ position: "absolute", left: 20, top: 18, color: theme.text, fontSize: 22, ...mono }}>SEG-07</div>
        <div style={{ position: "absolute", left: 20, top: 64, color: theme.accent2, fontSize: 43, ...mono }}>1080p</div>
        <div style={{ position: "absolute", left: 20, bottom: 22, color: theme.subtext, fontSize: 17, ...mono }}>БАЙТЫ УЖЕ ПОЛУЧЕНЫ</div>
      </div>
      <div style={{ position: "absolute", left: 26, top: 338, color: frozen ? theme.danger : theme.success, fontSize: 20, ...mono }}>
        {phase === "frozen" ? "НЕ МЕНЯЕТСЯ НА ЛЕТУ" : phase === "switch" ? "ОСТАЁТСЯ 1080p" : "ИГРАЕТ"}
      </div>
      <div style={{ position: "absolute", left: 26, top: 385, width: 338, height: 14, borderRadius: 999, background: theme.panelBorder }}>
        <div style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 999, background: phase === "frozen" ? theme.danger : theme.success }} />
      </div>
      <div style={{ position: "absolute", left: 26, top: 420, color: theme.subtext, fontSize: 17, ...mono }}>{phase === "switch" ? "ГРАНИЦА → SEG-08" : "SEG-07 · ТЕКУЩИЙ"}</div>
      {frozen ? (
        <div style={{ position: "absolute", left: 292, top: 334 }}>
          <IconGlyph name="lock-keyhole" size={42} color={phase === "frozen" ? theme.danger : theme.success} strokeWidth={1.8} />
        </div>
      ) : null}
    </Panel>
  );
};

const Metrics: React.FC<{ phase: AdaptiveBitratePhase; local: number; impactLocal: number; opacity: number }> = ({ phase, local, impactLocal, opacity }) => {
  const fill = smooth(interpolate(local, [0, Math.max(impactLocal, 1)], [0.22, 0.82], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const chosen = phase === "switch" || phase === "downshift";
  const title = phase === "measure" ? "ДОСТАВКА · 1.1×" : phase === "buffer" || phase === "downshift" ? "БУФЕР · 9 с → 6 с" : chosen ? "ПОСЛЕ ВЫБОРА · БУФЕР РАСТЁТ" : phase === "frozen" ? "SEG-07 · БАЙТЫ НЕ ПЕРЕПИСАТЬ" : "ВЫБОР ПО ЗАПАСУ ВРЕМЕНИ";
  const barColor = phase === "buffer" || phase === "downshift" ? theme.warning : chosen ? theme.success : theme.accent;
  return (
    <div style={{ position: "absolute", left: 76, top: 984, width: 924, height: 150, opacity, ...mono }}>
      <div style={{ color: barColor, fontSize: 20 }}>{title}</div>
      <div style={{ position: "absolute", left: 0, top: 44, width: 924, height: 26, borderRadius: 999, background: theme.panelBorder }}>
        <div style={{ width: `${(chosen ? 0.74 : fill) * 100}%`, height: "100%", borderRadius: 999, background: barColor, boxShadow: `0 0 18px ${barColor}66` }} />
      </div>
      <div style={{ position: "absolute", left: 0, top: 82, color: theme.subtext, fontSize: 17 }}>{phase === "measure" ? "СКОРОСТЬ ДОСТАВКИ" : "ВРЕМЯ ДО ОПУСТОШЕНИЯ"}</div>
      <div style={{ position: "absolute", right: 0, top: 82, color: barColor, fontSize: 18 }}>{chosen ? "→ СТУПЕНЬ НИЖЕ" : phase === "frozen" ? "LOCKED" : "ОЦЕНИВАЕМ"}</div>
    </div>
  );
};

/** Лестница вариантов следующего сегмента: измерение ведёт на ступень ниже, текущий сегмент не переписывается. */
export const AdaptiveBitrateLadderVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "variants" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 13, mass: 0.7 } });
  const lower = phase === "downshift" || phase === "switch";
  const showLock = phase === "frozen" || phase === "switch";
  const selected = lower ? 2 : phase === "buffer" || phase === "measure" ? 1 : phase === "choose" ? 0 : -1;

  return (
    <div style={{ position: "absolute", inset: 0, opacity: enter }}>
      <Header phase={phase} opacity={enter} />
      <CurrentSegment phase={phase} opacity={enter} />
      <Panel left={500} top={398} width={500} height={548} color={phaseTone[phase]} opacity={enter}>
        <div style={{ position: "absolute", left: 26, top: 24, display: "flex", alignItems: "center", gap: 10, color: phaseTone[phase], fontSize: 20, ...mono }}>
          <IconGlyph name="layers" size={28} color={phaseTone[phase]} strokeWidth={1.8} />
          СЛЕДУЮЩИЙ · SEG-08
        </div>
        <StepCard top={94} quality="1080p" bitrate="4.5 Мбит/с" color={theme.accent2} active={selected === 0} opacity={phase === "ladder" || phase === "variants" ? 1 : 0.74} label={selected === 0 ? "ВЫБРАНО" : undefined} />
        <StepCard top={196} quality="720p" bitrate="2.5 Мбит/с" color={theme.accent} active={selected === 1} opacity={1} label={selected === 1 ? "ВЫБРАНО" : undefined} />
        <StepCard top={298} quality="360p" bitrate="0.8 Мбит/с" color={theme.success} active={selected === 2} opacity={1} label={selected === 2 ? "ВЫБРАНО" : undefined} />
        <div style={{ position: "absolute", left: 26, top: 414, color: phase === "variants" || phase === "ladder" ? theme.subtext : phaseTone[phase], fontSize: 17, ...mono }}>
          {phase === "variants" ? "ОДИН И ТОТ ЖЕ СЛЕДУЮЩИЙ КУСОЧЕК" : phase === "ladder" ? "КАЖДАЯ ПОЛКА · ДРУГАЯ ВЕСОВАЯ ЦЕНА" : phase === "choose" ? "ПЛЕЕР СТАВИТ ОТМЕТКУ НА ВАРИАНТЕ" : lower ? "ПРОСИМ НОВУЮ ВЕРСИЮ" : "ПОКА НЕ ПЕРЕКЛЮЧИЛИСЬ"}
        </div>
      </Panel>
      <Metrics phase={phase} local={local} impactLocal={impactLocal} opacity={enter} />
      <div style={{ position: "absolute", left: CX, top: 1195, transform: "translateX(-50%)", padding: "14px 30px", borderRadius: 999, border: `2px solid ${phaseTone[phase]}`, background: `${phaseTone[phase]}18`, color: phaseTone[phase], fontSize: 22, whiteSpace: "nowrap", ...mono }}>
        {phase === "frozen" ? "СКАЧАННЫЙ SEG-07 · БАЙТЫ НЕ ИЗМЕНИТЬ" : phase === "switch" ? "SEG-07 · 1080p  →  SEG-08 · 360p" : phase === "downshift" ? "ЗАПАС ТАЕТ · БЕРЁМ ЛЁГКУЮ СТУПЕНЬ" : phase === "choose" ? "ОДИН СЛЕДУЮЩИЙ СЕГМЕНТ · ОДИН ВЫБОР" : "ВЫБОР ДОСТУПЕН НА ГРАНИЦЕ СЕГМЕНТА"}
      </div>
      <PulseRing x={760} y={730} triggerFrame={impactLocal} tone={phase === "switch" ? "success" : phase === "frozen" ? "danger" : "accent"} size={190 + 60 * reveal} />
      {showLock ? <div style={{ position: "absolute", left: 428, top: 540, color: phase === "frozen" ? theme.danger : theme.success, opacity: enter }}><IconGlyph name="lock-keyhole" size={44} color={phase === "frozen" ? theme.danger : theme.success} strokeWidth={1.8} /></div> : null}
    </div>
  );
};

import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type ResetVectorPhase = "vector" | "postman" | "address" | "wow" | "handoff";

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1.4 };
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const phaseTitle: Record<ResetVectorPhase, string> = {
  vector: "RESET VECTOR · СТАРТ",
  postman: "АДРЕС · ИДИ СЮДА",
  address: "X86 · АДРЕСА",
  wow: "ВАУ · 16 БАЙТ",
  handoff: "JMP · FIRMWARE",
};

const phaseColor: Record<ResetVectorPhase, string> = {
  vector: theme.accent,
  postman: theme.warning,
  address: theme.accent2,
  wow: theme.warning,
  handoff: theme.success,
};

const Tile: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  enter: number;
  color: string;
  icon: string;
  label: string;
  detail: string;
  children?: React.ReactNode;
}> = ({ x, y, width, height, enter, color, icon, label, detail, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height,
      borderRadius: 24,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 38px ${color}1E`,
      opacity: enter,
      transform: `translateY(${(1 - enter) * 30}px)`,
      boxSizing: "border-box",
    }}
  >
    <div style={{ position: "absolute", left: 22, top: 20, display: "flex", alignItems: "center", gap: 10, ...mono, fontSize: 20, color }}>
      <IconGlyph name={icon} size={28} color={color} strokeWidth={1.7} />
      {label}
    </div>
    <div style={{ position: "absolute", left: 24, right: 24, top: 88, textAlign: "center", ...mono, fontSize: 23, color: theme.text }}>{detail}</div>
    {children}
  </div>
);

const VectorPhase: React.FC<{ enter: number; local: number; fps: number; impactLocal: number }> = ({ enter, local, fps, impactLocal }) => {
  const hit = local >= impactLocal;
  const fetchP = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.72 } }) : 0;
  return (
    <>
      <Tile x={80} y={480} width={330} height={300} enter={enter} color={theme.accent} icon="cpu" label="CPU" detail="ПОСЛЕ RESET">
        <div style={{ position: "absolute", left: 26, right: 26, top: 170, height: 58, borderRadius: 14, background: `${theme.accent}12`, border: `2px solid ${theme.accent}66`, display: "flex", alignItems: "center", justifyContent: "center", ...mono, fontSize: 21, color: theme.accent }}>FETCH → ?</div>
      </Tile>
      <Tile x={640} y={510} width={360} height={240} enter={enter} color={theme.warning} icon="map-pin" label="RESET VECTOR" detail="ФИКСИРОВАННЫЙ">
        <div style={{ position: "absolute", left: 26, right: 26, top: 142, textAlign: "center", ...mono, fontSize: 26, color: theme.warning }}>АДРЕС → INSTR</div>
      </Tile>
      <svg width={W} height={layout.safeBottom} viewBox={`0 0 ${W} ${layout.safeBottom}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: enter }}>
        <line x1="410" y1="620" x2="640" y2="620" stroke={theme.accent} strokeWidth="5" strokeDasharray="12 9" strokeLinecap="round" />
        <circle cx={410 + 230 * clamp01(fetchP)} cy="620" r={12} fill={theme.accent} opacity={0.45 + fetchP * 0.55} />
        <text x="525" y="590" textAnchor="middle" fontFamily={theme.mono} fontSize="18" fontWeight="800" fill={theme.accent}>ПЕРВЫЙ FETCH</text>
      </svg>
      <div style={{ position: "absolute", left: "50%", top: 1145, transform: `translateX(-50%) scale(${0.92 + fetchP * 0.08})`, padding: "13px 28px", borderRadius: 999, background: `${theme.accent}18`, border: `3px solid ${theme.accent}99`, ...mono, fontSize: 26, color: theme.accent, whiteSpace: "nowrap", opacity: enter }}>{fetchP > 0.7 ? "CPU НАШЁЛ ПЕРВУЮ ТОЧКУ" : "ПОСЛЕ СБРОСА · КУДА ИДТИ?"}</div>
      <PulseRing x={640} y={620} triggerFrame={impactLocal} tone="accent" size={230} />
    </>
  );
};

const PostmanPhase: React.FC<{ enter: number; local: number; fps: number; impactLocal: number }> = ({ enter, local, fps, impactLocal }) => {
  const p = spring({ frame: Math.max(0, local - 8), fps, config: { damping: 15, mass: 0.78 } });
  const routeP = clamp01((local - impactLocal) / 30);
  return (
    <>
      <Tile x={70} y={480} width={310} height={300} enter={enter} color={theme.accent} icon="cpu" label="ПРОЦЕССОР" detail="ЖДЁТ АДРЕС">
        <div style={{ position: "absolute", left: 26, right: 26, top: 170, textAlign: "center", ...mono, fontSize: 20, color: theme.subtext }}>ПЕРВЫЙ ШАГ · ОБЯЗАТЕЛЕН</div>
      </Tile>
      <Tile x={700} y={480} width={310} height={300} enter={enter} color={theme.warning} icon="map-pin" label="АДРЕСНАЯ ДВЕРЬ" detail="ТОЛЬКО СЮДА">
        <div style={{ position: "absolute", left: 26, right: 26, top: 170, textAlign: "center", ...mono, fontSize: 20, color: theme.warning }}>НЕ ВЫБИРАЕТ · ИДЁТ</div>
      </Tile>
      <svg width={W} height={layout.safeBottom} viewBox={`0 0 ${W} ${layout.safeBottom}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: enter }}>
        <line x1="380" y1="630" x2="700" y2="630" stroke={theme.warning} strokeWidth="4" strokeDasharray="11 9" strokeLinecap="round" />
        <circle cx={380 + 320 * routeP} cy="630" r="10" fill={theme.warning} opacity={0.6 + 0.4 * routeP} />
        <text x="540" y="595" textAnchor="middle" fontFamily={theme.mono} fontSize="19" fontWeight="800" fill={theme.warning}>ОБЯЗАТЕЛЬНЫЙ ПЕРВЫЙ АДРЕС</text>
      </svg>
      <div style={{ position: "absolute", left: "50%", top: 865, transform: `translateX(-50%) translateY(${(1 - p) * 26}px) scale(${0.88 + p * 0.12})`, display: "flex", alignItems: "center", gap: 14, padding: "14px 28px", borderRadius: 18, background: `${theme.warning}14`, border: `3px solid ${theme.warning}88`, opacity: enter * p }}>
        <IconGlyph name="mail" size={34} color={theme.warning} strokeWidth={1.7} />
        <span style={{ ...mono, fontSize: 25, color: theme.warning }}>ПОЧТАЛЬОН · ВСЕГДА ТУДА</span>
      </div>
      <PulseRing x={700} y={630} triggerFrame={impactLocal} tone="warning" size={220} />
    </>
  );
};

const AddressPhase: React.FC<{ enter: number; local: number; fps: number; impactLocal: number; wow: boolean }> = ({ enter, local, fps, impactLocal, wow }) => {
  const pop = local >= impactLocal ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  const selectedColor = wow ? theme.warning : theme.accent2;
  return (
    <>
      <div style={{ position: "absolute", left: 70, top: 470, width: 940, height: 220, borderRadius: 24, background: `${theme.panel}F2`, border: `3px solid ${selectedColor}77`, boxShadow: `0 0 42px ${selectedColor}20`, opacity: enter, transform: `translateY(${(1 - enter) * 30}px) scale(${0.96 + pop * 0.04})` }}>
        <div style={{ position: "absolute", left: 26, top: 22, ...mono, fontSize: 22, color: selectedColor }}>32-БИТНЫЙ АДРЕСНЫЙ ДИАПАЗОН</div>
        <div style={{ position: "absolute", left: 28, right: 28, top: 106, height: 46, borderRadius: 12, background: `${theme.subtext}18`, border: `2px solid ${theme.subtext}66`, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${theme.subtext}22 0%, ${theme.subtext}22 80%, ${selectedColor}44 80%, ${selectedColor}66 100%)` }} />
          <div style={{ position: "absolute", left: "80%", top: 0, bottom: 0, width: "20%", borderLeft: `4px solid ${selectedColor}`, background: `${selectedColor}2A` }} />
        </div>
        <div style={{ position: "absolute", left: 28, top: 166, ...mono, fontSize: 19, color: theme.subtext }}>00000000H · НАЧАЛО</div>
        <div style={{ position: "absolute", right: 28, top: 166, ...mono, fontSize: 19, color: theme.text }}>FFFFFFFFH · 4 ГБ</div>
      </div>
      <div style={{ position: "absolute", left: 155, top: 780, width: 770, height: 260, borderRadius: 24, background: `${selectedColor}12`, border: `4px solid ${selectedColor}`, boxShadow: `0 0 50px ${selectedColor}36`, opacity: enter * (0.85 + pop * 0.15), transform: `scale(${0.94 + pop * 0.06})` }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 22, textAlign: "center", ...mono, fontSize: wow ? 38 : 31, color: selectedColor }}>FFFFFFF0H</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 92, textAlign: "center", ...mono, fontSize: 22, color: theme.text }}>← последние 16 байт перед границей</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 146, textAlign: "center", ...mono, fontSize: 24, color: selectedColor }}>FFFFFFF0H … FFFFFFFFH</div>
      </div>
      <div style={{ position: "absolute", left: "50%", top: 1135, transform: `translateX(-50%) scale(${0.9 + pop * 0.1})`, padding: "13px 27px", borderRadius: 999, background: `${selectedColor}1A`, border: `3px solid ${selectedColor}`, ...mono, fontSize: 26, color: selectedColor, whiteSpace: "nowrap", opacity: enter }}>{wow ? "ВСЕГО 16 Б · ПОЧТИ ВЕРХ АДРЕСНОГО ПРОСТРАНСТВА" : "RESET VECTOR · FFFFFFF0H"}</div>
      <PulseRing x={850} y={605} triggerFrame={impactLocal} tone={wow ? "warning" : "accent2"} size={230} />
    </>
  );
};

const HandoffPhase: React.FC<{ enter: number; local: number; fps: number; impactLocal: number }> = ({ enter, local, fps, impactLocal }) => {
  const p = clamp01((local - impactLocal) / 34);
  const pop = local >= impactLocal ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.72 } }) : 0;
  return (
    <>
      <Tile x={48} y={470} width={290} height={320} enter={enter} color={theme.accent} icon="cpu" label="CPU" detail="RESET VECTOR">
        <div style={{ position: "absolute", left: 22, right: 22, top: 168, height: 64, borderRadius: 14, background: `${theme.accent}12`, border: `2px solid ${theme.accent}66`, display: "flex", alignItems: "center", justifyContent: "center", ...mono, fontSize: 22, color: theme.accent }}>JMP · FIRST</div>
      </Tile>
      <Tile x={400} y={505} width={260} height={250} enter={enter} color={theme.warning} icon="scan-line" label="RESET STUB" detail="1-я КОМАНДА">
        <div style={{ position: "absolute", left: 22, right: 22, top: 148, textAlign: "center", ...mono, fontSize: 19, color: theme.warning }}>→ MAIN CODE</div>
      </Tile>
      <Tile x={720} y={470} width={310} height={320} enter={enter} color={theme.success} icon="book-open" label="FIRMWARE" detail="ОСТАЛЬНОЙ КОД">
        <div style={{ position: "absolute", left: 22, right: 22, top: 150, display: "flex", flexDirection: "column", gap: 12 }}>
          {["RAM · INIT", "DISPLAY · INIT"].map((label) => <div key={label} style={{ height: 48, borderRadius: 12, background: `${theme.success}10`, border: `2px solid ${theme.success}55`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", boxSizing: "border-box", ...mono, fontSize: 17, color: theme.subtext }}><span>{label}</span><span style={{ color: theme.warning }}>WAIT</span></div>)}
        </div>
      </Tile>
      <svg width={W} height={layout.safeBottom} viewBox={`0 0 ${W} ${layout.safeBottom}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: enter }}>
        <line x1="338" y1="630" x2="400" y2="630" stroke={theme.warning} strokeWidth="5" strokeLinecap="round" />
        <circle cx={338 + 62 * p} cy="630" r="10" fill={theme.warning} opacity={0.45 + p * 0.55} />
        <line x1="660" y1="630" x2="720" y2="630" stroke={theme.success} strokeWidth="5" strokeLinecap="round" />
        <text x="540" y="600" textAnchor="middle" fontFamily={theme.mono} fontSize="18" fontWeight="800" fill={theme.warning}>JMP → FIRMWARE</text>
      </svg>
      <div style={{ position: "absolute", left: "50%", top: 1135, transform: `translateX(-50%) scale(${0.91 + pop * 0.09})`, padding: "13px 28px", borderRadius: 999, background: `${theme.success}18`, border: `3px solid ${theme.success}`, ...mono, fontSize: 25, color: theme.success, whiteSpace: "nowrap", opacity: enter }}>УПРАВЛЕНИЕ ПЕРЕДАНО · ЭКРАН ПОКА ЧЁРНЫЙ</div>
      <PulseRing x={720} y={630} triggerFrame={impactLocal} tone="success" size={230} />
    </>
  );
};

export const ResetVectorVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: ResetVectorPhase;
}> = ({ local, fps, impactLocal, phase = "vector" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const color = phaseColor[phase];
  return (
    <>
      <div style={{ position: "absolute", left: 32, right: 32, top: 220, display: "flex", justifyContent: "center", alignItems: "center", gap: 12, ...mono, fontSize: 23, color, opacity: enter, whiteSpace: "nowrap" }}>
        <IconGlyph name={phase === "postman" ? "mail" : phase === "address" || phase === "wow" ? "map-pin" : phase === "handoff" ? "arrow-right-left" : "cpu"} size={29} color={color} strokeWidth={1.8} />
        {phaseTitle[phase]}
      </div>
      {phase === "vector" ? <VectorPhase enter={enter} local={local} fps={fps} impactLocal={impactLocal} /> : null}
      {phase === "postman" ? <PostmanPhase enter={enter} local={local} fps={fps} impactLocal={impactLocal} /> : null}
      {phase === "address" ? <AddressPhase enter={enter} local={local} fps={fps} impactLocal={impactLocal} wow={false} /> : null}
      {phase === "wow" ? <AddressPhase enter={enter} local={local} fps={fps} impactLocal={impactLocal} wow /> : null}
      {phase === "handoff" ? <HandoffPhase enter={enter} local={local} fps={fps} impactLocal={impactLocal} /> : null}
    </>
  );
};

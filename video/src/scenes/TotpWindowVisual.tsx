import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type TotpWindowPhase =
  | "offline"
  | "secret"
  | "window"
  | "hmac"
  | "match"
  | "sealed"
  | "sealed-result"
  | "tolerance"
  | "skew"
  | "mismatch";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: TotpWindowPhase;
  windowSeconds?: number;
  clockOffset?: number;
  wide?: boolean;
};

const W = layout.width;
const CX = W / 2;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const phaseTitle: Record<TotpWindowPhase, string> = {
  offline: "ОФЛАЙН · РАСЧЁТ ОСТАЁТСЯ В ТЕЛЕФОНЕ",
  secret: "ОБЩИЙ СЕКРЕТ · НЕ ПЕРЕДАЁТСЯ",
  window: "ТЕКУЩЕЕ ОКНО · 30 s",
  hmac: "HMAC · ДВА НЕЗАВИСИМЫХ РАСЧЁТА",
  match: "ОДИН КОД · САЙТ ПРИНИМАЕТ",
  sealed: "ДВЕ ЗАПЕЧАТАННЫЕ ИНСТРУКЦИИ",
  "sealed-result": "СЧИТАЮТ НА МЕСТЕ · НИЧЕГО НЕ ШЛЮТ",
  tolerance: "ЗАДЕРЖКА · СОСЕДНЕЕ ОКНО",
  skew: "СБИТЫЕ ЧАСЫ · ОКНА РАЗОШЛИСЬ",
  mismatch: "РАЗНЫЕ ОКНА → РАЗНЫЕ ЧИСЛА",
};

const phaseIcon: Record<TotpWindowPhase, string> = {
  offline: "wifi-off",
  secret: "lock-keyhole",
  window: "clock-3",
  hmac: "git-compare-arrows",
  match: "shield-check",
  sealed: "file-lock-2",
  "sealed-result": "calculator",
  tolerance: "clock-arrow-right",
  skew: "clock-alert",
  mismatch: "equal-not",
};

const Header: React.FC<{ phase: TotpWindowPhase; enter: number; wide?: boolean }> = ({ phase, enter, wide }) => {
  const color = wide ? theme.warning : phase === "mismatch" || phase === "skew" ? theme.danger : theme.accent;
  return (
    <div
      style={{
        position: "absolute",
        left: CX,
        top: 238,
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
      <IconGlyph name={phaseIcon[phase]} size={30} color={color} strokeWidth={1.8} />
      <span>{wide ? "СЛИШКОМ ШИРОКО · РИСК АТАКИ" : phaseTitle[phase]}</span>
    </div>
  );
};

const DeviceFrame: React.FC<{
  x: number;
  y: number;
  width?: number;
  height: number;
  color: string;
  icon: string;
  label: string;
  enter: number;
  children?: React.ReactNode;
}> = ({ x, y, width = 400, height, color, icon, label, enter, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height,
      boxSizing: "border-box",
      padding: "24px 18px",
      borderRadius: 26,
      background: `${theme.panel}EC`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 38px ${color}1C`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      opacity: enter,
      transform: `translateY(${(1 - enter) * 32}px)`,
    }}
  >
    <IconGlyph name={icon} size={48} color={color} strokeWidth={1.8} />
    <div style={{ marginTop: 8, color: theme.text, fontFamily: theme.font, fontSize: 27, fontWeight: 800 }}>{label}</div>
    {children}
  </div>
);

const SecretSeal: React.FC<{ color: string; compact?: boolean }> = ({ color, compact = false }) => (
  <div
    style={{
      marginTop: compact ? 10 : 18,
      padding: compact ? "9px 15px" : "12px 18px",
      borderRadius: 16,
      border: `2px solid ${color}88`,
      background: `${color}12`,
      display: "flex",
      alignItems: "center",
      gap: 10,
    }}
  >
    <IconGlyph name="lock-keyhole" size={compact ? 24 : 30} color={color} strokeWidth={1.8} />
    <div>
      <div style={{ ...mono, fontSize: compact ? 18 : 21, color }}>K = 04AF…7E</div>
      <div style={{ ...mono, marginTop: 3, fontSize: compact ? 13 : 15, color: theme.subtext }}>ЗАПЕЧАТАН · НЕ ЛЕТИТ</div>
    </div>
  </div>
);

const CodePill: React.FC<{ code: string; label?: string; color: string; opacity?: number; scale?: number }> = ({
  code,
  label = "6 ЦИФР",
  color,
  opacity = 1,
  scale = 1,
}) => (
  <div
    style={{
      marginTop: 18,
      minWidth: 238,
      padding: "12px 22px 14px",
      borderRadius: 18,
      background: `${color}18`,
      border: `3px solid ${color}AA`,
      boxShadow: `0 0 28px ${color}30`,
      textAlign: "center",
      opacity,
      transform: `scale(${scale})`,
    }}
  >
    <div style={{ ...mono, color: theme.subtext, fontSize: 14 }}>{label}</div>
    <div style={{ marginTop: 3, color, fontFamily: theme.mono, fontWeight: 800, fontSize: 42, letterSpacing: 4 }}>{code}</div>
  </div>
);

const ClockPanel: React.FC<{
  x: number;
  y: number;
  color: string;
  title: string;
  time: string;
  windowSeconds: number;
  progress: number;
  enter: number;
  note?: string;
  width?: number;
  height?: number;
  danger?: boolean;
}> = ({ x, y, color, title, time, windowSeconds, progress, enter, note = "T = 2486", width = 390, height = 270, danger = false }) => {
  const barProgress = interpolate(smooth(progress), [0, 1], [0.08, 0.94]);
  const border = danger ? theme.danger : color;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        boxSizing: "border-box",
        padding: "20px 22px",
        borderRadius: 24,
        background: `${theme.panel}EC`,
        border: `3px solid ${border}88`,
        boxShadow: `0 0 34px ${border}1C`,
        opacity: enter,
        textAlign: "center",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 9, color: border, ...mono, fontSize: 19 }}>
        <IconGlyph name={danger ? "clock-alert" : "clock-3"} size={29} color={border} strokeWidth={1.8} />
        <span>{title}</span>
      </div>
      <div style={{ marginTop: 16, color: theme.text, fontFamily: theme.mono, fontWeight: 800, fontSize: 36, letterSpacing: 2 }}>{time}</div>
      <div style={{ marginTop: 4, color: border, ...mono, fontSize: 19 }}>ОКНО {windowSeconds} s</div>
      <div style={{ margin: "15px auto 0", width: Math.min(width - 74, 300), height: 12, borderRadius: 99, background: `${theme.panelBorder}`, overflow: "hidden" }}>
        <div style={{ width: `${barProgress * 100}%`, height: "100%", borderRadius: 99, background: border, boxShadow: `0 0 18px ${border}AA` }} />
      </div>
      <div style={{ marginTop: 10, color: danger ? theme.danger : theme.subtext, ...mono, fontSize: 16 }}>{note}</div>
    </div>
  );
};

const BottomBadge: React.FC<{ text: string; color: string; enter: number; y?: number; opacity?: number }> = ({ text, color, enter, y = 1130, opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: y,
      transform: "translateX(-50%)",
      padding: "14px 30px",
      borderRadius: 999,
      background: `${color}18`,
      border: `2px solid ${color}99`,
      color,
      ...mono,
      fontSize: 23,
      whiteSpace: "nowrap",
      opacity: enter * opacity,
      boxShadow: `0 0 32px ${color}25`,
    }}
  >
    {text}
  </div>
);

const ArrowDown: React.FC<{ x: number; y: number; color: string; opacity: number }> = ({ x, y, color, opacity }) => (
  <div style={{ position: "absolute", left: x, top: y, color, opacity }}>
    <IconGlyph name="arrow-down" size={34} color={color} strokeWidth={2} />
  </div>
);

const ResultCode: React.FC<{ x: number; y: number; color: string; opacity: number; scale?: number }> = ({ x, y, color, opacity, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: 250,
      boxSizing: "border-box",
      padding: "12px 18px",
      borderRadius: 18,
      border: `3px solid ${color}AA`,
      background: `${color}18`,
      color,
      textAlign: "center",
      opacity,
      transform: `scale(${scale})`,
      boxShadow: `0 0 28px ${color}30`,
    }}
  >
    <div style={{ ...mono, fontSize: 14, color: theme.subtext }}>РЕЗУЛЬТАТ</div>
    <div style={{ marginTop: 3, fontFamily: theme.mono, fontWeight: 800, fontSize: 38, letterSpacing: 4 }}>482 917</div>
  </div>
);

const WindowSlot: React.FC<{
  x: number;
  y: number;
  width: number;
  label: string;
  time: string;
  color: string;
  enter: number;
  active?: boolean;
  wide?: boolean;
  index: number;
}> = ({ x, y, width, label, time, color, enter, active = false, wide = false, index }) => {
  const reveal = spring({ frame: Math.max(0, index * 5), fps: 30, config: { damping: 14, mass: 0.7 } });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height: 265,
        boxSizing: "border-box",
        padding: "20px 10px",
        borderRadius: 20,
        background: active ? `${color}18` : `${theme.panel}E8`,
        border: `3px solid ${color}${active ? "CC" : "66"}`,
        opacity: enter * (0.45 + reveal * 0.55),
        textAlign: "center",
        transform: `translateY(${(1 - reveal) * 22}px)`,
        boxShadow: active ? `0 0 28px ${color}28` : undefined,
      }}
    >
      <div style={{ ...mono, color, fontSize: wide ? 22 : 25 }}>{label}</div>
      <div style={{ marginTop: 25, color: theme.text, fontFamily: theme.mono, fontWeight: 800, fontSize: wide ? 20 : 23 }}>{time}</div>
      <div style={{ marginTop: 30, color: active ? theme.success : theme.subtext, ...mono, fontSize: wide ? 15 : 17 }}>{active ? "ПРОВЕРИТЬ" : "ОКНО"}</div>
      {active ? <IconGlyph name="clock-check" size={32} color={theme.success} strokeWidth={1.8} /> : null}
    </div>
  );
};

/** Буквальный TOTP: локальный секрет + одинаковое временное окно → два HMAC-расчёта → код. */
export const TotpWindowVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "offline",
  windowSeconds = 30,
  clockOffset = 30,
  wide = false,
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const impact = local >= impactLocal;
  const after = impact ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  const timerProgress = smooth(clamp01(local / Math.max(impactLocal, 1)));

  if (phase === "offline") {
    const travelX = interpolate(after, [0, 1], [474, 608]);
    return (
      <>
        <Header phase={phase} enter={enter} />
        <DeviceFrame x={70} y={395} height={465} color={theme.accent} icon="smartphone" label="ТЕЛЕФОН" enter={enter}>
          <div style={{ marginTop: 13, color: theme.warning, ...mono, fontSize: 17 }}>САМОЛЁТ / ПОДВАЛ</div>
          <div style={{ marginTop: 12, color: theme.subtext, ...mono, fontSize: 16 }}>СЕТИ НЕТ · КОД УЖЕ ЗДЕСЬ</div>
          <CodePill code="482 917" color={theme.accent} />
        </DeviceFrame>
        <DeviceFrame x={610} y={395} height={465} color={theme.accent2} icon="globe-2" label="САЙТ" enter={enter}>
          <div style={{ marginTop: 13, color: theme.subtext, ...mono, fontSize: 17 }}>ЖДЁТ СВЯЗИ</div>
          <div style={{ marginTop: 12, color: theme.subtext, ...mono, fontSize: 16 }}>ПРИНЯТЬ КОД ПОЗЖЕ</div>
          <div style={{ marginTop: 18, color: theme.success, ...mono, fontSize: 18, opacity: enter * (0.25 + after * 0.75) }}>✓ КОД ПРИНЯТ</div>
        </DeviceFrame>
        <svg width={W} height={layout.height} viewBox={`0 0 ${W} ${layout.height}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: enter }}>
          <line x1="470" y1="750" x2="610" y2="750" stroke={after > 0.5 ? theme.success : theme.warning} strokeWidth={after > 0.5 ? 6 : 4} strokeDasharray={after > 0.5 ? undefined : "12 12"} opacity={0.9} />
        </svg>
        <div style={{ position: "absolute", left: CX, top: 785, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 9, color: after > 0.5 ? theme.success : theme.warning, ...mono, fontSize: 17, whiteSpace: "nowrap", opacity: enter }}>
          <IconGlyph name={after > 0.5 ? "wifi" : "wifi-off"} size={27} color={after > 0.5 ? theme.success : theme.warning} strokeWidth={1.8} />
          <span>{after > 0.5 ? "СВЯЗЬ ВЕРНУЛАСЬ" : "СЕТЬ НЕДОСТУПНА"}</span>
        </div>
        {impact ? <div style={{ position: "absolute", left: travelX, top: 720, transform: "translate(-50%, -50%)", padding: "8px 14px", borderRadius: 14, background: theme.success, color: "#06121A", ...mono, fontSize: 20, opacity: enter * after, boxShadow: `0 0 24px ${theme.success}AA`, whiteSpace: "nowrap" }}>482 917</div> : null}
        <BottomBadge text="СЕТЬ НУЖНА ПРИЁМУ, НЕ РАСЧЁТУ" color={theme.success} enter={enter} opacity={0.75 + after * 0.25} />
        <PulseRing x={CX} y={750} triggerFrame={impactLocal} tone="success" size={250} />
      </>
    );
  }

  if (phase === "secret") {
    return (
      <>
        <Header phase={phase} enter={enter} />
        <DeviceFrame x={70} y={395} height={390} color={theme.accent} icon="smartphone" label="ПРИЛОЖЕНИЕ" enter={enter}>
          <SecretSeal color={theme.accent} />
          <div style={{ marginTop: 14, color: theme.subtext, ...mono, fontSize: 16 }}>ХРАНИТ ЗАРАНЕЕ</div>
        </DeviceFrame>
        <DeviceFrame x={610} y={395} height={390} color={theme.accent2} icon="server" label="СЕРВЕР" enter={enter}>
          <SecretSeal color={theme.accent2} />
          <div style={{ marginTop: 14, color: theme.subtext, ...mono, fontSize: 16 }}>ХРАНИТ ЗАРАНЕЕ</div>
        </DeviceFrame>
        <svg width={W} height={layout.height} viewBox={`0 0 ${W} ${layout.height}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: enter }}>
          <line x1="468" y1="690" x2="612" y2="690" stroke={theme.subtext} strokeWidth="3" strokeDasharray="8 10" opacity="0.7" />
        </svg>
        <div style={{ position: "absolute", left: CX, top: 655, transform: "translateX(-50%)", padding: "12px 20px", borderRadius: 999, background: `${theme.panel}F2`, border: `2px solid ${theme.subtext}88`, color: theme.text, ...mono, fontSize: 19, whiteSpace: "nowrap", opacity: enter }}>K ≡ K · ОБЩИЙ СЕКРЕТ</div>
        <BottomBadge text="ОДИН K НА ОБЕИХ СТОРОНАХ" color={theme.accent} enter={enter} />
        <PulseRing x={CX} y={690} triggerFrame={impactLocal} tone="accent" size={220} />
      </>
    );
  }

  if (phase === "window") {
    const remaining = Math.max(1, Math.ceil(windowSeconds * (1 - timerProgress)));
    return (
      <>
        <Header phase={phase} enter={enter} />
        <DeviceFrame x={70} y={385} height={180} color={theme.accent} icon="smartphone" label="ТЕЛЕФОН" enter={enter} />
        <DeviceFrame x={610} y={385} height={180} color={theme.accent2} icon="server" label="СЕРВЕР" enter={enter} />
        <ClockPanel x={70} y={620} color={theme.accent} title="ЧАСЫ ПРИЛОЖЕНИЯ" time="12:40:30" windowSeconds={windowSeconds} progress={timerProgress} enter={enter} note={`T = 2486 · ещё ${remaining} s`} />
        <ClockPanel x={620} y={620} color={theme.accent2} title="ЧАСЫ СЕРВЕРА" time="12:40:30" windowSeconds={windowSeconds} progress={timerProgress} enter={enter} note={`T = 2486 · ещё ${remaining} s`} />
        <div style={{ position: "absolute", left: CX, top: 775, transform: "translate(-50%, -50%)", color: theme.success, ...mono, fontSize: 30, opacity: enter }}>T = T</div>
        <BottomBadge text={`ОДНО И ТО ЖЕ ОКНО · ${windowSeconds} s`} color={theme.success} enter={enter} />
        <PulseRing x={CX} y={760} triggerFrame={impactLocal} tone="success" size={240} />
      </>
    );
  }

  if (phase === "hmac") {
    const laneP = smooth(clamp01((local - 8) / Math.max(impactLocal, 1)));
    const resultP = after;
    return (
      <>
        <Header phase={phase} enter={enter} />
        <DeviceFrame x={70} y={385} height={190} color={theme.accent} icon="smartphone" label="ТЕЛЕФОН" enter={enter}>
          <div style={{ marginTop: 10, color: theme.accent, ...mono, fontSize: 17 }}>K + T · 12:40:30 · 30 s</div>
        </DeviceFrame>
        <DeviceFrame x={610} y={385} height={190} color={theme.accent2} icon="server" label="СЕРВЕР" enter={enter}>
          <div style={{ marginTop: 10, color: theme.accent2, ...mono, fontSize: 17 }}>K + T · 12:40:30 · 30 s</div>
        </DeviceFrame>
        <div style={{ position: "absolute", left: 150, top: 645, width: 260, padding: "12px 16px", borderRadius: 16, background: `${theme.panel}F0`, border: `2px solid ${theme.accent}66`, color: theme.text, ...mono, fontSize: 19, textAlign: "center", opacity: enter }}>K + T = 2486</div>
        <div style={{ position: "absolute", left: 690, top: 645, width: 260, padding: "12px 16px", borderRadius: 16, background: `${theme.panel}F0`, border: `2px solid ${theme.accent2}66`, color: theme.text, ...mono, fontSize: 19, textAlign: "center", opacity: enter }}>K + T = 2486</div>
        <ArrowDown x={267} y={720} color={theme.accent} opacity={enter * laneP} />
        <ArrowDown x={807} y={720} color={theme.accent2} opacity={enter * laneP} />
        <div style={{ position: "absolute", left: 165, top: 765, width: 230, padding: "12px 10px", borderRadius: 16, background: `${theme.accent}18`, border: `3px solid ${theme.accent}AA`, color: theme.accent, ...mono, fontSize: 25, textAlign: "center", opacity: enter }}>HMAC( K, T )</div>
        <div style={{ position: "absolute", left: 705, top: 765, width: 230, padding: "12px 10px", borderRadius: 16, background: `${theme.accent2}18`, border: `3px solid ${theme.accent2}AA`, color: theme.accent2, ...mono, fontSize: 25, textAlign: "center", opacity: enter }}>HMAC( K, T )</div>
        <ArrowDown x={267} y={842} color={theme.accent} opacity={enter * laneP} />
        <ArrowDown x={807} y={842} color={theme.accent2} opacity={enter * laneP} />
        <ResultCode x={145} y={900} color={theme.success} opacity={enter * resultP} scale={0.9 + resultP * 0.1} />
        <ResultCode x={685} y={900} color={theme.success} opacity={enter * resultP} scale={0.9 + resultP * 0.1} />
        <BottomBadge text="СОВПАЛИ · 6 ЦИФР" color={theme.success} enter={enter} opacity={resultP} />
        <PulseRing x={CX} y={965} triggerFrame={impactLocal} tone="success" size={240} />
      </>
    );
  }

  if (phase === "match") {
    const codeP = spring({ frame: Math.max(0, local - 10), fps, config: { damping: 12, mass: 0.7 } });
    return (
      <>
        <Header phase={phase} enter={enter} />
        <DeviceFrame x={70} y={405} height={360} color={theme.accent} icon="smartphone" label="ТЕЛЕФОН" enter={enter}>
          <CodePill code="482 917" color={theme.accent} />
          <div style={{ marginTop: 14, color: theme.subtext, ...mono, fontSize: 16 }}>КОД ИЗ ПРИЛОЖЕНИЯ</div>
        </DeviceFrame>
        <DeviceFrame x={610} y={405} height={360} color={theme.accent2} icon="globe-2" label="САЙТ" enter={enter}>
          <CodePill code="482 917" color={theme.success} />
          <div style={{ marginTop: 14, color: theme.success, ...mono, fontSize: 16 }}>КОД СОВПАЛ</div>
        </DeviceFrame>
        <div style={{ position: "absolute", left: CX, top: 735, transform: "translate(-50%, -50%)", color: theme.success, ...mono, fontSize: 58, opacity: enter * codeP }}>≡</div>
        <div style={{ position: "absolute", left: CX, top: 900, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 9, color: theme.success, ...mono, fontSize: 25, opacity: enter * codeP, whiteSpace: "nowrap" }}>
          <IconGlyph name="check-circle-2" size={32} color={theme.success} strokeWidth={1.8} />
          <span>САЙТ ПРИНЯЛ КОД</span>
        </div>
        <BottomBadge text="ПОЗЖЕ СЕТЬ ПЕРЕДАЛА КОД САЙТУ" color={theme.success} enter={enter} opacity={codeP} />
        <PulseRing x={CX} y={735} triggerFrame={impactLocal} tone="success" size={230} />
      </>
    );
  }

  if (phase === "sealed") {
    const timerP = smooth(clamp01(local / Math.max(impactLocal, 1)));
    return (
      <>
        <Header phase={phase} enter={enter} />
        <DeviceFrame x={70} y={400} height={390} color={theme.accent} icon="file-lock-2" label="ИНСТРУКЦИЯ A" enter={enter}>
          <SecretSeal color={theme.accent} />
          <div style={{ marginTop: 14, color: theme.subtext, ...mono, fontSize: 16 }}>ВНУТРИ · ОБЩИЙ K</div>
        </DeviceFrame>
        <DeviceFrame x={610} y={400} height={390} color={theme.accent2} icon="file-lock-2" label="ИНСТРУКЦИЯ B" enter={enter}>
          <SecretSeal color={theme.accent2} />
          <div style={{ marginTop: 14, color: theme.subtext, ...mono, fontSize: 16 }}>ВНУТРИ · ОБЩИЙ K</div>
        </DeviceFrame>
        <svg width={W} height={layout.height} viewBox={`0 0 ${W} ${layout.height}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: enter }}>
          <line x1="270" y1="800" x2="430" y2="900" stroke={theme.accent} strokeWidth="4" strokeDasharray="10 9" opacity={0.75} />
          <line x1="810" y1="800" x2="650" y2="900" stroke={theme.accent2} strokeWidth="4" strokeDasharray="10 9" opacity={0.75} />
        </svg>
        <div style={{ position: "absolute", left: 370, top: 875, width: 340, height: 170, boxSizing: "border-box", borderRadius: 22, background: `${theme.success}14`, border: `3px solid ${theme.success}99`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, opacity: enter * (0.65 + timerP * 0.35), boxShadow: `0 0 34px ${theme.success}22` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: theme.success, ...mono, fontSize: 20 }}><IconGlyph name="clock-3" size={30} color={theme.success} strokeWidth={1.8} /><span>ОДИНАКОВЫЙ ТАЙМЕР</span></div>
          <div style={{ color: theme.text, fontFamily: theme.mono, fontWeight: 800, fontSize: 32 }}>12:40:30</div>
          <div style={{ color: theme.success, ...mono, fontSize: 19 }}>ОКНО {windowSeconds} s</div>
        </div>
        <BottomBadge text="СЕКРЕТ ВНУТРИ · ТАЙМЕР СНАРУЖИ" color={theme.success} enter={enter} />
        <PulseRing x={CX} y={960} triggerFrame={impactLocal} tone="success" size={220} />
      </>
    );
  }

  if (phase === "sealed-result") {
    const resultP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
    return (
      <>
        <Header phase={phase} enter={enter} />
        <DeviceFrame x={70} y={390} height={270} color={theme.accent} icon="file-lock-2" label="ИНСТРУКЦИЯ A" enter={enter}>
          <div style={{ marginTop: 12, color: theme.accent, ...mono, fontSize: 18 }}>K + ВРЕМЯ · ЗДЕСЬ</div>
        </DeviceFrame>
        <DeviceFrame x={610} y={390} height={270} color={theme.accent2} icon="file-lock-2" label="ИНСТРУКЦИЯ B" enter={enter}>
          <div style={{ marginTop: 12, color: theme.accent2, ...mono, fontSize: 18 }}>K + ВРЕМЯ · ЗДЕСЬ</div>
        </DeviceFrame>
        <ArrowDown x={267} y={680} color={theme.accent} opacity={enter} />
        <ArrowDown x={807} y={680} color={theme.accent2} opacity={enter} />
        <ResultCode x={145} y={750} color={theme.success} opacity={enter * resultP} scale={0.9 + resultP * 0.1} />
        <ResultCode x={685} y={750} color={theme.success} opacity={enter * resultP} scale={0.9 + resultP * 0.1} />
        <div style={{ position: "absolute", left: CX, top: 910, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, color: theme.subtext, ...mono, fontSize: 20, opacity: enter }}>
          <IconGlyph name="lock" size={28} color={theme.subtext} strokeWidth={1.8} />
          <span>СОДЕРЖИМОЕ НЕ ПЕРЕСЫЛАЕТСЯ</span>
        </div>
        <BottomBadge text="КАЖДАЯ СЧИТАЕТ КОД НА МЕСТЕ" color={theme.success} enter={enter} opacity={resultP} />
        <PulseRing x={CX} y={810} triggerFrame={impactLocal} tone="success" size={230} />
      </>
    );
  }

  if (phase === "tolerance") {
    const count = wide ? 5 : 3;
    const slotWidth = wide ? 160 : 220;
    const gap = wide ? 12 : 28;
    const total = count * slotWidth + (count - 1) * gap;
    const startX = (W - total) / 2;
    return (
      <>
        <Header phase={phase} enter={enter} wide={wide} />
        <div style={{ position: "absolute", left: CX, top: 385, transform: "translateX(-50%)", color: wide ? theme.warning : theme.subtext, ...mono, fontSize: 19, whiteSpace: "nowrap", opacity: enter }}>{wide ? "БОЛЬШЕ ДОПУСК · БОЛЬШЕ ПОПЫТОК" : "ЗАДЕРЖКА МОЖЕТ ПОПАСТЬ В СОСЕДНИЙ СЛОТ"}</div>
        {Array.from({ length: count }).map((_, i) => {
          const middle = Math.floor(count / 2);
          const delta = i - middle;
          const slotColor = wide && Math.abs(delta) >= 2 ? theme.danger : i === middle ? theme.success : theme.accent2;
          const time = `12:${40 + delta < 10 ? "0" : ""}${40 + delta}:30`;
          return <WindowSlot key={i} x={startX + i * (slotWidth + gap)} y={465} width={slotWidth} label={delta === 0 ? "T · ТЕКУЩЕЕ" : `T ${delta > 0 ? "+" : "−"}${Math.abs(delta)}`} time={time} color={slotColor} enter={enter} active={i === middle} wide={wide} index={i} />;
        })}
        <div style={{ position: "absolute", left: CX, top: 825, transform: "translateX(-50%)", padding: "14px 25px", borderRadius: 18, background: wide ? `${theme.danger}18` : `${theme.success}18`, border: `3px solid ${wide ? theme.danger : theme.success}99`, color: wide ? theme.danger : theme.success, ...mono, fontSize: 23, whiteSpace: "nowrap", opacity: enter }}>
          {wide ? "АТАКЕ ПРОЩЕ УГАДАТЬ" : "СЕРВЕР ПРОВЕРЯЕТ СОСЕДНЕЕ ОКНО"}
        </div>
        <BottomBadge text={wide ? "ДОПУСК ±2 · РИСК РАСТЁТ" : "ДОПУСК ±1 · ПОМОГАЕТ ЗАДЕРЖКА"} color={wide ? theme.danger : theme.success} enter={enter} />
        <PulseRing x={CX} y={825} triggerFrame={impactLocal} tone={wide ? "danger" : "success"} size={230} />
      </>
    );
  }

  if (phase === "skew") {
    const offset = Math.max(1, Math.round(Math.abs(clockOffset)));
    return (
      <>
        <Header phase={phase} enter={enter} />
        <ClockPanel x={70} y={420} color={theme.accent} title="ЧАСЫ ТЕЛЕФОНА" time="12:40:30" windowSeconds={windowSeconds} progress={0.62} enter={enter} note={`СБИЛИСЬ · +${offset} s`} danger />
        <ClockPanel x={620} y={420} color={theme.accent2} title="ЧАСЫ СЕРВЕРА" time="12:40:00" windowSeconds={windowSeconds} progress={0.34} enter={enter} note="ЭТАЛОННОЕ ВРЕМЯ" />
        <div style={{ position: "absolute", left: CX, top: 790, transform: "translate(-50%, -50%)", color: theme.danger, ...mono, fontSize: 66, opacity: enter }}>≠</div>
        <div style={{ position: "absolute", left: CX, top: 900, transform: "translateX(-50%)", color: theme.danger, ...mono, fontSize: 23, whiteSpace: "nowrap", opacity: enter }}>ОКНА ВЫБРАНЫ НЕ ОДНОВРЕМЕННО</div>
        <BottomBadge text="СИНХРОНИЗАЦИЯ ЧАСОВ КРИТИЧНА" color={theme.danger} enter={enter} />
        <PulseRing x={CX} y={790} triggerFrame={impactLocal} tone="danger" size={240} />
      </>
    );
  }

  // mismatch
  const mismatchP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  return (
    <>
      <Header phase="mismatch" enter={enter} />
      <DeviceFrame x={70} y={415} height={410} color={theme.accent} icon="smartphone" label="ТЕЛЕФОН · T−1" enter={enter}>
        <CodePill code="482 917" color={theme.danger} opacity={mismatchP} />
        <div style={{ marginTop: 15, color: theme.danger, ...mono, fontSize: 17 }}>ЧИСЛО A</div>
      </DeviceFrame>
      <DeviceFrame x={610} y={415} height={410} color={theme.accent2} icon="server" label="СЕРВЕР · T" enter={enter}>
        <CodePill code="105 638" color={theme.danger} opacity={mismatchP} />
        <div style={{ marginTop: 15, color: theme.danger, ...mono, fontSize: 17 }}>ЧИСЛО B</div>
      </DeviceFrame>
      <div style={{ position: "absolute", left: CX, top: 730, transform: "translate(-50%, -50%)", color: theme.danger, ...mono, fontSize: 66, opacity: enter * mismatchP }}>≠</div>
      <BottomBadge text="РАЗНЫЕ ОКНА → РАЗНЫЕ ЧИСЛА" color={theme.danger} enter={enter} opacity={mismatchP} />
      <PulseRing x={CX} y={730} triggerFrame={impactLocal} tone="danger" size={250} />
    </>
  );
};

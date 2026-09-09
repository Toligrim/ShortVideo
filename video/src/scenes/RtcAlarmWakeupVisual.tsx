import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type RtcAlarmWakeupPhase =
  | "symptom"
  | "offline"
  | "save"
  | "analogy"
  | "rtc"
  | "sleep"
  | "no-poll"
  | "alarm"
  | "wakeup"
  | "ring";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: RtcAlarmWakeupPhase;
};

const W = layout.width;
const H = layout.safeBottom;
const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.2,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const phaseTitle: Record<RtcAlarmWakeupPhase, string> = {
  symptom: "СИМПТОМ · АВИАРЕЖИМ",
  offline: "СЕТЬ ОТКЛЮЧЕНА · ВРЕМЯ ВНУТРИ",
  save: "ALARM · ТОЧКА СОХРАНЕНА",
  analogy: "АНАЛОГИЯ · КУХОННЫЙ ТАЙМЕР",
  rtc: "RTC · ЧАСЫ РЕАЛЬНОГО ВРЕМЕНИ",
  sleep: "CPU · СПИТ / RTC · ТИКАЕТ",
  "no-poll": "ВАУ · БЕЗ ПРОВЕРКИ КАЖДУЮ СЕКУНДУ",
  alarm: "HARDWARE ALARM · ДОШЁЛ ДО ТОЧКИ",
  wakeup: "WAKEUP · ИМПУЛЬС К CPU",
  ring: "ЗВОНОК · ЗВУК ВКЛЮЧЁН",
};

const phaseColor: Record<RtcAlarmWakeupPhase, string> = {
  symptom: theme.accent,
  offline: theme.danger,
  save: theme.warning,
  analogy: theme.warning,
  rtc: theme.accent,
  sleep: theme.accent2,
  "no-poll": theme.warning,
  alarm: theme.warning,
  wakeup: theme.success,
  ring: theme.success,
};

const phaseIcon: Record<RtcAlarmWakeupPhase, string> = {
  symptom: "smartphone",
  offline: "wifi-off",
  save: "alarm-clock",
  analogy: "timer",
  rtc: "clock-3",
  sleep: "moon",
  "no-poll": "circle-off",
  alarm: "timer",
  wakeup: "zap",
  ring: "volume-2",
};

const Header: React.FC<{ phase: RtcAlarmWakeupPhase; opacity: number }> = ({ phase, opacity }) => {
  const color = phaseColor[phase];
  return (
    <div
      style={{
        position: "absolute",
        left: 28,
        right: 28,
        top: 262,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color,
        opacity,
        whiteSpace: "nowrap",
        fontSize: 21,
        ...mono,
      }}
    >
      <IconGlyph name={phaseIcon[phase]} size={29} color={color} strokeWidth={1.8} />
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
  opacity: number;
  children?: React.ReactNode;
}> = ({ x, y, width, height, color, opacity, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 28,
      background: `${theme.panel}ED`,
      border: `3px solid ${color}77`,
      boxShadow: `0 0 44px ${color}20`,
      opacity,
      transform: `translateY(${(1 - opacity) * 28}px)`,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const Badge: React.FC<{ text: string; color: string; opacity: number; scale?: number }> = ({
  text,
  color,
  opacity,
  scale = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left: 70,
      top: 1190,
      width: 940,
      minHeight: 72,
      boxSizing: "border-box",
      padding: "15px 24px",
      borderRadius: 999,
      background: `${color}18`,
      border: `3px solid ${color}99`,
      color,
      textAlign: "center",
      whiteSpace: "nowrap",
      opacity,
      transform: `scale(${0.96 + 0.04 * scale})`,
      boxShadow: `0 0 34px ${color}28`,
      fontSize: 22,
      ...mono,
    }}
  >
    {text}
  </div>
);

const IconSlash: React.FC<{
  x: number;
  y: number;
  name: string;
  color: string;
  opacity: number;
  size?: number;
}> = ({ x, y, name, color, opacity, size = 48 }) => (
  <div style={{ position: "absolute", left: x, top: y, width: size, height: size, opacity }}>
    <IconGlyph name={name} size={size} color={color} strokeWidth={1.8} />
    <div
      style={{
        position: "absolute",
        left: -8,
        top: size / 2 - 2,
        width: size + 16,
        height: 4,
        borderRadius: 4,
        background: color,
        transform: "rotate(-38deg)",
        boxShadow: `0 0 14px ${color}99`,
      }}
    />
  </div>
);

const Phone: React.FC<{
  x: number;
  y: number;
  opacity: number;
  color?: string;
  time?: string;
  compact?: boolean;
  networkOff?: boolean;
}> = ({ x, y, opacity, color = theme.accent, time = "07:00", compact = false, networkOff = true }) => {
  const width = compact ? 250 : 290;
  const height = compact ? 470 : 530;
  const screenWidth = width - 42;
  const screenHeight = height - 112;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        opacity,
        transform: `translateY(${(1 - opacity) * 30}px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 36,
          background: `${theme.panel}F8`,
          border: `5px solid ${color}AA`,
          boxShadow: `0 0 42px ${color}28`,
          boxSizing: "border-box",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 21,
          top: 26,
          width: screenWidth,
          height: screenHeight,
          borderRadius: 24,
          background: `${theme.bg}F4`,
          border: `2px solid ${color}55`,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", left: 20, right: 20, top: 18, display: "flex", justifyContent: "space-between", color: theme.subtext, fontSize: 14, ...mono }}>
          <span>{time}</span>
          <span style={{ color: networkOff ? theme.danger : theme.success }}>{networkOff ? "ОФЛАЙН" : "СЕТЬ"}</span>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 82, textAlign: "center", color, ...mono, fontSize: compact ? 16 : 18 }}>
          {networkOff ? "АВИАРЕЖИМ" : "ЛОКАЛЬНО"}
        </div>
        <div style={{ position: "absolute", left: "50%", top: 108, transform: "translateX(-50%)" }}>
          <IconGlyph name="plane" size={compact ? 36 : 42} color={color} strokeWidth={1.5} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 152, textAlign: "center", color: theme.text, fontFamily: theme.mono, fontSize: compact ? 46 : 56, fontWeight: 800, letterSpacing: 2 }}>
          {time}
        </div>
        <div style={{ position: "absolute", left: 20, right: 20, top: 244, height: 2, background: `${color}55` }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 272, textAlign: "center", color: theme.warning, ...mono, fontSize: compact ? 15 : 17 }}>
          ALARM · 07:00
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 28, textAlign: "center", color: networkOff ? theme.danger : theme.subtext, ...mono, fontSize: 14 }}>
          {networkOff ? "СЕТЬ = 0" : "СЕТЬ = ON"}
        </div>
      </div>
      <div style={{ position: "absolute", left: "50%", top: 12, width: compact ? 62 : 72, height: 8, transform: "translateX(-50%)", borderRadius: 10, background: `${theme.subtext}99` }} />
      {networkOff ? <IconSlash x={width - 63} y={58} name="wifi-off" color={theme.danger} opacity={opacity} size={compact ? 34 : 40} /> : null}
    </div>
  );
};

const SpeakerWaves: React.FC<{ x: number; y: number; color: string; opacity: number; progress: number }> = ({
  x,
  y,
  color,
  opacity,
  progress,
}) => {
  const p = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(progress * 7));
  return (
    <svg width={230} height={220} viewBox="0 0 230 220" style={{ position: "absolute", left: x, top: y, overflow: "visible", opacity }}>
      <path d="M 16 92 L 48 92 L 82 62 L 82 158 L 48 128 L 16 128 Z" fill={`${color}18`} stroke={color} strokeWidth="4" strokeLinejoin="round" />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M ${105 + i * 25} ${76 - i * 14} Q ${142 + i * 28} 110 ${105 + i * 25} ${144 + i * 14}`}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.25 + p * (0.2 + i * 0.18)}
        />
      ))}
    </svg>
  );
};

const TimeString = (progress: number) => {
  const step = Math.min(3, Math.floor(clamp01(progress) * 4));
  return step === 3 ? "07:00:00" : `06:59:${String(57 + step).padStart(2, "0")}`;
};

const CounterCard: React.FC<{
  x: number;
  y: number;
  width?: number;
  height?: number;
  color: string;
  opacity: number;
  progress: number;
  title?: string;
  note?: string;
  marker?: number;
  fixedTime?: string;
  highlight?: boolean;
}> = ({
  x,
  y,
  width = 560,
  height = 580,
  color,
  opacity,
  progress,
  title = "RTC · HARDWARE COUNTER",
  note = "ОТДЕЛЬНЫЕ ЧАСЫ · +1 s",
  marker = 0.78,
  fixedTime,
  highlight = false,
}) => {
  const railWidth = width - 72;
  const pointer = interpolate(smooth(progress), [0, 1], [0.05, 0.94]);
  const reached = progress >= marker;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        boxSizing: "border-box",
        padding: "25px 28px",
        borderRadius: 28,
        background: `${theme.panel}F2`,
        border: `3px solid ${(highlight || reached) ? theme.warning : color}88`,
        boxShadow: `0 0 42px ${(highlight || reached) ? theme.warning : color}22`,
        opacity,
        transform: `translateY(${(1 - opacity) * 28}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color, ...mono, fontSize: 20, whiteSpace: "nowrap" }}>
        <IconGlyph name="clock-3" size={30} color={color} strokeWidth={1.8} />
        <span>{title}</span>
      </div>
      <div style={{ marginTop: 52, color: theme.text, textAlign: "center", fontFamily: theme.mono, fontWeight: 800, fontSize: width > 500 ? 64 : 54, letterSpacing: 3, textShadow: `0 0 32px ${color}44` }}>
        {fixedTime ?? TimeString(progress)}
      </div>
      <div style={{ marginTop: 12, color: theme.subtext, textAlign: "center", ...mono, fontSize: 17 }}>ВРЕМЯ ОТ ЭПОХИ · НЕ ИНТЕРНЕТ</div>
      <div style={{ position: "relative", marginTop: 48, width: railWidth, height: 12, borderRadius: 99, background: theme.panelBorder }}>
        <div style={{ width: `${pointer * 100}%`, height: "100%", borderRadius: 99, background: reached ? theme.warning : color, boxShadow: `0 0 18px ${reached ? theme.warning : color}99` }} />
        <div style={{ position: "absolute", left: `${marker * 100}%`, top: -22, bottom: -22, width: 4, background: reached ? theme.warning : theme.text, boxShadow: `0 0 14px ${reached ? theme.warning : theme.text}AA` }} />
        <div style={{ position: "absolute", left: `${pointer * 100}%`, top: "50%", width: 22, height: 22, borderRadius: "50%", transform: "translate(-50%, -50%)", background: reached ? theme.warning : color, boxShadow: `0 0 20px ${reached ? theme.warning : color}` }} />
      </div>
      <div style={{ position: "relative", marginTop: 15, width: railWidth, height: 25, color: theme.subtext, ...mono, fontSize: 15 }}>
        <span style={{ position: "absolute", left: 0 }}>06:59:57</span>
        <span style={{ position: "absolute", left: `${marker * 100}%`, transform: "translateX(-50%)", color: reached ? theme.warning : theme.text }}>ALARM · 07:00</span>
        <span style={{ position: "absolute", right: 0 }}>07:00:01</span>
      </div>
      <div style={{ position: "absolute", left: 28, right: 28, bottom: 29, padding: "13px 14px", borderRadius: 16, background: `${color}12`, border: `2px solid ${color}55`, color: highlight || reached ? theme.warning : color, textAlign: "center", ...mono, fontSize: 18 }}>
        {note}
      </div>
    </div>
  );
};

const CpuCard: React.FC<{
  x: number;
  y: number;
  width?: number;
  height?: number;
  opacity: number;
  active: boolean;
  status: string;
  note: string;
  color?: string;
}> = ({ x, y, width = 320, height = 360, opacity, active, status, note, color = theme.accent2 }) => {
  const stateColor = active ? theme.success : color;
  const breathe = 1 + (active ? 0.018 : 0.008) * Math.sin(y / 40 + opacity * 5);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        boxSizing: "border-box",
        borderRadius: 28,
        background: `${theme.panel}F2`,
        border: `3px solid ${stateColor}88`,
        boxShadow: `0 0 42px ${stateColor}20`,
        opacity,
        transform: `translateY(${(1 - opacity) * 28}px) scale(${breathe})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <IconGlyph name={active ? "cpu" : "moon"} size={66} color={stateColor} strokeWidth={1.6} />
      <div style={{ color: theme.text, ...mono, fontSize: 31 }}>CPU</div>
      <div style={{ color: stateColor, ...mono, fontSize: 20 }}>{status}</div>
      <div style={{ color: theme.subtext, ...mono, fontSize: 15, textAlign: "center" }}>{note}</div>
    </div>
  );
};

const NetworkSource: React.FC<{
  x: number;
  y: number;
  icon: string;
  label: string;
  opacity: number;
}> = ({ x, y, icon, label, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: 270,
      height: 175,
      borderRadius: 22,
      background: `${theme.danger}0D`,
      border: `3px solid ${theme.danger}66`,
      opacity,
      transform: `translateY(${(1 - opacity) * 26}px)`,
      textAlign: "center",
      paddingTop: 24,
      boxSizing: "border-box",
    }}
  >
    <IconSlash x={108} y={17} name={icon} color={theme.danger} opacity={opacity} size={48} />
    <div style={{ marginTop: 61, color: theme.text, ...mono, fontSize: 21 }}>{label}</div>
    <div style={{ marginTop: 10, color: theme.danger, ...mono, fontSize: 15 }}>НЕ СПРАШИВАЕМ</div>
  </div>
);

const AlarmRegister: React.FC<{
  x: number;
  y: number;
  width?: number;
  height?: number;
  opacity: number;
  active?: boolean;
  color?: string;
}> = ({ x, y, width = 430, height = 430, opacity, active = false, color = theme.warning }) => (
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
      border: `3px solid ${active ? theme.success : color}88`,
      boxShadow: `0 0 44px ${active ? theme.success : color}22`,
      opacity,
      transform: `translateY(${(1 - opacity) * 28}px) scale(${active ? 1.01 : 1})`,
      textAlign: "center",
      padding: "26px 24px",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: active ? theme.success : color, ...mono, fontSize: 20 }}>
      <IconGlyph name={active ? "zap" : "alarm-clock"} size={30} color={active ? theme.success : color} strokeWidth={1.8} />
      <span>ALARM REGISTER</span>
    </div>
    <div style={{ marginTop: 52, color: theme.text, fontFamily: theme.mono, fontWeight: 800, fontSize: 58, letterSpacing: 3 }}>07:00:00</div>
    <div style={{ marginTop: 13, color: active ? theme.success : color, ...mono, fontSize: 19 }}>{active ? "EVENT · СРАБОТАЛ" : "СОХРАНЁННАЯ ТОЧКА"}</div>
    <div style={{ margin: "34px auto 0", width: 285, height: 2, background: `${color}55` }} />
    <div style={{ marginTop: 25, display: "flex", justifyContent: "center", alignItems: "center", gap: 9, color: theme.subtext, ...mono, fontSize: 16 }}>
      <IconGlyph name="lock-keyhole" size={25} color={color} strokeWidth={1.8} />
      <span>ВНУТРИ ТЕЛЕФОНА</span>
    </div>
    <div style={{ marginTop: 15, color: theme.subtext, ...mono, fontSize: 15 }}>ONE-SHOT · WAKEUP</div>
  </div>
);

const SymptomPhase: React.FC<{ local: number; enter: number; impactLocal: number }> = ({ local, enter, impactLocal }) => {
  const ring = local / 8;
  return (
    <>
      <Panel x={70} y={390} width={420} height={650} color={theme.accent} opacity={enter} />
      <Phone x={135} y={445} opacity={enter} color={theme.accent} />
      <Panel x={555} y={450} width={455} height={400} color={theme.warning} opacity={enter} />
      <div style={{ position: "absolute", left: 555, top: 485, width: 455, textAlign: "center", color: theme.warning, ...mono, fontSize: 22, opacity: enter }}>УТРОМ</div>
      <div style={{ position: "absolute", left: 555, top: 560, width: 455, textAlign: "center", color: theme.text, fontFamily: theme.mono, fontWeight: 800, fontSize: 74, letterSpacing: 4, opacity: enter }}>07:00</div>
      <SpeakerWaves x={690} y={625} color={theme.success} opacity={enter} progress={ring} />
      <div style={{ position: "absolute", left: 555, top: 785, width: 455, textAlign: "center", color: theme.success, ...mono, fontSize: 20, opacity: enter }}>БУДИЛЬНИК ЗВОНИТ</div>
      <div style={{ position: "absolute", left: 70, right: 70, top: 930, textAlign: "center", color: theme.text, ...mono, fontSize: 24, opacity: enter }}>КАК ТЕЛЕФОН ЗНАЕТ?</div>
      <Badge text="СЕТИ НЕТ · БУДИЛЬНИК ЗВОНИТ" color={theme.success} opacity={enter} scale={local >= impactLocal ? 1 : 0.96} />
      <PulseRing x={812} y={640} triggerFrame={impactLocal} tone="success" size={200} />
    </>
  );
};

const OfflinePhase: React.FC<{ enter: number; impactLocal: number }> = ({ enter, impactLocal }) => (
  <>
    <Panel x={70} y={390} width={940} height={650} color={theme.danger} opacity={enter} />
    <Phone x={112} y={455} compact opacity={enter} color={theme.danger} />
    <div style={{ position: "absolute", left: 425, top: 522, width: 110, height: 4, background: `${theme.danger}55`, opacity: enter }} />
    <div style={{ position: "absolute", left: 465, top: 506, color: theme.danger, ...mono, fontSize: 15, opacity: enter }}>НЕТ ЗАПРОСА</div>
    <NetworkSource x={560} y={455} icon="radio-tower" label="МОБИЛЬНАЯ ВЫШКА" opacity={enter} />
    <NetworkSource x={560} y={690} icon="cloud" label="ИНТЕРНЕТ" opacity={enter} />
    <div style={{ position: "absolute", left: 390, top: 580, width: 180, textAlign: "center", color: theme.warning, ...mono, fontSize: 18, opacity: enter }}>ALARM ОСТАЛСЯ</div>
    <div style={{ position: "absolute", left: 390, top: 650, width: 180, textAlign: "center", color: theme.subtext, ...mono, fontSize: 14, opacity: enter }}>ВРЕМЯ НЕ СКАЧИВАЕТСЯ</div>
    <Badge text="ВЫШКА И ИНТЕРНЕТ НЕ НУЖНЫ" color={theme.danger} opacity={enter} />
    <PulseRing x={700} y={540} triggerFrame={impactLocal} tone="danger" size={170} />
  </>
);

const SavePhase: React.FC<{ local: number; enter: number; fps: number; impactLocal: number }> = ({ local, enter, fps, impactLocal }) => {
  const pop = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 13, mass: 0.7 } });
  return (
    <>
      <Panel x={70} y={400} width={360} height={610} color={theme.accent} opacity={enter} />
      <Phone x={125} y={470} compact opacity={enter} color={theme.accent} />
      <div style={{ position: "absolute", left: 435, top: 650, width: 96, height: 4, background: theme.warning, opacity: enter }} />
      <div style={{ position: "absolute", left: 452, top: 620, color: theme.warning, ...mono, fontSize: 16, opacity: enter }}>SET</div>
      <AlarmRegister x={530} y={430} width={480} height={470} opacity={enter} />
      <Badge text="ALARM = 07:00:00 · СОХРАНЁН ВНУТРИ" color={theme.warning} opacity={enter} scale={0.96 + pop * 0.04} />
      <PulseRing x={770} y={645} triggerFrame={impactLocal} tone="warning" size={220} />
    </>
  );
};

const AnalogyPhase: React.FC<{ local: number; enter: number; impactLocal: number }> = ({ local, enter, impactLocal }) => {
  const tick = 0.5 + 0.5 * Math.sin(local / 5);
  return (
    <>
      <Panel x={70} y={420} width={420} height={560} color={theme.warning} opacity={enter} />
      <div style={{ position: "absolute", left: 70, right: 590, top: 455, textAlign: "center", color: theme.warning, ...mono, fontSize: 21, opacity: enter }}>КУХОННЫЙ ТАЙМЕР</div>
      <div style={{ position: "absolute", left: 170, top: 540, width: 220, height: 220, borderRadius: "50%", border: `6px solid ${theme.warning}AA`, background: `${theme.warning}10`, opacity: enter, boxShadow: `0 0 34px ${theme.warning}20` }}>
        <div style={{ position: "absolute", left: 102, top: 24, width: 4, height: 82, transformOrigin: "50% 86px", transform: `rotate(${local * 3}deg)`, background: theme.warning, borderRadius: 4 }} />
        <div style={{ position: "absolute", left: 97, top: 97, width: 14, height: 14, borderRadius: "50%", background: theme.warning, boxShadow: `0 0 ${12 + tick * 10}px ${theme.warning}` }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 120, textAlign: "center", color: theme.text, fontFamily: theme.mono, fontWeight: 800, fontSize: 28 }}>07:00</div>
      </div>
      <div style={{ position: "absolute", left: 70, right: 590, top: 825, textAlign: "center", color: theme.subtext, ...mono, fontSize: 17, opacity: enter }}>ТИКАЕТ САМ · СЕТЬ НЕ НУЖНА</div>
      <div style={{ position: "absolute", left: 480, top: 650, width: 80, height: 4, background: theme.warning, opacity: enter }} />
      <div style={{ position: "absolute", left: 500, top: 620, color: theme.warning, ...mono, fontSize: 15, opacity: enter }}>ВНУТРИ</div>
      <AlarmRegister x={590} y={445} width={420} height={455} opacity={enter} />
      <Badge text="RTC — КУХОННЫЙ ТАЙМЕР ВНУТРИ ТЕЛЕФОНА" color={theme.warning} opacity={enter} />
      <PulseRing x={800} y={650} triggerFrame={impactLocal} tone="warning" size={210} />
    </>
  );
};

const SplitClockPhase: React.FC<{
  enter: number;
  local: number;
  color: string;
  badge: string;
  note: string;
  cpuStatus: string;
  cpuNote: string;
  noPoll?: boolean;
}> = ({ enter, local, color, badge, note, cpuStatus, cpuNote, noPoll = false }) => {
  const progress = smooth(clamp01((local - 8) / 84));
  return (
    <>
      <CounterCard x={70} y={400} color={color} opacity={enter} progress={progress} note={note} highlight={noPoll} />
      <CpuCard x={690} y={500} opacity={enter} active={false} status={cpuStatus} note={cpuNote} color={theme.accent2} />
      <div style={{ position: "absolute", left: 630, top: 645, width: 56, height: 3, background: `${color}66`, opacity: enter }} />
      <div style={{ position: "absolute", left: 640, top: 618, color: color, ...mono, fontSize: 15, opacity: enter }}>{noPoll ? "NO POLL" : "ОТДЕЛЬНО"}</div>
      <Badge text={badge} color={color} opacity={enter} />
    </>
  );
};

const AlarmPhase: React.FC<{ local: number; enter: number; fps: number; impactLocal: number }> = ({ local, enter, fps, impactLocal }) => {
  const progress = smooth(clamp01((local - 8) / Math.max(impactLocal - 8, 1)));
  const active = local >= impactLocal;
  const pop = active ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  return (
    <>
      <CounterCard x={70} y={410} width={560} height={520} color={theme.warning} opacity={enter} progress={active ? 0.8 : progress * 0.8} note={active ? "ТОЧКА ДОСТИГНУТА · EVENT" : "СЧЁТЧИК ИДЁТ К ТОЧКЕ"} highlight={active} />
      <AlarmRegister x={680} y={450} width={330} height={410} opacity={enter} active={active} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: enter }}>
        <line x1="590" y1="670" x2="680" y2="670" stroke={theme.warning} strokeWidth="4" strokeDasharray="11 9" />
        <circle cx={590 + 90 * (active ? 1 : progress)} cy="670" r={10 + pop * 4} fill={theme.warning} opacity={0.55 + pop * 0.45} />
        <text x="635" y="640" textAnchor="middle" fontFamily={theme.mono} fontSize="17" fontWeight="800" fill={theme.warning}>ALARM EVENT</text>
      </svg>
      <Badge text={active ? "COUNTER REACHED · ALARM EVENT" : "RTC → СОХРАНЁННАЯ ТОЧКА"} color={theme.warning} opacity={enter} scale={0.96 + pop * 0.04} />
      <PulseRing x={760} y={650} triggerFrame={impactLocal} tone="warning" size={210} />
    </>
  );
};

const AlarmBox: React.FC<{ x: number; y: number; opacity: number }> = ({ x, y, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: 300,
      height: 300,
      borderRadius: 26,
      boxSizing: "border-box",
      background: `${theme.panel}F2`,
      border: `3px solid ${theme.warning}88`,
      boxShadow: `0 0 40px ${theme.warning}20`,
      opacity,
      padding: "28px 20px",
      textAlign: "center",
    }}
  >
    <IconGlyph name="timer" size={62} color={theme.warning} strokeWidth={1.6} />
    <div style={{ marginTop: 14, color: theme.text, ...mono, fontSize: 21 }}>HARDWARE ALARM</div>
    <div style={{ marginTop: 18, color: theme.warning, ...mono, fontSize: 17 }}>ONE-SHOT TIMER</div>
  </div>
);

const WakeupPhase: React.FC<{ local: number; enter: number; fps: number; impactLocal: number }> = ({ local, enter, fps, impactLocal }) => {
  const wake = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const signal = clamp01((local - impactLocal) / 36);
  const active = wake > 0.35;
  return (
    <>
      <AlarmBox x={70} y={485} opacity={enter} />
      <CpuCard x={745} y={445} width={290} height={380} opacity={enter} active={active} status={active ? "RUNNING" : "SLEEP"} note={active ? "ОСНОВНОЙ ПРОЦЕССОР" : "ЖДЁТ ИМПУЛЬС"} color={theme.accent2} />
      <IconSlash x={50} y={430} name="wifi-off" color={theme.danger} opacity={enter} size={38} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: enter }}>
        <line x1="370" y1="635" x2="745" y2="635" stroke={theme.success} strokeWidth="5" strokeDasharray="14 10" strokeLinecap="round" />
        <circle cx={370 + 375 * signal} cy="635" r={11 + wake * 6} fill={theme.success} opacity={0.35 + wake * 0.65} />
        <path d="M 470 600 L 492 635 L 470 670 M 535 600 L 557 635 L 535 670" fill="none" stroke={theme.success} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity={0.35 + wake * 0.65} />
        <text x="555" y="565" textAnchor="middle" fontFamily={theme.mono} fontSize="19" fontWeight="800" fill={theme.success}>WAKEUP SIGNAL</text>
      </svg>
      <Badge text={active ? "ИМПУЛЬС ПРИШЁЛ · CPU ПРОСНУЛСЯ" : "ALARM → ИМПУЛЬС → CPU"} color={theme.success} opacity={enter} scale={0.96 + wake * 0.04} />
      <PulseRing x={885} y={635} triggerFrame={impactLocal} tone="success" size={240} />
    </>
  );
};

const RingPhase: React.FC<{ local: number; enter: number; impactLocal: number }> = ({ local, enter, impactLocal }) => {
  const active = local >= impactLocal;
  return (
    <>
      <Panel x={70} y={400} width={430} height={630} color={theme.success} opacity={enter} />
      <Phone x={135} y={465} opacity={enter} color={theme.success} />
      <CpuCard x={625} y={470} width={360} height={360} opacity={enter} active={true} status="RUNNING" note="СПИКЕР ВКЛЮЧЁН" color={theme.success} />
      <IconSlash x={595} y={420} name="wifi-off" color={theme.danger} opacity={enter} size={42} />
      <div style={{ position: "absolute", left: 625, top: 895, width: 360, textAlign: "center", color: theme.success, ...mono, fontSize: 24, opacity: enter }}>ALARM SOUND · ON</div>
      <Badge text="ЗВУК ВКЛЮЧИЛСЯ БЕЗ СЕТИ" color={theme.success} opacity={enter} scale={active ? 1 : 0.96} />
      <PulseRing x={810} y={650} triggerFrame={impactLocal} tone="success" size={230} />
    </>
  );
};

export const RtcAlarmWakeupVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "symptom" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  return (
    <>
      <Header phase={phase} opacity={enter} />
      {phase === "symptom" ? <SymptomPhase local={local} enter={enter} impactLocal={impactLocal} /> : null}
      {phase === "offline" ? <OfflinePhase enter={enter} impactLocal={impactLocal} /> : null}
      {phase === "save" ? <SavePhase local={local} enter={enter} fps={fps} impactLocal={impactLocal} /> : null}
      {phase === "analogy" ? <AnalogyPhase local={local} enter={enter} impactLocal={impactLocal} /> : null}
      {phase === "rtc" ? (
        <SplitClockPhase
          enter={enter}
          local={local}
          color={theme.accent}
          badge="RTC ТИКАЕТ ОТДЕЛЬНО ОТ CPU"
          note="HARDWARE COUNTER · ТИК ИДЁТ"
          cpuStatus="SLEEP"
          cpuNote="ОСНОВНОЙ ПРОЦЕССОР СПИТ"
        />
      ) : null}
      {phase === "sleep" ? (
        <SplitClockPhase
          enter={enter}
          local={local}
          color={theme.accent2}
          badge="RTC ОН · ОСНОВНОЙ CPU СПИТ"
          note="RTC · ПИТАНИЕ ОСТАЛОСЬ"
          cpuStatus="SLEEP"
          cpuNote="НИЗКОЕ ПОТРЕБЛЕНИЕ"
        />
      ) : null}
      {phase === "no-poll" ? (
        <SplitClockPhase
          enter={enter}
          local={local}
          color={theme.warning}
          badge="НЕТ ОПРОСА · СЧЁТЧИК ИДЁТ САМ"
          note="CPU НЕ ПРОСЫПАЕТСЯ КАЖДУЮ СЕКУНДУ"
          cpuStatus="SLEEP"
          cpuNote="НЕ ПРОВЕРЯЕТ ВРЕМЯ"
          noPoll
        />
      ) : null}
      {phase === "alarm" ? <AlarmPhase local={local} enter={enter} fps={fps} impactLocal={impactLocal} /> : null}
      {phase === "wakeup" ? <WakeupPhase local={local} enter={enter} fps={fps} impactLocal={impactLocal} /> : null}
      {phase === "ring" ? <RingPhase local={local} enter={enter} impactLocal={impactLocal} /> : null}
    </>
  );
};

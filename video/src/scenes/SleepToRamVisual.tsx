import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

export type SleepToRamPhase =
  | "analogy"
  | "lid"
  | "sleep"
  | "refresh"
  | "wake"
  | "resume"
  | "hibernate";

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const phaseTitle: Record<SleepToRamPhase, string> = {
  analogy: "АНАЛОГИЯ · СТРАНИЦЫ НЕ УБРАЛИ",
  lid: "КРЫШКА · SLEEP REQUEST",
  sleep: "SLEEP · НИЗКОЕ ПОТРЕБЛЕНИЕ",
  refresh: "RAM · SELF-REFRESH",
  wake: "WAKE · ВОЗВРАЩЕНИЕ ПИТАНИЯ",
  resume: "RESUME · СЕАНС ПРОДОЛЖЕН",
  hibernate: "HIBERNATE · ОБРАЗ НА ДИСКЕ",
};

const phaseColor: Record<SleepToRamPhase, string> = {
  analogy: theme.warning,
  lid: theme.accent,
  sleep: theme.accent2,
  refresh: theme.success,
  wake: theme.accent,
  resume: theme.success,
  hibernate: theme.warning,
};

const Header: React.FC<{ phase: SleepToRamPhase; enter: number }> = ({ phase, enter }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      // Keep the phase header below wrapped story headings while leaving a
      // clear gutter before the visual panels (the scene camera shifts by -20).
      top: 360,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: phaseColor[phase],
      fontSize: 24,
      whiteSpace: "nowrap",
      opacity: enter,
      ...mono,
    }}
  >
    <IconGlyph
      name={phase === "analogy" ? "book-open" : phase === "refresh" ? "refresh-cw" : phase === "hibernate" ? "hard-drive" : "laptop"}
      size={30}
      color={phaseColor[phase]}
      strokeWidth={1.8}
    />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const Badge: React.FC<{ text: string; tone: string; opacity: number; scale?: number }> = ({
  text,
  tone,
  opacity,
  scale = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 1190,
      transform: `translateX(-50%) scale(${scale})`,
      padding: "14px 30px",
      borderRadius: 999,
      background: `${tone}18`,
      border: `3px solid ${tone}99`,
      boxShadow: `0 0 34px ${tone}2A`,
      color: tone,
      opacity,
      whiteSpace: "nowrap",
      ...mono,
      fontSize: 24,
    }}
  >
    {text}
  </div>
);

const WindowCard: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  tone: string;
  label: string;
}> = ({ left, top, width, height, tone, label }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      borderRadius: 10,
      background: `${tone}18`,
      border: `2px solid ${tone}AA`,
      boxSizing: "border-box",
      padding: "10px 12px",
      color: tone,
      ...mono,
      fontSize: 17,
    }}
  >
    <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: tone }} />
      ))}
    </div>
    <div>{label}</div>
    <div style={{ marginTop: 10, height: 4, width: "72%", background: `${tone}66` }} />
    <div style={{ marginTop: 7, height: 4, width: "54%", background: `${tone}44` }} />
  </div>
);

const Laptop: React.FC<{
  left: number;
  top: number;
  open: number;
  enter: number;
  screenOpacity?: number;
  compact?: boolean;
}> = ({ left, top, open, enter, screenOpacity = 1, compact = false }) => {
  const width = compact ? 430 : 520;
  const screenWidth = width - 56;
  const screenHeight = compact ? 205 : 250;
  const baseTop = screenHeight - 8;
  const contentOpacity = screenOpacity * open;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height: 370,
        opacity: enter,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 28,
          top: 0,
          width: screenWidth,
          height: screenHeight,
          transformOrigin: "50% 100%",
          // The hinge is the lower edge: shrinking around it closes the lid onto the base.
          transform: `scaleY(${0.09 + 0.91 * open})`,
          borderRadius: 20,
          background: "#070B12",
          border: `5px solid ${open > 0.25 ? theme.subtext : theme.accent2}AA`,
          boxShadow: `0 0 34px ${open > 0.25 ? theme.accent : theme.accent2}22`,
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        <div style={{ position: "absolute", inset: 0, opacity: contentOpacity }}>
          <div
            style={{
              position: "absolute",
              left: 18,
              right: 18,
              top: 15,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: theme.subtext,
              ...mono,
              fontSize: 14,
            }}
          >
            <span>WORKSPACE</span>
            <span style={{ color: theme.success }}>● ACTIVE</span>
          </div>
          <WindowCard left={20} top={52} width={screenWidth * 0.38} height={128} tone={theme.accent} label="TAB 1" />
          <WindowCard left={screenWidth * 0.42} top={52} width={screenWidth * 0.52} height={86} tone={theme.accent2} label="DOCUMENT" />
          <WindowCard left={screenWidth * 0.42} top={151} width={screenWidth * 0.52} height={80} tone={theme.success} label="TAB 3" />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: baseTop,
          width,
          height: 62,
          borderRadius: "12px 12px 22px 22px",
          background: `${theme.panel}F4`,
          border: `4px solid ${theme.subtext}88`,
          boxSizing: "border-box",
          boxShadow: `0 10px 24px ${theme.bg}99`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 17,
            transform: "translateX(-50%)",
            color: open > 0.3 ? theme.subtext : theme.accent2,
            ...mono,
            fontSize: compact ? 15 : 17,
            whiteSpace: "nowrap",
          }}
        >
          {open > 0.3 ? "LAPTOP · OPEN" : "LID · CLOSED"}
        </div>
        <div
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: -12,
            height: 12,
            borderRadius: "0 0 16px 16px",
            background: `${theme.subtext}44`,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: width / 2 - 7,
          top: baseTop - 3,
          width: 14,
          height: 8,
          borderRadius: 6,
          background: theme.accent2,
          opacity: 0.9,
        }}
      />
    </div>
  );
};

const StateRow: React.FC<{
  left: number;
  top: number;
  width: number;
  icon: string;
  label: string;
  status: string;
  tone: string;
  opacity: number;
  pulse?: number;
}> = ({ left, top, width, icon, label, status, tone, opacity, pulse = 1 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height: 66,
      borderRadius: 13,
      background: `${tone}${tone === theme.subtext ? "0C" : "16"}`,
      border: `2px solid ${tone}${tone === theme.subtext ? "55" : "88"}`,
      display: "flex",
      alignItems: "center",
      gap: 11,
      padding: "0 14px",
      boxSizing: "border-box",
      opacity,
      ...mono,
      fontSize: 17,
      color: theme.text,
    }}
  >
    <IconGlyph name={icon} size={29} color={tone} strokeWidth={1.8} />
    <span style={{ color: theme.subtext }}>{label}</span>
    <span style={{ marginLeft: "auto", color: tone, opacity: 0.6 + 0.4 * pulse }}>{status}</span>
  </div>
);

const SystemStateCard: React.FC<{
  left: number;
  top: number;
  phase: "sleep" | "wake";
  local: number;
  enter: number;
}> = ({ left, top, phase, local, enter }) => {
  const wakeP = phase === "wake" ? smooth((local - 8) / 34) : 0;
  const cpuTone = phase === "wake" && wakeP > 0.35 ? theme.success : theme.subtext;
  const deviceTone = phase === "wake" && wakeP > 0.68 ? theme.accent : theme.subtext;
  const ramPulse = 0.8 + 0.2 * (0.5 + 0.5 * Math.sin(local / 4));
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: 390,
        height: 470,
        borderRadius: 24,
        background: `${theme.panel}F0`,
        border: `3px solid ${(phase === "wake" ? theme.accent : theme.accent2)}77`,
        boxShadow: `0 0 38px ${(phase === "wake" ? theme.accent : theme.accent2)}20`,
        opacity: enter,
      }}
    >
      <div style={{ position: "absolute", left: 24, top: 22, display: "flex", alignItems: "center", gap: 10, color: theme.text, ...mono, fontSize: 21 }}>
        <IconGlyph name="activity" size={27} color={phase === "wake" ? theme.accent : theme.accent2} strokeWidth={1.8} />
        СОСТОЯНИЕ СИСТЕМЫ
      </div>
      <div style={{ position: "absolute", left: 24, top: 64, color: theme.subtext, ...mono, fontSize: 16 }}>
        {phase === "wake" ? "ПИТАНИЕ ВОЗВРАЩАЕТСЯ" : "КРЫШКА ЗАКРЫТА"}
      </div>
      <StateRow left={24} top={106} width={342} icon="cpu" label="CPU" status={phase === "wake" && wakeP > 0.35 ? "RUN" : "SLEEP"} tone={cpuTone} opacity={enter} pulse={phase === "wake" ? wakeP : 0.2} />
      <StateRow left={24} top={184} width={342} icon="wifi-off" label="УЗЛЫ" status={phase === "wake" && wakeP > 0.68 ? "READY" : "LOW POWER"} tone={deviceTone} opacity={enter} pulse={phase === "wake" ? wakeP : 0.2} />
      <StateRow left={24} top={262} width={342} icon="memory-stick" label="RAM" status="ПИТАНИЕ ЕСТЬ" tone={theme.success} opacity={enter} pulse={ramPulse} />
      <div style={{ position: "absolute", left: 24, right: 24, top: 350, paddingTop: 18, borderTop: `2px solid ${theme.subtext}33`, color: theme.subtext, ...mono, fontSize: 17 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, color: theme.success }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: theme.success, boxShadow: `0 0 ${10 + ramPulse * 8}px ${theme.success}` }} />
          <span>СОСТОЯНИЕ ОКОН · В RAM</span>
        </div>
        <div style={{ marginTop: 17, color: theme.subtext }}>CPU и устройства спят</div>
      </div>
    </div>
  );
};

const BookSpread: React.FC<{ left: number; top: number; enter: number }> = ({ left, top, enter }) => (
  <div style={{ position: "absolute", left, top, width: 410, height: 330, opacity: enter }}>
    <div style={{ position: "absolute", left: 0, top: 78, width: 196, height: 210, borderRadius: "20px 6px 12px 24px", background: `${theme.warning}18`, border: `3px solid ${theme.warning}99`, transform: "skewY(3deg)" }}>
      {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ position: "absolute", left: 24, top: 35 + i * 30, width: 142 - (i % 2) * 18, height: 5, borderRadius: 3, background: `${theme.warning}77` }} />)}
    </div>
    <div style={{ position: "absolute", left: 196, top: 78, width: 196, height: 210, borderRadius: "6px 20px 24px 12px", background: `${theme.warning}18`, border: `3px solid ${theme.warning}99`, transform: "skewY(-3deg)" }}>
      {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ position: "absolute", left: 26, top: 35 + i * 30, width: 142 - ((i + 1) % 2) * 18, height: 5, borderRadius: 3, background: `${theme.warning}77` }} />)}
    </div>
    <div style={{ position: "absolute", left: 190, top: 82, width: 30, height: 200, background: `${theme.warning}22`, transform: "rotate(2deg)" }} />
    <div style={{ position: "absolute", left: 133, top: 0, display: "flex", alignItems: "center", gap: 9, color: theme.subtext, ...mono, fontSize: 20 }}>
      <IconGlyph name="book-open" size={30} color={theme.warning} strokeWidth={1.8} />
      РАСКРЫТАЯ КНИГА
    </div>
  </div>
);

const LampOff: React.FC<{ left: number; top: number; enter: number }> = ({ left, top, enter }) => (
  <div style={{ position: "absolute", left, top, display: "flex", alignItems: "center", gap: 10, opacity: enter, ...mono, fontSize: 19, color: theme.subtext }}>
    <IconGlyph name="sun" size={32} color={theme.subtext} strokeWidth={1.8} />
    <span style={{ textDecoration: "line-through", textDecorationColor: theme.danger }}>ЛАМПА · OFF</span>
  </div>
);

const DataGrid: React.FC<{ left: number; top: number; enter: number; local: number }> = ({ left, top, enter, local }) => (
  <div style={{ position: "absolute", left, top, width: 392, height: 270, opacity: enter }}>
    <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", borderRadius: 20, background: `${theme.success}10`, border: `3px solid ${theme.success}88`, boxShadow: `0 0 34px ${theme.success}22` }} />
    <div style={{ position: "absolute", left: 22, top: 20, display: "flex", alignItems: "center", gap: 9, ...mono, fontSize: 20, color: theme.success }}>
      <IconGlyph name="memory-stick" size={29} color={theme.success} strokeWidth={1.8} />
      ДАННЫЕ · ЖИВЫЕ
    </div>
    <div style={{ position: "absolute", left: 24, top: 75, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 9 }}>
      {Array.from({ length: 16 }).map((_, i) => {
        const active = (i + Math.floor(local / 5)) % 7 === 0;
        return <div key={i} style={{ width: 68, height: 28, borderRadius: 7, border: `2px solid ${active ? theme.success : theme.success}66`, background: `${active ? theme.success : theme.accent2}${active ? "55" : "18"}`, color: active ? theme.text : theme.success, display: "flex", alignItems: "center", justifyContent: "center", ...mono, fontSize: 17 }}>{i % 3 === 0 ? "1" : "0"}</div>;
      })}
    </div>
    <div style={{ position: "absolute", left: 24, top: 221, display: "flex", alignItems: "center", gap: 10, color: theme.success, ...mono, fontSize: 15, whiteSpace: "nowrap" }}>
      <span style={{ transform: `rotate(${local * 5}deg)`, display: "inline-flex" }}><IconGlyph name="refresh-cw" size={25} color={theme.success} strokeWidth={2} /></span>
      ПОВТОРЯТЬ ЦИКЛ · ДАННЫЕ НЕ ПАДАЮТ
    </div>
  </div>
);

const RefreshPanel: React.FC<{ left: number; top: number; enter: number; local: number }> = ({ left, top, enter, local }) => (
  <div style={{ position: "absolute", left, top, width: 440, height: 525, borderRadius: 24, background: `${theme.panel}F0`, border: `3px solid ${theme.success}88`, boxShadow: `0 0 40px ${theme.success}20`, opacity: enter }}>
    <div style={{ position: "absolute", left: 24, top: 22, display: "flex", alignItems: "center", gap: 9, color: theme.success, ...mono, fontSize: 21 }}>
      <IconGlyph name="refresh-cw" size={28} color={theme.success} strokeWidth={1.8} />
      SELF-REFRESH
    </div>
    <DataGrid left={24} top={82} enter={enter} local={local} />
    <div style={{ position: "absolute", left: 24, top: 382, width: 392, display: "flex", flexDirection: "column", gap: 12 }}>
      <StateRow left={0} top={0} width={392} icon="cpu" label="CPU" status="МОЛЧИТ" tone={theme.subtext} opacity={enter} pulse={0.3} />
      <StateRow left={0} top={78} width={392} icon="hard-drive" label="SSD" status="НЕ УЧАСТВУЕТ" tone={theme.subtext} opacity={enter} pulse={0.2} />
    </div>
  </div>
);

const LidSensor: React.FC<{ left: number; top: number; enter: number; closed: number }> = ({ left, top, enter, closed }) => (
  <div style={{ position: "absolute", left, top, width: 350, height: 410, borderRadius: 24, background: `${theme.panel}F0`, border: `3px solid ${theme.accent}88`, boxShadow: `0 0 38px ${theme.accent}20`, opacity: enter }}>
    <div style={{ position: "absolute", left: 24, top: 24, display: "flex", alignItems: "center", gap: 10, color: theme.accent, ...mono, fontSize: 21 }}>
      <IconGlyph name="laptop" size={28} color={theme.accent} strokeWidth={1.8} />
      ДАТЧИК КРЫШКИ
    </div>
    <div style={{ position: "absolute", left: 44, top: 105, color: theme.subtext, ...mono, fontSize: 18 }}>LID STATE</div>
    <div style={{ position: "absolute", left: 44, top: 145, width: 262, height: 68, borderRadius: 15, border: `3px solid ${closed > 0.55 ? theme.success : theme.warning}99`, background: `${closed > 0.55 ? theme.success : theme.warning}18`, color: closed > 0.55 ? theme.success : theme.warning, display: "flex", alignItems: "center", justifyContent: "center", ...mono, fontSize: 27 }}>
      {closed > 0.55 ? "CLOSED" : "OPEN"}
    </div>
    <div style={{ position: "absolute", left: 162, top: 232, transform: `translateY(${closed * 24}px)`, color: theme.accent, opacity: 0.45 + closed * 0.55 }}>
      <IconGlyph name="arrow-down" size={45} color={theme.accent} strokeWidth={2} />
    </div>
    <div style={{ position: "absolute", left: 44, top: 300, color: closed > 0.55 ? theme.success : theme.subtext, ...mono, fontSize: 19 }}>
      {closed > 0.55 ? "SLEEP REQUEST · SENT" : "WAITING FOR CLOSE"}
    </div>
  </div>
);

const ResumePanel: React.FC<{ left: number; top: number; enter: number; reveal: number }> = ({ left, top, enter, reveal }) => (
  <div style={{ position: "absolute", left, top, width: 390, height: 480, borderRadius: 24, background: `${theme.panel}F0`, border: `3px solid ${theme.success}88`, boxShadow: `0 0 40px ${theme.success}20`, opacity: enter }}>
    <div style={{ position: "absolute", left: 24, top: 22, display: "flex", alignItems: "center", gap: 10, color: theme.success, ...mono, fontSize: 21 }}>
      <IconGlyph name="arrow-right" size={28} color={theme.success} strokeWidth={1.8} />
      RAM → ЭКРАН
    </div>
    <div style={{ position: "absolute", left: 24, top: 92, width: 342, height: 94, borderRadius: 15, background: `${theme.success}18`, border: `2px solid ${theme.success}88`, display: "flex", alignItems: "center", justifyContent: "center", color: theme.success, ...mono, fontSize: 24, opacity: reveal }}>
      СЕАНС ПРОДОЛЖЕН
    </div>
    <div style={{ position: "absolute", left: 24, top: 220, width: 342, display: "flex", flexDirection: "column", gap: 12, opacity: reveal }}>
      {["TAB 1 · ОТКРЫТА", "DOCUMENT · НА МЕСТЕ", "TAB 3 · ОТКРЫТА"].map((label, i) => (
        <div key={label} style={{ height: 54, borderRadius: 12, border: `2px solid ${[theme.accent, theme.accent2, theme.success][i]}88`, background: `${[theme.accent, theme.accent2, theme.success][i]}14`, display: "flex", alignItems: "center", padding: "0 16px", boxSizing: "border-box", color: theme.text, ...mono, fontSize: 17 }}>
          <IconGlyph name="file-text" size={24} color={[theme.accent, theme.accent2, theme.success][i]} strokeWidth={1.8} />
          <span style={{ marginLeft: 10 }}>{label}</span>
        </div>
      ))}
    </div>
    <div style={{ position: "absolute", left: 24, top: 414, display: "flex", alignItems: "center", gap: 9, color: theme.danger, ...mono, fontSize: 17, opacity: reveal }}>
      <IconGlyph name="hard-drive" size={25} color={theme.danger} strokeWidth={1.8} />
      <span style={{ textDecoration: "line-through" }}>SSD → WINDOWS</span>
    </div>
  </div>
);

export const SleepToRamVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: SleepToRamPhase;
}> = ({ local, fps, impactLocal, phase = "sleep" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const phaseTone = phaseColor[phase];
  const after = smooth((local - impactLocal) / 18);
  const pop = local >= impactLocal ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;

  if (phase === "analogy") {
    return (
      <>
        <Header phase={phase} enter={enter} />
        <BookSpread left={74} top={455} enter={enter} />
        <LampOff left={105} top={830} enter={enter} />
        <div style={{ position: "absolute", left: 585, top: 470, width: 410, height: 360, borderRadius: 24, background: `${theme.panel}F0`, border: `3px solid ${theme.warning}77`, opacity: enter, boxShadow: `0 0 34px ${theme.warning}18` }}>
          <div style={{ position: "absolute", left: 25, top: 24, display: "flex", alignItems: "center", gap: 9, color: theme.warning, ...mono, fontSize: 20 }}>
            <IconGlyph name="laptop" size={29} color={theme.warning} strokeWidth={1.8} />
            ТЕХНИЧЕСКИЙ СМЫСЛ
          </div>
          <div style={{ position: "absolute", left: 30, top: 100, width: 350, height: 74, borderRadius: 15, background: `${theme.success}16`, border: `2px solid ${theme.success}88`, display: "flex", alignItems: "center", justifyContent: "center", color: theme.success, ...mono, fontSize: 23 }}>СОСТОЯНИЕ · В RAM</div>
          <div style={{ position: "absolute", left: 46, top: 220, display: "flex", alignItems: "center", gap: 12, color: theme.subtext, ...mono, fontSize: 19 }}>
            <IconGlyph name="monitor-off" size={30} color={theme.subtext} strokeWidth={1.8} />
            ЭКРАН ГАСНЕТ
          </div>
          <div style={{ position: "absolute", left: 46, top: 275, display: "flex", alignItems: "center", gap: 12, color: theme.success, ...mono, fontSize: 19 }}>
            <IconGlyph name="memory-stick" size={30} color={theme.success} strokeWidth={1.8} />
            СТРАНИЦЫ ОСТАЛИСЬ
          </div>
        </div>
        <Badge text="ПОГАСИЛИ СВЕТ · СОСТОЯНИЕ НЕ УБРАЛИ" tone={phaseTone} opacity={enter} scale={0.94 + pop * 0.06} />
        <PulseRing x={790} y={610} triggerFrame={impactLocal} tone="warning" size={190} />
      </>
    );
  }

  if (phase === "lid") {
    const closed = smooth((local - 8) / 34);
    const open = 1 - closed;
    return (
      <>
        <Header phase={phase} enter={enter} />
        <Laptop left={72} top={465} open={open} enter={enter} />
        <LidSensor left={650} top={445} enter={enter} closed={closed} />
        <div style={{ position: "absolute", left: 155, top: 390, color: theme.accent, opacity: enter * (1 - closed * 0.7), ...mono, fontSize: 22 }}>
          КРЫШКА ↓
        </div>
        <Badge text={closed > 0.55 ? "КРЫШКА → SLEEP · СЕАНС НЕ СБРОШЕН" : "СИСТЕМА ВИДИТ КРЫШКУ"} tone={phaseTone} opacity={enter} scale={0.94 + pop * 0.06} />
        <PulseRing x={330} y={710} triggerFrame={impactLocal} tone="accent" size={200} />
      </>
    );
  }

  if (phase === "sleep") {
    return (
      <>
        <Header phase={phase} enter={enter} />
        <Laptop left={72} top={500} open={0} enter={enter} />
        <SystemStateCard left={625} top={435} phase="sleep" local={local} enter={enter} />
        <Badge text="CPU И УЗЛЫ СПЯТ · RAM ПОД ПИТАНИЕМ" tone={phaseTone} opacity={enter} scale={0.94 + pop * 0.06} />
        <PulseRing x={820} y={700} triggerFrame={impactLocal} tone="accent2" size={200} />
      </>
    );
  }

  if (phase === "refresh") {
    return (
      <>
        <Header phase={phase} enter={enter} />
        <Laptop left={42} top={585} open={0} enter={enter} compact />
        <RefreshPanel left={570} top={420} enter={enter} local={local} />
        <Badge text="RAM САМА ОБНОВЛЯЕТ ДАННЫЕ · SSD НЕ НУЖЕН" tone={phaseTone} opacity={enter} scale={0.92 + pop * 0.08} />
        <PulseRing x={790} y={610} triggerFrame={impactLocal} tone="success" size={210} />
      </>
    );
  }

  if (phase === "wake") {
    const open = smooth((local - 8) / 36);
    return (
      <>
        <Header phase={phase} enter={enter} />
        <Laptop left={72} top={485} open={open} enter={enter} />
        <SystemStateCard left={625} top={435} phase="wake" local={local} enter={enter} />
        <Badge text={open > 0.65 ? "CPU И УЗЛЫ СНОВА РАБОТАЮТ" : "ОТКРЫВАЕМ КРЫШКУ"} tone={phaseTone} opacity={enter} scale={0.94 + pop * 0.06} />
        <PulseRing x={820} y={600} triggerFrame={impactLocal} tone="accent" size={205} />
      </>
    );
  }

  if (phase === "resume") {
    const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 13, mass: 0.7 } });
    return (
      <>
        <Header phase={phase} enter={enter} />
        <Laptop left={60} top={470} open={1} enter={enter} screenOpacity={reveal} />
        <ResumePanel left={625} top={430} enter={enter} reveal={reveal} />
        <Badge text={reveal > 0.55 ? "RAM → ЭКРАН · БЕЗ ПОВТОРНОЙ ЗАГРУЗКИ" : "СЕАНС ИЩЕТСЯ В RAM"} tone={phaseTone} opacity={enter} scale={0.9 + pop * 0.1} />
        <PulseRing x={790} y={580} triggerFrame={impactLocal} tone="success" size={215} />
      </>
    );
  }

  const copyP = after;
  return (
    <>
      <Header phase={phase} enter={enter} />
      <Laptop left={48} top={575} open={0} enter={enter} compact />
      <div style={{ position: "absolute", left: 585, top: 430, width: 440, height: 480, borderRadius: 24, background: `${theme.panel}F0`, border: `3px solid ${theme.warning}88`, boxShadow: `0 0 38px ${theme.warning}20`, opacity: enter }}>
        <div style={{ position: "absolute", left: 24, top: 22, display: "flex", alignItems: "center", gap: 10, color: theme.warning, ...mono, fontSize: 21 }}>
          <IconGlyph name="hard-drive" size={29} color={theme.warning} strokeWidth={1.8} />
          ОБРАЗ ПАМЯТИ
        </div>
        <div style={{ position: "absolute", left: 32, top: 98, width: 376, height: 82, borderRadius: 14, border: `2px solid ${theme.accent2}88`, background: `${theme.accent2}18`, display: "flex", alignItems: "center", justifyContent: "center", color: theme.accent2, ...mono, fontSize: 22, opacity: 1 - copyP * 0.1 }}>
          RAM · STATE
        </div>
        <div style={{ position: "absolute", left: 194, top: 190, color: theme.warning, transform: `translateY(${copyP * 12}px)`, opacity: 0.6 + copyP * 0.4 }}>
          <IconGlyph name="arrow-down" size={44} color={theme.warning} strokeWidth={2} />
        </div>
        <div style={{ position: "absolute", left: 32, top: 250, width: 376, height: 90, borderRadius: 14, border: `2px solid ${theme.warning}AA`, background: `${theme.warning}18`, display: "flex", alignItems: "center", justifyContent: "center", color: theme.warning, ...mono, fontSize: 21 }}>
          HIBERNATION IMAGE → SSD
        </div>
        <div style={{ position: "absolute", left: 32, top: 384, display: "flex", alignItems: "center", gap: 10, color: theme.danger, ...mono, fontSize: 18 }}>
          <IconGlyph name="power" size={26} color={theme.danger} strokeWidth={1.8} />
          RAM · ПИТАНИЕ OFF
        </div>
      </div>
      <Badge text="ГИБЕРНАЦИЯ: СНАЧАЛА ДИСК · ПОТОМ RAM OFF" tone={phaseTone} opacity={enter} scale={0.92 + pop * 0.08} />
      <PulseRing x={800} y={690} triggerFrame={impactLocal} tone="warning" size={210} />
    </>
  );
};

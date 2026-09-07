import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type FindNetworkPhase =
  | "drop"
  | "point"
  | "beacon"
  | "heard"
  | "network"
  | "cloud"
  | "anonymous";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: FindNetworkPhase;
}

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
  letterSpacing: 1.5,
};

const phaseTitle: Record<FindNetworkPhase, string> = {
  drop: "НАУШНИК ОСТАЛСЯ У КОФЕЙНИ",
  point: "ПРИЛОЖЕНИЕ ПОКАЗЫВАЕТ ТОЧКУ",
  beacon: "НАУШНИК ПЕРЕДАЁТ BLE-МАЯК",
  heard: "ТЕЛЕФОН ПРОХОЖЕГО СЛЫШИТ МАЯК",
  network: "СЕТЬ ПОИСКА · ТЕЛЕФОНЫ-ПОМОЩНИКИ",
  cloud: "ОТЧЁТ УХОДИТ В ОБЛАКО",
  anonymous: "ПОМОЩНИК НЕ ВИДИТ ЛИЧНОСТЬ",
};

const phaseIcon: Record<FindNetworkPhase, string> = {
  drop: "map-pin",
  point: "map",
  beacon: "radio",
  heard: "bluetooth",
  network: "share-2",
  cloud: "cloud-upload",
  anonymous: "eye-off",
};

const phaseColor: Record<FindNetworkPhase, string> = {
  drop: theme.warning,
  point: theme.success,
  beacon: theme.accent,
  heard: theme.accent2,
  network: theme.accent,
  cloud: theme.success,
  anonymous: theme.warning,
};

const Header: React.FC<{ phase: FindNetworkPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 320,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: phaseColor[phase],
      opacity,
      whiteSpace: "nowrap",
      fontSize: 24,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={31} color={phaseColor[phase]} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const StatusPill: React.FC<{
  text: string;
  color: string;
  opacity: number;
  y?: number;
}> = ({ text, color, opacity, y = 1205 }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: y,
      transform: "translateX(-50%)",
      padding: "14px 28px",
      borderRadius: 999,
      background: `${color}18`,
      border: `3px solid ${color}99`,
      boxShadow: `0 0 34px ${color}2E`,
      color,
      opacity,
      whiteSpace: "nowrap",
      fontSize: 24,
      ...mono,
    }}
  >
    {text}
  </div>
);

const Connector: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  opacity: number;
  dashed?: boolean;
}> = ({ x1, y1, x2, y2, color, opacity, dashed = true }) => {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return (
    <div
      style={{
        position: "absolute",
        left: x1,
        top: y1,
        width: length,
        height: 4,
        transform: `rotate(${angle}deg)`,
        transformOrigin: "0 50%",
        borderTop: `3px ${dashed ? "dashed" : "solid"} ${color}`,
        opacity,
      }}
    />
  );
};

const FlowDot: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  progress: number;
  color: string;
  opacity: number;
  size?: number;
}> = ({ x1, y1, x2, y2, progress, color, opacity, size = 18 }) => (
  <div
    style={{
      position: "absolute",
      left: interpolate(progress, [0, 1], [x1, x2]),
      top: interpolate(progress, [0, 1], [y1, y2]),
      width: size,
      height: size,
      transform: "translate(-50%, -50%)",
      borderRadius: "50%",
      background: color,
      boxShadow: `0 0 24px ${color}`,
      opacity,
    }}
  />
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
      background: `${theme.panel}F2`,
      border: `3px solid ${color}77`,
      boxShadow: `0 0 42px ${color}20`,
      opacity,
    }}
  >
    {children}
  </div>
);

const Earbud: React.FC<{
  x: number;
  y: number;
  opacity: number;
  color?: string;
  scale?: number;
}> = ({ x, y, opacity, color = theme.accent, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: `translate(-50%, -50%) scale(${scale})`,
      width: 186,
      height: 118,
      borderRadius: 24,
      background: `${theme.panel}F5`,
      border: `3px solid ${color}AA`,
      boxShadow: `0 0 32px ${color}33`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      color: theme.text,
      opacity,
    }}
  >
    <IconGlyph name="headphones" size={39} color={color} strokeWidth={1.8} />
    <span style={{ ...mono, color: theme.text, fontSize: 17, letterSpacing: 1 }}>НАУШНИК</span>
  </div>
);

const Phone: React.FC<{
  x: number;
  y: number;
  label: string;
  opacity: number;
  color?: string;
  width?: number;
}> = ({ x, y, label, opacity, color = theme.accent2, width = 190 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: "translate(-50%, -50%)",
      width,
      height: 106,
      borderRadius: 22,
      background: `${theme.panel}F5`,
      border: `3px solid ${color}99`,
      boxShadow: `0 0 28px ${color}28`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      color: theme.text,
      opacity,
    }}
  >
    <IconGlyph name="smartphone" size={36} color={color} strokeWidth={1.8} />
    <span style={{ ...mono, fontSize: 16, letterSpacing: 0.7, textAlign: "center" }}>{label}</span>
  </div>
);

const Cloud: React.FC<{ x: number; y: number; opacity: number; color?: string }> = ({
  x,
  y,
  opacity,
  color = theme.success,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: "translate(-50%, -50%)",
      width: 224,
      height: 136,
      borderRadius: 30,
      background: `${theme.panel}F5`,
      border: `3px solid ${color}99`,
      boxShadow: `0 0 32px ${color}28`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      opacity,
    }}
  >
    <IconGlyph name="cloud" size={38} color={color} strokeWidth={1.8} />
    <span style={{ ...mono, color: theme.text, fontSize: 16, letterSpacing: 0.6, textAlign: "center" }}>
      СЕТЬ ПОИСКА
    </span>
  </div>
);

const MapCard: React.FC<{ left: number; top: number; opacity: number }> = ({ left, top, opacity }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width: 430,
      height: 470,
      borderRadius: 26,
      overflow: "hidden",
      background:
        "linear-gradient(135deg, transparent 0 28%, #243449 28% 30%, transparent 30% 57%, #243449 57% 59%, transparent 59%), linear-gradient(35deg, transparent 0 42%, #1E3040 42% 44%, transparent 44% 72%, #1E3040 72% 74%, transparent 74%), #172231",
      border: `3px solid ${theme.success}88`,
      boxShadow: `0 0 42px ${theme.success}22`,
      opacity,
    }}
  >
    <div style={{ position: "absolute", left: 24, top: 22, display: "flex", alignItems: "center", gap: 9, color: theme.success, ...mono, fontSize: 19 }}>
      <IconGlyph name="map" size={28} color={theme.success} strokeWidth={1.8} />
      ТОЧКА ОБНАРУЖЕНИЯ
    </div>
    <div
      style={{
        position: "absolute",
        left: 216,
        top: 260,
        width: 30,
        height: 30,
        borderRadius: "50% 50% 50% 0",
        background: theme.danger,
        transform: "translate(-50%, -50%) rotate(-45deg)",
        boxShadow: `0 0 28px ${theme.danger}`,
      }}
    >
      <div style={{ position: "absolute", left: 10, top: 10, width: 10, height: 10, borderRadius: "50%", background: theme.bg }} />
    </div>
    <div style={{ position: "absolute", left: 54, right: 54, bottom: 34, height: 2, background: `${theme.text}22` }} />
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 6, textAlign: "center", color: theme.text, ...mono, fontSize: 17 }}>
      КОФЕЙНЯ · ТОЧКА
    </div>
  </div>
);

const NetworkPhase: React.FC<{ local: number; enter: number; impactLocal: number }> = ({ local, enter, impactLocal }) => {
  const beaconP = smooth((local - 8) / 36);
  const reportP = smooth((local - 28) / 48);
  const phones = [
    { x: 370, y: 560, label: "ПРОХОЖИЙ 1" },
    { x: 560, y: 820, label: "ПРОХОЖИЙ 2" },
    { x: 750, y: 545, label: "ПРОХОЖИЙ 3" },
  ];
  const earbud = { x: 130, y: 690 };
  const cloud = { x: 930, y: 690 };
  return (
    <>
      <Header phase="network" opacity={enter} />
      <Earbud x={earbud.x} y={earbud.y} opacity={enter} color={theme.accent} scale={0.82} />
      <div style={{ position: "absolute", left: 135, top: 475, transform: "translateX(-50%)", color: theme.accent, ...mono, fontSize: 16, opacity: enter }}>
        BLE-МАЯК
      </div>
      {phones.map((phone, i) => (
        <React.Fragment key={phone.label}>
          <Connector x1={earbud.x + 88} y1={earbud.y} x2={phone.x - 92} y2={phone.y} color={theme.accent} opacity={enter * 0.7} />
          <Phone x={phone.x} y={phone.y} label={phone.label} opacity={enter} color={i === 1 ? theme.accent : theme.accent2} width={170} />
          <Connector x1={phone.x + 86} y1={phone.y} x2={cloud.x - 112} y2={cloud.y} color={theme.accent2} opacity={enter * 0.7} />
          <FlowDot
            x1={earbud.x + 88}
            y1={earbud.y}
            x2={phone.x - 92}
            y2={phone.y}
            progress={smooth((beaconP - i * 0.13) / 0.72)}
            color={theme.accent}
            opacity={enter * (0.35 + 0.65 * clamp01((beaconP - i * 0.13) / 0.72))}
            size={15}
          />
          <FlowDot
            x1={phone.x + 86}
            y1={phone.y}
            x2={cloud.x - 112}
            y2={cloud.y}
            progress={smooth((reportP - i * 0.12) / 0.72)}
            color={theme.success}
            opacity={enter * clamp01((reportP - i * 0.12) / 0.72)}
            size={16}
          />
        </React.Fragment>
      ))}
      <Cloud x={cloud.x} y={cloud.y} opacity={enter} />
      <div style={{ position: "absolute", left: 510, top: 412, color: theme.accent, ...mono, fontSize: 17, opacity: enter }}>СЛЫШАТ СИГНАЛ</div>
      <div style={{ position: "absolute", left: 735, top: 930, width: 340, textAlign: "center", color: theme.success, ...mono, fontSize: 16, opacity: enter }}>ОТЧЁТ · КООРДИНАТА ТЕЛЕФОНА</div>
      <StatusPill text="НАУШНИК → BLE → ТЕЛЕФОНЫ → ОБЛАКО" color={theme.success} opacity={enter} />
      <PulseRing x={cloud.x} y={cloud.y} triggerFrame={impactLocal} tone="success" size={220} />
    </>
  );
};

const FindNetworkVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "network" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const pulse = 0.5 + 0.5 * Math.sin(local / 10);
  const impact = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });

  if (phase === "network") return <NetworkPhase local={local} enter={enter} impactLocal={impactLocal} />;

  if (phase === "drop") {
    const fall = smooth(local / 34);
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <Panel left={100} top={430} width={470} height={480} color={theme.warning} opacity={enter}>
          <div style={{ position: "absolute", left: 28, top: 26, display: "flex", alignItems: "center", gap: 10, color: theme.warning, ...mono, fontSize: 22 }}>
            <IconGlyph name="coffee" size={30} color={theme.warning} strokeWidth={1.8} />
            КОФЕЙНЯ
          </div>
          <div style={{ position: "absolute", left: 42, right: 42, top: 126, height: 5, background: `${theme.warning}55`, transform: "rotate(-8deg)" }} />
          <div style={{ position: "absolute", left: 54, right: 54, top: 250, height: 5, background: `${theme.warning}55`, transform: "rotate(10deg)" }} />
          <div style={{ position: "absolute", left: 180, top: 340, color: theme.subtext, ...mono, fontSize: 18 }}>ТРОТУАР</div>
        </Panel>
        <Earbud x={520} y={510 + fall * 210} opacity={enter} color={theme.warning} scale={0.84 + 0.16 * impact} />
        <div style={{ position: "absolute", left: 520, top: 820, color: theme.warning, ...mono, fontSize: 19, transform: "translateX(-50%)", opacity: enter }}>УРОНЕН · НЕ ЗАМЕЧЕН</div>
        <Connector x1={610} y1={720} x2={790} y2={720} color={theme.subtext} opacity={enter * 0.7} />
        <Phone x={855} y={720} label="ВЛАДЕЛЕЦ" opacity={enter} color={theme.accent2} />
        <StatusPill text="ОН УШЁЛ, МАЯК ОСТАЛСЯ" color={theme.warning} opacity={enter} />
        <PulseRing x={520} y={720} triggerFrame={impactLocal} tone="warning" size={180} />
      </>
    );
  }

  if (phase === "point") {
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <Phone x={170} y={670} label="ПРИЛОЖЕНИЕ" opacity={enter} color={theme.accent2} width={180} />
        <Connector x1={265} y1={670} x2={330} y2={670} color={theme.success} opacity={enter} dashed={false} />
        <MapCard left={340} top={420} opacity={enter} />
        <div style={{ position: "absolute", left: 540, top: 950, transform: "translateX(-50%)", color: theme.success, ...mono, fontSize: 20, opacity: enter }}>«ВОТ ЕГО ТОЧКА»</div>
        <StatusPill text="НО КТО СООБЩИЛ?" color={theme.warning} opacity={enter * (0.65 + 0.35 * pulse)} />
        <PulseRing x={556} y={680} triggerFrame={impactLocal} tone="success" size={220} />
      </>
    );
  }

  if (phase === "beacon") {
    const radius = 140 + 34 * pulse;
    return (
      <>
        <Header phase={phase} opacity={enter} />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: CX,
              top: 680,
              width: radius + i * 86,
              height: radius + i * 86,
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              border: `3px solid ${theme.accent}${i === 0 ? "AA" : "55"}`,
              opacity: enter * (0.85 - i * 0.2),
            }}
          />
        ))}
        <Earbud x={CX} y={680} opacity={enter} color={theme.accent} scale={1.08} />
        <div style={{ position: "absolute", left: CX, top: 475, transform: "translateX(-50%)", color: theme.accent, ...mono, fontSize: 26, opacity: enter }}>BLE-МАЯК</div>
        <div style={{ position: "absolute", left: CX, top: 875, transform: "translateX(-50%)", color: theme.subtext, ...mono, fontSize: 19, opacity: enter }}>КОРОТКИЙ СИГНАЛ · ПЕРИОДИЧЕСКИ</div>
        <StatusPill text="КООРДИНАТУ САМ НЕ СЧИТАЕТ" color={theme.accent} opacity={enter} />
        <PulseRing x={CX} y={680} triggerFrame={impactLocal} tone="accent" size={240} />
      </>
    );
  }

  if (phase === "heard") {
    const signal = smooth((local - 12) / 42);
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <Earbud x={250} y={670} opacity={enter} color={theme.accent} scale={0.88} />
        <Connector x1={350} y1={670} x2={675} y2={670} color={theme.accent} opacity={enter * 0.75} />
        <FlowDot x1={355} y1={670} x2={665} y2={670} progress={signal} color={theme.accent} opacity={enter} size={20} />
        <div style={{ position: "absolute", left: 515, top: 620, transform: "translateX(-50%)", color: theme.accent, ...mono, fontSize: 18, opacity: enter }}>BLE-МАЯК</div>
        <Phone x={800} y={670} label="ПРОХОЖИЙ" opacity={enter} color={theme.accent2} width={220} />
        <div style={{ position: "absolute", left: 800, top: 835, transform: "translateX(-50%)", color: theme.accent2, ...mono, fontSize: 23, opacity: enter }}>«СЛЫШУ ЕГО»</div>
        <StatusPill text="РЯДОМ · БЕЗ СОПРЯЖЕНИЯ" color={theme.accent2} opacity={enter} />
        <PulseRing x={800} y={670} triggerFrame={impactLocal} tone="accent2" size={220} />
      </>
    );
  }

  if (phase === "cloud") {
    const report = smooth((local - 10) / 48);
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <Phone x={220} y={670} label="ТЕЛЕФОН" opacity={enter} color={theme.accent2} width={190} />
        <Connector x1={320} y1={670} x2={790} y2={670} color={theme.success} opacity={enter * 0.75} />
        <FlowDot x1={325} y1={670} x2={785} y2={670} progress={report} color={theme.success} opacity={enter} size={22} />
        <div style={{ position: "absolute", left: 560, top: 615, transform: "translateX(-50%)", color: theme.success, ...mono, fontSize: 18, opacity: enter }}>ОТЧЁТ · КООРДИНАТА</div>
        <Cloud x={880} y={670} opacity={enter} />
        <StatusPill text="ПРИНЯТ В СЕТИ ПОИСКА" color={theme.success} opacity={enter * (0.55 + 0.45 * impact)} />
        <PulseRing x={880} y={670} triggerFrame={impactLocal} tone="success" size={230} />
      </>
    );
  }

  // anonymous
  return (
    <>
      <Header phase={phase} opacity={enter} />
      <Phone x={250} y={650} label="ПРОХОЖИЙ" opacity={enter} color={theme.accent2} width={220} />
      <Connector x1={365} y1={650} x2={560} y2={650} color={theme.success} opacity={enter * 0.7} />
      <div style={{ position: "absolute", left: 650, top: 475, width: 300, height: 330, borderRadius: 24, background: `${theme.panel}F2`, border: `3px solid ${theme.warning}77`, opacity: enter, padding: "24px 22px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, color: theme.warning, ...mono, fontSize: 18 }}>
          <IconGlyph name="file-lock" size={28} color={theme.warning} strokeWidth={1.8} />
          ОТЧЁТ
        </div>
        <div style={{ marginTop: 42, color: theme.success, ...mono, fontSize: 18 }}>КООРДИНАТА · ДА</div>
        <div style={{ marginTop: 38, color: theme.danger, ...mono, fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
          <IconGlyph name="eye-off" size={25} color={theme.danger} strokeWidth={1.8} />
          ИМЯ · НЕТ
        </div>
      </div>
      <StatusPill text="ПОМОЩНИК ПЕРЕДАЛ ТОЧКУ, НЕ ЛИЧНОСТЬ" color={theme.warning} opacity={enter} />
      <PulseRing x={650} y={650} triggerFrame={impactLocal} tone="warning" size={220} />
    </>
  );
};

export { FindNetworkVisual };

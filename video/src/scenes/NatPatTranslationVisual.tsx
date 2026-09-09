import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type NatPatPhase = "home" | "translate" | "ticket" | "return";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: NatPatPhase;
  privateIp?: string;
  privatePort?: string;
  publicIp?: string;
  publicPort?: string;
  deviceLabel?: string;
  siteLabel?: string;
}

const W = layout.width;
const CX = W / 2;
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
      borderRadius: 28,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 38px ${color}18`,
      opacity,
    }}
  >
    {children}
  </div>
);

const PanelTitle: React.FC<{
  icon: string;
  text: string;
  color: string;
  opacity: number;
}> = ({ icon, text, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: 24,
      top: 22,
      display: "flex",
      alignItems: "center",
      gap: 12,
      color,
      fontSize: 20,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    <IconGlyph name={icon} size={32} color={color} strokeWidth={1.8} />
    <span>{text}</span>
  </div>
);

const Endpoint: React.FC<{
  left: number;
  top: number;
  width: number;
  text: string;
  color: string;
  opacity: number;
  fontSize?: number;
}> = ({ left, top, width, text, color, opacity, fontSize = 20 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      textAlign: "center",
      color,
      fontSize,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    {text}
  </div>
);

const Caption: React.FC<{ text: string; color: string; opacity: number }> = ({ text, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 1215,
      transform: "translateX(-50%)",
      padding: "12px 28px",
      borderRadius: 999,
      background: `${color}18`,
      border: `2px solid ${color}88`,
      color,
      fontSize: 22,
      whiteSpace: "nowrap",
      opacity,
      boxShadow: `0 0 30px ${color}1A`,
      ...mono,
    }}
  >
    {text}
  </div>
);

const Packet: React.FC<{
  x: number;
  y: number;
  label: string;
  color: string;
  opacity: number;
  scale?: number;
}> = ({ x, y, label, color, opacity, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: `translate(-50%, -50%) scale(${scale})`,
      display: "flex",
      alignItems: "center",
      gap: 9,
      padding: "10px 16px",
      borderRadius: 999,
      background: `${color}28`,
      border: `2px solid ${color}`,
      color,
      fontSize: 18,
      whiteSpace: "nowrap",
      opacity,
      boxShadow: `0 0 24px ${color}44`,
      ...mono,
    }}
  >
    <IconGlyph name="package" size={22} color={color} strokeWidth={1.8} />
    <span>{label}</span>
  </div>
);

const Route: React.FC<{
  from: number;
  to: number;
  y: number;
  color: string;
  opacity: number;
}> = ({ from, to, y, color, opacity }) => (
  <svg width={W} height={layout.height} style={{ position: "absolute", inset: 0, overflow: "visible", opacity }}>
    <path
      d={`M ${from} ${y} C ${from + (to - from) * 0.32} ${y - 74}, ${from + (to - from) * 0.68} ${y + 74}, ${to} ${y}`}
      fill="none"
      stroke={`${color}99`}
      strokeWidth="4"
      strokeDasharray="12 18"
    />
    <path
      d={`M ${to - 16} ${y - 10} L ${to} ${y} L ${to - 16} ${y + 10}`}
      fill="none"
      stroke={color}
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Параметрический путь NAT/PAT: private endpoint → public mapping → обратная таблица. */
export const NatPatTranslationVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "home",
  privateIp = "192.168.1.42",
  privatePort = "53120",
  publicIp = "203.0.113.7",
  publicPort = "41001",
  deviceLabel = "ТЕЛЕФОН",
  siteLabel = "САЙТ",
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const post = hit
    ? spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } })
    : 0;
  const privateEndpoint = `${privateIp}:${privatePort}`;
  const publicEndpoint = `${publicIp}:${publicPort}`;

  if (phase === "home") {
    const travel = smooth((local - 14) / 56);
    const packetX = interpolate(travel, [0, 1], [420, 700]);
    const packetY = 700 - Math.sin(travel * Math.PI) * 92;
    return (
      <>
        <Panel left={60} top={455} width={360} height={430} color={theme.accent} opacity={enter}>
          <PanelTitle icon="home" text="ДОМА" color={theme.accent} opacity={enter} />
          <div style={{ position: "absolute", left: 45, right: 45, top: 135, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ textAlign: "center", color: theme.text, ...mono, fontSize: 16 }}>
              <IconGlyph name="smartphone" size={58} color={theme.accent} strokeWidth={1.8} />
              <div style={{ marginTop: 12 }}>ТЕЛ</div>
            </div>
            <div style={{ textAlign: "center", color: theme.text, ...mono, fontSize: 16 }}>
              <IconGlyph name="laptop" size={58} color={theme.accent2} strokeWidth={1.8} />
              <div style={{ marginTop: 12 }}>НОУТ</div>
            </div>
            <div style={{ textAlign: "center", color: theme.text, ...mono, fontSize: 16 }}>
              <IconGlyph name="smartphone" size={58} color={theme.accent} strokeWidth={1.8} />
              <div style={{ marginTop: 12 }}>ТЕЛ</div>
            </div>
          </div>
          <Endpoint left={35} top={325} width={290} text="192.168.1.x" color={theme.accent} opacity={enter} />
        </Panel>

        <Panel left={465} top={515} width={150} height={300} color={theme.warning} opacity={enter}>
          <div style={{ position: "absolute", left: 0, top: 42, width: "100%", textAlign: "center" }}>
            <IconGlyph name="router" size={62} color={theme.warning} strokeWidth={1.8} />
          </div>
          <div style={{ position: "absolute", left: 0, top: 135, width: "100%", textAlign: "center", color: theme.text, fontSize: 19, ...mono }}>РОУТЕР</div>
          <div style={{ position: "absolute", left: 0, top: 218, width: "100%", textAlign: "center", color: theme.warning, fontSize: 17, ...mono }}>ГРАНИЦА</div>
        </Panel>

        <Panel left={700} top={455} width={320} height={430} color={theme.accent2} opacity={enter}>
          <PanelTitle icon="globe-2" text={siteLabel} color={theme.accent2} opacity={enter} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 125, textAlign: "center", color: theme.text, fontSize: 28, fontWeight: 800 }}>ВИДИТ</div>
          <Endpoint left={24} top={205} width={272} text={publicIp} color={theme.accent2} opacity={enter} fontSize={25} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 300, textAlign: "center", color: theme.subtext, fontSize: 18, ...mono }}>ОДИН АДРЕС</div>
        </Panel>

        <Route from={420} to={700} y={700} color={theme.warning} opacity={enter} />
        <Packet x={packetX} y={packetY} label="ЗАПРОС" color={theme.warning} opacity={enter} scale={0.92 + 0.08 * post} />
        <Caption text="ОДИН АДРЕС СНАРУЖИ" color={theme.accent2} opacity={enter} />
        <PulseRing x={550} y={700} triggerFrame={impactLocal} tone="warning" size={170} />
      </>
    );
  }

  if (phase === "translate") {
    const travel = smooth((local - 12) / 68);
    const packetX = interpolate(travel, [0, 1], [340, 750]);
    const packetY = 720 - Math.sin(travel * Math.PI) * 92;
    return (
      <>
        <Panel left={45} top={460} width={285} height={430} color={theme.accent} opacity={enter}>
          <PanelTitle icon="smartphone" text={deviceLabel} color={theme.accent} opacity={enter} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 115, textAlign: "center" }}>
            <IconGlyph name="smartphone" size={82} color={theme.accent} strokeWidth={1.8} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 235, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>ВНУТРИ СЕТИ</div>
          <Endpoint left={20} top={305} width={245} text={privateEndpoint} color={theme.accent} opacity={enter} fontSize={19} />
        </Panel>

        <Panel left={350} top={410} width={380} height={530} color={theme.warning} opacity={enter}>
          <PanelTitle icon="router" text="NAT / PAT" color={theme.warning} opacity={enter} />
          <div style={{ position: "absolute", left: 35, right: 35, top: 125, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>ПЕРЕПИСЬ ПАКЕТА</div>
          <Endpoint left={30} top={190} width={320} text={privateEndpoint} color={theme.accent} opacity={enter} fontSize={20} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 245, textAlign: "center", color: theme.warning, fontSize: 38, fontWeight: 800 }}>↓</div>
          <Endpoint left={30} top={315} width={320} text={publicEndpoint} color={theme.accent2} opacity={enter} fontSize={20} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 400, textAlign: "center", color: theme.warning, fontSize: 17, ...mono }}>IP + ПОРТ</div>
        </Panel>

        <Panel left={750} top={460} width={285} height={430} color={theme.accent2} opacity={enter}>
          <PanelTitle icon="globe-2" text={siteLabel} color={theme.accent2} opacity={enter} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 115, textAlign: "center" }}>
            <IconGlyph name="globe-2" size={82} color={theme.accent2} strokeWidth={1.8} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 205, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>СНАРУЖИ ВИДИТ</div>
          <Endpoint left={16} top={305} width={253} text={publicEndpoint} color={theme.accent2} opacity={enter} fontSize={19} />
        </Panel>

        <Route from={330} to={750} y={720} color={theme.accent2} opacity={enter} />
        <Packet x={packetX} y={packetY} label="ПАКЕТ" color={theme.accent2} opacity={enter} scale={0.92 + 0.08 * post} />
        <Caption text="ПЕРЕПИСЬ НА ГРАНИЦЕ" color={theme.warning} opacity={enter} />
        <PulseRing x={540} y={720} triggerFrame={impactLocal} tone="warning" size={205} />
      </>
    );
  }

  if (phase === "ticket") {
    const ticketP = smooth((local - 12) / 54);
    const ticketX = interpolate(ticketP, [0, 1], [420, 635]);
    const rowOpacity = 0.35 + 0.65 * post;
    return (
      <>
        <Panel left={92} top={455} width={340} height={485} color={theme.warning} opacity={enter}>
          <PanelTitle icon="package" text="ГАРДЕРОБ" color={theme.warning} opacity={enter} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 132, textAlign: "center" }}>
            <IconGlyph name="package" size={104} color={theme.warning} strokeWidth={1.5} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 275, textAlign: "center", color: theme.text, fontSize: 27, fontWeight: 800 }}>ВЕЩЬ</div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 350, textAlign: "center", color: theme.subtext, fontSize: 18, ...mono }}>ЖДЁТ ВЫДАЧИ</div>
        </Panel>

        <Panel left={570} top={455} width={420} height={485} color={theme.accent2} opacity={enter}>
          <PanelTitle icon="table-2" text="ТАБЛИЦА" color={theme.accent2} opacity={enter} />
          <div style={{ position: "absolute", left: 30, right: 30, top: 132, height: 132, borderRadius: 18, background: `${theme.accent2}12`, border: `2px solid ${theme.accent2}55`, opacity: rowOpacity }}>
            <div style={{ position: "absolute", left: 20, top: 19, color: theme.subtext, fontSize: 16, ...mono }}>НОМЕРОК</div>
            <div style={{ position: "absolute", left: 20, top: 57, color: theme.accent2, fontSize: 28, ...mono }}>№ {publicPort}</div>
            <div style={{ position: "absolute", right: 20, top: 50, color: theme.text, fontSize: 21, ...mono }}>→ ВЕЩЬ</div>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 332, textAlign: "center", color: theme.subtext, fontSize: 18, ...mono }}>ОДНА СТРОКА</div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 375, textAlign: "center", color: theme.accent2, fontSize: 18, ...mono }}>№ → ЧТО ВНУТРИ</div>
        </Panel>

        <Route from={432} to={570} y={700} color={theme.warning} opacity={enter} />
        <Packet x={ticketX} y={700} label={`№ ${publicPort}`} color={theme.warning} opacity={enter} scale={0.94 + 0.06 * post} />
        <Caption text="НОМЕРОК → СТРОКА" color={theme.accent2} opacity={enter} />
        <PulseRing x={780} y={655} triggerFrame={impactLocal} tone="accent2" size={190} />
      </>
    );
  }

  const responseP = smooth((local - 12) / 76);
  const responseX = interpolate(responseP, [0, 1], [330, 755]);
  const responseY = 720 + Math.sin(responseP * Math.PI) * 92;
  const rowGlow = 0.25 + 0.75 * post;
  return (
    <>
      <Panel left={45} top={465} width={285} height={405} color={theme.accent2} opacity={enter}>
        <PanelTitle icon="globe-2" text={siteLabel} color={theme.accent2} opacity={enter} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 112, textAlign: "center" }}>
          <IconGlyph name="globe-2" size={76} color={theme.accent2} strokeWidth={1.8} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 220, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>ОТВЕТ НА</div>
        <Endpoint left={18} top={280} width={249} text={`:${publicPort}`} color={theme.accent2} opacity={enter} fontSize={23} />
      </Panel>

      <Panel left={355} top={420} width={370} height={510} color={theme.warning} opacity={enter}>
        <PanelTitle icon="table-2" text="LOOKUP" color={theme.warning} opacity={enter} />
        <div style={{ position: "absolute", left: 24, right: 24, top: 125, height: 170, borderRadius: 18, background: `${theme.warning}${Math.round(rowGlow * 38).toString(16).padStart(2, "0")}`, border: `3px solid ${theme.warning}`, boxShadow: `0 0 ${22 + 22 * rowGlow}px ${theme.warning}${Math.round(35 + 45 * rowGlow).toString(16).padStart(2, "0")}` }}>
          <Endpoint left={16} top={28} width={314} text={publicEndpoint} color={theme.accent2} opacity={enter} fontSize={18} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 71, textAlign: "center", color: theme.warning, fontSize: 27, fontWeight: 800 }}>↓</div>
          <Endpoint left={16} top={113} width={314} text={privateEndpoint} color={theme.accent} opacity={enter} fontSize={18} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 355, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>ИЩЕМ ПО ПОРТУ</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 402, textAlign: "center", color: theme.warning, fontSize: 18, ...mono, opacity: rowGlow }}>СТРОКА НАЙДЕНА</div>
      </Panel>

      <Panel left={750} top={465} width={285} height={405} color={theme.success} opacity={enter}>
        <PanelTitle icon="smartphone" text={deviceLabel} color={theme.success} opacity={enter} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 112, textAlign: "center" }}>
          <IconGlyph name="smartphone" size={76} color={theme.success} strokeWidth={1.8} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 220, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>ПОЛУЧАЕТ</div>
        <Endpoint left={18} top={280} width={249} text={`:${privatePort}`} color={theme.success} opacity={enter} fontSize={23} />
      </Panel>

      <Route from={330} to={755} y={720} color={theme.success} opacity={enter} />
      <Packet x={responseX} y={responseY} label="ОТВЕТ" color={theme.success} opacity={enter} scale={0.92 + 0.08 * post} />
      <Caption text="ВОЗВРАТ ПО ТАБЛИЦЕ" color={theme.success} opacity={enter} />
      <PulseRing x={540} y={700} triggerFrame={impactLocal} tone="success" size={220} />
    </>
  );
};

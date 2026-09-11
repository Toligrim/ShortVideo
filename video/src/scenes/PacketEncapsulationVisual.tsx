import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";
import { MotionGroup } from "../lib/motion/MotionStage";

export type PacketEncapsulationPhase = "route" | "pack" | "transit" | "unwrap" | "exit";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: PacketEncapsulationPhase;
  clientIp?: string;
  vpnIp?: string;
  siteLabel?: string;
}

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1.1 };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const phaseTitles: Record<PacketEncapsulationPhase, string> = {
  route: "ПУТЬ ЗАПРОСА · К VPN",
  pack: "ИНКАПСУЛЯЦИЯ · ПАКЕТ В ПАКЕТЕ",
  transit: "ВНЕШНИЙ ЗАГОЛОВОК · ДО VPN",
  unwrap: "VPN-СЕРВЕР · ОБОЛОЧКА СНЯТА",
  exit: "САЙТ ВИДИТ · АДРЕС VPN",
};

const phaseIcons: Record<PacketEncapsulationPhase, string> = {
  route: "route",
  pack: "layers",
  transit: "package",
  unwrap: "package-open",
  exit: "globe",
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
      borderRadius: 26,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 38px ${color}1C`,
      opacity,
    }}
  >
    {children}
  </div>
);

const Header: React.FC<{ phase: PacketEncapsulationPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      // Keep the phase label below the shared SceneHeading (y=195..~265)
      // while leaving a clear gap before the diagram starts at y=430+.
      top: 320,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: theme.subtext,
      fontSize: 24,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcons[phase]} size={30} color={phase === "exit" ? theme.success : theme.accent2} strokeWidth={1.8} />
    <span>{phaseTitles[phase]}</span>
  </div>
);

const Caption: React.FC<{ text: string; color: string; opacity: number }> = ({ text, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
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

const NodeCard: React.FC<{
  left: number;
  top: number;
  width?: number;
  height?: number;
  icon: string;
  label: string;
  detail?: string;
  color: string;
  opacity: number;
}> = ({ left, top, width = 240, height = 220, icon, label, detail, color, opacity }) => (
  <Panel left={left} top={top} width={width} height={height} color={color} opacity={opacity}>
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <IconGlyph name={icon} size={48} color={color} strokeWidth={1.8} />
      <div style={{ color: theme.text, fontSize: 25, fontWeight: 800, whiteSpace: "nowrap" }}>{label}</div>
      {detail ? <div style={{ color, fontSize: 18, whiteSpace: "nowrap", ...mono }}>{detail}</div> : null}
    </div>
  </Panel>
);

const Packet: React.FC<{
  left: number;
  top: number;
  width?: number;
  label: string;
  detail?: string;
  color: string;
  opacity: number;
  dashed?: boolean;
}> = ({ left, top, width = 220, label, detail, color, opacity, dashed = false }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      minHeight: 92,
      boxSizing: "border-box",
      borderRadius: 20,
      border: `3px ${dashed ? "dashed" : "solid"} ${color}`,
      background: `${color}20`,
      boxShadow: `0 0 30px ${color}32`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      color,
      opacity,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 22, ...mono }}>
      <IconGlyph name="package" size={24} color={color} strokeWidth={1.8} />
      {label}
    </div>
    {detail ? <div style={{ color: theme.text, fontSize: 18, ...mono }}>{detail}</div> : null}
  </div>
);

const Line: React.FC<{ left: number; top: number; width: number; color: string; opacity: number; reverse?: boolean }> = ({ left, top, width, color, opacity, reverse = false }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height: 4,
      borderTop: `4px ${reverse ? "dotted" : "dashed"} ${color}99`,
      opacity,
    }}
  />
);

export const PacketEncapsulationVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "route",
  clientIp = "198.51.100.24",
  vpnIp = "203.0.113.9",
  siteLabel = "САЙТ",
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const routeP = smooth((local - impactLocal) / 26);

  const shellDetail = `IP: ${vpnIp}`;
  const innerDetail = `IP: ${clientIp}`;

  return (
    <div style={{ position: "relative", width: W, height: 1200, overflow: "hidden" }}>
      <Header phase={phase} opacity={enter} />

      {phase === "route" ? (
        <>
          <MotionGroup id="client" index={0}>
            <NodeCard left={60} top={470} icon="smartphone" label="УСТРОЙСТВО" detail={clientIp} color={theme.accent} opacity={enter} />
          </MotionGroup>
          <MotionGroup id="vpn" index={1}>
            <NodeCard left={420} top={455} width={260} height={250} icon="server" label="VPN-СЕРВЕР" detail={vpnIp} color={theme.accent2} opacity={enter} />
          </MotionGroup>
          <MotionGroup id="site" index={2}>
            <NodeCard left={800} top={470} icon="globe" label={siteLabel} detail="назначение" color={theme.success} opacity={enter} />
          </MotionGroup>
          <Line left={300} top={585} width={120} color={theme.accent} opacity={enter} />
          <Line left={680} top={585} width={120} color={theme.accent2} opacity={enter * 0.8} />
          <MotionGroup id="route-packet" index={3} action={{ preset: "transfer", cue: "route", from: { x: 0, y: 0 }, to: { x: 120, y: 0 } }}>
            <Packet left={190} top={635} label="ЗАПРОС" detail="в путь" color={theme.accent} opacity={enter * (0.55 + routeP * 0.45)} />
          </MotionGroup>
          <Caption text="УСТРОЙСТВО → VPN → САЙТ" color={theme.accent2} opacity={enter} />
          <PulseRing x={550} y={585} triggerFrame={impactLocal} tone="accent2" size={180} />
        </>
      ) : null}

      {phase === "pack" ? (
        <>
          <MotionGroup id="outer-packet" index={0} action={{ preset: "pulse", cue: "seal" }}>
            <div style={{ position: "absolute", left: 120, top: 430, width: 840, height: 410, borderRadius: 32, border: `4px solid ${theme.accent2}`, background: `${theme.accent2}0D`, boxShadow: `0 0 48px ${theme.accent2}2A`, opacity: enter }}>
              <div style={{ position: "absolute", left: 30, top: 28, color: theme.accent2, fontSize: 22, ...mono }}>ВНЕШНИЙ ЗАГОЛОВОК</div>
              <div style={{ position: "absolute", right: 30, top: 28, color: theme.accent2, fontSize: 21, ...mono }}>IP: {vpnIp}</div>
              <div style={{ position: "absolute", left: 28, right: 28, top: 84, borderTop: `2px dashed ${theme.accent2}77` }} />
              <div style={{ position: "absolute", left: 28, right: 28, bottom: 28, color: theme.subtext, fontSize: 20, textAlign: "center", ...mono }}>ОБОЛОЧКА МАРШРУТИЗИРУЕТСЯ ДО VPN</div>
            </div>
          </MotionGroup>
          <MotionGroup id="inner-packet" index={1} action={{ preset: "transfer", cue: "pack", from: { x: -140, y: 0 }, to: { x: 0, y: 0 } }}>
            <Packet left={265} top={585} width={550} label="ВНУТРЕННИЙ IP-ПАКЕТ" detail={innerDetail} color={theme.accent} opacity={enter} dashed />
          </MotionGroup>
          <div style={{ position: "absolute", left: W / 2, top: 890, transform: "translateX(-50%)", color: theme.text, fontSize: 29, ...mono, opacity: enter * (0.45 + reveal * 0.55), whiteSpace: "nowrap" }}>
            ПАКЕТ  ⊂  ПАКЕТ
          </div>
          <Caption text="ВНУТРЕННИЙ ЗАГОЛОВОК СОХРАНЁН" color={theme.accent} opacity={enter} />
          <PulseRing x={W / 2} y={635} triggerFrame={impactLocal} tone="accent" size={210} />
        </>
      ) : null}

      {phase === "transit" ? (
        <>
          <MotionGroup id="client" index={0}>
            <NodeCard left={50} top={480} icon="smartphone" label="УСТРОЙСТВО" detail={clientIp} color={theme.accent} opacity={enter} />
          </MotionGroup>
          <MotionGroup id="vpn" index={1}>
            <NodeCard left={410} top={445} width={270} height={260} icon="server" label="VPN-СЕРВЕР" detail={vpnIp} color={theme.accent2} opacity={enter} />
          </MotionGroup>
          <MotionGroup id="site" index={2}>
            <NodeCard left={805} top={480} icon="globe" label={siteLabel} detail="ещё не видит" color={theme.subtext} opacity={enter * 0.66} />
          </MotionGroup>
          <Line left={290} top={595} width={120} color={theme.accent} opacity={enter} />
          <MotionGroup id="outer-packet" index={3} action={{ preset: "transfer", cue: "arrive", from: { x: 0, y: 0 }, to: { x: 130, y: 0 } }}>
            <Packet left={210} top={650} label="ВНЕШНИЙ IP" detail={shellDetail} color={theme.accent2} opacity={enter} />
          </MotionGroup>
          <Caption text="ВНЕШНИЙ ЗАГОЛОВОК → VPN" color={theme.accent2} opacity={enter} />
          <PulseRing x={540} y={595} triggerFrame={impactLocal} tone="accent2" size={190} />
        </>
      ) : null}

      {phase === "unwrap" ? (
        <>
          <MotionGroup id="vpn" index={0}>
            <NodeCard left={55} top={490} width={260} height={250} icon="server" label="VPN-СЕРВЕР" detail={vpnIp} color={theme.accent2} opacity={enter} />
          </MotionGroup>
          <MotionGroup id="shell" index={1} action={{ preset: "depart", cue: "open", from: { x: 0, y: 0 }, to: { x: 110, y: -40 } }}>
            <Packet left={350} top={535} width={250} label="ОБОЛОЧКА" detail="снять" color={theme.warning} opacity={enter} />
          </MotionGroup>
          <MotionGroup id="site" index={2}>
            <NodeCard left={805} top={490} icon="globe" label={siteLabel} detail="получает запрос" color={theme.success} opacity={enter} />
          </MotionGroup>
          <Line left={315} top={645} width={490} color={theme.success} opacity={enter} />
          <MotionGroup id="inner-packet" index={3} action={{ preset: "transfer", cue: "forward", from: { x: -35, y: 0 }, to: { x: 170, y: 0 } }}>
            <Packet left={400} top={690} width={300} label="ВНУТР. IP" detail={innerDetail} color={theme.accent} opacity={enter} />
          </MotionGroup>
          <Caption text="ОБОЛОЧКА СНЯТА · ПАКЕТ ИДЁТ ДАЛЬШЕ" color={theme.warning} opacity={enter * (0.55 + reveal * 0.45)} />
          <PulseRing x={495} y={645} triggerFrame={impactLocal} tone="warning" size={190} />
        </>
      ) : null}

      {phase === "exit" ? (
        <>
          <MotionGroup id="vpn" index={0}>
            <NodeCard left={95} top={485} width={270} height={250} icon="server" label="VPN-СЕРВЕР" detail={vpnIp} color={theme.accent2} opacity={enter} />
          </MotionGroup>
          <MotionGroup id="site" index={1}>
            <NodeCard left={745} top={455} width={280} height={310} icon="globe" label={siteLabel} detail={`источник: ${vpnIp}`} color={theme.success} opacity={enter} />
          </MotionGroup>
          <Line left={365} top={610} width={380} color={theme.success} opacity={enter} />
          <MotionGroup id="outbound-packet" index={2} action={{ preset: "transfer", cue: "return", from: { x: 0, y: 0 }, to: { x: 160, y: 0 } }}>
            <Packet left={405} top={665} width={290} label="ЗАПРОС К САЙТУ" detail={`source: ${vpnIp}`} color={theme.success} opacity={enter} />
          </MotionGroup>
          <Caption text="САЙТ ВИДИТ АДРЕС VPN-СЕРВЕРА" color={theme.success} opacity={enter * (0.55 + reveal * 0.45)} />
          <PulseRing x={885} y={610} triggerFrame={impactLocal} tone="success" size={220} />
        </>
      ) : null}
    </div>
  );
};

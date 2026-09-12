import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";
import { MotionGroup, useMotion } from "../lib/motion/MotionStage";

export type CookieTicketPhase = "symptom" | "versus" | "set" | "return" | "lookup";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: CookieTicketPhase;
  ticket?: string;
  siteLabel?: string;
  basketLabel?: string;
}

const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.1,
};

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  children: React.ReactNode;
}> = ({ left, top, width, height, color, children }) => (
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
      boxShadow: `0 0 38px ${color}1A`,
    }}
  >
    {children}
  </div>
);

const PanelTitle: React.FC<{ icon: string; text: string; color: string }> = ({ icon, text, color }) => (
  <div style={{ position: "absolute", left: 24, top: 22, display: "flex", alignItems: "center", gap: 11, color, fontSize: 20, whiteSpace: "nowrap", ...mono }}>
    <IconGlyph name={icon} size={31} color={color} strokeWidth={1.8} />
    <span>{text}</span>
  </div>
);

const Caption: React.FC<{ text: string; color?: string }> = ({ text, color = theme.accent2 }) => (
  <div
    style={{
      position: "absolute",
      left: layout.width / 2,
      top: 1195,
      transform: "translateX(-50%)",
      padding: "13px 28px",
      borderRadius: 999,
      background: `${color}18`,
      border: `2px solid ${color}88`,
      color,
      fontSize: 22,
      whiteSpace: "nowrap",
      boxShadow: `0 0 28px ${color}1A`,
      ...mono,
    }}
  >
    {text}
  </div>
);

const Arrow: React.FC<{ x1: number; x2: number; y: number; color: string; opacity?: number }> = ({ x1, x2, y, color, opacity = 1 }) => (
  <svg width={layout.width} height={layout.height} style={{ position: "absolute", inset: 0, overflow: "visible", opacity }}>
    <path d={`M ${x1} ${y} L ${x2 - 18} ${y}`} fill="none" stroke={`${color}99`} strokeWidth={4} strokeDasharray="12 16" />
    <path d={`M ${x2 - 18} ${y - 11} L ${x2} ${y} L ${x2 - 18} ${y + 11}`} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Token: React.FC<{ x: number; y: number; label: string; color: string; opacity?: number; icon?: string }> = ({ x, y, label, color, opacity = 1, icon = "key-round" }) => (
  <div
    data-motion-shape
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: "translate(-50%, -50%)",
      display: "flex",
      alignItems: "center",
      gap: 9,
      padding: "11px 17px",
      borderRadius: 999,
      background: `${color}24`,
      border: `2px solid ${color}`,
      color,
      fontSize: 18,
      whiteSpace: "nowrap",
      opacity,
      boxShadow: `0 0 24px ${color}44`,
      ...mono,
    }}
  >
    <IconGlyph name={icon} size={23} color={color} strokeWidth={1.8} />
    <span>{label}</span>
  </div>
);

const CartRow: React.FC<{ left: number; top: number; width: number; color: string; label: string; glow?: number }> = ({ left, top, width, color, label, glow = 1 }) => (
  <div
    data-motion-shape
    style={{
      position: "absolute",
      left,
      top,
      width,
      height: 104,
      boxSizing: "border-box",
      borderRadius: 18,
      background: `${color}${Math.round(18 + 28 * glow).toString(16).padStart(2, "0")}`,
      border: `2px solid ${color}${Math.round(55 + 70 * glow).toString(16).padStart(2, "0")}`,
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "0 20px",
      color,
      fontSize: 21,
      ...mono,
      boxShadow: `0 0 ${12 + 24 * glow}px ${color}${Math.round(18 + 30 * glow).toString(16).padStart(2, "0")}`,
    }}
  >
    <IconGlyph name="shopping-basket" size={34} color={color} strokeWidth={1.8} />
    <span>{label}</span>
  </div>
);

const BrowserPanel: React.FC<{ left: number; top: number; width?: number; height?: number; children?: React.ReactNode }> = ({ left, top, width = 320, height = 430, children }) => (
  <Panel left={left} top={top} width={width} height={height} color={theme.accent}>
    <PanelTitle icon="globe-2" text="БРАУЗЕР" color={theme.accent} />
    <div style={{ position: "absolute", left: 26, right: 26, top: 93, height: 3, background: `${theme.accent}55` }} />
    {children}
  </Panel>
);

const ServerPanel: React.FC<{ left: number; top: number; width?: number; height?: number; children?: React.ReactNode }> = ({ left, top, width = 360, height = 430, children }) => (
  <Panel left={left} top={top} width={width} height={height} color={theme.accent2}>
    <PanelTitle icon="server" text="СЕРВЕР" color={theme.accent2} />
    <div style={{ position: "absolute", left: 26, right: 26, top: 93, height: 3, background: `${theme.accent2}55` }} />
    {children}
  </Panel>
);

const KeyRow: React.FC<{ left: number; top: number; width: number; ticket: string; color?: string; opacity?: number }> = ({ left, top, width, ticket, color = theme.warning, opacity = 1 }) => (
  <div style={{ position: "absolute", left, top, width, height: 94, borderRadius: 16, border: `2px solid ${color}77`, background: `${color}12`, opacity, padding: "17px 18px", boxSizing: "border-box" }}>
    <div style={{ color: theme.subtext, fontSize: 15, ...mono }}>ИДЕНТИФИКАТОР</div>
    <div style={{ marginTop: 7, color, fontSize: 25, ...mono }}>{ticket}</div>
  </div>
);

/** Параметрическая цепочка server state: Set-Cookie → маленький ключ → Cookie → запись. */
export const CookieTicketVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "symptom",
  ticket = "7F3A",
  siteLabel = "МАГАЗИН",
  basketLabel = "КОРЗИНА",
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const motion = useMotion();

  if (phase === "symptom") {
    const place = motion.action("place");
    return (
      <>
        <MotionGroup id="browser" index={0} action={{ preset: "pulse", cue: "return" }}>
          <BrowserPanel left={62} top={430}>
            <div style={{ position: "absolute", left: 25, right: 25, top: 133, color: theme.subtext, fontSize: 17, ...mono }}>ВОЗВРАТ В {siteLabel}</div>
            <CartRow left={25} top={205} width={270} color={theme.accent} label={basketLabel} />
          </BrowserPanel>
        </MotionGroup>
        <MotionGroup id="record" index={1} action={{ preset: "pulse", cue: "place" }}>
          <ServerPanel left={620} top={430}>
            <div style={{ position: "absolute", left: 25, right: 25, top: 133, color: theme.subtext, fontSize: 17, ...mono }}>ЗАПИСЬ СОХРАНЕНА</div>
            <CartRow left={25} top={205} width={310} color={theme.accent2} label={basketLabel} glow={0.35 + 0.65 * place} />
          </ServerPanel>
        </MotionGroup>
        <Arrow x1={390} x2={620} y={680} color={theme.success} opacity={enter} />
        <Caption text="ПАМЯТЬ — В ЗАПИСИ" color={theme.success} />
        <PulseRing x={790} y={680} triggerFrame={impactLocal} tone="success" size={210} />
      </>
    );
  }

  if (phase === "versus") {
    return (
      <>
        <MotionGroup id="request-a" index={0} action={{ preset: "recoil", cue: "without", to: { x: -24, y: 0 } }}>
          <Panel left={50} top={390} width={460} height={590} color={theme.danger}>
            <PanelTitle icon="circle-x" text="БЕЗ КЛЮЧА" color={theme.danger} />
            <div style={{ position: "absolute", left: 30, top: 138, color: theme.subtext, fontSize: 17, ...mono }}>НОВЫЙ ЗАПРОС</div>
            <Token x={240} y={530} label="ПУСТО" color={theme.danger} icon="shopping-basket" />
            <div style={{ position: "absolute", left: 30, right: 30, top: 465, height: 2, background: `${theme.danger}55` }} />
            <div style={{ position: "absolute", left: 30, right: 30, top: 505, textAlign: "center", color: theme.danger, fontSize: 18, ...mono }}>КОРЗИНА НЕ НАЙДЕНА</div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="request-b" index={1} action={{ preset: "transfer", cue: "with", to: { x: 24, y: 0 } }}>
          <Panel left={570} top={390} width={460} height={590} color={theme.success}>
            <PanelTitle icon="key-round" text="С КЛЮЧОМ" color={theme.success} />
            <div style={{ position: "absolute", left: 30, top: 138, color: theme.subtext, fontSize: 17, ...mono }}>ТОТ ЖЕ САЙТ</div>
            <KeyRow left={30} top={190} width={400} ticket={ticket} color={theme.success} />
            <MotionGroup id="result" index={2} action={{ preset: "pulse", cue: "found" }}>
              <CartRow left={30} top={360} width={400} color={theme.success} label={basketLabel} />
            </MotionGroup>
          </Panel>
        </MotionGroup>
        <div style={{ position: "absolute", left: layout.width / 2, top: 365, bottom: 1000, width: 2, background: `${theme.subtext}44` }} />
        <Caption text="ОДИН САЙТ · ДВА ИСХОДА" color={theme.warning} />
        <PulseRing x={800} y={740} triggerFrame={impactLocal} tone="success" size={230} />
      </>
    );
  }

  if (phase === "set") {
    const response = motion.action("respond");
    const saved = motion.action("save");
    return (
      <>
        <MotionGroup id="server" index={0}>
          <ServerPanel left={58} top={430} width={350}>
            <div style={{ position: "absolute", left: 25, right: 25, top: 135, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>ОТВЕТ СЕРВЕРА</div>
            <div style={{ position: "absolute", left: 25, right: 25, top: 214, textAlign: "center", color: theme.accent2, fontSize: 26, ...mono }}>ЗАПИСЬ · {basketLabel}</div>
          </ServerPanel>
        </MotionGroup>
        <MotionGroup id="browser" index={1}>
          <BrowserPanel left={672} top={430} width={350}>
            <div style={{ position: "absolute", left: 25, right: 25, top: 135, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>МАЛЕНЬКАЯ СТРОКА</div>
          </BrowserPanel>
        </MotionGroup>
        <Arrow x1={408} x2={672} y={680} color={theme.warning} opacity={enter} />
        <MotionGroup id="response" index={2} action={{ preset: "transfer", cue: "respond", from: { x: -315, y: 0 }, to: { x: 315, y: 0 } }}>
          <Token x={540} y={680} label="Set-Cookie" color={theme.warning} icon="arrow-right" opacity={0.45 + 0.55 * response} />
        </MotionGroup>
        <MotionGroup id="key" index={3} action={{ preset: "pulse", cue: "save" }}>
          <KeyRow left={697} top={635} width={300} ticket={ticket} color={theme.warning} opacity={0.35 + 0.65 * saved} />
        </MotionGroup>
        <Caption text="КЛЮЧ, НЕ КОРЗИНА" color={theme.warning} />
        <PulseRing x={847} y={680} triggerFrame={impactLocal} tone="warning" size={220} />
      </>
    );
  }

  if (phase === "return") {
    const suitable = motion.action("suitable");
    const lookup = motion.action("lookup");
    return (
      <>
        <MotionGroup id="browser" index={0}>
          <BrowserPanel left={38} top={445} width={285} height={405}>
            <div style={{ position: "absolute", left: 24, right: 24, top: 135, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>ЗАПРОС</div>
            <KeyRow left={24} top={205} width={237} ticket={ticket} color={theme.accent} />
          </BrowserPanel>
        </MotionGroup>
        <MotionGroup id="gate" index={1} action={{ preset: "pulse", cue: "suitable" }}>
          <Panel left={365} top={395} width={300} height={505} color={suitable > 0.01 ? theme.success : theme.warning}>
            <PanelTitle icon="shield-check" text="ФИЛЬТР" color={suitable > 0.01 ? theme.success : theme.warning} />
            <div style={{ position: "absolute", left: 25, right: 25, top: 145, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>ДОМЕН + ПУТЬ</div>
            <div style={{ position: "absolute", left: 25, right: 25, top: 260, textAlign: "center", color: suitable > 0.01 ? theme.success : theme.warning, fontSize: 25, ...mono }}>{suitable > 0.01 ? "ПОДХОДИТ" : "ПРОВЕРКА"}</div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="key" index={2} action={{ preset: "transfer", cue: "add", from: { x: -355, y: 0 }, to: { x: 355, y: 0 } }}>
          <Token x={540} y={685} label="Cookie" color={theme.accent} icon="key-round" />
        </MotionGroup>
        <MotionGroup id="record" index={3} action={{ preset: "pulse", cue: "lookup" }}>
          <ServerPanel left={755} top={445} width={285} height={405}>
            <div style={{ position: "absolute", left: 24, right: 24, top: 135, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>ПОИСК ПО КЛЮЧУ</div>
            <CartRow left={24} top={205} width={237} color={theme.accent2} label={`${ticket} → ${basketLabel}`} glow={0.3 + 0.7 * lookup} />
          </ServerPanel>
        </MotionGroup>
        <Arrow x1={323} x2={755} y={685} color={theme.accent} opacity={enter} />
        <Caption text="ТОЛЬКО ПОДХОДЯЩИЙ ПУТЬ" color={theme.success} />
        <PulseRing x={900} y={685} triggerFrame={impactLocal} tone="success" size={190} />
      </>
    );
  }

  const bind = motion.action("bind");
  const found = motion.action("found");
  const requestY = 520 - 34 * bind;
  return (
    <>
      <MotionGroup id="browser" index={0}>
        <BrowserPanel left={55} top={390} width={360} height={570}>
          <div style={{ position: "absolute", left: 25, right: 25, top: 137, color: theme.subtext, fontSize: 17, ...mono }}>НОВЫЙ ЗАПРОС</div>
          <KeyRow left={25} top={200} width={310} ticket={ticket} color={theme.accent} />
          <CartRow left={25} top={390} width={310} color={theme.success} label={basketLabel} glow={found} />
        </BrowserPanel>
      </MotionGroup>
      <MotionGroup id="key" index={1} action={{ preset: "transfer", cue: "bind", from: { x: -110, y: 50 }, to: { x: 300, y: 150 } }}>
        <Token x={420} y={requestY + 45} label={ticket} color={theme.warning} icon="key-round" />
      </MotionGroup>
      <MotionGroup id="record" index={2} action={{ preset: "pulse", cue: "found" }}>
        <ServerPanel left={620} top={390} width={405} height={570}>
          <div style={{ position: "absolute", left: 25, right: 25, top: 137, color: theme.subtext, fontSize: 17, ...mono }}>СТАРАЯ ЗАПИСЬ</div>
          <CartRow left={25} top={215} width={355} color={theme.accent2} label={`${ticket} → ${basketLabel}`} glow={0.3 + 0.7 * found} />
          <div style={{ position: "absolute", left: 25, right: 25, top: 390, textAlign: "center", color: theme.success, fontSize: 19, ...mono, opacity: 0.4 + 0.6 * found }}>ЗАПИСЬ НАЙДЕНА</div>
        </ServerPanel>
      </MotionGroup>
      <Arrow x1={415} x2={620} y={650} color={theme.warning} opacity={enter} />
      <Caption text="КЛЮЧ СВЯЗЫВАЕТ ДВА МОМЕНТА" color={theme.success} />
      <PulseRing x={820} y={650} triggerFrame={impactLocal} tone="success" size={240} />
    </>
  );
};

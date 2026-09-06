import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type WifiLoginPhase = "enter" | "air";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: WifiLoginPhase;
}

const W = layout.width;
const CX = W / 2;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1.4 };

const Header: React.FC<{ title: string; icon: string; color?: string; opacity: number }> = ({
  title,
  icon,
  color = theme.accent,
  opacity,
}) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 235,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: theme.subtext,
      fontSize: 25,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    <IconGlyph name={icon} size={31} color={color} strokeWidth={1.8} />
    <span>{title}</span>
  </div>
);

const Pill: React.FC<{
  left: number;
  top: number;
  text: string;
  color: string;
  opacity?: number;
  fontSize?: number;
}> = ({ left, top, text, color, opacity = 1, fontSize = 22 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      transform: "translateX(-50%)",
      padding: "11px 24px",
      borderRadius: 999,
      background: `${color}18`,
      border: `2px solid ${color}99`,
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

const DeviceCard: React.FC<{
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
      borderRadius: 28,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 36px ${color}18`,
      opacity,
    }}
  >
    {children}
  </div>
);

const FooterBadge: React.FC<{ text: string; color: string; opacity: number }> = ({ text, color, opacity }) => (
  <Pill left={CX} top={1240} text={text} color={color} opacity={opacity} fontSize={23} />
);

/** Бытовой вход в Wi‑Fi: пароль вводится на телефоне, а в эфир уходят только радиокадры. */
export const WifiLoginVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "enter" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const progress = smooth(local / Math.max(impactLocal, 1));
  const hit = local >= impactLocal;
  const post = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;

  if (phase === "enter") {
    const buttonColor = hit ? theme.success : theme.accent;
    return (
      <>
        <Header title="ОБЫЧНЫЙ ВХОД · ПАРОЛЬ НА ТЕЛЕФОНЕ" icon="wifi" opacity={enter} />
        <DeviceCard left={92} top={390} width={430} height={700} color={theme.accent} opacity={enter}>
          <div style={{ position: "absolute", left: 32, top: 28, color: theme.subtext, fontSize: 20, ...mono }}>
            НАСТРОЙКИ · WI‑FI
          </div>
          <div style={{ position: "absolute", left: 46, top: 104, color: theme.text, fontSize: 35, fontWeight: 800 }}>
            HOME_5G
          </div>
          <div style={{ position: "absolute", left: 46, top: 176, color: theme.subtext, fontSize: 20, ...mono }}>
            ПАРОЛЬ
          </div>
          <div
            style={{
              position: "absolute",
              left: 42,
              top: 218,
              width: 346,
              height: 72,
              borderRadius: 14,
              background: theme.bg,
              border: `2px solid ${theme.panelBorder}`,
              color: theme.text,
              fontSize: 31,
              letterSpacing: 8,
              padding: "15px 18px",
              boxSizing: "border-box",
              ...mono,
            }}
          >
            ••••••••
          </div>
          <div
            style={{
              position: "absolute",
              left: 42,
              top: 336,
              width: 346,
              height: 78,
              borderRadius: 18,
              background: `${buttonColor}20`,
              border: `3px solid ${buttonColor}`,
              color: buttonColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              transform: `scale(${0.94 + post * 0.06})`,
              ...mono,
            }}
          >
            {hit ? "ПОДКЛЮЧЕНО" : "ПОДКЛЮЧИТЬ"}
          </div>
          <div style={{ position: "absolute", left: 42, top: 470, color: theme.subtext, fontSize: 20, ...mono }}>
            ввод локальный
          </div>
          <div style={{ position: "absolute", left: 42, top: 510, color: theme.success, fontSize: 22, ...mono }}>
            {hit ? "пароль не покидает экран" : "секрет ещё здесь"}
          </div>
        </DeviceCard>

        <DeviceCard left={645} top={510} width={340} height={350} color={theme.accent2} opacity={enter}>
          <div style={{ position: "absolute", left: 0, top: 38, width: "100%", textAlign: "center" }}>
            <IconGlyph name="router" size={76} color={theme.accent2} strokeWidth={1.8} />
          </div>
          <div style={{ position: "absolute", left: 0, top: 143, width: "100%", textAlign: "center", color: theme.text, fontSize: 30, fontWeight: 800 }}>
            РОУТЕР
          </div>
          <div style={{ position: "absolute", left: 0, top: 204, width: "100%", textAlign: "center", color: theme.subtext, fontSize: 20, ...mono }}>
            ждёт вход
          </div>
          <div style={{ position: "absolute", left: 0, top: 258, width: "100%", textAlign: "center", color: theme.accent2, fontSize: 18, ...mono }}>
            HOME_5G
          </div>
        </DeviceCard>

        <div
          style={{
            position: "absolute",
            left: 540,
            top: 720,
            width: 90,
            borderTop: `3px dashed ${theme.panelBorder}`,
            opacity: enter * progress,
          }}
        />
        <div style={{ position: "absolute", left: 585, top: 684, opacity: enter * progress }}>
          <IconGlyph name="arrow-right" size={38} color={theme.accent} strokeWidth={1.8} />
        </div>
        <FooterBadge text={hit ? "ВХОД ПРИНЯТ · СЕКРЕТ ЛОКАЛЕН" : "ПАРОЛЬ ВВОДИТСЯ ЛОКАЛЬНО"} color={buttonColor} opacity={enter} />
        {hit ? <PulseRing x={815} y={685} triggerFrame={impactLocal} tone="success" size={180} /> : null}
      </>
    );
  }

  const wave = smooth(clamp01((local - 8) / 28));
  const pulseX = interpolate(wave, [0, 1], [395, 690]);
  return (
    <>
      <Header title="В ЭФИРЕ · РАДИОКАДРЫ, НЕ ПАРОЛЬ" icon="radio" color={theme.warning} opacity={enter} />
      <DeviceCard left={92} top={505} width={275} height={330} color={theme.accent} opacity={enter}>
        <div style={{ position: "absolute", left: 0, top: 45, width: "100%", textAlign: "center" }}>
          <IconGlyph name="smartphone" size={74} color={theme.accent} strokeWidth={1.8} />
        </div>
        <div style={{ position: "absolute", left: 0, top: 150, width: "100%", textAlign: "center", color: theme.text, fontSize: 28, fontWeight: 800 }}>
          ТЕЛЕФОН
        </div>
        <div style={{ position: "absolute", left: 0, top: 216, width: "100%", textAlign: "center", color: theme.accent, fontSize: 18, ...mono }}>
          HOME_5G
        </div>
      </DeviceCard>
      <DeviceCard left={713} top={505} width={275} height={330} color={theme.accent2} opacity={enter}>
        <div style={{ position: "absolute", left: 0, top: 45, width: "100%", textAlign: "center" }}>
          <IconGlyph name="router" size={74} color={theme.accent2} strokeWidth={1.8} />
        </div>
        <div style={{ position: "absolute", left: 0, top: 150, width: "100%", textAlign: "center", color: theme.text, fontSize: 28, fontWeight: 800 }}>
          РОУТЕР
        </div>
        <div style={{ position: "absolute", left: 0, top: 216, width: "100%", textAlign: "center", color: theme.accent2, fontSize: 18, ...mono }}>
          RADIO
        </div>
      </DeviceCard>

      <svg width={W} height={layout.height} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: enter * wave }}>
        <path d="M 370 630 C 470 490, 610 490, 710 630" fill="none" stroke={`${theme.warning}88`} strokeWidth="5" strokeDasharray="14 18" />
        <path d="M 370 690 C 470 830, 610 830, 710 690" fill="none" stroke={`${theme.accent2}66`} strokeWidth="3" strokeDasharray="8 18" />
        <circle cx={pulseX} cy={630 - Math.sin(wave * Math.PI) * 140} r="13" fill={theme.warning} />
      </svg>

      <div style={{ position: "absolute", left: CX, top: 915, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 16, opacity: enter }}>
        <IconGlyph name="radio" size={34} color={theme.warning} strokeWidth={1.8} />
        <span style={{ color: theme.warning, fontSize: 23, ...mono }}>EAPOL · РАДИОКАДРЫ</span>
      </div>
      <DeviceCard left={340} top={1000} width={400} height={150} color={theme.danger} opacity={enter}>
        <div style={{ position: "absolute", left: 40, top: 40 }}><IconGlyph name="eye" size={48} color={theme.danger} strokeWidth={1.8} /></div>
        <div style={{ position: "absolute", left: 112, top: 35, color: theme.danger, fontSize: 23, ...mono }}>СОСЕД СЛУШАЕТ</div>
        <div style={{ position: "absolute", left: 112, top: 80, color: theme.subtext, fontSize: 20, ...mono }}>видит кадры, не пароль</div>
      </DeviceCard>
      <div style={{ position: "absolute", left: CX, top: 1176, transform: "translateX(-50%)", color: theme.danger, fontSize: 26, textDecoration: "line-through", ...mono, opacity: enter }}>
        ПАРОЛЬ В ЭФИРЕ
      </div>
      <FooterBadge text="В ЭФИРЕ · ТОЛЬКО ОБМЕН" color={theme.success} opacity={enter} />
      {local >= impactLocal ? <PulseRing x={CX} y={630} triggerFrame={impactLocal} tone="warning" size={190} /> : null}
    </>
  );
};

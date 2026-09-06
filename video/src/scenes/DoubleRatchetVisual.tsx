import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type DoubleRatchetPhase =
  | "message"
  | "ciphertext"
  | "derive"
  | "advance"
  | "encrypt"
  | "decrypt"
  | "server"
  | "metadata"
  | "backup";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: DoubleRatchetPhase;
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

const phaseTitle: Record<DoubleRatchetPhase, string> = {
  message: "СООБЩЕНИЕ · НА УСТРОЙСТВЕ",
  ciphertext: "СЕРВЕР ПОЛУЧАЕТ ШИФРТЕКСТ",
  derive: "ЦЕПОЧКА → КЛЮЧ СООБЩЕНИЯ",
  advance: "ОДНОРАЗОВЫЙ ЖЕТОН УШЁЛ",
  encrypt: "ОТПРАВИТЕЛЬ ЗАПИРАЕТ ТЕКСТ",
  decrypt: "ПОЛУЧАТЕЛЬ ОТКРЫВАЕТ ТЕКСТ",
  server: "ВЗЛОМАННАЯ БАЗА · КЛЮЧЕЙ НЕТ",
  metadata: "СЕРВЕР ВИДИТ МЕТАДАННЫЕ",
  backup: "РЕЗЕРВНАЯ КОПИЯ · ОТДЕЛЬНЫЙ СЛОЙ",
};

const phaseColor: Record<DoubleRatchetPhase, string> = {
  message: theme.accent,
  ciphertext: theme.danger,
  derive: theme.accent2,
  advance: theme.warning,
  encrypt: theme.accent,
  decrypt: theme.success,
  server: theme.danger,
  metadata: theme.warning,
  backup: theme.accent2,
};

const phaseIcon: Record<DoubleRatchetPhase, string> = {
  message: "message-square-text",
  ciphertext: "file-lock",
  derive: "key-round",
  advance: "refresh-cw",
  encrypt: "lock-keyhole",
  decrypt: "unlock-keyhole",
  server: "skull",
  metadata: "list",
  backup: "database-backup",
};

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  opacity?: number;
  children: React.ReactNode;
}> = ({ left, top, width, height, color, opacity = 1, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      padding: "24px 24px 20px",
      borderRadius: 26,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 42px ${color}22`,
      opacity,
    }}
  >
    {children}
  </div>
);

const PanelHeader: React.FC<{
  icon: string;
  label: string;
  color: string;
}> = ({ icon, label, color }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      color: theme.text,
      fontFamily: theme.font,
      fontWeight: 800,
      fontSize: 25,
      whiteSpace: "nowrap",
    }}
  >
    <IconGlyph name={icon} size={34} color={color} strokeWidth={1.8} />
    {label}
  </div>
);

const Label: React.FC<{
  text: string;
  color?: string;
  size?: number;
  opacity?: number;
}> = ({ text, color = theme.subtext, size = 18, opacity = 1 }) => (
  <div style={{ ...mono, color, fontSize: size, opacity, whiteSpace: "nowrap" }}>{text}</div>
);

const StatusPill: React.FC<{
  text: string;
  color: string;
  y: number;
  opacity: number;
  scale?: number;
}> = ({ text, color, y, opacity, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: y,
      transform: `translateX(-50%) scale(${scale})`,
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

const Link: React.FC<{
  left: number;
  top: number;
  width: number;
  color: string;
  opacity: number;
  dashed?: boolean;
}> = ({ left, top, width, color, opacity, dashed = false }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height: 4,
      opacity,
      background: dashed
        ? `repeating-linear-gradient(90deg, ${color}BB 0 18px, transparent 18px 32px)`
        : color,
      borderRadius: 4,
    }}
  >
    <div style={{ position: "absolute", right: -2, top: -14 }}>
      <IconGlyph
        name="arrow-right"
        size={32}
        color={color}
        strokeWidth={2}
        /* стрелка стоит на конце, а не создаёт отдельный смысловой узел */
      />
    </div>
  </div>
);

const Token: React.FC<{
  label: string;
  x: number;
  y: number;
  color: string;
  opacity?: number;
  active?: boolean;
  crossed?: boolean;
  shiftX?: number;
}> = ({ label, x, y, color, opacity = 1, active = false, crossed = false, shiftX = 0 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: 88,
      height: 58,
      transform: `translateX(${shiftX}px) scale(${active ? 1.08 : 1})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
      background: `${color}${active ? "2E" : "18"}`,
      border: `3px solid ${color}${active ? "DD" : "88"}`,
      boxShadow: active ? `0 0 28px ${color}66` : `0 0 18px ${color}20`,
      color: active ? theme.text : color,
      opacity,
      fontSize: 20,
      ...mono,
    }}
  >
    {label}
    {crossed ? (
      <div
        style={{
          position: "absolute",
          left: 8,
          right: 8,
          top: 26,
          height: 4,
          background: theme.danger,
          transform: "rotate(-16deg)",
          boxShadow: `0 0 12px ${theme.danger}`,
        }}
      />
    ) : null}
  </div>
);

const Chain: React.FC<{
  left: number;
  top: number;
  color: string;
  active?: number;
  consumed?: boolean;
  opacity?: number;
  shift?: number;
}> = ({ left, top, color, active = -1, consumed = false, opacity = 1, shift = 0 }) => (
  <div style={{ position: "absolute", left, top, width: 296, height: 112, opacity }}>
    <Label text="ЦЕПОЧКА" color={color} size={17} />
    <div
      style={{
        position: "absolute",
        left: 4,
        top: 71,
        width: 270,
        height: 3,
        background: `repeating-linear-gradient(90deg, ${color}99 0 14px, transparent 14px 24px)`,
      }}
    />
    {["К1", "К2", "К3"].map((item, i) => (
      <Token
        key={item}
        label={item}
        x={i * 94}
        y={30}
        color={i === 1 ? theme.accent2 : color}
        active={i === active}
        crossed={consumed && i === 0}
        opacity={consumed && i === 0 ? 0.58 : 1}
        shiftX={consumed && i > 0 ? -shift * (i === 1 ? 1 : 0.5) : 0}
      />
    ))}
  </div>
);

const MessageBubble: React.FC<{
  text: string;
  color: string;
  opacity?: number;
  scale?: number;
}> = ({ text, color, opacity = 1, scale = 1 }) => (
  <div
    style={{
      marginTop: 24,
      padding: "14px 20px",
      borderRadius: 20,
      background: `${color}1D`,
      border: `2px solid ${color}99`,
      color: theme.text,
      opacity,
      transform: `scale(${scale})`,
      fontFamily: theme.font,
      fontWeight: 700,
      fontSize: 25,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

const CipherCapsule: React.FC<{
  x: number;
  y: number;
  opacity?: number;
  color?: string;
  scale?: number;
}> = ({ x, y, opacity = 1, color = theme.danger, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: `translate(-50%, -50%) scale(${scale})`,
      padding: "13px 20px",
      borderRadius: 999,
      background: `${color}22`,
      border: `3px solid ${color}BB`,
      boxShadow: `0 0 32px ${color}44`,
      color,
      opacity,
      fontSize: 20,
      whiteSpace: "nowrap",
      ...mono,
    }}
  >
    7F · A2 · 91 · …
  </div>
);

const Header: React.FC<{ phase: DoubleRatchetPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 238,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: phaseColor[phase],
      opacity,
      whiteSpace: "nowrap",
      fontSize: 23,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={30} color={phaseColor[phase]} strokeWidth={1.8} />
    {phaseTitle[phase]}
  </div>
);

export const DoubleRatchetVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "message",
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({
    frame: Math.max(0, local - impactLocal),
    fps,
    config: { damping: 12, mass: 0.7 },
  });
  const flight = smooth((local - 8) / Math.max(impactLocal - 8, 1));
  const postImpact = local >= impactLocal;
  const common = { opacity: enter };

  if (phase === "message") {
    const packetX = interpolate(flight, [0, 1], [390, 695]);
    return (
      <div style={{ position: "relative", width: W, height: 1250, overflow: "hidden" }}>
        <Header phase={phase} opacity={enter} />
        <Panel left={56} top={418} width={330} height={350} color={theme.accent} {...common}>
          <PanelHeader icon="smartphone" label="Отправитель" color={theme.accent} />
          <MessageBubble text="я уже рядом" color={theme.accent} />
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <Label text="ТЕКСТ" color={theme.accent} size={18} />
          </div>
        </Panel>
        <Panel left={694} top={418} width={330} height={350} color={theme.accent2} {...common}>
          <PanelHeader icon="server" label="Сервер" color={theme.accent2} />
          <div style={{ marginTop: 38, textAlign: "center" }}>
            <IconGlyph name="database" size={70} color={theme.accent2} strokeWidth={1.6} />
            <Label text="ПЕРЕВОЗИТ" color={theme.subtext} size={18} />
          </div>
        </Panel>
        <Link left={380} top={592} width={320} color={theme.accent} opacity={enter * 0.7} />
        <div style={{ position: "absolute", left: packetX, top: 592, transform: "translate(-50%, -50%)" }}>
          <MessageBubble text="посылка" color={theme.accent} opacity={enter} scale={0.82} />
        </div>
        <StatusPill text="ТЕКСТ НА УСТРОЙСТВЕ" color={theme.accent} y={1088} opacity={enter} />
        {postImpact ? <PulseRing x={730} y={592} triggerFrame={impactLocal} tone="accent2" size={180} /> : null}
      </div>
    );
  }

  if (phase === "ciphertext") {
    const packetX = interpolate(flight, [0, 1], [388, 696]);
    return (
      <div style={{ position: "relative", width: W, height: 1250, overflow: "hidden" }}>
        <Header phase={phase} opacity={enter} />
        <Panel left={44} top={410} width={320} height={388} color={theme.accent} {...common}>
          <PanelHeader icon="smartphone" label="Отправитель" color={theme.accent} />
          <MessageBubble text="я уже рядом" color={theme.accent} />
          <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
            <IconGlyph name="lock-keyhole" size={42} color={theme.accent2} strokeWidth={1.8} />
          </div>
        </Panel>
        <Panel left={704} top={410} width={332} height={388} color={theme.danger} {...common}>
          <PanelHeader icon="server" label="Взломанный сервер" color={theme.danger} />
          <div style={{ marginTop: 32, display: "flex", justifyContent: "center" }}>
            <IconGlyph name="database" size={64} color={theme.danger} strokeWidth={1.6} />
          </div>
          <Label text="7F · A2 · 91 · …" color={theme.danger} size={21} />
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <IconGlyph name="skull" size={24} color={theme.danger} strokeWidth={1.8} />
            <Label text="НЕЧИТАЕМО" color={theme.danger} size={17} />
          </div>
        </Panel>
        <Link left={365} top={592} width={350} color={theme.danger} opacity={enter * 0.72} />
        <CipherCapsule x={packetX} y={592} opacity={enter} scale={0.84 + 0.16 * flight} />
        <StatusPill text="СЕРВЕР ВИДИТ ШИФРТЕКСТ" color={theme.danger} y={1092} opacity={enter} />
        {postImpact ? <PulseRing x={730} y={592} triggerFrame={impactLocal} tone="danger" size={200} /> : null}
      </div>
    );
  }

  if (phase === "derive") {
    return (
      <div style={{ position: "relative", width: W, height: 1250, overflow: "hidden" }}>
        <Header phase={phase} opacity={enter} />
        <Panel left={42} top={402} width={372} height={468} color={theme.accent} {...common}>
          <PanelHeader icon="smartphone" label="Отправитель" color={theme.accent} />
          <Chain left={38} top={126} color={theme.accent} active={0} />
          <div style={{ position: "absolute", left: 72, top: 290, display: "flex", alignItems: "center", gap: 10 }}>
            <IconGlyph name="key-round" size={32} color={theme.accent} strokeWidth={1.8} />
            <Label text="КЛЮЧ 1" color={theme.accent} size={22} />
          </div>
          <div style={{ position: "absolute", left: 112, top: 350 }}>
            <Label text="выводит сам" color={theme.subtext} size={17} />
          </div>
        </Panel>
        <Panel left={666} top={402} width={372} height={468} color={theme.accent2} {...common}>
          <PanelHeader icon="smartphone" label="Получатель" color={theme.accent2} />
          <Chain left={38} top={126} color={theme.accent2} active={0} />
          <div style={{ position: "absolute", left: 72, top: 290, display: "flex", alignItems: "center", gap: 10 }}>
            <IconGlyph name="key-round" size={32} color={theme.accent2} strokeWidth={1.8} />
            <Label text="КЛЮЧ 1" color={theme.accent2} size={22} />
          </div>
          <div style={{ position: "absolute", left: 112, top: 350 }}>
            <Label text="выводит сам" color={theme.subtext} size={17} />
          </div>
        </Panel>
        <div style={{ position: "absolute", left: CX, top: 570, transform: "translateX(-50%)", textAlign: "center", ...common }}>
          <IconGlyph name="lock-keyhole" size={36} color={theme.danger} strokeWidth={1.8} />
          <Label text="НЕ ЛЕТИТ" color={theme.danger} size={16} />
        </div>
        <StatusPill text="ОДИНАКОВЫЙ КЛЮЧ" color={theme.success} y={704} opacity={enter * reveal} scale={0.82 + 0.18 * reveal} />
        <StatusPill text="ОБА ВЫВЕЛИ КЛЮЧ 1" color={theme.success} y={1088} opacity={enter * reveal} scale={0.94 + 0.06 * reveal} />
        {postImpact ? (
          <>
            <PulseRing x={250} y={612} triggerFrame={impactLocal} tone="accent" size={160} />
            <PulseRing x={830} y={612} triggerFrame={impactLocal} tone="accent2" size={160} />
          </>
        ) : null}
      </div>
    );
  }

  if (phase === "advance") {
    const shift = smooth((local - impactLocal + 8) / 18);
    return (
      <div style={{ position: "relative", width: W, height: 1250, overflow: "hidden" }}>
        <Header phase={phase} opacity={enter} />
        <Panel left={54} top={408} width={972} height={488} color={theme.warning} {...common}>
          <PanelHeader icon="refresh-cw" label="Конвейер одноразовых жетонов" color={theme.warning} />
          <div style={{ position: "absolute", left: 60, top: 126 }}>
            <Label text="СООБЩЕНИЕ 1" color={theme.subtext} size={18} />
          </div>
          <Chain left={104} top={174} color={theme.accent} active={postImpact ? 1 : 0} consumed={postImpact} shift={shift * 22} />
          <div style={{ position: "absolute", left: 82, top: 360, display: "flex", alignItems: "center", gap: 12, opacity: enter }}>
            <IconGlyph name="package" size={36} color={theme.danger} strokeWidth={1.8} />
            <Label text="К1 → ПОСЫЛКА" color={theme.danger} size={20} />
          </div>
          <div style={{ position: "absolute", left: 520, top: 360, display: "flex", alignItems: "center", gap: 12, opacity: enter * reveal }}>
            <IconGlyph name="arrow-right" size={34} color={theme.success} strokeWidth={2} />
            <Label text="К2 СЛЕДУЕТ" color={theme.success} size={20} />
          </div>
        </Panel>
        <StatusPill text="К1 УШЁЛ · К2 ДАЛЬШЕ" color={theme.success} y={1088} opacity={enter * (0.4 + 0.6 * reveal)} scale={0.94 + 0.06 * reveal} />
        {postImpact ? <PulseRing x={520} y={612} triggerFrame={impactLocal} tone="success" size={210} /> : null}
      </div>
    );
  }

  if (phase === "encrypt") {
    const lockP = smooth((local - impactLocal + 10) / 18);
    const packetX = interpolate(flight, [0, 1], [392, 696]);
    return (
      <div style={{ position: "relative", width: W, height: 1250, overflow: "hidden" }}>
        <Header phase={phase} opacity={enter} />
        <Panel left={46} top={410} width={338} height={414} color={theme.accent} {...common}>
          <PanelHeader icon="smartphone" label="Отправитель" color={theme.accent} />
          <MessageBubble text="я уже рядом" color={theme.accent} opacity={1 - 0.35 * lockP} scale={1 - 0.08 * lockP} />
          <div style={{ marginTop: 30, display: "flex", justifyContent: "center" }}>
            <IconGlyph name="lock-keyhole" size={48} color={lockP > 0.5 ? theme.success : theme.accent2} strokeWidth={1.8} />
          </div>
          <Label text="КЛЮЧ 1" color={theme.accent2} size={19} />
        </Panel>
        <Panel left={696} top={410} width={338} height={414} color={theme.accent2} {...common}>
          <PanelHeader icon="server" label="Сервер" color={theme.accent2} />
          <div style={{ marginTop: 60, display: "flex", justifyContent: "center" }}>
            <IconGlyph name="database" size={68} color={theme.accent2} strokeWidth={1.6} />
          </div>
          <Label text="ждёт посылку" color={theme.subtext} size={18} />
        </Panel>
        <Link left={376} top={604} width={330} color={theme.danger} opacity={enter * lockP} />
        <CipherCapsule x={packetX} y={604} opacity={enter * lockP} scale={0.84 + 0.16 * flight} />
        <StatusPill text="ТЕКСТ ЗАПЕРТ" color={theme.success} y={1092} opacity={enter * reveal} />
        {postImpact ? <PulseRing x={730} y={604} triggerFrame={impactLocal} tone="danger" size={200} /> : null}
      </div>
    );
  }

  if (phase === "decrypt") {
    const openP = reveal;
    return (
      <div style={{ position: "relative", width: W, height: 1250, overflow: "hidden" }}>
        <Header phase={phase} opacity={enter} />
        <Panel left={46} top={410} width={338} height={414} color={theme.danger} {...common}>
          <PanelHeader icon="server" label="Сервер" color={theme.danger} />
          <div style={{ marginTop: 60, display: "flex", justifyContent: "center" }}>
            <IconGlyph name="database" size={68} color={theme.danger} strokeWidth={1.6} />
          </div>
          <Label text="7F · A2 · 91 · …" color={theme.danger} size={20} />
          <Label text="шифртекст" color={theme.danger} size={17} />
        </Panel>
        <Panel left={696} top={410} width={338} height={414} color={theme.success} {...common}>
          <PanelHeader icon="smartphone" label="Получатель" color={theme.success} />
          <div style={{ marginTop: 34, display: "flex", justifyContent: "center" }}>
            <IconGlyph name="key-round" size={38} color={theme.accent2} strokeWidth={1.8} />
          </div>
          <Label text="КЛЮЧ 1" color={theme.accent2} size={20} />
          <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
            <IconGlyph name={openP > 0.5 ? "lock-keyhole-open" : "lock-keyhole"} size={48} color={openP > 0.5 ? theme.success : theme.accent2} strokeWidth={1.8} />
          </div>
          <MessageBubble text="я уже рядом" color={theme.success} opacity={openP} scale={0.88 + 0.12 * openP} />
        </Panel>
        <Link left={376} top={604} width={330} color={theme.danger} opacity={enter * 0.78} />
        <CipherCapsule x={540} y={604} opacity={enter * (1 - openP)} />
        <StatusPill text="ТЕКСТ ОТКРЫТ НА УСТРОЙСТВЕ" color={theme.success} y={1092} opacity={enter * openP} />
        {postImpact ? <PulseRing x={820} y={604} triggerFrame={impactLocal} tone="success" size={210} /> : null}
      </div>
    );
  }

  if (phase === "server") {
    return (
      <div style={{ position: "relative", width: W, height: 1250, overflow: "hidden" }}>
        <Header phase={phase} opacity={enter} />
        <Panel left={54} top={408} width={448} height={488} color={theme.danger} {...common}>
          <PanelHeader icon="database" label="База сервера" color={theme.danger} />
          <div style={{ marginTop: 42, display: "flex", flexDirection: "column", gap: 15 }}>
            {["7F · A2 · 91", "3C · 10 · D8", "B4 · 7A · 02"].map((row) => (
              <div key={row} style={{ padding: "13px 16px", borderRadius: 14, background: `${theme.danger}16`, border: `2px solid ${theme.danger}66`, color: theme.danger, ...mono, fontSize: 20 }}>
                {row}
              </div>
            ))}
          </div>
          <Label text="ПОСЫЛКИ" color={theme.danger} size={18} />
        </Panel>
        <Panel left={578} top={408} width={448} height={488} color={theme.danger} {...common}>
          <PanelHeader icon="skull" label="Злоумышленник" color={theme.danger} />
          <div style={{ marginTop: 58, display: "flex", justifyContent: "center" }}>
            <IconGlyph name="eye" size={70} color={theme.danger} strokeWidth={1.6} />
          </div>
          <div style={{ marginTop: 34, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <IconGlyph name="key-round" size={32} color={theme.danger} strokeWidth={1.8} />
            <Label text="КЛЮЧЕЙ НЕТ" color={theme.danger} size={23} />
          </div>
        </Panel>
        <div style={{ position: "absolute", left: CX, top: 596, transform: "translateX(-50%)", ...common }}>
          <IconGlyph name="arrow-right" size={38} color={theme.danger} strokeWidth={2} />
        </div>
        <StatusPill text="ПОСЫЛКИ ЕСТЬ · КЛЮЧЕЙ НЕТ" color={theme.danger} y={1088} opacity={enter * reveal} />
        {postImpact ? <PulseRing x={802} y={650} triggerFrame={impactLocal} tone="danger" size={220} /> : null}
      </div>
    );
  }

  if (phase === "metadata") {
    const metadataP = reveal;
    return (
      <div style={{ position: "relative", width: W, height: 1250, overflow: "hidden" }}>
        <Header phase={phase} opacity={enter} />
        <Panel left={46} top={408} width={430} height={488} color={theme.danger} {...common}>
          <PanelHeader icon="database" label="Содержимое" color={theme.danger} />
          <div style={{ marginTop: 52, display: "flex", justifyContent: "center" }}>
            <CipherCapsule x={215} y={166} opacity={enter} scale={1.08} />
          </div>
          <div style={{ marginTop: 112, textAlign: "center" }}>
            <Label text="НЕЧИТАЕМО" color={theme.danger} size={21} />
          </div>
        </Panel>
        <Panel left={604} top={408} width={430} height={488} color={theme.warning} {...common}>
          <PanelHeader icon="list" label="Метаданные" color={theme.warning} />
          <div style={{ marginTop: 38, display: "flex", flexDirection: "column", gap: 18, opacity: metadataP }}>
            <Label text="КТО · АЛИНА" color={theme.accent} size={20} />
            <Label text="КОГДА · 12:04" color={theme.warning} size={20} />
            <Label text="КУДА · БОБ" color={theme.accent2} size={20} />
          </div>
          <div style={{ position: "absolute", left: 70, right: 70, bottom: 42, textAlign: "center" }}>
            <Label text="ВИДНО СЕРВЕРУ" color={theme.warning} size={18} opacity={metadataP} />
          </div>
        </Panel>
        <div style={{ position: "absolute", left: CX, top: 594, transform: "translateX(-50%)", color: theme.subtext, ...mono, fontSize: 26, opacity: enter }}>≠</div>
        <StatusPill text="СОДЕРЖИМОЕ СКРЫТО · СЛЕДЫ ВИДНЫ" color={theme.warning} y={1088} opacity={enter * metadataP} />
        {postImpact ? <PulseRing x={820} y={620} triggerFrame={impactLocal} tone="warning" size={210} /> : null}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: W, height: 1250, overflow: "hidden" }}>
      <Header phase="backup" opacity={enter} />
      <Panel left={48} top={414} width={430} height={440} color={theme.accent} {...common}>
        <PanelHeader icon="server" label="Чат" color={theme.accent} />
        <div style={{ marginTop: 56, display: "flex", justifyContent: "center" }}>
          <IconGlyph name="database" size={66} color={theme.accent} strokeWidth={1.6} />
        </div>
        <CipherCapsule x={215} y={176} opacity={enter} />
        <Label text="СВОЙ СЛОЙ" color={theme.accent} size={18} />
      </Panel>
      <Panel left={602} top={414} width={430} height={440} color={theme.accent2} {...common}>
        <PanelHeader icon="cloud" label="Резервная копия" color={theme.accent2} />
        <div style={{ marginTop: 48, display: "flex", justifyContent: "center" }}>
          <IconGlyph name="database-backup" size={66} color={theme.accent2} strokeWidth={1.6} />
        </div>
        <div style={{ marginTop: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <IconGlyph name="key-round" size={30} color={theme.accent2} strokeWidth={1.8} />
          <Label text="ОТДЕЛЬНЫЙ КЛЮЧ" color={theme.accent2} size={19} />
        </div>
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <IconGlyph name="lock-keyhole" size={25} color={theme.accent2} strokeWidth={1.8} />
          <Label text="ШИФРУЕТСЯ ОТДЕЛЬНО" color={theme.accent2} size={16} />
        </div>
      </Panel>
      <div style={{ position: "absolute", left: CX, top: 610, transform: "translateX(-50%)", ...common }}>
        <div style={{ color: theme.danger, fontSize: 48, fontWeight: 800 }}>≠</div>
      </div>
      <StatusPill text="РЕЗЕРВНАЯ КОПИЯ — ОТДЕЛЬНЫЙ СЛОЙ" color={theme.accent2} y={1088} opacity={enter * reveal} />
      {postImpact ? <PulseRing x={820} y={620} triggerFrame={impactLocal} tone="accent2" size={210} /> : null}
    </div>
  );
};

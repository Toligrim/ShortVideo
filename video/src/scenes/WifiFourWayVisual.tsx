import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type WifiFourWayPhase =
  | "secret"
  | "messages"
  | "nonces"
  | "replay"
  | "mix"
  | "mic"
  | "check"
  | "complete"
  | "capture"
  | "offline";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: WifiFourWayPhase;
}

const W = layout.width;
const CX = W / 2;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1.2 };

const Header: React.FC<{ title: string; icon: string; color?: string; opacity: number }> = ({ title, icon, color = theme.accent, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 225,
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
      borderRadius: 26,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 38px ${color}1A`,
      opacity,
    }}
  >
    {children}
  </div>
);

const CenterPill: React.FC<{ left?: number; top: number; text: string; color: string; opacity: number; fontSize?: number }> = ({ left = CX, top, text, color, opacity, fontSize = 23 }) => (
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

const Node: React.FC<{ left: number; top: number; label: string; icon: string; color: string; opacity: number; sub?: string }> = ({
  left,
  top,
  label,
  icon,
  color,
  opacity,
  sub,
}) => (
  <Panel left={left} top={top} width={300} height={170} color={color} opacity={opacity}>
    <div style={{ position: "absolute", left: 26, top: 40 }}><IconGlyph name={icon} size={60} color={color} strokeWidth={1.8} /></div>
    <div style={{ position: "absolute", left: 105, top: 38, color: theme.text, fontSize: 28, fontWeight: 800 }}>{label}</div>
    {sub ? <div style={{ position: "absolute", left: 105, top: 96, color: theme.subtext, fontSize: 18, ...mono }}>{sub}</div> : null}
  </Panel>
);

const FooterBadge: React.FC<{ text: string; color: string; opacity: number; fontSize?: number }> = ({ text, color, opacity, fontSize = 23 }) => (
  <CenterPill top={1235} text={text} color={color} opacity={opacity} fontSize={fontSize} />
);

const PacketRow: React.FC<{
  top: number;
  label: string;
  detail: string;
  fromAp: boolean;
  color: string;
  opacity: number;
}> = ({ top, label, detail, fromAp, color, opacity }) => (
  <div style={{ position: "absolute", left: 130, top, width: 820, height: 72, opacity }}>
    <div style={{ position: "absolute", left: 0, top: 34, width: 820, borderTop: `2px dashed ${theme.panelBorder}` }} />
    <div style={{ position: "absolute", left: fromAp ? 550 : 185, top: 18, width: 270, height: 34, borderRadius: 999, background: `${color}22`, border: `2px solid ${color}`, color, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 17, whiteSpace: "nowrap", ...mono }}>
      <IconGlyph name={fromAp ? "arrow-left" : "arrow-right"} size={22} color={color} strokeWidth={2} />
      {label}
    </div>
    <div style={{ position: "absolute", left: fromAp ? 220 : 570, top: 4, color: theme.subtext, fontSize: 16, ...mono }}>{detail}</div>
  </div>
);

const FlowArrow: React.FC<{ left: number; top: number; width: number; color: string; opacity: number; reverse?: boolean }> = ({ left, top, width, color, opacity, reverse = false }) => (
  <div style={{ position: "absolute", left, top, width, height: 40, opacity }}>
    <div style={{ position: "absolute", left: 0, top: 19, width, borderTop: `3px solid ${color}` }} />
    <div style={{ position: "absolute", left: reverse ? 0 : width - 34, top: 2 }}>
      <IconGlyph name={reverse ? "arrow-left" : "arrow-right"} size={34} color={color} strokeWidth={1.8} />
    </div>
  </div>
);

/** WPA four-way handshake: four EAPOL messages, fresh nonces, PTK derivation and MIC proof. */
export const WifiFourWayVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "messages" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const post = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;

  if (phase === "secret") {
    return (
      <>
        <Header title="ОБЩИЙ СЕКРЕТ · НЕ ПЕРЕДАЁТСЯ" icon="lock-keyhole" color={theme.success} opacity={enter} />
        <Panel left={70} top={425} width={390} height={480} color={theme.accent} opacity={enter}>
          <div style={{ position: "absolute", left: 0, top: 34, width: "100%", textAlign: "center" }}><IconGlyph name="smartphone" size={62} color={theme.accent} strokeWidth={1.8} /></div>
          <div style={{ position: "absolute", left: 0, top: 116, width: "100%", textAlign: "center", color: theme.text, fontSize: 28, fontWeight: 800 }}>ТЕЛЕФОН</div>
          <div style={{ position: "absolute", left: 0, top: 190, width: "100%", textAlign: "center", color: theme.subtext, fontSize: 19, ...mono }}>пароль + HOME_5G</div>
          <CenterPill left={195} top={275} text="🔒 PMK 9A…" color={theme.accent} opacity={enter} fontSize={24} />
          <div style={{ position: "absolute", left: 0, top: 380, width: "100%", textAlign: "center", color: theme.success, fontSize: 17, ...mono }}>штамп остаётся здесь</div>
        </Panel>
        <Panel left={620} top={425} width={390} height={480} color={theme.accent2} opacity={enter}>
          <div style={{ position: "absolute", left: 0, top: 34, width: "100%", textAlign: "center" }}><IconGlyph name="router" size={62} color={theme.accent2} strokeWidth={1.8} /></div>
          <div style={{ position: "absolute", left: 0, top: 116, width: "100%", textAlign: "center", color: theme.text, fontSize: 28, fontWeight: 800 }}>РОУТЕР</div>
          <div style={{ position: "absolute", left: 0, top: 190, width: "100%", textAlign: "center", color: theme.subtext, fontSize: 19, ...mono }}>пароль + HOME_5G</div>
          <CenterPill left={195} top={275} text="🔒 PMK 9A…" color={theme.accent2} opacity={enter} fontSize={24} />
          <div style={{ position: "absolute", left: 0, top: 380, width: "100%", textAlign: "center", color: theme.success, fontSize: 17, ...mono }}>штамп остаётся здесь</div>
        </Panel>
        <div style={{ position: "absolute", left: 460, top: 635, width: 160, borderTop: `3px dashed ${theme.danger}88`, opacity: enter }} />
        <div style={{ position: "absolute", left: CX, top: 585, transform: "translateX(-50%)", color: theme.danger, fontSize: 20, ...mono }}>НЕ ЛЕТИТ</div>
        <FooterBadge text="ОБА ЗНАЮТ PMK · ШТАМП НЕ ПОКАЗАН" color={theme.success} opacity={enter} />
      </>
    );
  }

  if (phase === "messages") {
    const rows = [
      ["M1 · ANonce", "роутер → телефон", true, theme.accent2],
      ["M2 · SNonce + MIC", "телефон → роутер", false, theme.accent],
      ["M3 · GTK + MIC", "зашифровано", true, theme.warning],
      ["M4 · ACK", "подтверждение", false, theme.success],
    ] as const;
    return (
      <>
        <Header title="WPA · ЧЕТЫРЕ СООБЩЕНИЯ" icon="repeat-2" color={theme.warning} opacity={enter} />
        <Node left={75} top={370} label="ТЕЛЕФОН" icon="smartphone" color={theme.accent} opacity={enter} sub="клиент" />
        <Node left={705} top={370} label="РОУТЕР" icon="router" color={theme.accent2} opacity={enter} sub="точка доступа" />
        {rows.map(([label, detail, fromAp, color], index) => {
          const rowOpacity = enter * smooth((local - index * 9) / 18);
          return <PacketRow key={label} top={585 + index * 112} label={label} detail={detail} fromAp={fromAp} color={color} opacity={rowOpacity} />;
        })}
        <FooterBadge text="M1 · M2 · M3 · M4 · ПАРОЛЯ НЕТ" color={theme.success} opacity={enter} />
        {hit ? <PulseRing x={540} y={1004} triggerFrame={impactLocal} tone="success" size={160} /> : null}
      </>
    );
  }

  if (phase === "nonces") {
    const p = smooth((local - 8) / Math.max(impactLocal, 1));
    return (
      <>
        <Header title="СВЕЖИЕ NONCE · КАЖДЫЙ ВХОД" icon="dice-5" color={theme.warning} opacity={enter} />
        <Node left={75} top={470} label="ТЕЛЕФОН" icon="smartphone" color={theme.accent} opacity={enter} sub="придумывает своё" />
        <Node left={705} top={470} label="РОУТЕР" icon="router" color={theme.accent2} opacity={enter} sub="посылает первым" />
        <FlowArrow left={380} top={545} width={325} color={theme.accent2} opacity={enter * p} reverse />
        <CenterPill top={695} text="ANonce · 7C4A…91" color={theme.accent2} opacity={enter * p} />
        <CenterPill top={785} text="SNonce · B19E…44" color={theme.accent} opacity={enter * p} />
        <div style={{ position: "absolute", left: CX, top: 900, transform: "translateX(-50%)", color: theme.subtext, fontSize: 21, ...mono, opacity: enter }}>случайные числа · не пароль</div>
        <FooterBadge text="НОВЫЙ ВХОД → НОВЫЕ ЧИСЛА" color={theme.success} opacity={enter} />
        {hit ? <PulseRing x={CX} y={742} triggerFrame={impactLocal} tone="warning" size={180} /> : null}
      </>
    );
  }

  if (phase === "replay") {
    return (
      <>
        <Header title="СВЕЖЕСТЬ ЛОМАЕТ REPLAY" icon="refresh-cw" color={theme.danger} opacity={enter} />
        <Panel left={78} top={430} width={420} height={560} color={theme.danger} opacity={enter}>
          <div style={{ position: "absolute", left: 0, top: 34, width: "100%", textAlign: "center", color: theme.danger, fontSize: 23, ...mono }}>СТАРАЯ ЗАПИСЬ</div>
          <div style={{ position: "absolute", left: 0, top: 110, width: "100%", textAlign: "center" }}><IconGlyph name="video" size={70} color={theme.danger} strokeWidth={1.8} /></div>
          <div style={{ position: "absolute", left: 0, top: 220, width: "100%", textAlign: "center", color: theme.subtext, fontSize: 20, ...mono }}>ANonce 12AF…</div>
          <div style={{ position: "absolute", left: 0, top: 278, width: "100%", textAlign: "center", color: theme.subtext, fontSize: 20, ...mono }}>SNonce 03D1…</div>
          <div style={{ position: "absolute", left: 0, top: 380, width: "100%", textAlign: "center", color: theme.danger, fontSize: 22, textDecoration: "line-through", ...mono }}>ПОВТОРИТЬ</div>
        </Panel>
        <Panel left={582} top={430} width={420} height={560} color={theme.success} opacity={enter}>
          <div style={{ position: "absolute", left: 0, top: 34, width: "100%", textAlign: "center", color: theme.success, fontSize: 23, ...mono }}>НОВЫЙ ВХОД</div>
          <div style={{ position: "absolute", left: 0, top: 110, width: "100%", textAlign: "center" }}><IconGlyph name="sparkles" size={70} color={theme.success} strokeWidth={1.8} /></div>
          <div style={{ position: "absolute", left: 0, top: 220, width: "100%", textAlign: "center", color: theme.success, fontSize: 20, ...mono }}>ANonce 7C4A…</div>
          <div style={{ position: "absolute", left: 0, top: 278, width: "100%", textAlign: "center", color: theme.success, fontSize: 20, ...mono }}>SNonce B19E…</div>
          <div style={{ position: "absolute", left: 0, top: 380, width: "100%", textAlign: "center", color: theme.success, fontSize: 22, ...mono }}>ПРИНЯТЬ</div>
        </Panel>
        <div style={{ position: "absolute", left: CX, top: 1020, transform: "translateX(-50%)", color: theme.danger, fontSize: 22, ...mono }}>старый обмен не подходит</div>
        <FooterBadge text="СВЕЖИЕ NONCE · СТАРУЮ ЗАПИСЬ НЕ ПЕРЕИГРАТЬ" color={theme.success} opacity={enter} />
      </>
    );
  }

  if (phase === "mix") {
    const sources = ["PMK · секрет", "ANonce", "SNonce", "MAC AP + MAC STA"];
    return (
      <>
        <Header title="PTK · СМЕШИВАЕМ ЧЕТЫРЕ ИСТОЧНИКА" icon="combine" color={theme.accent} opacity={enter} />
        <Panel left={58} top={395} width={330} height={610} color={theme.accent} opacity={enter}>
          <div style={{ position: "absolute", left: 0, top: 28, width: "100%", textAlign: "center", color: theme.accent, fontSize: 22, ...mono }}>МАТЕРИАЛЫ</div>
          {sources.map((source, index) => (
            <div key={source} style={{ position: "absolute", left: 26, top: 108 + index * 104, width: 278, height: 60, borderRadius: 13, background: `${index === 0 ? theme.success : theme.panelBorder}30`, border: `2px solid ${index === 0 ? theme.success : theme.panelBorder}`, color: index === 0 ? theme.success : theme.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, ...mono }}>{source}</div>
          ))}
        </Panel>
        <div style={{ position: "absolute", left: 392, top: 640, width: 105, borderTop: `3px solid ${theme.accent}` }} />
        <div style={{ position: "absolute", left: 478, top: 565, width: 190, height: 170, borderRadius: 25, background: `${theme.panel}F2`, border: `3px solid ${theme.warning}`, boxShadow: `0 0 45px ${theme.warning}22`, opacity: enter * (0.8 + post * 0.2) }}>
          <div style={{ position: "absolute", left: 0, top: 27, width: "100%", textAlign: "center", color: theme.warning, fontSize: 22, ...mono }}>PRF-X</div>
          <div style={{ position: "absolute", left: 0, top: 76, width: "100%", textAlign: "center", color: theme.text, fontSize: 31, fontWeight: 800 }}>PTK</div>
          <div style={{ position: "absolute", left: 0, top: 125, width: "100%", textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>временный ключ</div>
        </div>
        <div style={{ position: "absolute", left: 668, top: 640, width: 100, borderTop: `3px solid ${theme.success}` }} />
        <Panel left={770} top={430} width={245} height={490} color={theme.success} opacity={enter}>
          <div style={{ position: "absolute", left: 0, top: 26, width: "100%", textAlign: "center", color: theme.success, fontSize: 19, ...mono }}>ОБЕ СТОРОНЫ</div>
          <div style={{ position: "absolute", left: 23, top: 105, width: 199, height: 100, borderRadius: 18, background: `${theme.accent}18`, border: `2px solid ${theme.accent}`, color: theme.accent, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, ...mono }}><span>ТЕЛЕФОН</span><span style={{ fontSize: 25 }}>PTK</span></div>
          <div style={{ position: "absolute", left: 23, top: 270, width: 199, height: 100, borderRadius: 18, background: `${theme.accent2}18`, border: `2px solid ${theme.accent2}`, color: theme.accent2, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, ...mono }}><span>РОУТЕР</span><span style={{ fontSize: 25 }}>PTK</span></div>
        </Panel>
        <CenterPill top={1035} text="одинаковый временный ключ" color={theme.success} opacity={enter} />
        {hit ? <PulseRing x={570} y={650} triggerFrame={impactLocal} tone="warning" size={170} /> : null}
      </>
    );
  }

  if (phase === "mic") {
    return (
      <>
        <Header title="MIC · ПРОВЕРОЧНЫЙ ОТПЕЧАТОК" icon="fingerprint" color={theme.warning} opacity={enter} />
        <Node left={70} top={475} label="ТЕЛЕФОН" icon="smartphone" color={theme.accent} opacity={enter} sub="PTK внутри" />
        <Node left={710} top={475} label="РОУТЕР" icon="router" color={theme.accent2} opacity={enter} sub="ждёт доказательство" />
        <FlowArrow left={370} top={585} width={340} color={theme.warning} opacity={enter * smooth(local / Math.max(impactLocal, 1))} />
        <Panel left={355} top={720} width={370} height={180} color={theme.warning} opacity={enter}>
          <div style={{ position: "absolute", left: 0, top: 28, width: "100%", textAlign: "center" }}><IconGlyph name="fingerprint" size={48} color={theme.warning} strokeWidth={1.8} /></div>
          <div style={{ position: "absolute", left: 0, top: 92, width: "100%", textAlign: "center", color: theme.warning, fontSize: 24, ...mono }}>MIC 4F9A…</div>
        </Panel>
        <div style={{ position: "absolute", left: CX, top: 955, transform: "translateX(-50%)", color: theme.subtext, fontSize: 20, ...mono }}>телефон возвращает доказательство знания секрета</div>
        <FooterBadge text="ОТПЕЧАТОК ЕДЕТ · ПАРОЛЬ НЕ ЕДЕТ" color={theme.success} opacity={enter} />
        {hit ? <PulseRing x={CX} y={810} triggerFrame={impactLocal} tone="warning" size={180} /> : null}
      </>
    );
  }

  if (phase === "check") {
    const checkP = hit ? post : 0;
    return (
      <>
        <Header title="РОУТЕР ПРОВЕРЯЕТ MIC" icon="badge-check" color={theme.success} opacity={enter} />
        <Node left={70} top={470} label="ТЕЛЕФОН" icon="smartphone" color={theme.accent} opacity={enter} sub="секрет знает" />
        <Panel left={540} top={425} width={455} height={520} color={theme.accent2} opacity={enter}>
          <div style={{ position: "absolute", left: 0, top: 35, width: "100%", textAlign: "center" }}><IconGlyph name="router" size={64} color={theme.accent2} strokeWidth={1.8} /></div>
          <div style={{ position: "absolute", left: 0, top: 115, width: "100%", textAlign: "center", color: theme.text, fontSize: 28, fontWeight: 800 }}>РОУТЕР</div>
          <div style={{ position: "absolute", left: 42, top: 210, width: 370, height: 78, borderRadius: 15, background: `${theme.warning}18`, border: `2px solid ${theme.warning}`, color: theme.warning, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, ...mono }}>MIC 4F9A…</div>
          <div style={{ position: "absolute", left: 0, top: 350, width: "100%", textAlign: "center", color: theme.success, fontSize: 31, ...mono, opacity: 0.4 + 0.6 * checkP }}>✓ MIC СОВПАЛ</div>
        </Panel>
        <FlowArrow left={370} top={570} width={170} color={theme.warning} opacity={enter} />
        <FooterBadge text={hit ? "ОБЩИЙ СЕКРЕТ ДОКАЗАН" : "СВЕРКА ИДЁТ"} color={theme.success} opacity={enter} />
        {hit ? <PulseRing x={765} y={820} triggerFrame={impactLocal} tone="success" size={200} /> : null}
      </>
    );
  }

  if (phase === "complete") {
    return (
      <>
        <Header title="M3 + M4 · ЗАЩИТА ВКЛЮЧЕНА" icon="shield-check" color={theme.success} opacity={enter} />
        <Node left={75} top={385} label="ТЕЛЕФОН" icon="smartphone" color={theme.accent} opacity={enter} sub="готов к данным" />
        <Node left={705} top={385} label="РОУТЕР" icon="router" color={theme.accent2} opacity={enter} sub="отправляет GTK" />
        <PacketRow top={625} label="M3 · GTK 🔒" detail="зашифрован PTK" fromAp color={theme.warning} opacity={enter} />
        <PacketRow top={790} label="M4 · ACK" detail="получено" fromAp={false} color={theme.success} opacity={enter} />
        <CenterPill top={1000} text="DATA · 🔒 ЗАШИФРОВАНО" color={theme.success} opacity={enter} fontSize={25} />
        <FooterBadge text="ЧЕТЫРЕ ШАГА ЗАВЕРШЕНЫ" color={theme.success} opacity={enter} />
        {hit ? <PulseRing x={540} y={824} triggerFrame={impactLocal} tone="success" size={190} /> : null}
      </>
    );
  }

  if (phase === "capture") {
    const packets = ["M1 · ANonce", "M2 · SNonce + MIC", "M3 · GTK 🔒", "M4 · ACK"];
    return (
      <>
        <Header title="ЗАПИСЬ ЭФИРА · ПАРОЛЯ НЕТ" icon="radio-tower" color={theme.warning} opacity={enter} />
        <Panel left={70} top={405} width={630} height={600} color={theme.warning} opacity={enter}>
          <div style={{ position: "absolute", left: 0, top: 30, width: "100%", textAlign: "center", color: theme.warning, fontSize: 22, ...mono }}>ЗАХВАЧЕННЫЕ КАДРЫ EAPOL</div>
          {packets.map((packet, index) => (
            <div key={packet} style={{ position: "absolute", left: 42, top: 105 + index * 102, width: 546, height: 66, borderRadius: 14, background: `${index === 2 ? theme.accent2 : theme.panelBorder}28`, border: `2px solid ${index === 2 ? theme.accent2 : theme.panelBorder}`, color: index === 2 ? theme.accent2 : theme.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, ...mono }}>{packet}</div>
          ))}
        </Panel>
        <Panel left={745} top={475} width={270} height={380} color={theme.danger} opacity={enter}>
          <div style={{ position: "absolute", left: 0, top: 35, width: "100%", textAlign: "center" }}><IconGlyph name="eye" size={68} color={theme.danger} strokeWidth={1.8} /></div>
          <div style={{ position: "absolute", left: 0, top: 130, width: "100%", textAlign: "center", color: theme.danger, fontSize: 22, ...mono }}>СЛУШАЕТ</div>
          <div style={{ position: "absolute", left: 0, top: 205, width: "100%", textAlign: "center", color: theme.subtext, fontSize: 18, ...mono }}>числа · MIC · GTK</div>
          <div style={{ position: "absolute", left: 0, top: 275, width: "100%", textAlign: "center", color: theme.danger, fontSize: 21, textDecoration: "line-through", ...mono }}>ПАРОЛЬ</div>
        </Panel>
        <FooterBadge text="ЗАПИСЬ ВИДИТ ДОКАЗАТЕЛЬСТВО, НЕ ПАРОЛЬ" color={theme.success} opacity={enter} />
      </>
    );
  }

  if (phase === "offline") {
    const guesses = ["123456", "qwerty", "HOME2026"];
    return (
      <>
        <Header title="СЛАБЫЙ ПАРОЛЬ · УГАДЫВАЮТ OFFLINE" icon="laptop" color={theme.danger} opacity={enter} />
        <Panel left={70} top={460} width={340} height={390} color={theme.warning} opacity={enter}>
          <div style={{ position: "absolute", left: 0, top: 34, width: "100%", textAlign: "center" }}><IconGlyph name="radio-tower" size={58} color={theme.warning} strokeWidth={1.8} /></div>
          <div style={{ position: "absolute", left: 0, top: 115, width: "100%", textAlign: "center", color: theme.warning, fontSize: 22, ...mono }}>ЗАПИСЬ M1–M4</div>
          <div style={{ position: "absolute", left: 0, top: 205, width: "100%", textAlign: "center", color: theme.subtext, fontSize: 19, ...mono }}>уже сохранена</div>
          <div style={{ position: "absolute", left: 0, top: 285, width: "100%", textAlign: "center", color: theme.danger, fontSize: 18, ...mono }}>СЕТЬ НЕ НУЖНА</div>
        </Panel>
        <div style={{ position: "absolute", left: 410, top: 650, width: 110, borderTop: `3px solid ${theme.danger}` }} />
        <div style={{ position: "absolute", left: 460, top: 632 }}><IconGlyph name="arrow-right" size={34} color={theme.danger} strokeWidth={1.8} /></div>
        <Panel left={545} top={395} width={470} height={545} color={theme.danger} opacity={enter}>
          <div style={{ position: "absolute", left: 0, top: 28, width: "100%", textAlign: "center" }}><IconGlyph name="laptop" size={58} color={theme.danger} strokeWidth={1.8} /></div>
          <div style={{ position: "absolute", left: 0, top: 105, width: "100%", textAlign: "center", color: theme.danger, fontSize: 22, ...mono }}>СЛОВАРЬ · ПРОВЕРКА</div>
          {guesses.map((guess, index) => <div key={guess} style={{ position: "absolute", left: 48, top: 190 + index * 78, width: 374, height: 48, borderRadius: 12, background: index === 2 ? `${theme.success}20` : `${theme.panelBorder}30`, border: `2px solid ${index === 2 ? theme.success : theme.panelBorder}`, color: index === 2 ? theme.success : theme.subtext, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, ...mono }}>{guess}{index === 2 ? " · MIC ✓" : " · нет"}</div>)}
        </Panel>
        <FooterBadge text="ОФЛАЙН-УГАДЫВАНИЕ ВОЗМОЖНО ТОЛЬКО ДЛЯ СЛАБОГО ПАРОЛЯ" color={theme.danger} opacity={enter} fontSize={20} />
      </>
    );
  }

  return null;
};

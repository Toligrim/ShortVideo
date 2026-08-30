import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

const W = layout.width;

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export type TlsHandshakePhase = "certificate" | "derive" | "channel";

export const TlsHandshakeVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: TlsHandshakePhase;
}> = ({ local, fps, impactLocal, phase = "certificate" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const done = local >= impactLocal;
  const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };
  const card = (color: string): React.CSSProperties => ({
    borderRadius: 24,
    background: `${theme.panel}E8`,
    border: `3px solid ${color}66`,
    boxShadow: `0 0 42px ${color}20`,
  });

  const headerTitle: Record<TlsHandshakePhase, string> = {
    certificate: "СЕРТИФИКАТ · ДОМЕН ↔ КЛЮЧ",
    derive: "ОБМЕН · СЕКРЕТ НЕ ЛЕТИТ",
    channel: "КАНАЛ ЗАЩИЩЁН · ЛОЖЬ ВНУТРИ",
  };

  const header = (
    <div
      style={{
        position: "absolute",
        left: W / 2,
        top: 245,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        color: theme.subtext,
        fontSize: 25,
        whiteSpace: "nowrap",
        opacity: enter,
        ...mono,
      }}
    >
      <IconGlyph
        name={phase === "certificate" ? "badge-check" : phase === "derive" ? "key-round" : "lock-keyhole"}
        size={30}
        color={phase === "channel" ? theme.success : theme.accent}
        strokeWidth={1.8}
      />
      <span>{headerTitle[phase]}</span>
    </div>
  );

  if (phase === "certificate") {
    const flyP = smooth(clamp01(local / Math.max(impactLocal - 6, 1)));
    const checkP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
    return (
      <>
        {header}
        {/* Browser */}
        <div
          style={{
            position: "absolute",
            left: 76,
            top: 430,
            width: 300,
            height: 360,
            ...card(theme.accent),
            opacity: enter,
            transform: `translateY(${(1 - enter) * 40}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <IconGlyph name="globe" size={56} color={theme.accent} strokeWidth={1.8} />
          <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 28, color: theme.text }}>Браузер</div>
          <div style={{ ...mono, fontSize: 18, color: theme.subtext }}>проверяет</div>
        </div>
        {/* Server */}
        <div
          style={{
            position: "absolute",
            right: 76,
            top: 430,
            width: 300,
            height: 360,
            ...card(theme.accent2),
            opacity: enter,
            transform: `translateY(${(1 - enter) * 40}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <IconGlyph name="server" size={56} color={theme.accent2} strokeWidth={1.8} />
          <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 28, color: theme.text }}>Сервер</div>
          <div style={{ ...mono, fontSize: 18, color: theme.subtext }}>отдаёт</div>
        </div>
        {/* Certificate card center flying */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 135,
            top: 430 + flyP * 100,
            width: 270,
            height: 280,
            borderRadius: 22,
            background: theme.panel,
            border: `3px solid ${theme.warning}99`,
            boxShadow: `0 0 42px ${theme.warning}33`,
            opacity: enter,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 18,
            gap: 10,
            transform: `scale(${0.85 + flyP * 0.15})`,
          }}
        >
          <IconGlyph name="file-badge" size={42} color={theme.warning} strokeWidth={1.8} />
          <div style={{ ...mono, fontSize: 20, color: theme.warning }}>СЕРТИФИКАТ</div>
          <div style={{ fontFamily: theme.mono, fontSize: 22, fontWeight: 800, color: theme.text }}>example.com</div>
          <div style={{ fontFamily: theme.mono, fontSize: 18, color: theme.accent }}>K = 04af…7e</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, color: theme.success, ...mono, fontSize: 16 }}>
            <IconGlyph name="badge-check" size={18} color={theme.success} strokeWidth={1.8} />
            подпись ЦС
          </div>
        </div>
        {/* arrows */}
        <div style={{ position: "absolute", left: 376, top: 845, opacity: enter * flyP }}>
          <IconGlyph name="arrow-left" size={36} color={theme.accent} />
        </div>
        <div style={{ position: "absolute", right: 376, top: 845, opacity: enter * flyP }}>
          <IconGlyph name="arrow-right" size={36} color={theme.accent2} />
        </div>
        {/* domain ↔ key line */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 900,
            transform: `translateX(-50%) scale(${0.8 + checkP * 0.2})`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 26px",
            borderRadius: 999,
            background: done ? `${theme.success}18` : `${theme.panel}DD`,
            border: `2px solid ${done ? theme.success : theme.panelBorder}`,
            color: done ? theme.success : theme.subtext,
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 26,
            opacity: done ? checkP : enter * 0.9,
            whiteSpace: "nowrap",
          }}
        >
          {done ? <IconGlyph name="check" size={24} color={theme.success} strokeWidth={2.2} /> : null}
          домен ↔ открытый ключ
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1005,
            transform: "translateX(-50%)",
            ...mono,
            fontSize: 20,
            color: theme.subtext,
            opacity: enter,
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          {done ? "браузер проверил подпись — домен свой" : "сертификат связывает домен и ключ"}
        </div>
        {done ? <PulseRing x={W / 2} y={670} triggerFrame={impactLocal} tone="success" size={220} /> : null}
      </>
    );
  }

  if (phase === "derive") {
    const pubP = smooth(clamp01((local - 8) / 18));
    const derivedP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
    // trajectory of public shares
    const leftPubX = interpolate(pubP, [0, 1], [430, 500]);
    const rightPubX = interpolate(pubP, [0, 1], [650, 580]);
    return (
      <>
        {header}
        {/* Client */}
        <div
          style={{
            position: "absolute",
            left: 76,
            top: 430,
            width: 320,
            height: 380,
            ...card(theme.accent),
            opacity: enter,
            transform: `translateY(${(1 - enter) * 40}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <IconGlyph name="smartphone" size={52} color={theme.accent} strokeWidth={1.8} />
          <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 26, color: theme.text }}>Клиент</div>
          <div style={{ fontFamily: theme.mono, fontSize: 22, color: theme.accent, fontWeight: 800 }}>a — секрет</div>
          <div style={{ padding: "6px 14px", borderRadius: 999, background: `${theme.danger}18`, border: `2px solid ${theme.danger}88`, color: theme.danger, ...mono, fontSize: 16 }}>не летит</div>
        </div>
        {/* Server */}
        <div
          style={{
            position: "absolute",
            right: 76,
            top: 430,
            width: 320,
            height: 380,
            ...card(theme.accent2),
            opacity: enter,
            transform: `translateY(${(1 - enter) * 40}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <IconGlyph name="server" size={52} color={theme.accent2} strokeWidth={1.8} />
          <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 26, color: theme.text }}>Сервер</div>
          <div style={{ fontFamily: theme.mono, fontSize: 22, color: theme.accent2, fontWeight: 800 }}>b — секрет</div>
          <div style={{ padding: "6px 14px", borderRadius: 999, background: `${theme.danger}18`, border: `2px solid ${theme.danger}88`, color: theme.danger, ...mono, fontSize: 16 }}>не летит</div>
        </div>
        {/* Public shares flying */}
        <div
          style={{
            position: "absolute",
            left: leftPubX,
            top: 620,
            transform: "translate(-50%, -50%)",
            padding: "10px 18px",
            borderRadius: 999,
            background: theme.accent,
            color: "#06121A",
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 22,
            opacity: pubP * enter,
            boxShadow: `0 0 24px ${theme.accent}AA`,
            whiteSpace: "nowrap",
          }}
        >
          A = gᵃ
        </div>
        <div
          style={{
            position: "absolute",
            left: rightPubX,
            top: 700,
            transform: "translate(-50%, -50%)",
            padding: "10px 18px",
            borderRadius: 999,
            background: theme.accent2,
            color: "#06121A",
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 22,
            opacity: pubP * enter,
            boxShadow: `0 0 24px ${theme.accent2}AA`,
            whiteSpace: "nowrap",
          }}
        >
          B = gᵇ
        </div>
        <div style={{ position: "absolute", left: 396, top: 670, color: theme.accent, fontSize: 38, opacity: pubP * enter }}>→</div>
        <div style={{ position: "absolute", right: 396, top: 590, color: theme.accent2, fontSize: 38, opacity: pubP * enter }}>←</div>

        {/* Derived same key both sides */}
        <div
          style={{
            position: "absolute",
            left: 160,
            top: 900,
            width: 360,
            height: 110,
            borderRadius: 20,
            background: `${theme.success}14`,
            border: `2px solid ${theme.success}99`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            opacity: done ? derivedP : 0,
            transform: `scale(${0.8 + derivedP * 0.2})`,
          }}
        >
          <div style={{ ...mono, fontSize: 18, color: theme.success }}>КЛИЕНТ ВЫВЕЛ</div>
          <div style={{ fontFamily: theme.mono, fontSize: 28, fontWeight: 800, color: theme.success }}>S = gᵃᵇ</div>
        </div>
        <div
          style={{
            position: "absolute",
            right: 160,
            top: 900,
            width: 360,
            height: 110,
            borderRadius: 20,
            background: `${theme.success}14`,
            border: `2px solid ${theme.success}99`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            opacity: done ? derivedP : 0,
            transform: `scale(${0.8 + derivedP * 0.2})`,
          }}
        >
          <div style={{ ...mono, fontSize: 18, color: theme.success }}>СЕРВЕР ВЫВЕЛ</div>
          <div style={{ fontFamily: theme.mono, fontSize: 28, fontWeight: 800, color: theme.success }}>S = gᵃᵇ</div>
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1070,
            transform: `translateX(-50%) scale(${0.8 + derivedP * 0.2})`,
            padding: "12px 24px",
            borderRadius: 999,
            background: `${theme.success}18`,
            border: `2px solid ${theme.success}`,
            color: theme.success,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 28,
            whiteSpace: "nowrap",
            opacity: done ? derivedP : 0,
          }}
        >
          один и тот же ключ — нигде не летел
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2 - 220,
            top: 790,
            width: 440,
            height: 4,
            background: `${theme.danger}88`,
            opacity: done ? 0.9 : 0,
            transform: "rotate(-8deg)",
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 870,
            transform: "translateX(-50%)",
            ...mono,
            fontSize: 18,
            color: theme.danger,
            opacity: done ? 0.9 : 0,
          }}
        >
          S в сети нет — подслушать нечего
        </div>
        {done ? <PulseRing x={W / 2} y={955} triggerFrame={impactLocal} tone="success" size={260} /> : null}
      </>
    );
  }

  // phase === "channel"
  const tunnelP = spring({ frame: Math.max(0, local - 6), fps, config: { damping: 13, mass: 0.8 } });
  const letterP = spring({ frame: Math.max(0, local - 20), fps, config: { damping: 11, mass: 0.7 } });
  const eyeFade = clamp01((local - 30) / 16);
  return (
    <>
      {header}
      {/* Browser node */}
      <div
        style={{
          position: "absolute",
          left: 76,
          top: 430,
          width: 280,
          height: 280,
          ...card(theme.accent),
          opacity: enter,
          transform: `translateY(${(1 - enter) * 40}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <IconGlyph name="globe" size={52} color={theme.accent} strokeWidth={1.8} />
        <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 26, color: theme.text }}>Браузер</div>
        <div style={{ ...mono, fontSize: 16, color: theme.subtext }}>с ключом S</div>
      </div>
      {/* Server node */}
      <div
        style={{
          position: "absolute",
          right: 76,
          top: 430,
          width: 280,
          height: 280,
          ...card(theme.accent2),
          opacity: enter,
          transform: `translateY(${(1 - enter) * 40}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <IconGlyph name="server" size={52} color={theme.accent2} strokeWidth={1.8} />
        <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 26, color: theme.text }}>example.com</div>
        <div style={{ ...mono, fontSize: 16, color: theme.subtext }}>с ключом S</div>
      </div>
      {/* Encrypted tunnel */}
      <div
        style={{
          position: "absolute",
          left: 356,
          top: 520,
          width: 368,
          height: 140,
          borderRadius: 24,
          background: `linear-gradient(90deg, ${theme.success}22, ${theme.accent}18)`,
          border: `3px solid ${theme.success}99`,
          boxShadow: `0 0 40px ${theme.success}44`,
          opacity: enter * tunnelP,
          transform: `scaleX(${0.7 + tunnelP * 0.3})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <IconGlyph name="lock-keyhole" size={36} color={theme.success} strokeWidth={1.8} />
        <span style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 22, color: theme.success }}>ШИФРО-КАНАЛ</span>
      </div>
      {/* sealed letter inside tunnel */}
      <div
        style={{
          position: "absolute",
          left: W / 2 - 110,
          top: 720,
          width: 220,
          height: 140,
          borderRadius: 16,
          background: theme.panel,
          border: `2px solid ${theme.warning}88`,
          opacity: enter * letterP,
          transform: `translateY(${(1 - letterP) * 20}px) scale(${0.8 + letterP * 0.2})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          boxShadow: `0 0 28px ${theme.warning}22`,
        }}
      >
        <IconGlyph name="mail" size={40} color={theme.warning} strokeWidth={1.8} />
        <div style={{ fontFamily: theme.mono, fontSize: 18, color: theme.subtext }}>внутри</div>
        <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 26, color: theme.danger }}>ложь?</div>
      </div>
      {/* eye outside crossed */}
      <div
        style={{
          position: "absolute",
          right: 90,
          top: 780,
          opacity: eyeFade,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ position: "relative" }}>
          <IconGlyph name="eye-off" size={52} color={theme.subtext} strokeWidth={1.8} />
        </div>
        <div style={{ ...mono, fontSize: 16, color: theme.subtext }}>не прочитать</div>
      </div>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 985,
          transform: `translateX(-50%) scale(${0.8 + letterP * 0.2})`,
          padding: "14px 26px",
          borderRadius: 999,
          background: done ? `${theme.warning}16` : `${theme.panel}DD`,
          border: `2px solid ${done ? theme.warning : theme.panelBorder}`,
          color: done ? theme.warning : theme.subtext,
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 26,
          opacity: done ? letterP : enter,
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      >
        {done ? "канал надёжен — отправитель не проверен" : "по дороге никто не подберёт"}
      </div>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 1120,
          transform: "translateX(-50%)",
          display: "flex",
          gap: 16,
          opacity: enter * letterP,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 999, background: `${theme.success}14`, border: `1px solid ${theme.success}55` }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: theme.success, boxShadow: `0 0 10px ${theme.success}` }} />
          <span style={{ ...mono, fontSize: 16, color: theme.success }}>канал защищён</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 999, background: `${theme.danger}14`, border: `1px solid ${theme.danger}55` }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: theme.danger, boxShadow: `0 0 10px ${theme.danger}` }} />
          <span style={{ ...mono, fontSize: 16, color: theme.danger }}>сайт может лгать</span>
        </div>
      </div>
      {done ? <PulseRing x={W / 2} y={590} triggerFrame={impactLocal} tone="success" size={260} /> : null}
    </>
  );
};

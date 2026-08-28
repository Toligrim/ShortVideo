import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type UsbPdNegotiationPhase = "discover" | "capabilities" | "request" | "contract";

/** USB Power Delivery negotiation literally: safe 5V, BMC on CC, PDO menu, Request/Accept/PS_RDY. */
export const UsbPdNegotiationVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: UsbPdNegotiationPhase;
}> = ({ local, fps, impactLocal, phase = "discover" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  const cx = layout.width / 2;
  const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };

  const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
  const smooth = (t: number) => t * t * (3 - 2 * t);

  const phaseTitle: Record<UsbPdNegotiationPhase, string> = {
    discover: "USB-C · БЕЗОПАСНЫЕ 5 В ДО КОНТРАКТА",
    capabilities: "CC-ЛИНИЯ · МЕНЮ PDO · BMC 300 КБИТ",
    request: "ЗАПРОС · ACCEPT · ЖДЁМ PS_RDY",
    contract: "КОНТРАКТ · PS_RDY · МОЖНО БРАТЬ ТОК",
  };
  const phaseColor =
    phase === "discover" ? theme.success : phase === "capabilities" ? theme.accent : phase === "request" ? theme.warning : theme.success;

  const header = (
    <div
      style={{
        position: "absolute",
        left: cx,
        top: 240,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: theme.mono,
        fontSize: 23,
        letterSpacing: 2,
        color: phaseColor,
        opacity: enter,
        whiteSpace: "nowrap",
      }}
    >
      <IconGlyph
        name={phase === "discover" ? "shield-check" : phase === "capabilities" ? "list" : phase === "request" ? "arrow-right-left" : "zap"}
        size={28}
        color={phaseColor}
        strokeWidth={1.8}
      />
      {phaseTitle[phase]}
    </div>
  );

  // Device positions
  const leftX = 230;
  const rightX = 850;
  const devY = 520;
  const ccY = 780;
  const vbusY = 920;

  const devices = (
    <>
      {/* Source (charger) */}
      <div
        style={{
          position: "absolute",
          left: leftX - 150,
          top: devY - 110,
          width: 300,
          height: 220,
          borderRadius: 24,
          background: theme.panel,
          border: `3px solid ${theme.accent}99`,
          boxShadow: `0 0 36px ${theme.accent}22`,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 30}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <IconGlyph name="plug-zap" size={56} color={theme.accent} strokeWidth={1.7} />
        <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 26, color: theme.text }}>БЛОК 100W</div>
        <div style={{ fontFamily: theme.mono, fontSize: 18, color: theme.subtext }}>Source · Rp</div>
      </div>
      {/* Sink (phone) */}
      <div
        style={{
          position: "absolute",
          left: rightX - 150,
          top: devY - 110,
          width: 300,
          height: 220,
          borderRadius: 24,
          background: theme.panel,
          border: `3px solid ${theme.accent2}99`,
          boxShadow: `0 0 36px ${theme.accent2}22`,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 30}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <IconGlyph name="smartphone" size={56} color={theme.accent2} strokeWidth={1.7} />
        <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 26, color: theme.text }}>ТЕЛЕФОН</div>
        <div style={{ fontFamily: theme.mono, fontSize: 18, color: theme.subtext }}>Sink · Rd</div>
      </div>
    </>
  );

  // Cable lines
  const cables = (
    <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: enter }}>
      {/* VBUS thick power line */}
      <line x1={leftX + 110} y1={vbusY} x2={rightX - 110} y2={vbusY} stroke={phase === "contract" ? theme.success : theme.subtext} strokeWidth={phase === "contract" ? 7 : 5} strokeLinecap="round" opacity={0.95} />
      {/* CC thin signaling line */}
      <line x1={leftX + 110} y1={ccY} x2={rightX - 110} y2={ccY} stroke={theme.accent} strokeWidth={4} strokeDasharray={phase === "capabilities" || phase === "request" ? "10 8" : "none"} strokeLinecap="round" opacity={0.9} />
      {/* VBUS label */}
      <text x={cx} y={vbusY - 18} textAnchor="middle" fontFamily={theme.mono} fontSize={20} fontWeight={800} fill={phase === "discover" ? theme.success : theme.subtext}>VBUS</text>
      <text x={cx} y={ccY - 18} textAnchor="middle" fontFamily={theme.mono} fontSize={20} fontWeight={800} fill={theme.accent}>CC</text>
    </svg>
  );

  // DISCOVER phase: safe 5V badge and Rp/Rd hint
  if (phase === "discover") {
    const voltP = smooth(clamp01(local / Math.max(impactLocal, 1)));
    const vbusVolt = 5; // safe
    return (
      <>
        {header}
        {devices}
        {cables}
        {/* Voltage gauge at VBUS mid */}
        <div
          style={{
            position: "absolute",
            left: cx - 160,
            top: vbusY + 30,
            width: 320,
            height: 120,
            borderRadius: 18,
            background: `${theme.success}14`,
            border: `3px solid ${theme.success}99`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            opacity: enter,
            transform: `scale(${0.85 + pop * 0.15})`,
            boxShadow: `0 0 32px ${theme.success}33`,
          }}
        >
          <div style={{ fontFamily: theme.mono, fontSize: 44, fontWeight: 800, color: theme.success }}>{vbusVolt} В</div>
          <div style={{ fontFamily: theme.mono, fontSize: 20, color: theme.success }}>vSafe5V · БЕЗОПАСНО</div>
        </div>
        {/* CC detection hint */}
        <div
          style={{
            position: "absolute",
            left: cx - 200,
            top: ccY + 22,
            width: 400,
            textAlign: "center",
            fontFamily: theme.mono,
            fontSize: 22,
            color: theme.accent,
            opacity: enter * voltP,
          }}
        >
          Rp ─┤├─ Rd · КАБЕЛЬ ОБНАРУЖЕН
        </div>
        {/* Status */}
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1120,
            transform: `translateX(-50%) scale(${0.8 + pop * 0.2})`,
            padding: "14px 28px",
            borderRadius: 999,
            background: `${theme.success}18`,
            border: `3px solid ${theme.success}`,
            color: theme.success,
            fontFamily: theme.mono,
            fontSize: 26,
            fontWeight: 800,
            opacity: enter * pop,
            whiteSpace: "nowrap",
            boxShadow: `0 0 32px ${theme.success}44`,
          }}
        >
          5 В ДО КОНТРАКТА · 100W ЖДУТ
        </div>
        <PulseRing x={cx} y={vbusY + 90} triggerFrame={impactLocal} tone="success" size={220} />
      </>
    );
  }

  if (phase === "capabilities") {
    const packets = [
      { volt: "5 В", amp: "3A", first: true },
      { volt: "9 В", amp: "3A", first: false },
      { volt: "15 В", amp: "3A", first: false },
      { volt: "20 В", amp: "5A", first: false },
    ];
    return (
      <>
        {header}
        {devices}
        {cables}
        {/* PDO menu sliding on CC */}
        <div
          style={{
            position: "absolute",
            left: 76,
            right: 76,
            top: 680,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            opacity: enter,
          }}
        >
          {packets.map((p, i) => {
            const pEnter = spring({ frame: Math.max(0, local - i * 6), fps, config: { damping: 14, mass: 0.75 } });
            const color = p.first ? theme.success : theme.accent2;
            const label = p.first ? "ОБЯЗАТЕЛЬНО" : `PDO ${i + 1}`;
            return (
              <div
                key={i}
                style={{
                  width: 225,
                  height: 140,
                  borderRadius: 18,
                  background: p.first ? `${theme.success}18` : theme.panel,
                  border: `3px solid ${color}${p.first ? "CC" : "88"}`,
                  boxShadow: p.first ? `0 0 32px ${theme.success}44` : `0 0 20px ${color}22`,
                  opacity: enter * pEnter,
                  transform: `translateY(${(1 - pEnter) * 30}px) scale(${p.first ? 1 + 0.02 * Math.sin(local / 8) : 1})`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <div style={{ fontFamily: theme.mono, fontSize: 30, fontWeight: 800, color: color }}>{p.volt}</div>
                <div style={{ fontFamily: theme.mono, fontSize: 20, color: theme.text }}>{p.amp}</div>
                <div style={{ fontFamily: theme.mono, fontSize: 16, color: color }}>{label}</div>
              </div>
            );
          })}
        </div>
        <div
          style={{
            position: "absolute",
            left: cx - 150,
            top: ccY - 55,
            width: 300,
            height: 48,
            borderRadius: 999,
            background: `${theme.accent}1A`,
            border: `2px solid ${theme.accent}88`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontFamily: theme.mono,
            fontSize: 18,
            fontWeight: 800,
            color: theme.accent,
            opacity: enter * pop,
            transform: `translateX(${interpolate(smooth(clamp01((local - impactLocal) / 30)), [0, 1], [-40, 40])}px)`,
          }}
        >
          <IconGlyph name="radio" size={20} color={theme.accent} strokeWidth={1.8} />
          Source Capabilities
        </div>
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1040,
            transform: `translateX(-50%)`,
            padding: "10px 22px",
            borderRadius: 999,
            background: `${theme.accent}16`,
            border: `2px solid ${theme.accent}66`,
            color: theme.accent,
            fontFamily: theme.mono,
            fontSize: 22,
            fontWeight: 800,
            opacity: enter * pop,
            whiteSpace: "nowrap",
          }}
        >
          BMC 300 кбит/с · GoodCRC
        </div>
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1120,
            transform: `translateX(-50%) scale(${0.85 + pop * 0.15})`,
            padding: "14px 28px",
            borderRadius: 999,
            background: `${theme.warning}18`,
            border: `3px solid ${theme.warning}`,
            color: theme.warning,
            fontFamily: theme.mono,
            fontSize: 26,
            fontWeight: 800,
            opacity: enter * pop,
            whiteSpace: "nowrap",
          }}
        >
          МЕНЮ ВЫЛОЖЕНО · ЖДЁМ ВЫБОР
        </div>
        <PulseRing x={cx} y={750} triggerFrame={impactLocal} tone="accent" size={200} />
      </>
    );
  }

  if (phase === "request") {
    const t = smooth(clamp01((local - impactLocal) / 28));
    const reqX = interpolate(t, [0, 1], [rightX - 80, leftX + 80]);
    return (
      <>
        {header}
        {devices}
        {cables}
        {/* Request packet moving left on CC */}
        <div
          style={{
            position: "absolute",
            left: reqX - 90,
            top: ccY - 42,
            width: 180,
            height: 52,
            borderRadius: 999,
            background: theme.warning,
            color: "#1A1200",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontFamily: theme.mono,
            fontSize: 22,
            fontWeight: 800,
            opacity: hit ? 1 : 0,
            boxShadow: `0 0 28px ${theme.warning}88`,
            transform: `translateX(-50%)`,
          }}
        >
          <IconGlyph name="arrow-left" size={20} color="#1A1200" strokeWidth={2} />
          Request 9В
        </div>
        {/* Accept packet moving right */}
        <div
          style={{
            position: "absolute",
            left: interpolate(t, [0, 1], [leftX + 80, rightX - 80]) - 90,
            top: ccY - 42,
            width: 180,
            height: 52,
            borderRadius: 999,
            background: `${theme.success}`,
            color: "#06210F",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontFamily: theme.mono,
            fontSize: 22,
            fontWeight: 800,
            opacity: t > 0.45 ? 1 : 0,
            boxShadow: `0 0 28px ${theme.success}88`,
            transform: `translateX(-50%)`,
          }}
        >
          Accept
          <IconGlyph name="check" size={20} color="#06210F" strokeWidth={2} />
        </div>
        {/* Sequence hint */}
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 880,
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 18px",
            borderRadius: 999,
            background: `${theme.panel}DD`,
            border: `2px solid ${theme.panelBorder}`,
            color: theme.subtext,
            fontFamily: theme.mono,
            fontSize: 18,
            fontWeight: 800,
            opacity: enter,
          }}
        >
          <span style={{ color: theme.warning }}>Request</span>
          <span>→</span>
          <span style={{ color: theme.subtext }}>GoodCRC</span>
          <span>→</span>
          <span style={{ color: theme.success }}>Accept</span>
          <span>→</span>
          <span style={{ color: theme.subtext }}>GoodCRC</span>
        </div>
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1040,
            transform: "translateX(-50%)",
            padding: "12px 24px",
            borderRadius: 999,
            background: `${theme.warning}18`,
            border: `2px solid ${theme.warning}88`,
            color: theme.warning,
            fontFamily: theme.mono,
            fontSize: 22,
            fontWeight: 800,
            opacity: enter * pop,
            whiteSpace: "nowrap",
          }}
        >
          VBUS ЕЩЁ 5 В · ПЕРЕКЛЮЧЕНИЕ ПОСЛЕ Accept
        </div>
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1120,
            transform: `translateX(-50%) scale(${0.85 + pop * 0.15})`,
            padding: "14px 28px",
            borderRadius: 999,
            background: `${theme.warning}14`,
            border: `3px solid ${theme.warning}`,
            color: theme.warning,
            fontFamily: theme.mono,
            fontSize: 26,
            fontWeight: 800,
            opacity: enter * pop,
            whiteSpace: "nowrap",
          }}
        >
          ВЫБОР ОТПРАВЛЕН · ПРИНЯТО
        </div>
        <PulseRing x={cx} y={ccY} triggerFrame={impactLocal} tone="warning" size={240} />
      </>
    );
  }

  // contract
  const voltTarget = 20;
  const rampP = smooth(clamp01((local - impactLocal) / 32));
  const curVolt = interpolate(rampP, [0, 1], [5, voltTarget]);
  const withinTol = rampP > 0.85;
  return (
    <>
      {header}
      {devices}
      {cables}
      {/* Voltage ramp */}
      <div
        style={{
          position: "absolute",
          left: 76,
          top: 940,
          width: 928,
          height: 28,
          borderRadius: 999,
          background: theme.panelBorder,
          overflow: "hidden",
          opacity: enter,
        }}
      >
        <div
          style={{
            width: `${(curVolt / voltTarget) * 100}%`,
            height: "100%",
            borderRadius: 999,
            background: withinTol ? theme.success : theme.warning,
            boxShadow: `0 0 24px ${withinTol ? theme.success : theme.warning}88`,
            transition: "background 0.2s",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 76 + (curVolt / voltTarget) * 928 - 60,
          top: 980,
          width: 120,
          textAlign: "center",
          fontFamily: theme.mono,
          fontSize: 28,
          fontWeight: 800,
          color: withinTol ? theme.success : theme.warning,
          opacity: enter,
          transform: `translateX(-50%) scale(${0.9 + pop * 0.1})`,
        }}
      >
        {curVolt.toFixed(1)} В
      </div>
      <div
        style={{
          position: "absolute",
          left: 760,
          top: 980,
          fontFamily: theme.mono,
          fontSize: 20,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        ЦЕЛЬ {voltTarget} В ±5%
      </div>
      {/* PS_RDY badge */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 1050,
          transform: `translateX(-50%) scale(${withinTol ? 0.85 + pop * 0.15 : 0.9})`,
          padding: "14px 28px",
          borderRadius: 999,
          background: withinTol ? `${theme.success}18` : `${theme.warning}18`,
          border: `3px solid ${withinTol ? theme.success : theme.warning}`,
          color: withinTol ? theme.success : theme.warning,
          fontFamily: theme.mono,
          fontSize: 26,
          fontWeight: 800,
          opacity: enter * (withinTol ? pop : 0.7),
          whiteSpace: "nowrap",
          boxShadow: withinTol ? `0 0 32px ${theme.success}44` : "none",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <IconGlyph name={withinTol ? "check-circle" : "clock"} size={28} color={withinTol ? theme.success : theme.warning} strokeWidth={1.8} />
        {withinTol ? "PS_RDY · МОЖНО БРАТЬ ТОК" : "Ждём ±5% …"}
      </div>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 1130,
          transform: "translateX(-50%)",
          padding: "10px 20px",
          borderRadius: 999,
          background: `${theme.panel}DD`,
          border: `2px solid ${theme.panelBorder}`,
          color: theme.subtext,
          fontFamily: theme.mono,
          fontSize: 18,
          fontWeight: 800,
          opacity: enter,
          whiteSpace: "nowrap",
        }}
      >
        только после PS_RDY телефон берёт ток · GoodCRC
      </div>
      {withinTol ? <PulseRing x={cx} y={980} triggerFrame={impactLocal} tone="success" size={260} /> : null}
    </>
  );
};

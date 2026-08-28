import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type BgpReroutePhase = "break" | "withdraw" | "reroute" | "converge";

/** BGP reroute: кабель рвётся, BGP UPDATE отзывает маршрут, роутеры выбирают запасной путь. */
export const BgpRerouteVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: BgpReroutePhase;
}> = ({ local, fps, impactLocal, phase = "break" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;

  const cx = layout.width / 2;
  const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };

  // Router positions — pentagon-ish layout for 4 routers
  const routers = [
    { id: "R1", x: cx, y: 520, label: "AS 64501", icon: "network", tone: theme.accent },
    { id: "R2", x: 220, y: 780, label: "AS 64502", icon: "network", tone: theme.accent2 },
    { id: "R3", x: 860, y: 780, label: "AS 64503", icon: "network", tone: theme.accent2 },
    { id: "R4", x: cx, y: 1040, label: "AS 64504", icon: "network", tone: theme.success },
  ];

  // Links between routers (pairs of indices)
  const links = [
    { from: 0, to: 1, broken: true },
    { from: 0, to: 2, broken: false },
    { from: 1, to: 3, broken: false },
    { from: 2, to: 3, broken: false },
    { from: 1, to: 2, broken: false },
  ];
  const showConvergePackets = phase === "reroute" || phase === "converge";

  const phaseTitle: Record<BgpReroutePhase, string> = {
    break: "ОБРЫВ КАБЕЛЯ · СТАРАЯ ТРАССА НЕЖИЗНЕННА",
    withdraw: "BGP UPDATE · ОТЗЫВ МАРШРУТА",
    reroute: "ВЫБОР АЛЬТЕРНАТИВЫ · НОВАЯ ТРАССА",
    converge: "КОНВЕРГЕНЦИЯ · ТРАФИК ВОССТАНОВЛЕН",
  };

  const phaseColor = phase === "break" || phase === "withdraw" ? theme.danger : phase === "reroute" ? theme.warning : theme.success;

  return (
    <>
      {/* Phase title */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 300,
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontFamily: theme.mono,
          fontSize: 24,
          letterSpacing: 3,
          color: phaseColor,
          opacity: enter,
          whiteSpace: "nowrap",
        }}
      >
        <IconGlyph
          name={phase === "break" ? "cable" : phase === "withdraw" ? "radio" : phase === "reroute" ? "route" : "check-circle"}
          size={28}
          color={phaseColor}
          strokeWidth={1.8}
        />
        {phaseTitle[phase]}
      </div>

      {/* Status badge */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 370,
          transform: `translateX(-50%) scale(${0.85 + pop * 0.15})`,
          padding: "12px 26px",
          borderRadius: 14,
          background: `${phaseColor}18`,
          border: `3px solid ${phaseColor}`,
          boxShadow: `0 0 32px ${phaseColor}33`,
          opacity: enter,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <IconGlyph
          name={phase === "break" ? "x-circle" : phase === "withdraw" ? "alert-triangle" : phase === "reroute" ? "refresh-cw" : "check-circle"}
          size={28}
          color={phaseColor}
          strokeWidth={1.8}
        />
        <span style={{ fontFamily: theme.mono, fontSize: 26, fontWeight: 800, color: theme.text }}>
          {phase === "break" ? "LINK DOWN" : phase === "withdraw" ? "WITHDRAW" : phase === "reroute" ? "COMPUTE" : "CONVERGED"}
        </span>
      </div>

      {/* Links between routers */}
      <svg
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
        width={layout.width}
        height={layout.safeBottom}
        viewBox={`0 0 ${layout.width} ${layout.safeBottom}`}
      >
        {links.map((link, i) => {
          const r1 = routers[link.from];
          const r2 = routers[link.to];
          const isOldBroken = link.broken;
          const isNewPath =
            (phase === "reroute" || phase === "converge") &&
            ((link.from === 0 && link.to === 2) || (link.from === 2 && link.to === 3));
          const color = isOldBroken
            ? theme.danger
            : isNewPath
              ? phase === "converge"
                ? theme.success
                : theme.warning
              : theme.accent2;
          const dashArray = isOldBroken ? "12 10" : "none";
          const opacity = enter * (isOldBroken ? 0.5 : 1);

          // Animated dash offset for broken link
          const dashOffset = isOldBroken ? local * 0.8 : 0;

          return (
            <g key={i}>
              <line
                x1={r1.x}
                y1={r1.y}
                x2={r2.x}
                y2={r2.y}
                stroke={color}
                strokeWidth={isOldBroken ? 3 : 5}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                opacity={opacity}
              />
              {/* Break X on broken link */}
              {isOldBroken && (
                <g>
                  <line
                    x1={(r1.x + r2.x) / 2 - 18}
                    y1={(r1.y + r2.y) / 2 - 18}
                    x2={(r1.x + r2.x) / 2 + 18}
                    y2={(r1.y + r2.y) / 2 + 18}
                    stroke={theme.danger}
                    strokeWidth={6}
                    strokeLinecap="round"
                    opacity={enter}
                  />
                  <line
                    x1={(r1.x + r2.x) / 2 + 18}
                    y1={(r1.y + r2.y) / 2 - 18}
                    x2={(r1.x + r2.x) / 2 - 18}
                    y2={(r1.y + r2.y) / 2 + 18}
                    stroke={theme.danger}
                    strokeWidth={6}
                    strokeLinecap="round"
                    opacity={enter}
                  />
                </g>
              )}
              {/* Animated packets on reroute path */}
              {isNewPath && showConvergePackets && (
                <circle
                  cx={interpolate(clamp01((local - impactLocal) / 40), [0, 1], [r1.x, r2.x])}
                  cy={interpolate(clamp01((local - impactLocal) / 40), [0, 1], [r1.y, r2.y])}
                  r={10}
                  fill={theme.success}
                  opacity={enter * pop}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Router nodes */}
      {routers.map((r, i) => {
        const routerEnter = spring({ frame: Math.max(0, local - i * 4), fps, config: { damping: 14, mass: 0.75 } });
        const isSource = i === 0;
        const isDest = i === 3;
        const borderColor = isSource ? theme.accent : isDest ? theme.success : theme.accent2;
        const active = phase === "converge" && (i === 0 || i === 2 || i === 3);
        return (
          <div
            key={r.id}
            style={{
              position: "absolute",
              left: r.x - 100,
              top: r.y - 100,
              width: 200,
              height: 200,
              borderRadius: 24,
              background: theme.panel,
              border: `3px solid ${active ? theme.success : borderColor}99`,
              boxShadow: active ? `0 0 36px ${theme.success}44` : `0 0 28px ${borderColor}22`,
              opacity: enter * routerEnter,
              transform: `translateY(${(1 - routerEnter) * 30}px) scale(${1 + 0.015 * Math.sin(local / 11 + i)})`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <IconGlyph name={r.icon} size={44} color={active ? theme.success : borderColor} strokeWidth={1.7} />
            <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 24, color: theme.text }}>{r.id}</div>
            <div
              style={{
                padding: "3px 8px",
                borderRadius: 999,
                background: `${active ? theme.success : borderColor}18`,
                border: `1px solid ${active ? theme.success : borderColor}88`,
                fontFamily: theme.mono,
                fontSize: 14,
                fontWeight: 800,
                color: active ? theme.success : borderColor,
              }}
            >
              {r.label}
            </div>
          </div>
        );
      })}

      {/* BGP UPDATE badge — withdraw phase */}
      {phase === "withdraw" && (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1160,
            transform: `translateX(-50%) scale(${0.8 + pop * 0.2})`,
            padding: "14px 28px",
            borderRadius: 14,
            background: `${theme.danger}18`,
            border: `3px solid ${theme.danger}`,
            boxShadow: `0 0 32px ${theme.danger}44`,
            opacity: enter * pop,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <IconGlyph name="radio" size={28} color={theme.danger} strokeWidth={1.8} />
          <span style={{ fontFamily: theme.mono, fontSize: 24, fontWeight: 800, color: theme.danger }}>
            BGP UPDATE · WITHDRAW 192.168.0.0/16
          </span>
        </div>
      )}

      {/* Compute badge — reroute phase */}
      {phase === "reroute" && (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1160,
            transform: `translateX(-50%) scale(${0.8 + pop * 0.2})`,
            padding: "14px 28px",
            borderRadius: 14,
            background: `${theme.warning}18`,
            border: `3px solid ${theme.warning}`,
            boxShadow: `0 0 32px ${theme.warning}44`,
            opacity: enter * pop,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <IconGlyph name="refresh-cw" size={28} color={theme.warning} strokeWidth={1.8} />
          <span style={{ fontFamily: theme.mono, fontSize: 24, fontWeight: 800, color: theme.warning }}>
            НОВЫЙ ПУТЬ: R1 → R3 → R4
          </span>
        </div>
      )}

      {/* Success badge — converge */}
      {phase === "converge" && (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1160,
            transform: `translateX(-50%) scale(${0.8 + pop * 0.2})`,
            padding: "14px 28px",
            borderRadius: 14,
            background: `${theme.success}18`,
            border: `3px solid ${theme.success}`,
            boxShadow: `0 0 32px ${theme.success}44`,
            opacity: enter * pop,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <IconGlyph name="check-circle" size={28} color={theme.success} strokeWidth={1.8} />
          <span style={{ fontFamily: theme.mono, fontSize: 24, fontWeight: 800, color: theme.success }}>
            КОНВЕРГЕНЦИЯ · ~30 СЕК
          </span>
        </div>
      )}

      <PulseRing x={cx} y={routers[0].y} triggerFrame={impactLocal} tone={phaseColor === theme.danger ? "danger" : phaseColor === theme.warning ? "warning" : "success"} size={260} />
    </>
  );
};

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

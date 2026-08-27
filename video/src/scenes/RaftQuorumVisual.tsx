import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, theme, toneColor } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const W = layout.width;

export type RaftQuorumPhase = "cluster" | "poll" | "commit" | "failure" | "no-commit";

interface ServerDef {
  id: string;
  label: string;
  x: number;
  y: number;
}

const CX = W / 2;
const CY = 780;
const R = 260;
const servers: ServerDef[] = [0, 1, 2, 3, 4].map((i) => {
  const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
  return { id: `s${i + 1}`, label: `S${i + 1}`, x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
});

export const RaftQuorumVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: RaftQuorumPhase;
  quorum?: boolean;
  leader?: number;
}> = ({ local, fps, impactLocal, phase = "cluster", quorum = true, leader = 1 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;

  const headers: Record<RaftQuorumPhase, string> = {
    cluster: "RAFT-КЛАСТЕР · 5 СЕРВЕРОВ",
    poll: "ЛИДЕР ОПРАШИВАЕТ КЛАСТЕР",
    commit: "ЗАПИСЬ ПОДТВЕРЖДЕНА",
    failure: "КВОРУМА НЕТ · НОВЫЕ ЗАПИСИ",
    "no-commit": "УЖЕ ЗАПИСАННОЕ — НА МЕСТЕ",
  };

  const getState = (i: number): "leader" | "follower" | "down" => {
    if (i === leader) return "leader";
    if (phase === "failure" || phase === "no-commit") {
      if (quorum) return i === 3 || i === 4 ? "follower" : "down";
      return i <= 2 ? "follower" : "down";
    }
    if (phase === "cluster") return i <= 1 ? "down" : "follower";
    return i <= 1 ? "down" : "follower";
  };

  const colorOf = (s: "leader" | "follower" | "down") =>
    s === "leader" ? theme.success : s === "follower" ? theme.accent : theme.danger;

  const iconOf = (s: "leader" | "follower" | "down") =>
    s === "leader" ? "server" : s === "follower" ? "server" : "server-crash";

  const node = (srv: ServerDef, state: "leader" | "follower" | "down", delay: number) => {
    const p = spring({ frame: Math.max(0, local - delay), fps, config: { damping: 14, mass: 0.8 } });
    const color = colorOf(state);
    const isLeader = state === "leader";
    const isDown = state === "down";
    const pulse = isLeader && done ? 1 + 0.04 * Math.sin((local - impactLocal) / 6) : 1;

    return (
      <div
        key={srv.id}
        style={{
          position: "absolute",
          left: srv.x - 70,
          top: srv.y - 52,
          width: 140,
          height: 104,
          borderRadius: 22,
          background: isDown ? `${theme.panel}CC` : theme.panel,
          border: `3px solid ${color}${isDown ? "55" : "CC"}`,
          boxShadow: isDown ? "none" : `0 0 ${isLeader ? 42 : 22}px ${color}33`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          opacity: enter * p,
          transform: `translateY(${(1 - p) * 40}px) scale(${pulse})`,
        }}
      >
        <IconGlyph name={iconOf(state)} size={36} color={color} strokeWidth={1.7} />
        <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 24, color: isDown ? theme.subtext : theme.text }}>{srv.label}</div>
        {isLeader ? <div style={{ fontFamily: theme.mono, fontSize: 16, color: theme.success, letterSpacing: 1 }}>LEADER</div> : null}
        {isDown ? (
          <div style={{ position: "absolute", top: -10, right: -10 }}>
            <IconGlyph name="circle-x" size={28} color={theme.danger} strokeWidth={2.2} />
          </div>
        ) : null}
      </div>
    );
  };

  const edges = (fromIdx: number, toIdx: number, color: string, op: number, dashed = false) => {
    const a = servers[fromIdx];
    const b = servers[toIdx];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const inset = 75;
    return (
      <div
        key={`e-${fromIdx}-${toIdx}`}
        style={{
          position: "absolute",
          left: a.x + Math.cos((angle * Math.PI) / 180) * inset,
          top: a.y + Math.sin((angle * Math.PI) / 180) * inset,
          width: len - inset * 2,
          height: 3,
          transformOrigin: "0 50%",
          transform: `rotate(${angle}deg)`,
          background: dashed ? "transparent" : color,
          borderTop: dashed ? `3px dashed ${color}` : undefined,
          opacity: op,
        }}
      />
    );
  };

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: CX,
          top: 300,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontWeight: 800,
          fontSize: 26,
          letterSpacing: 2,
          color: quorum ? theme.success : theme.danger,
          opacity: enter,
          whiteSpace: "nowrap",
        }}
      >
        {headers[phase]}
      </div>
      {/* pentagon edges */}
      {servers.map((_, i) => {
        const si = getState(i);
        const isDown = si === "down";
        const color = isDown ? `${theme.danger}44` : `${theme.accent}44`;
        return edges(i, (i + 1) % 5, color, enter * (isDown ? 0.3 : 0.7), isDown);
      })}
      {/* leader→follower lines for poll/commit */}
      {(phase === "poll" || phase === "commit") &&
        servers.map((_, i) => {
          if (i === leader) return null;
          const si = getState(i);
          if (si === "down") return null;
          const color = phase === "commit" ? theme.success : theme.accent2;
          return edges(leader, i, color, enter * 0.85);
        })}
      {/* server nodes */}
      {servers.map((srv, i) => node(srv, getState(i), i * 5))}
      {/* quorum badge for commit */}
      {phase === "commit" && done && (
        <div
          style={{
            position: "absolute",
            left: CX,
            top: 1140,
            transform: `translateX(-50%) scale(${0.8 + badgeP * 0.2})`,
            padding: "18px 36px",
            borderRadius: 999,
            background: `${theme.success}18`,
            border: `3px solid ${theme.success}`,
            color: theme.success,
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: 2,
            opacity: enter * badgeP,
            boxShadow: `0 0 40px ${theme.success}55`,
            whiteSpace: "nowrap",
          }}
        >
          3 ИЗ 5 — КВОРУМ ✓
        </div>
      )}
      {/* failure badge */}
      {(phase === "failure" || phase === "no-commit") && done && (
        <div
          style={{
            position: "absolute",
            left: CX,
            top: 1140,
            transform: `translateX(-50%) scale(${0.8 + badgeP * 0.2})`,
            padding: "18px 36px",
            borderRadius: 999,
            background: `${theme.danger}18`,
            border: `3px solid ${theme.danger}`,
            color: theme.danger,
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 28,
            letterSpacing: 2,
            opacity: enter * badgeP,
            boxShadow: `0 0 30px ${theme.danger}33`,
            whiteSpace: "nowrap",
          }}
        >
          {phase === "failure" ? "2 ИЗ 5 — КВОРУМА НЕТ" : "КОММИТЫ СОХРАНЕНЫ"}
        </div>
      )}
      {done && <PulseRing x={CX} y={CY} triggerFrame={impactLocal} tone={quorum ? "success" : "danger"} size={580} />}
    </>
  );
};

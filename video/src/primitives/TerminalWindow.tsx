import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { theme } from "../lib/theme";
import type { TerminalCommand } from "../lib/types";

const CHAR_FRAMES = 1.2; // скорость печати команды

/** Окно терминала: команды печатаются, вывод появляется построчно. */
export const TerminalWindow: React.FC<{
  commands: TerminalCommand[];
  x: number;
  y: number;
  width?: number;
  startFrame?: number;
}> = ({ commands, x, y, width = 940, startFrame = 10 }) => {
  const frame = useCurrentFrame();

  // расписание: команда печатается, затем вывод построчно
  let cursor = startFrame;
  const rows: { text: string; kind: "cmd" | "out"; from: number; typed?: boolean }[] = [];
  for (const c of commands) {
    rows.push({ text: c.cmd, kind: "cmd", from: cursor, typed: true });
    cursor += Math.ceil(c.cmd.length * CHAR_FRAMES) + 8;
    for (const line of c.output ?? []) {
      rows.push({ text: line, kind: "out", from: cursor });
      cursor += 10;
    }
    cursor += 6;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: x - width / 2,
        top: y,
        width,
        background: "#0A0F18",
        border: `2px solid ${theme.panelBorder}`,
        borderRadius: 24,
        overflow: "hidden",
        boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", gap: 12, padding: "20px 24px", background: theme.panel }}>
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <div key={c} style={{ width: 22, height: 22, borderRadius: 11, background: c }} />
        ))}
      </div>
      <div style={{ padding: "28px 32px 36px", fontFamily: theme.mono, fontSize: 34, lineHeight: 1.65 }}>
        {rows.map((r, i) => {
          if (frame < r.from) return null;
          let text = r.text;
          if (r.typed) {
            const chars = Math.floor((frame - r.from) / CHAR_FRAMES);
            text = r.text.slice(0, Math.max(0, chars));
          }
          const opacity = r.typed
            ? 1
            : interpolate(frame, [r.from, r.from + 6], [0, 1], {
                extrapolateRight: "clamp",
              });
          return (
            <div key={i} style={{ opacity, color: r.kind === "cmd" ? theme.text : theme.subtext }}>
              {r.kind === "cmd" ? <span style={{ color: theme.success }}>$ </span> : null}
              {text}
              {r.typed && text.length < r.text.length ? (
                <span style={{ color: theme.accent }}>▋</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

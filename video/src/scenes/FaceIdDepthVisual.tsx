import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";

export type FaceIdDepthPhase = "darkness" | "dots" | "depth";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: FaceIdDepthPhase;
};

const W = layout.width;
const H = layout.height;
const CX = W / 2;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const PhaseTitle: React.FC<{ phase: FaceIdDepthPhase; opacity: number }> = ({ phase, opacity }) => {
  const title: Record<FaceIdDepthPhase, string> = {
    darkness: "Лицо в темноте",
    dots: "Точечный проектор",
    depth: "Карта глубины",
  };
  return (
    <div
      style={{
        position: "absolute",
        top: layout.safeTop + 30,
        left: 50,
        right: 50,
        textAlign: "center",
        color: theme.text,
        fontFamily: theme.font,
        fontSize: 48,
        fontWeight: 800,
        lineHeight: 1.08,
        opacity,
      }}
    >
      {title[phase]}
    </div>
  );
};

export const FaceIdDepthVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "darkness" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 16, mass: 0.75 } });
  const reveal = smooth(local / 24);
  const hit = local >= impactLocal ? Math.exp(-(local - impactLocal) * 0.18) : 0;

  const darknessParticles = Array.from({ length: 50 }, (_, i) => ({
    x: 100 + (Math.random() * 880),
    y: 200 + (Math.random() * 1520),
    size: 1 + Math.random() * 3,
    speed: 0.5 + Math.random() * 1.5,
  }));

  const dotPositions = Array.from({ length: 150 }, (_, i) => ({
    x: 100 + (Math.random() * 880),
    y: 300 + (Math.random() * 1320),
    brightness: 0.3 + Math.random() * 0.7,
  }));

  const depthMapPoints = Array.from({ length: 100 }, (_, i) => ({
    x: 50 + (Math.random() * 980),
    y: 400 + (Math.random() * 1120),
    height: 2 + Math.random() * 4,
    depthValue: 0.5 + Math.random() * 0.5,
  }));

  return (
    <div style={{ position: "relative", width: W, height: H, overflow: "hidden" }}>
      <PhaseTitle phase={phase} opacity={enter} />

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: theme.bg,
          opacity: enter,
        }}
      />

      {phase === "darkness" && (
        <div
          style={{
            position: "absolute",
            top: 400,
            left: CX - 200,
            width: 400,
            height: 400,
            borderRadius: 500,
            background: theme.panel,
            boxShadow: `0 0 80px ${theme.accent}33`,
            opacity: enter * 0.8,
          }}
        >
          <IconGlyph name="face-smile" size={120} color={theme.accent} />
        </div>
      )}

      {phase === "dots" && (
        <svg viewBox="0 0 1080 1920" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
          {dotPositions.map((dot, i) => (
            <circle
              key={i}
              cx={dot.x}
              cy={dot.y}
              r={2}
              fill={theme.accent}
              opacity={dot.brightness * enter * 0.5}
            />
          ))}
        </svg>
      )}

      {phase === "depth" && (
        <svg viewBox="0 0 1080 1920" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
          {depthMapPoints.map((point, i) => (
            <line
              key={i}
              x1={point.x}
              y1={point.y}
              x2={point.x + 1}
              y2={point.y - point.height}
              stroke={theme.accent}
              strokeWidth={point.height}
              opacity={0.3 * enter}
            />
          ))}
        </svg>
      )}

      {phase === "darkness" && (
        <div
          style={{
            position: "absolute",
            left: CX - 100,
            top: 800,
            width: 200,
            height: 40,
            borderRadius: 999,
            background: `${theme.accent}20`,
            border: `2px solid ${theme.accent}88`,
            color: theme.accent,
            fontFamily: theme.mono,
            fontSize: 24,
            fontWeight: 800,
            textAlign: "center",
            opacity: enter * 0.6,
            whiteSpace: "nowrap",
          }}
        >
          Flood Illuminator — невидимая подсветка
        </div>
      )}

      {phase === "dots" && (
        <div
          style={{
            position: "absolute",
            left: CX - 120,
            top: 800,
            width: 240,
            height: 40,
            borderRadius: 999,
            background: `${theme.accent2}20`,
            border: `2px solid ${theme.accent2}88`,
            color: theme.accent2,
            fontFamily: theme.mono,
            fontSize: 24,
            fontWeight: 800,
            textAlign: "center",
            opacity: enter * 0.6,
            whiteSpace: "nowrap",
          }}
        >
          30 000 невидимых точек
        </div>
      )}

      {phase === "depth" && (
        <div
          style={{
            position: "absolute",
            left: CX - 120,
            top: 800,
            width: 240,
            height: 40,
            borderRadius: 999,
            background: `${theme.success}20`,
            border: `2px solid ${theme.success}88`,
            color: theme.success,
            fontFamily: theme.mono,
            fontSize: 24,
            fontWeight: 800,
            textAlign: "center",
            opacity: enter * 0.6,
            whiteSpace: "nowrap",
          }}
        >
          3D-рельеф лица
        </div>
      )}
    </div>
  );
};
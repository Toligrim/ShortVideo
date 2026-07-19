import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, theme } from "../lib/theme";
import type { HookScene as HookProps } from "../lib/types";

/** Хук: крупный заголовок, слова влетают по одному. */
export const HookScene: React.FC<{ scene: HookProps }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = scene.title.split(" ");
  const breathe = 1 + 0.03 * Math.sin(frame / 18);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 70,
          right: 70,
          top: layout.height * 0.3,
          display: "flex",
          flexWrap: "wrap",
          gap: "12px 26px",
          justifyContent: "center",
          transform: `scale(${breathe})`,
        }}
      >
        {words.map((w, i) => {
          const s = spring({ frame: frame - 4 - i * 5, fps, config: { damping: 11, mass: 0.9 } });
          const tilt = (1 - s) * (i % 2 === 0 ? -10 : 10);
          const sway = 1.4 * Math.sin(frame / 14 + i * 1.7);
          return (
            <span
              key={i}
              style={{
                fontFamily: theme.font,
                fontWeight: 800,
                fontSize: 108,
                lineHeight: 1.08,
                color: i % 3 === 1 ? theme.accent : theme.text,
                transform: `translateY(${(1 - s) * 90 + sway}px) scale(${0.5 + 0.5 * s}) rotate(${tilt + sway * 0.4}deg)`,
                opacity: s,
                textShadow:
                  i % 3 === 1
                    ? `0 0 50px ${theme.accent}55, 0 6px 40px rgba(0,0,0,0.6)`
                    : "0 6px 40px rgba(0,0,0,0.6)",
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
      {scene.subtitle ? (
        <div
          style={{
            position: "absolute",
            left: 90,
            right: 90,
            top: layout.height * 0.62,
            textAlign: "center",
            fontFamily: theme.font,
            fontSize: 50,
            color: theme.subtext,
            opacity: interpolate(frame, [24, 40], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {scene.subtitle}
        </div>
      ) : null}
    </>
  );
};

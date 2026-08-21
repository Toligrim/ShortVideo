import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import type { OutroScene as OutroProps } from "../lib/types";

/** Финал: заголовок, пункты-выводы, пульсирующий CTA. */
export const OutroScene: React.FC<{ scene: OutroProps; frames: number }> = ({ scene, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleS = spring({ frame: frame - 4, fps, config: { damping: 13 } });
  const ctaFrom = Math.min(Math.round(frames * 0.55), frames - 30);
  const pulse = 1 + 0.035 * Math.sin(((frame - ctaFrom) / fps) * Math.PI * 2.2);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: layout.height * 0.2,
          textAlign: "center",
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 88,
          color: theme.text,
          opacity: titleS,
          transform: `translateY(${(1 - titleS) * 50}px)`,
        }}
      >
        {scene.title}
      </div>
      <div
        style={{
          position: "absolute",
          left: 130,
          right: 130,
          top: layout.height * 0.33,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {(scene.bullets ?? []).map((b, i) => {
          const s = spring({ frame: frame - 16 - i * 9, fps, config: { damping: 14 } });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 26,
                opacity: s,
                transform: `translateX(${(1 - s) * 80}px)`,
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  background: theme.accent,
                  boxShadow: `0 0 24px ${theme.accent}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontFamily: theme.font, fontWeight: 700, fontSize: 48, color: theme.text }}>
                {b}
              </span>
            </div>
          );
        })}
      </div>
      {scene.cta ? (
        <>
        <PulseRing
          x={layout.width / 2}
          y={layout.height * 0.59 + 60}
          triggerFrame={ctaFrom}
          size={420}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: layout.height * 0.59,
            display: "flex",
            justifyContent: "center",
            opacity: interpolate(frame, [ctaFrom, ctaFrom + 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div
            style={{
              transform: `scale(${frame >= ctaFrom ? pulse : 1})`,
              background: theme.accent,
              color: "#06121A",
              fontFamily: theme.font,
              fontWeight: 800,
              fontSize: 40,
              padding: "16px 32px",
              borderRadius: 999,
              boxShadow: `0 0 60px ${theme.accent}66`,
              maxWidth: 900,
              textAlign: "center",
              lineHeight: 1.05,
            }}
          >
            {scene.cta}
          </div>
        </div>
        </>
      ) : null}
    </>
  );
};

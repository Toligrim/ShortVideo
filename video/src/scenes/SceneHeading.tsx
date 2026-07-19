import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { layout, theme } from "../lib/theme";

export const SceneHeading: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: layout.safeTop,
        textAlign: "center",
        fontFamily: theme.font,
        fontWeight: 800,
        fontSize: 58,
        color: theme.text,
        opacity,
        transform: `translateY(${(1 - opacity) * -20}px)`,
      }}
    >
      {text}
    </div>
  );
};

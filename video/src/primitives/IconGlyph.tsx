import React from "react";
import { icons } from "lucide-react";
import { theme } from "../lib/theme";

const toPascal = (name: string) =>
  name
    .split(/[-_ ]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");

export const IconGlyph: React.FC<{
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}> = ({ name, size = 64, color = theme.text, strokeWidth = 2 }) => {
  const Icon = icons[toPascal(name) as keyof typeof icons];
  if (!Icon) {
    return (
      <div style={{ width: size, height: size, borderRadius: size / 4, border: `3px solid ${color}` }} />
    );
  }
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
};

import { displayFont, monoFont } from "./fonts";

export const theme = {
  bg: "#0B0E14",
  panel: "#141A26",
  panelBorder: "#232C3D",
  text: "#E8EEF6",
  subtext: "#8B96A8",
  accent: "#22D3EE", // циан — основной
  accent2: "#A78BFA", // фиолетовый — вторичный
  success: "#34D399",
  danger: "#F87171",
  warning: "#FBBF24",
  font: displayFont,
  mono: monoFont,
} as const;

export type Tone = "accent" | "accent2" | "success" | "danger" | "warning";

export const toneColor = (tone?: Tone): string => theme[tone ?? "accent"];

// Вертикальный формат 1080×1920: safe-зоны под UI платформ
export const layout = {
  width: 1080,
  height: 1920,
  safeTop: 150,
  safeBottom: 1650, // ниже — только субтитры
  karaokeY: 1660,
} as const;

export const FPS = 30;
// Тишина до и после реплики внутри сцены (сек)
export const LEAD_SEC = 0.2;
export const TAIL_SEC = 0.55;

import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";

// Кириллические начертания; веса, реально используемые в движке
const montserrat = loadMontserrat("normal", {
  weights: ["700", "800"],
  subsets: ["cyrillic", "latin"],
});
const jetbrains = loadJetBrains("normal", {
  weights: ["400", "700"],
  subsets: ["cyrillic", "latin"],
});

export const displayFont = `${montserrat.fontFamily}, 'Liberation Sans', sans-serif`;
export const monoFont = `${jetbrains.fontFamily}, 'DejaVu Sans Mono', monospace`;

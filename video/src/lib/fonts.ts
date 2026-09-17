import { getInfo as getMontserratInfo } from "@remotion/google-fonts/Montserrat";
import { getInfo as getJetBrainsInfo } from "@remotion/google-fonts/JetBrainsMono";
import { loadFontFromInfo } from "@remotion/google-fonts/from-info";
import { staticFile } from "remotion";

// Fonts are vendored under public/fonts (see public/fonts/README.md) instead
// of fetched from fonts.gstatic.com at render time: the engine keeps no
// persistent Chromium profile, so a live-fetch failure kills a render with
// no output, and the OpenRouter sandbox's animation-director role has no
// network at all by design. Regenerate with `node scripts/fetch-fonts.cjs`
// if a package version bump moves the upstream URLs.
const LOCAL_FILES: Record<string, Record<string, string>> = {
  Montserrat: {
    cyrillic: "montserrat-v31-cyrillic.woff2",
    latin: "montserrat-v31-latin.woff2",
  },
  JetBrainsMono: {
    cyrillic: "jetbrainsmono-v24-cyrillic.woff2",
    latin: "jetbrainsmono-v24-latin.woff2",
  },
};

function localizeFontInfo<T extends { fonts: Record<string, Record<string, Record<string, string>>> }>(
  importName: string,
  info: T,
  weights: string[],
  subsets: string[],
): T {
  const localized = structuredClone(info);
  const localMap = LOCAL_FILES[importName];
  for (const weight of weights) {
    const bySubset = localized.fonts.normal?.[weight];
    if (!bySubset) {
      throw new Error(`fonts.ts: ${importName} has no normal/${weight} in getInfo()`);
    }
    for (const subset of subsets) {
      const filename = localMap?.[subset];
      if (!filename) {
        throw new Error(
          `fonts.ts: no vendored file for ${importName} subset "${subset}" - ` +
            "run `node scripts/fetch-fonts.cjs` and add it to LOCAL_FILES",
        );
      }
      bySubset[subset] = staticFile(`fonts/${filename}`);
    }
  }
  // Belt-and-braces: fail loudly rather than silently reaching for the CDN
  // if a future edit changes the requested matrix without updating LOCAL_FILES.
  for (const weight of weights) {
    for (const subset of subsets) {
      const url = localized.fonts.normal[weight][subset];
      if (url.startsWith("http")) {
        throw new Error(`fonts.ts: ${importName} normal/${weight}/${subset} was not localized`);
      }
    }
  }
  return localized;
}

// Кириллические начертания; веса, реально используемые в движке
const montserratWeights = ["700", "800"];
const montserratSubsets = ["cyrillic", "latin"];
const montserratInfo = localizeFontInfo(
  "Montserrat",
  getMontserratInfo(),
  montserratWeights,
  montserratSubsets,
);
const montserrat = loadFontFromInfo(montserratInfo, "normal", {
  weights: montserratWeights,
  subsets: montserratSubsets,
});

const jetbrainsWeights = ["400", "700"];
const jetbrainsSubsets = ["cyrillic", "latin"];
const jetbrainsInfo = localizeFontInfo(
  "JetBrainsMono",
  getJetBrainsInfo(),
  jetbrainsWeights,
  jetbrainsSubsets,
);
const jetbrains = loadFontFromInfo(jetbrainsInfo, "normal", {
  weights: jetbrainsWeights,
  subsets: jetbrainsSubsets,
});

export const displayFont = `${montserrat.fontFamily}, 'Liberation Sans', sans-serif`;
export const monoFont = `${jetbrains.fontFamily}, 'DejaVu Sans Mono', monospace`;

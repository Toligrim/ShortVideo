import React, { useLayoutEffect, useState } from "react";
import { Artifact, continueRender, delayRender, useCurrentFrame } from "remotion";

/**
 * Deterministic layout QC, independent of any LLM actually looking at stills.
 * After each frame settles, walks the real DOM (not component props — this is
 * what caught the utf8-boundary bug: a title that only overlapped its caption
 * once it wrapped to 2 lines, which no prop-level check would have seen) and
 * flags any two distinct text-bearing leaf elements whose boxes substantially
 * intersect. Emits an <Artifact> so `remotion render`/`still` writes the
 * report to disk without any per-visual instrumentation.
 */

type OverlapReport = {
  frame: number;
  pairs: {
    textA: string;
    textB: string;
    rectA: { x: number; y: number; w: number; h: number };
    rectB: { x: number; y: number; w: number; h: number };
    overlapPct: number;
  }[];
};

const OVERLAP_THRESHOLD_PCT = 0.2;

const computeOverlaps = (): OverlapReport["pairs"] => {
  if (typeof document === "undefined") return [];
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("div,span"))
    .filter((el) => el.children.length === 0)
    .filter((el) => (el.textContent ?? "").trim().length > 0)
    .filter((el) => {
      const style = window.getComputedStyle(el);
      return style.visibility !== "hidden" && parseFloat(style.opacity || "1") > 0.05;
    })
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 2 && rect.height > 2);

  const pairs: OverlapReport["pairs"] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ix = Math.max(0, Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left));
      const iy = Math.max(0, Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top));
      const overlapArea = ix * iy;
      if (overlapArea <= 0) continue;
      const smallerArea = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height);
      const overlapPct = smallerArea > 0 ? overlapArea / smallerArea : 0;
      if (overlapPct < OVERLAP_THRESHOLD_PCT) continue;
      pairs.push({
        textA: (a.el.textContent ?? "").trim().slice(0, 40),
        textB: (b.el.textContent ?? "").trim().slice(0, 40),
        rectA: { x: Math.round(a.rect.left), y: Math.round(a.rect.top), w: Math.round(a.rect.width), h: Math.round(a.rect.height) },
        rectB: { x: Math.round(b.rect.left), y: Math.round(b.rect.top), w: Math.round(b.rect.width), h: Math.round(b.rect.height) },
        overlapPct: Math.round(overlapPct * 100) / 100,
      });
    }
  }
  return pairs;
};

export const OverlapProbe: React.FC = () => {
  const frame = useCurrentFrame();
  const [pairs, setPairs] = useState<OverlapReport["pairs"] | null>(null);

  useLayoutEffect(() => {
    const [handle] = [delayRender("OverlapProbe: measuring DOM after layout")];
    // one extra frame so springs/transforms mid-flight this tick have committed
    const raf = requestAnimationFrame(() => {
      const result = computeOverlaps();
      setPairs(result);
      continueRender(handle);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  if (pairs === null) return null;
  const report: OverlapReport = { frame, pairs };
  return <Artifact filename={`overlap-frame-${frame}.json`} content={JSON.stringify(report)} />;
};

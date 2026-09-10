export const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));
/** Zero velocity at both ends; no frame-history integration. */
export const smooth = (t: number): number => { const p = clamp01(t); return p * p * (3 - 2 * p); };
export const mix = (a: number, b: number, p: number): number => a + (b - a) * p;
export const progress = (frame: number, start: number, end: number): number =>
  frame < start ? 0 : end <= start ? 1 : smooth((frame - start) / (end - start));

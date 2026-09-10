import React, { useLayoutEffect, useState } from "react";
import { Artifact, continueRender, delayRender, useCurrentFrame } from "remotion";

/** Opt-in QC only. Measurements are output; they never drive motion or video state. */
export const MotionProbe: React.FC = () => {
  const frame = useCurrentFrame();
  const [report, setReport] = useState<string | null>(null);
  useLayoutEffect(() => {
    const handle = delayRender("MotionProbe");
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      const actors = Array.from(document.querySelectorAll<HTMLElement>("[data-motion-actor]")).map(el => {
        const rect = el.getBoundingClientRect();
        let opacity = 1;
        for (let p: Element | null = el; p; p = p.parentElement) opacity *= Number(getComputedStyle(p).opacity);
        return { id: el.dataset.motionActor, layer: el.closest("[data-motion-layer]")?.getAttribute("data-motion-layer"),
          // Local action coordinates ignore camera movement; circles use their SVG position.
          x: Number(el.dataset.motionX ?? el.getAttribute("cx") ?? 0), y: Number(el.dataset.motionY ?? el.getAttribute("cy") ?? 0),
          progress: el.dataset.motionProgress ? Number(el.dataset.motionProgress) : null,
          opacity, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
      });
      setReport(JSON.stringify({ frame, actors }));
      continueRender(handle);
    });
    return () => { cancelled = true; continueRender(handle); };
  }, [frame]);
  return report === null ? null : <Artifact filename={`motion-frame-${frame}.json`} content={report} />;
};

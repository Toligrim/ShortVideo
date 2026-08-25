import React from "react";
import { spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const W = layout.width;

export type SuffixAutomatonPhase =
  | "growth"
  | "merge"
  | "bound"
  | "query"
  | "summary";

export const SuffixAutomatonVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: SuffixAutomatonPhase;
  n?: number;
}> = ({ local, fps, impactLocal, phase = "growth", n = 100 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const cx = W / 2;
  const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };

  if (phase === "growth") {
    const nodeR = 20;
    const cols = 5;
    const colGap = (W - 200) / cols;
    const startY = 500;
    const nodes: React.ReactNode[] = [];
    const edges: React.ReactNode[] = [];
    for (let col = 0; col < cols; col++) {
      const p = smooth(clamp01((local - col * 5) / 14));
      if (p <= 0) continue;
      const x = 140 + col * colGap;
      for (let r = 0; r <= col; r++) {
        const y = startY + r * 80;
        const color = col === cols - 1 ? theme.danger : theme.accent;
        nodes.push(
          <div key={`g-${col}-${r}`} style={{
            position: "absolute", left: x - nodeR, top: y - nodeR,
            width: nodeR * 2, height: nodeR * 2, borderRadius: "50%",
            background: theme.panel, border: `2px solid ${color}`,
            boxShadow: `0 0 10px ${color}33`, opacity: p * enter,
            transform: `scale(${0.3 + 0.7 * p})`,
          }} />
        );
        if (r > 0) {
          edges.push(
            <div key={`ge-${col}-${r}`} style={{
              position: "absolute", left: x - 1, top: startY + (r - 1) * nodeR * 2,
              width: 2, height: 80 - nodeR * 2,
              background: `${theme.accent}55`, opacity: p * enter * 0.5,
            }} />
          );
        }
      }
    }
    const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
    return (<>
      <div style={{ position: "absolute", left: cx, top: 280, transform: "translateX(-50%)", ...mono, fontSize: 24, color: theme.subtext, opacity: enter, textAlign: "center" }}>
        КАЖДЫЙ СУФФИКС — ВЕТКА
      </div>
      {edges}{nodes}
      {done && (<>
        <PulseRing x={cx} y={1100} triggerFrame={impactLocal} tone="danger" size={260} />
        <div style={{ position: "absolute", left: cx, top: 1220, transform: `translateX(-50%) scale(${badgeP})`, opacity: badgeP, padding: "12px 24px", borderRadius: 999, background: `${theme.danger}18`, border: `2px solid ${theme.danger}`, color: theme.danger, fontFamily: theme.font, fontWeight: 800, fontSize: 24, whiteSpace: "nowrap" }}>
          N(N+1)/2+1 УЗЛОВ
        </div>
      </>)}
    </>);
  }

  if (phase === "merge") {
    const nodeR = 28;
    const leftX = cx - 160, rightX = cx + 160, topY = 550, mergeY = 900;
    const mergeP = smooth(clamp01((local - 10) / 20));
    const mergedY = interpolate(mergeP, [0, 1], [topY, mergeY]);
    const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
    return (<>
      <div style={{ position: "absolute", left: cx, top: 280, transform: "translateX(-50%)", ...mono, fontSize: 24, color: theme.subtext, opacity: enter, textAlign: "center" }}>
        ОДИНАКОВЫЕ endpos → СКЛЕЙКА
      </div>
      {mergeP < 1 && (<>
        <div style={{ position: "absolute", left: leftX - nodeR, top: topY - nodeR, width: nodeR * 2, height: nodeR * 2, borderRadius: "50%", background: theme.panel, border: `3px solid ${theme.accent}`, boxShadow: `0 0 16px ${theme.accent}44`, opacity: enter * (1 - mergeP), transform: `scale(${enter})` }} />
        <div style={{ position: "absolute", left: rightX - nodeR, top: topY - nodeR, width: nodeR * 2, height: nodeR * 2, borderRadius: "50%", background: theme.panel, border: `3px solid ${theme.accent2}`, boxShadow: `0 0 16px ${theme.accent2}44`, opacity: enter * (1 - mergeP), transform: `scale(${enter})` }} />
        <div style={{ position: "absolute", left: leftX, top: topY + nodeR + 12, transform: "translateX(-50%)", ...mono, fontSize: 18, color: theme.accent, opacity: enter * (1 - mergeP) }}>ab</div>
        <div style={{ position: "absolute", left: rightX, top: topY + nodeR + 12, transform: "translateX(-50%)", ...mono, fontSize: 18, color: theme.accent2, opacity: enter * (1 - mergeP) }}>b</div>
      </>)}
      <div style={{ position: "absolute", left: cx - nodeR, top: mergedY - nodeR, width: nodeR * 2, height: nodeR * 2, borderRadius: "50%", background: theme.panel, border: `3px solid ${theme.success}`, boxShadow: `0 0 24px ${theme.success}55`, opacity: mergeP * enter, transform: `scale(${0.4 + 0.6 * mergeP})` }} />
      <div style={{ position: "absolute", left: cx, top: mergedY + nodeR + 12, transform: "translateX(-50%)", ...mono, fontSize: 18, color: theme.success, opacity: mergeP * enter }}>
        ab / b → state
      </div>
      {done && (<>
        <PulseRing x={cx} y={mergeY} triggerFrame={impactLocal} tone="success" size={200} />
        <div style={{ position: "absolute", left: cx, top: mergeY + nodeR * 2 + 80, transform: `translateX(-50%) scale(${badgeP})`, opacity: badgeP, padding: "12px 24px", borderRadius: 999, background: `${theme.success}18`, border: `2px solid ${theme.success}`, color: theme.success, fontFamily: theme.font, fontWeight: 800, fontSize: 22, whiteSpace: "nowrap" }}>
          ЭКВИВАЛЕНТНЫЕ → ОДНО
        </div>
      </>)}
    </>);
  }

  if (phase === "bound") {
    const formulaY = 480;
    const formulaP = smooth(clamp01(local / 18));
    const n2m1 = 2 * n - 1, n3m4 = 3 * n - 4;
    const counterP = smooth(clamp01(local / Math.max(impactLocal - 6, 1)));
    const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
    return (<>
      <div style={{ position: "absolute", left: cx, top: 300, transform: "translateX(-50%)", ...mono, fontSize: 24, color: theme.subtext, opacity: enter }}>ГРАНИЦА ТОЧНАЯ</div>
      <div style={{ position: "absolute", left: cx, top: formulaY, transform: `translateX(-50%) scale(${formulaP})`, textAlign: "center", opacity: formulaP * enter }}>
        <div style={{ ...mono, fontSize: 56, color: theme.accent }}>2n − 1</div>
        <div style={{ ...mono, fontSize: 22, color: theme.subtext, marginTop: 8 }}>СОСТОЯНИЙ</div>
      </div>
      <div style={{ position: "absolute", left: cx, top: formulaY + 180, transform: `translateX(-50%) scale(${smooth(clamp01((local - 8) / 18))})`, textAlign: "center", opacity: smooth(clamp01((local - 8) / 18)) * enter }}>
        <div style={{ ...mono, fontSize: 56, color: theme.accent2 }}>3n − 4</div>
        <div style={{ ...mono, fontSize: 22, color: theme.subtext, marginTop: 8 }}>ПЕРЕХОДОВ</div>
      </div>
      <div style={{ position: "absolute", left: cx, top: formulaY + 380, transform: "translateX(-50%)", textAlign: "center", opacity: enter }}>
        <div style={{ ...mono, fontSize: 18, color: theme.subtext }}>n = {n} →</div>
        <div style={{ ...mono, fontSize: 44, color: theme.text, marginTop: 6 }}>{Math.round(counterP * n2m1)} / {Math.round(counterP * n3m4)}</div>
      </div>
      {done && (<>
        <PulseRing x={cx} y={formulaY + 420} triggerFrame={impactLocal} tone="success" size={240} />
        <div style={{ position: "absolute", left: cx, top: formulaY + 560, transform: `translateX(-50%) scale(${badgeP})`, opacity: badgeP, padding: "12px 24px", borderRadius: 999, background: `${theme.success}18`, border: `2px solid ${theme.success}`, color: theme.success, fontFamily: theme.font, fontWeight: 800, fontSize: 22, whiteSpace: "nowrap" }}>
          НЕ ПРИБЛИЖЕНИЕ — ТОЧНАЯ ГРАНИЦА
        </div>
      </>)}
    </>);
  }

  if (phase === "query") {
    const stateR = 30;
    const states = [
      { x: cx - 280, y: 500, label: "0", color: theme.success },
      { x: cx - 80, y: 500, label: "1", color: theme.accent },
      { x: cx + 120, y: 500, label: "2", color: theme.accent },
      { x: cx + 300, y: 500, label: "3", color: theme.accent2 },
    ];
    const walkP = smooth(clamp01((local - 6) / 24));
    const activeIdx = Math.min(3, Math.floor(walkP * 4));
    const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
    return (<>
      <div style={{ position: "absolute", left: cx, top: 300, transform: "translateX(-50%)", ...mono, fontSize: 24, color: theme.subtext, opacity: enter }}>ПОИСК ПОДСТРОКИ</div>
      <div style={{ position: "absolute", left: cx, top: 380, transform: `translateX(-50%) scale(${enter})`, padding: "8px 24px", borderRadius: 999, background: `${theme.warning}18`, border: `2px solid ${theme.warning}88`, ...mono, fontSize: 30, color: theme.warning }}>
        "abb"
      </div>
      {states.map((s, i) => {
        const isActive = i === activeIdx;
        const isPast = i < activeIdx;
        const color = isActive ? theme.warning : isPast ? theme.success : s.color;
        return (
          <React.Fragment key={`st-${i}`}>
            <div style={{
              position: "absolute", left: s.x - stateR, top: s.y - stateR,
              width: stateR * 2, height: stateR * 2, borderRadius: "50%",
              background: theme.panel, border: `3px solid ${color}`,
              boxShadow: isActive ? `0 0 30px ${color}66` : `0 0 12px ${color}33`,
              opacity: enter, transform: `scale(${isActive ? 1.15 : 1})`,
            }} />
            <div style={{ position: "absolute", left: s.x, top: s.y + stateR + 10, transform: "translateX(-50%)", ...mono, fontSize: 20, color }}>{s.label}</div>
          </React.Fragment>
        );
      })}
      {done && (<>
        <PulseRing x={states[activeIdx].x} y={states[activeIdx].y} triggerFrame={impactLocal} tone="success" size={180} />
        <div style={{ position: "absolute", left: cx, top: 700, transform: `translateX(-50%) scale(${badgeP})`, opacity: badgeP, padding: "12px 24px", borderRadius: 999, background: `${theme.success}18`, border: `2px solid ${theme.success}`, color: theme.success, fontFamily: theme.font, fontWeight: 800, fontSize: 24, whiteSpace: "nowrap" }}>
          O(|p|) — ТЕКСТ НЕ ВАЖЕН
        </div>
      </>)}
    </>);
  }

  // summary
  const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  return (<>
    <div style={{ position: "absolute", left: cx, top: 340, transform: "translateX(-50%)", ...mono, fontSize: 24, color: theme.subtext, opacity: enter }}>ИТОГ</div>
    <div style={{ position: "absolute", left: cx, top: 440, transform: `translateX(-50%) scale(${enter})`, ...mono, fontSize: 48, color: theme.accent, textAlign: "center" }}>DAWG</div>
    <div style={{ position: "absolute", left: cx, top: 540, transform: "translateX(-50%)", textAlign: "center", opacity: enter }}>
      <div style={{ ...mono, fontSize: 22, color: theme.text, marginBottom: 20 }}>2n−1 состояний</div>
      <div style={{ ...mono, fontSize: 22, color: theme.accent2, marginBottom: 20 }}>3n−4 переходов</div>
      <div style={{ ...mono, fontSize: 22, color: theme.success }}>O(|p|) поиск</div>
    </div>
    {done && (<>
      <PulseRing x={cx} y={600} triggerFrame={impactLocal} tone="success" size={300} />
      <div style={{ position: "absolute", left: cx, top: 780, transform: `translateX(-50%) scale(${badgeP})`, opacity: badgeP, padding: "14px 28px", borderRadius: 999, background: `${theme.success}18`, border: `2px solid ${theme.success}`, color: theme.success, fontFamily: theme.font, fontWeight: 800, fontSize: 26, whiteSpace: "nowrap" }}>
        ЛИНЕЙНЫЙ АВТОМАТ — ВСЕ ПОДСТРОКИ
      </div>
    </>)}
  </>);
};

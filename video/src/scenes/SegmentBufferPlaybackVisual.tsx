import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { stripStress } from "../lib/stress";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type SegmentBufferPlaybackPhase = "symptom" | "split" | "queue" | "boundary";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: SegmentBufferPlaybackPhase;
}

const W = layout.width;
const CX = W / 2;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const phaseTitle: Record<SegmentBufferPlaybackPhase, string> = {
  symptom: "ПРОИГРЫВАНИЕ · ЗАПАС НЕ ПУСТ",
  split: "СЕРВЕР РЕЖЕТ ПОТОК НА СЕГМЕНТЫ",
  queue: "ПРЕДЫДУЩИЙ ИГРАЕТ · СЛЕДУЮЩИЙ В ОЧЕРЕДИ",
  boundary: "ГРАНИЦА · НОВАЯ ПОРЦИЯ УЖЕ ГОТОВА",
};

const phaseIcon: Record<SegmentBufferPlaybackPhase, string> = {
  symptom: "circle-play",
  split: "scissors",
  queue: "list-video",
  boundary: "milestone",
};

const phaseTone: Record<SegmentBufferPlaybackPhase, string> = {
  symptom: theme.warning,
  split: theme.accent2,
  queue: theme.accent,
  boundary: theme.success,
};

const Header: React.FC<{ phase: SegmentBufferPlaybackPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 224,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: phaseTone[phase],
      fontSize: 22,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={30} color={phaseTone[phase]} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  children: React.ReactNode;
}> = ({ left, top, width, height, color, opacity, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 26,
      background: `${theme.panel}F0`,
      border: `3px solid ${color}77`,
      boxShadow: `0 14px 48px ${color}20`,
      opacity,
    }}
  >
    {children}
  </div>
);

const SegmentChip: React.FC<{
  left: number;
  top: number;
  label: string;
  status: string;
  color: string;
  opacity: number;
  active?: boolean;
}> = ({ left, top, label, status, color, opacity, active = false }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width: 250,
      height: 82,
      boxSizing: "border-box",
      padding: "10px 16px",
      borderRadius: 16,
      border: `2px solid ${color}${active ? "CC" : "66"}`,
      background: `${color}${active ? "20" : "0D"}`,
      color: active ? theme.text : theme.subtext,
      opacity,
      ...mono,
    }}
  >
    <div style={{ fontSize: 23, color }}>{stripStress(label)}</div>
    <div style={{ marginTop: 4, fontSize: 16, color: active ? theme.text : theme.subtext }}>{status}</div>
  </div>
);

const StreamArrow: React.FC<{ local: number; impactLocal: number; opacity: number; color: string }> = ({
  local,
  impactLocal,
  opacity,
  color,
}) => {
  const progress = smooth(interpolate(local, [0, Math.max(impactLocal, 1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const x = interpolate(progress, [0, 1], [324, 620]);
  return (
    <>
      <svg width={W} height={layout.height} style={{ position: "absolute", inset: 0, opacity }}>
        <line x1="318" y1="636" x2="658" y2="636" stroke={`${color}66`} strokeWidth="3" strokeDasharray="10 12" />
        <path d="M636 622 L658 636 L636 650" fill="none" stroke={color} strokeWidth="4" />
      </svg>
      <div
        style={{
          position: "absolute",
          left: x,
          top: 636,
          transform: "translate(-50%, -50%)",
          minWidth: 92,
          padding: "10px 14px",
          borderRadius: 999,
          background: color,
          color: "#06121A",
          fontSize: 17,
          textAlign: "center",
          opacity: progress > 0.02 ? opacity : 0,
          ...mono,
        }}
      >
        SEG-07
      </div>
    </>
  );
};

const PlayerPanel: React.FC<{
  phase: SegmentBufferPlaybackPhase;
  local: number;
  opacity: number;
}> = ({ phase, local, opacity }) => {
  const playProgress = smooth(interpolate(local, [0, 180], [0.18, 0.94], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const quality = phase === "symptom" ? "720p · мягче" : "1080p · текущий";
  return (
    <Panel left={665} top={392} width={335} height={520} color={theme.accent} opacity={opacity}>
      <div style={{ position: "absolute", left: 26, top: 24, display: "flex", alignItems: "center", gap: 10, color: theme.accent, fontSize: 21, ...mono }}>
        <IconGlyph name="play" size={28} color={theme.accent} strokeWidth={1.8} />
        ПЛЕЕР
      </div>
      <div
        style={{
          position: "absolute",
          left: 24,
          top: 78,
          width: 287,
          height: 215,
          borderRadius: 18,
          background: "linear-gradient(145deg, #213D55 0%, #111923 72%)",
          border: `2px solid ${theme.panelBorder}`,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", left: 20, top: 18, color: theme.subtext, fontSize: 18, ...mono }}>КАДР · SEG-06</div>
        <div style={{ position: "absolute", left: 34, top: 76, width: 218, height: 70, borderRadius: 12, background: `${theme.accent2}33`, border: `2px solid ${theme.accent2}88` }} />
        <div style={{ position: "absolute", left: 121, top: 78 }}>
          <IconGlyph name="play" size={42} color={theme.text} strokeWidth={1.6} />
        </div>
        <div style={{ position: "absolute", left: 20, bottom: 22, color: theme.text, fontSize: 17, ...mono }}>{quality}</div>
      </div>
      <div style={{ position: "absolute", left: 28, top: 334, width: 279, height: 12, borderRadius: 999, background: theme.panelBorder }}>
        <div style={{ width: `${playProgress * 100}%`, height: "100%", borderRadius: 999, background: phase === "boundary" ? theme.success : theme.accent, boxShadow: `0 0 18px ${phase === "boundary" ? theme.success : theme.accent}` }} />
      </div>
      <div style={{ position: "absolute", left: 28, top: 366, color: theme.subtext, fontSize: 18, ...mono }}>00:42 / 01:30</div>
      <div style={{ position: "absolute", left: 28, top: 424, color: phase === "symptom" ? theme.warning : theme.success, fontSize: 20, ...mono }}>
        {phase === "boundary" ? "ИГРАЕТ БЕЗ ПАУЗЫ" : "ВОСПРОИЗВЕДЕНИЕ ИДЁТ"}
      </div>
    </Panel>
  );
};

const BufferRail: React.FC<{ phase: SegmentBufferPlaybackPhase; opacity: number }> = ({ phase, opacity }) => {
  const currentWidth = phase === "boundary" ? 300 : phase === "symptom" ? 240 : 270;
  const nextWidth = phase === "split" ? 80 : phase === "symptom" ? 60 : 190;
  return (
    <div style={{ position: "absolute", left: 96, top: 1004, width: 888, height: 126, opacity }}>
      <div style={{ position: "absolute", left: 0, top: 0, color: theme.subtext, fontSize: 19, ...mono }}>ВРЕМЕННАЯ ШКАЛА · ОЧЕРЕДЬ И БУФЕР</div>
      <div style={{ position: "absolute", left: 0, top: 43, width: 888, height: 28, borderRadius: 999, background: theme.panelBorder, overflow: "hidden", display: "flex" }}>
        <div style={{ width: currentWidth, height: "100%", background: theme.success, boxShadow: `0 0 18px ${theme.success}66` }} />
        <div style={{ width: nextWidth, height: "100%", background: theme.accent, boxShadow: `0 0 18px ${theme.accent}66` }} />
        <div style={{ flex: 1, height: "100%", background: `${theme.subtext}18` }} />
      </div>
      <div style={{ position: "absolute", left: 0, top: 80, color: theme.success, fontSize: 17, ...mono }}>SEG-06 · ИДЁТ</div>
      <div style={{ position: "absolute", left: 315, top: 80, color: theme.accent, fontSize: 17, ...mono }}>SEG-07 · ЗАПАС</div>
      <div style={{ position: "absolute", right: 0, top: 80, color: theme.text, fontSize: 19, ...mono }}>БУФЕР · 18 с</div>
      {phase === "boundary" ? <div style={{ position: "absolute", left: currentWidth - 4, top: 35, height: 46, borderLeft: `4px solid ${theme.warning}` }} /> : null}
    </div>
  );
};

/** Потоковые медиасегменты: текущий кусочек играет, следующий уже в очереди и даёт запас времени. */
export const SegmentBufferPlaybackVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "queue" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 13, mass: 0.7 } });
  const serverOpacity = phase === "symptom" ? 0.72 : 1;
  const queueOpacity = smooth(interpolate(local, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

  return (
    <div style={{ position: "absolute", inset: 0, opacity: enter }}>
      <Header phase={phase} opacity={enter} />
      <Panel left={76} top={430} width={238} height={330} color={theme.accent2} opacity={serverOpacity * enter}>
        <div style={{ position: "absolute", left: 24, top: 24, display: "flex", alignItems: "center", gap: 9, color: theme.accent2, fontSize: 20, ...mono }}>
          <IconGlyph name="server" size={30} color={theme.accent2} strokeWidth={1.8} />
          СЕРВЕР
        </div>
        <div style={{ position: "absolute", left: 24, top: 92, width: 190, height: 86, borderRadius: 14, border: `2px solid ${theme.accent2}66`, background: `${theme.accent2}12` }}>
          <div style={{ position: "absolute", left: 16, top: 15, color: theme.subtext, fontSize: 17, ...mono }}>ПЛЕЙЛИСТ</div>
          <div style={{ position: "absolute", left: 16, top: 48, color: theme.accent2, fontSize: 20, ...mono }}>SEG-06 · 07 · 08</div>
        </div>
        <div style={{ position: "absolute", left: 24, top: 220, color: phase === "split" ? theme.accent2 : theme.subtext, fontSize: 18, ...mono }}>
          {phase === "split" ? "ПОРЦИИ · НЕ ФАЙЛ" : "CDN → ПЛЕЕР"}
        </div>
      </Panel>

      <StreamArrow local={local} impactLocal={impactLocal} opacity={enter * queueOpacity} color={phaseTone[phase]} />

      <Panel left={350} top={430} width={286} height={380} color={phaseTone[phase]} opacity={enter * (phase === "symptom" ? 0.64 : 1)}>
        <div style={{ position: "absolute", left: 24, top: 24, display: "flex", alignItems: "center", gap: 9, color: phaseTone[phase], fontSize: 19, ...mono }}>
          <IconGlyph name="list-video" size={28} color={phaseTone[phase]} strokeWidth={1.8} />
          ОЧЕРЕДЬ
        </div>
        <SegmentChip left={18} top={78} label="SEG-06" status="ИГРАЕТ СЕЙЧАС" color={theme.success} opacity={1} active />
        <SegmentChip left={18} top={172} label="SEG-07" status={phase === "boundary" ? "ГОТОВ К ГРАНИЦЕ" : "СЛЕДУЮЩИЙ"} color={theme.accent} opacity={1} active={phase !== "split"} />
        <SegmentChip left={18} top={266} label="SEG-08" status="ДАЛЬШЕ" color={theme.subtext} opacity={phase === "split" ? 0.65 : 0.9} />
      </Panel>

      <PlayerPanel phase={phase} local={local} opacity={enter} />
      <BufferRail phase={phase} opacity={enter} />
      <div style={{ position: "absolute", left: CX, top: 1195, transform: "translateX(-50%)", padding: "14px 30px", borderRadius: 999, border: `2px solid ${phaseTone[phase]}`, background: `${phaseTone[phase]}18`, color: phaseTone[phase], fontSize: 22, whiteSpace: "nowrap", ...mono }}>
        {phase === "symptom" ? "КАЧЕСТВО МЯГЧЕ · ПАУЗЫ НЕТ" : phase === "split" ? "ОДИН ПОТОК → КОРОТКИЕ ПОРЦИИ" : phase === "queue" ? "СЛЕДУЮЩИЙ ПРИХОДИТ ПОКА ТЕКУЩИЙ ИГРАЕТ" : "ГРАНИЦА СЕГМЕНТА · БУФЕР СОХРАНЁН"}
      </div>
      <PulseRing x={820} y={636} triggerFrame={impactLocal} tone={phase === "boundary" ? "success" : "accent"} size={190 + 50 * reveal} />
    </div>
  );
};

import React from "react";
import { interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fitText } from "@remotion/layout-utils";
import { layout, theme, toneColor } from "../lib/theme";
import { wordFrame } from "../lib/timeline";
import type { StoryScene as StoryProps, StoryBeat, Word } from "../lib/types";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";
import { SceneHeading } from "./SceneHeading";

/* ──────────────────────────── расписание битов ──────────────────────────── */

export interface BeatSlot {
  beat: StoryBeat;
  start: number;
  end: number;
  impact: number | null; // кадр удара внутри бита (клик, рукопожатие, слэм)
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export const storySchedule = (scene: StoryProps, words: Word[], frames: number): BeatSlot[] => {
  const n = scene.beats.length;
  const starts: number[] = [];
  for (let i = 0; i < n; i++) {
    const anchored = scene.beats[i].onWord ? wordFrame(words, scene.beats[i].onWord!) : null;
    let s = anchored ?? Math.round((frames * i) / n);
    if (i === 0) s = 0;
    if (i > 0) s = Math.max(s, starts[i - 1] + 12);
    starts.push(s);
  }
  return scene.beats.map((beat, i) => {
    const start = starts[i];
    const end = i + 1 < n ? starts[i + 1] : frames;
    const dur = end - start;
    let impact: number | null = null;
    if (beat.visual === "browser-click") impact = start + Math.round(dur * 0.55);
    if (beat.visual === "handshake") impact = start + 10;
    if (beat.visual === "title-slam") impact = start + 8;
    return { beat, start, end, impact };
  });
};

/** Звуковые события: вуш на смену бита, клик/слэм/дзынь на удары визуалов. */
export const storySfx = (
  scene: StoryProps,
  words: Word[],
  frames: number
): { frame: number; sound: string }[] => {
  const slots = storySchedule(scene, words, frames);
  const events: { frame: number; sound: string }[] = [];
  for (const [i, s] of slots.entries()) {
    if (i > 0) events.push({ frame: s.start, sound: "whoosh-short" });
    if (s.impact === null) continue;
    if (s.beat.visual === "browser-click") events.push({ frame: s.impact, sound: "click" });
    if (s.beat.visual === "handshake")
      events.push({ frame: s.impact, sound: "slam" }, { frame: s.impact + 2, sound: "ding" });
    if (s.beat.visual === "title-slam") events.push({ frame: s.impact, sound: "slam" });
  }
  return events;
};

export const storyImpacts = (scene: StoryProps, words: Word[], frames: number): number[] => {
  const slots = storySchedule(scene, words, frames);
  const impacts = slots.filter((s) => s.impact !== null).map((s) => s.impact!) as number[];
  // смена бита — тоже лёгкий удар (прыжок кадра)
  impacts.push(...slots.slice(1).map((s) => s.start));
  return impacts;
};

/* ──────────────────────────── визуалы битов ──────────────────────────── */

const W = layout.width;

/** Браузер + рука-курсор, кликающая по ссылке. */
const BrowserClick: React.FC<{ local: number; dur: number; impactLocal: number; fps: number; url?: string }> = ({
  local,
  dur,
  impactLocal,
  fps,
  url = "example.com",
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const bw = 880;
  const bx = W / 2 - bw / 2;
  const by = 330;
  const linkY = by + 620; // блок-ссылка, куда кликаем
  // путь курсора: из-за правого нижнего угла к ссылке
  const p = smooth(clamp01(local / Math.max(impactLocal - 6, 1)));
  const cx = interpolate(p, [0, 1], [W + 60, W / 2 + 40]);
  const cy = interpolate(p, [0, 1], [1500, linkY + 40]);
  const clicked = local >= impactLocal;
  const press = clicked ? Math.max(0.82, 1 - (local - impactLocal) * 0.06) : 1;
  const linkFlash = clicked ? Math.exp(-(local - impactLocal) * 0.18) : 0;
  const skeleton = [
    { y: 120, h: 210, w: bw - 80, hero: true },
    { y: 360, h: 34, w: bw - 120 },
    { y: 414, h: 34, w: bw - 220 },
    { y: 468, h: 34, w: bw - 320 },
  ];
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: bx,
          top: by,
          width: bw,
          height: 780,
          transform: `translateY(${(1 - enter) * 120}px) scale(${0.9 + 0.1 * enter})`,
          opacity: enter,
          background: "#0A0F18",
          border: `2px solid ${theme.panelBorder}`,
          borderRadius: 26,
          overflow: "hidden",
          boxShadow: "0 40px 100px rgba(0,0,0,0.6)",
        }}
      >
        {/* шапка браузера */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", background: theme.panel }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
            <div key={c} style={{ width: 20, height: 20, borderRadius: 10, background: c }} />
          ))}
          <div
            style={{
              marginLeft: 14,
              flex: 1,
              background: "#0D1420",
              borderRadius: 12,
              padding: "10px 20px",
              fontFamily: theme.mono,
              fontSize: 30,
              color: theme.subtext,
            }}
          >
            🔒 {url}
          </div>
        </div>
        {/* скелет страницы */}
        {skeleton.map((b, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 40,
              top: b.y + 60,
              width: b.w,
              height: b.h,
              borderRadius: 14,
              background: b.hero
                ? `linear-gradient(120deg, ${theme.accent}22, ${theme.accent2}22)`
                : "#1B2434",
              opacity: enter,
            }}
          />
        ))}
        {/* блок-ссылка */}
        <div
          style={{
            position: "absolute",
            left: 40,
            top: linkY - by,
            width: 420,
            height: 74,
            borderRadius: 14,
            border: `3px solid ${theme.accent}`,
            background: `${theme.accent}${linkFlash > 0.4 ? "66" : "1A"}`,
            display: "flex",
            alignItems: "center",
            paddingLeft: 24,
            fontFamily: theme.font,
            fontWeight: 700,
            fontSize: 34,
            color: theme.accent,
            boxShadow: linkFlash > 0 ? `0 0 ${60 * linkFlash}px ${theme.accent}` : "none",
          }}
        >
          Открыть сайт →
        </div>
      </div>
      {clicked ? <PulseRing x={cx - 10} y={cy - 10} triggerFrame={0} size={180} /> : null}
      {/* рука-курсор */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: cy,
          transform: `translate(-30%, -12%) scale(${press}) rotate(-12deg)`,
          filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.8))",
        }}
      >
        <IconGlyph name="pointer" size={110} color={theme.text} strokeWidth={1.6} />
      </div>
    </>
  );
};

/** Телефон и сервер съезжаются с краёв. */
const DevicesMeet: React.FC<{ local: number; fps: number; met?: boolean }> = ({ local, fps, met = false }) => {
  const s = met ? 1 : spring({ frame: local, fps, config: { damping: 13, mass: 0.9 } });
  const cy = 900;
  const phoneX = interpolate(s, [0, 1], [-260, W / 2 - 250]);
  const serverX = interpolate(s, [0, 1], [W + 260, W / 2 + 250]);
  const lean = met ? 6 : 6 * s;
  const bob = 6 * Math.sin(local / 9);
  return (
    <>
      {/* телефон */}
      <div
        style={{
          position: "absolute",
          left: phoneX - 110,
          top: cy - 190 + bob,
          width: 220,
          height: 380,
          transform: `rotate(${lean}deg)`,
          background: theme.panel,
          border: `4px solid ${theme.accent}66`,
          borderRadius: 36,
          boxShadow: `0 0 70px ${theme.accent}22`,
          padding: 16,
        }}
      >
        <div style={{ width: "100%", height: "100%", borderRadius: 22, background: "#0D1420", padding: 14 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: i === 0 ? 90 : 30, borderRadius: 10, marginBottom: 12, background: i === 0 ? `${theme.accent}33` : "#1B2434" }} />
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 14, fontFamily: theme.font, fontWeight: 700, fontSize: 36, color: theme.text }}>Телефон</div>
      </div>
      {/* сервер */}
      <div
        style={{
          position: "absolute",
          left: serverX - 140,
          top: cy - 140 - bob,
          width: 280,
          height: 280,
          transform: `rotate(${-lean}deg)`,
          background: theme.panel,
          border: `4px solid ${toneColor("accent2")}66`,
          borderRadius: 32,
          boxShadow: `0 0 70px ${toneColor("accent2")}22`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <IconGlyph name="server" size={130} color={toneColor("accent2")} strokeWidth={1.5} />
        <div style={{ fontFamily: theme.font, fontWeight: 700, fontSize: 36, color: theme.text }}>Сервер</div>
      </div>
    </>
  );
};

/** Рукопожатие между устройствами: иконка-вспышка, кольца, искры. */
const Handshake: React.FC<{ local: number; fps: number; impactLocal: number }> = ({ local, fps, impactLocal }) => {
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 10, mass: 0.6 } }) : 0;
  const cy = 900;
  return (
    <>
      <DevicesMeet local={local} fps={fps} met />
      {hit ? (
        <>
          <PulseRing x={W / 2} y={cy} triggerFrame={impactLocal} size={340} tone="success" />
          {/* искры */}
          {Array.from({ length: 10 }).map((_, i) => {
            const ang = random(`spark${i}`) * 6.28;
            const dist = (30 + random(`sd${i}`) * 130) * smooth(clamp01((local - impactLocal) / 16));
            const op = 1 - clamp01((local - impactLocal) / 18);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: W / 2 + Math.cos(ang) * dist,
                  top: cy + Math.sin(ang) * dist * 0.8,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  background: i % 2 ? theme.accent : theme.success,
                  opacity: op,
                  boxShadow: `0 0 18px ${i % 2 ? theme.accent : theme.success}`,
                }}
              />
            );
          })}
          <div
            style={{
              position: "absolute",
              left: W / 2,
              top: cy,
              transform: `translate(-50%, -50%) scale(${pop}) rotate(${8 * Math.sin(local * 0.6)}deg)`,
            }}
          >
            <div
              style={{
                width: 190,
                height: 190,
                borderRadius: "50%",
                background: `${theme.success}1A`,
                border: `4px solid ${theme.success}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 0 90px ${theme.success}55`,
              }}
            >
              <IconGlyph name="handshake" size={110} color={theme.success} strokeWidth={1.6} />
            </div>
          </div>
        </>
      ) : null}
    </>
  );
};

/** Заголовок, влетающий с ударом. */
const TitleSlam: React.FC<{ local: number; fps: number; impactLocal: number; text?: string; sub?: string }> = ({
  local,
  fps,
  impactLocal,
  text = "",
  sub,
}) => {
  const s = spring({ frame: local, fps, config: { damping: 12, mass: 1.1 } });
  const scale = interpolate(s, [0, 1], [2.6, 1]);
  const landed = local >= impactLocal;
  const breathe = 1 + 0.025 * Math.sin(local / 12);
  const titleSize = Math.min(
    120,
    fitText({ text: (text || "").split("\n")[0], withinWidth: 940, fontFamily: theme.font, fontWeight: 800 }).fontSize
  );
  return (
    <>
      {landed ? <PulseRing x={W / 2} y={820} triggerFrame={impactLocal} size={520} /> : null}
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          top: 700,
          textAlign: "center",
          transform: `scale(${scale * breathe})`,
          opacity: s,
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: titleSize,
          lineHeight: 1.05,
          color: theme.accent,
          textShadow: `0 0 60px ${theme.accent}55, 0 8px 40px rgba(0,0,0,0.7)`,
        }}
      >
        {text}
      </div>
      {sub ? (
        <div
          style={{
            position: "absolute",
            left: 90,
            right: 90,
            top: 1010,
            textAlign: "center",
            fontFamily: theme.font,
            fontSize: 48,
            color: theme.subtext,
            opacity: interpolate(local, [14, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          {sub}
        </div>
      ) : null}
    </>
  );
};

/* ──────────────────────────── сцена-сториборд ──────────────────────────── */

/** Каждая фраза диктора — свой бит с движением камеры между битами. */
export const StoryScene: React.FC<{ scene: StoryProps; words: Word[]; frames: number }> = ({
  scene,
  words,
  frames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slots = storySchedule(scene, words, frames);
  const idx = Math.max(0, slots.findIndex((s, i) => frame >= s.start && (i + 1 >= slots.length || frame < slots[i + 1].start)));
  const slot = slots[idx];
  const local = frame - slot.start;
  const dur = slot.end - slot.start;
  const impactLocal = (slot.impact ?? slot.start) - slot.start;

  // камера: у каждого визуала свой план; переход — пружинный прыжок за ~9 кадров
  const cams: Record<string, { scale: number; y: number }> = {
    "browser-click": { scale: 1.0, y: 0 },
    "devices-meet": { scale: 1.12, y: -60 },
    handshake: { scale: 1.22, y: -110 },
    "title-slam": { scale: 1.0, y: 0 },
  };
  const cur = cams[slot.beat.visual] ?? { scale: 1, y: 0 };
  const prev = idx > 0 ? cams[slots[idx - 1].beat.visual] ?? cur : cur;
  const tCam = smooth(clamp01(local / 9));
  let scale = prev.scale + (cur.scale - prev.scale) * tCam;
  let camY = prev.y + (cur.y - prev.y) * tCam;
  // клик в браузере — доезд камеры к месту клика
  if (slot.beat.visual === "browser-click" && local >= impactLocal) {
    const p = smooth(clamp01((local - impactLocal) / 12));
    scale *= 1 + 0.22 * p;
    camY -= 140 * p;
  }
  // непрерывное блуждание камеры, чтобы кадр никогда не замирал
  const wander = 5 * Math.sin(frame / 22);
  const wanderX = 4 * Math.sin(frame / 31 + 2);

  const visual = (() => {
    switch (slot.beat.visual) {
      case "browser-click":
        return <BrowserClick local={local} dur={dur} impactLocal={impactLocal} fps={fps} url={slot.beat.params?.url as string} />;
      case "devices-meet":
        return <DevicesMeet local={local} fps={fps} />;
      case "handshake":
        return <Handshake local={local} fps={fps} impactLocal={impactLocal} />;
      case "title-slam":
        return (
          <TitleSlam
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            text={slot.beat.params?.text as string}
            sub={slot.beat.params?.sub as string | undefined}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <>
      {scene.heading ? <SceneHeading text={scene.heading} /> : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${wanderX}px, ${camY + wander}px) scale(${scale})`,
          transformOrigin: "50% 45%",
        }}
      >
        {visual}
      </div>
    </>
  );
};

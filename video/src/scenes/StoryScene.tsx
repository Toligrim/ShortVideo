import React from "react";
import { interpolate, interpolateColors, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fitText } from "@remotion/layout-utils";
import { layout, theme, toneColor } from "../lib/theme";
import { wordFrame } from "../lib/timeline";
import type { StoryScene as StoryProps, StoryBeat, Word } from "../lib/types";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";
import { SceneHeading } from "./SceneHeading";
import { OrbitFftGroups } from "./OrbitFftGroups";
import { GpsRelativity } from "./GpsRelativity";
import { InverseSqrtBits } from "./InverseSqrtBits";
import { BusyBeaverVisual } from "./BusyBeaverVisual";
import { SecretSharingVisual } from "./SecretSharingVisual";

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
    if (beat.visual === "password-leak") impact = start + Math.round(dur * 0.4);
    if (beat.visual === "hash-table") impact = start + Math.round(dur * 0.62);
    if (beat.visual === "collision-compare") impact = start + 18;
    if (beat.visual === "heap-graph") impact = start + 18;
    if (beat.visual === "gc-sweep") impact = start + Math.round(dur * 0.56);
    if (beat.visual === "medal-mint") impact = start + Math.round(dur * 0.5);
    if (beat.visual === "ancient-code") impact = start + Math.round(dur * 0.6);
    if (beat.visual === "verdict-scan") impact = start + Math.round(dur * 0.62);
    if (beat.visual === "paradox-box") impact = start + Math.round(dur * 0.55);
    if (beat.visual === "proof-sequence") impact = start + Math.round(dur * 0.92);
    if (beat.visual === "fft-wave")
      impact = start + Math.round(dur * (beat.params?.phase === "square" ? 0.85 : 0.5));
    if (beat.visual === "qr-repair") impact = start + Math.round(dur * 0.6);
    if (beat.visual === "hll-estimate") impact = start + Math.round(dur * 0.58);
    if (beat.visual === "bloom-bitarray") impact = start + Math.round(dur * 0.72);
    if (beat.visual === "bloom-probe") impact = start + Math.round(dur * 0.55);
    if (beat.visual === "coin-pair") impact = start + Math.round(dur * 0.65);
    if (beat.visual === "bit-extractor") impact = start + Math.round(dur * 0.75);
    if (beat.visual === "rule-110") impact = start + Math.round(dur * 0.6);
    if (beat.visual === "glider-collision") impact = start + Math.round(dur * 0.7);
    if (beat.visual === "debruijn-cycle") impact = start + Math.round(dur * 0.58);
    if (beat.visual === "hamming-word") impact = start + Math.round(dur * 0.58);
    if (beat.visual === "hamming-syndrome") impact = start + Math.round(dur * 0.64);
    if (beat.visual === "gps-relativity") impact = start + Math.round(dur * 0.62);
    if (beat.visual === "orbit-fft-groups") {
      const phase = beat.params?.phase;
      impact = start + Math.round(dur * (phase === "orbit" ? 0.68 : 0.58));
    }
    if (beat.visual === "cuckoo-table") impact = start + Math.round(dur * 0.58);
    if (beat.visual === "cuckoo-cycle") impact = start + Math.round(dur * 0.62);
    if (beat.visual === "cuckoo-stash") impact = start + Math.round(dur * 0.55);
    if (beat.visual === "inverse-sqrt-bits") impact = start + Math.round(dur * 0.6);
    if (beat.visual === "merkle-tree")
      impact = start + Math.round(dur * (beat.params?.phase === "proof" ? 0.64 : 0.58));
    if (beat.visual === "stable-matching")
      impact = start + Math.round(dur * (beat.params?.phase === "final" ? 0.72 : 0.58));
    if (beat.visual === "busy-beaver") {
      const phase = beat.params?.phase;
      impact = start + Math.round(dur * (phase === "run" ? 0.95 : 0.62));
    }
    if (beat.visual === "secret-sharing") impact = start + Math.round(dur * 0.55);
    if (beat.visual === "reservoir-sampling") {
      const phase = beat.params?.phase;
      impact = start + Math.round(dur * (phase === "proof" ? 0.72 : phase === "fair" ? 0.82 : 0.58));
    }
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
    if (s.beat.visual === "password-leak") events.push({ frame: s.impact, sound: "click" });
    if (s.beat.visual === "hash-table") events.push({ frame: s.impact, sound: "click" });
    if (s.beat.visual === "collision-compare") events.push({ frame: s.impact, sound: "pop" });
    if (s.beat.visual === "heap-graph") events.push({ frame: s.impact, sound: "pop" });
    if (s.beat.visual === "gc-sweep") events.push({ frame: s.impact, sound: "click" });
    if (s.beat.visual === "medal-mint")
      events.push({ frame: s.impact, sound: "slam" }, { frame: s.impact + 2, sound: "ding" });
    if (s.beat.visual === "ancient-code") events.push({ frame: s.impact, sound: "pop" });
    if (s.beat.visual === "verdict-scan") events.push({ frame: s.impact, sound: "click" });
    if (s.beat.visual === "paradox-box") events.push({ frame: s.impact, sound: "slam" });
    if (s.beat.visual === "proof-sequence") events.push({ frame: s.impact, sound: "ding" });
    if (s.beat.visual === "fft-wave")
      events.push({ frame: s.impact, sound: s.beat.params?.phase === "fft" ? "whoosh" : "pop" });
    if (s.beat.visual === "qr-repair") {
      const ph = s.beat.params?.phase;
      const sound = ph === "restore" ? "ding" : ph === "encode" ? "click" : "pop";
      events.push({ frame: s.impact, sound });
    }
    if (s.beat.visual === "hll-estimate") events.push({ frame: s.impact, sound: "pop" });
    if (s.beat.visual === "bloom-bitarray") events.push({ frame: s.impact, sound: "ding" });
    if (s.beat.visual === "bloom-probe") events.push({ frame: s.impact, sound: "pop" });
    if (s.beat.visual === "coin-pair") events.push({ frame: s.impact, sound: "pop" });
    if (s.beat.visual === "bit-extractor") events.push({ frame: s.impact, sound: "pop" });
    if (s.beat.visual === "rule-110") events.push({ frame: s.impact, sound: "click" });
    if (s.beat.visual === "glider-collision") events.push({ frame: s.impact, sound: "slam" });
    if (s.beat.visual === "debruijn-cycle") {
      const ph = s.beat.params?.phase;
      const sound = ph === "graph" ? "pop" : ph === "angle" ? "ding" : ph === "linear" ? "click" : "pop";
      events.push({ frame: s.impact, sound });
    }
    if (s.beat.visual === "hamming-word") events.push({ frame: s.impact, sound: "pop" });
    if (s.beat.visual === "hamming-syndrome") events.push({ frame: s.impact, sound: "ding" });
    if (s.beat.visual === "gps-relativity") {
      const ph = s.beat.params?.phase;
      const sound = ph === "factory" ? "click" : ph === "balance" ? "ding" : "pop";
      events.push({ frame: s.impact, sound });
    }
    if (s.beat.visual === "orbit-fft-groups") {
      const ph = s.beat.params?.phase;
      const sound = ph === "stages" ? "whoosh" : ph === "groups" ? "ding" : "pop";
      events.push({ frame: s.impact, sound });
    }
    if (s.beat.visual === "cuckoo-table") events.push({ frame: s.impact, sound: "pop" });
    if (s.beat.visual === "cuckoo-cycle") events.push({ frame: s.impact, sound: "slam" });
    if (s.beat.visual === "cuckoo-stash") events.push({ frame: s.impact, sound: "ding" });
    if (s.beat.visual === "inverse-sqrt-bits") events.push({ frame: s.impact, sound: "pop" });
    if (s.beat.visual === "merkle-tree") {
      const ph = s.beat.params?.phase;
      events.push({ frame: s.impact, sound: ph === "proof" ? "ding" : "pop" });
    }
    if (s.beat.visual === "stable-matching") {
      const ph = s.beat.params?.phase;
      events.push({ frame: s.impact, sound: ph === "final" ? "ding" : "pop" });
    }
    if (s.beat.visual === "busy-beaver") events.push({ frame: s.impact, sound: "ding" });
    if (s.beat.visual === "secret-sharing") events.push({ frame: s.impact, sound: "pop" });
    if (s.beat.visual === "reservoir-sampling") {
      const phase = s.beat.params?.phase;
      events.push({ frame: s.impact, sound: phase === "proof" || phase === "fair" ? "ding" : "pop" });
    }
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
            opacity: interpolate(local, [2, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          {sub}
        </div>
      ) : null}
    </>
  );
};

/** Пароль печатается точками, по энтеру буквы голым текстом улетают по проводу — читает их глаз сбоку. */
const PasswordLeak: React.FC<{ local: number; fps: number; impactLocal: number; password?: string }> = ({
  local,
  fps,
  impactLocal,
  password = "hunter2",
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const boxW = 760;
  const boxX = W / 2 - boxW / 2;
  const boxY = 760;
  const promptY = boxY + 130;
  const dotsY = boxY + 190;
  const typedCount = Math.min(password.length, Math.floor((local / Math.max(impactLocal, 1)) * password.length));
  const pressed = local >= impactLocal;
  const flash = pressed ? Math.exp(-(local - impactLocal) * 0.2) : 0;
  const leakP = pressed ? clamp01((local - impactLocal - 6) / 32) : 0;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: boxX,
          top: boxY,
          width: boxW,
          height: 260,
          transform: `translateY(${(1 - enter) * 100}px) scale(${0.92 + 0.08 * enter})`,
          opacity: enter,
          background: "#0A0F18",
          border: `2px solid ${theme.panelBorder}`,
          borderRadius: 24,
          boxShadow: "0 40px 100px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 22px", background: theme.panel }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
            <div key={c} style={{ width: 18, height: 18, borderRadius: 9, background: c }} />
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            left: 34,
            top: promptY - boxY,
            fontFamily: theme.mono,
            fontSize: 34,
            color: theme.subtext,
          }}
        >
          user@host:~$ ssh login
        </div>
        <div style={{ position: "absolute", left: 34, top: promptY - boxY + 60, display: "flex", gap: 12 }}>
          {Array.from({ length: typedCount }).map((_, i) => (
            <div key={i} style={{ width: 20, height: 20, borderRadius: 10, background: theme.text }} />
          ))}
          {!pressed ? (
            <div
              style={{
                width: 4,
                height: 30,
                background: theme.text,
                opacity: 0.5 + 0.5 * Math.sin(local / 4),
              }}
            />
          ) : null}
        </div>
      </div>
      {pressed && flash > 0.05 ? <PulseRing x={W / 2} y={dotsY} triggerFrame={impactLocal} tone="danger" size={260} /> : null}
      {pressed ? (
        <div
          style={{
            position: "absolute",
            left: boxX + boxW,
            top: dotsY - 2,
            width: W - (boxX + boxW) + 220,
            height: 4,
            background: `${theme.danger}AA`,
            boxShadow: `0 0 20px ${theme.danger}88`,
          }}
        />
      ) : null}
      {pressed
        ? password.split("").map((ch, i) => {
            const t = clamp01(leakP - i * 0.045);
            if (t <= 0) return null;
            const x = interpolate(t, [0, 1], [boxX + boxW - 10, W + 90]);
            const y = dotsY + 14 * Math.sin((local + i * 7) / 8);
            const op = interpolate(t, [0, 0.15, 0.85, 1], [0, 1, 1, 0]);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  transform: "translate(-50%, -50%)",
                  fontFamily: theme.mono,
                  fontWeight: 800,
                  fontSize: 46,
                  color: theme.danger,
                  textShadow: `0 0 20px ${theme.danger}`,
                  opacity: op,
                }}
              >
                {ch}
              </div>
            );
          })
        : null}
      {pressed && leakP > 0.25 ? (
        <div
          style={{
            position: "absolute",
            right: 130,
            top: dotsY - 130,
            opacity: interpolate(leakP, [0.25, 0.45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            filter: `drop-shadow(0 0 20px ${theme.danger}aa)`,
          }}
        >
          <IconGlyph name="eye" size={92} color={theme.danger} strokeWidth={1.6} />
        </div>
      ) : null}
    </>
  );
};

/** Семь позиций кода Хэмминга: три проверки и четыре бита данных. */
const HammingWordVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  errorPosition?: number;
}> = ({ local, fps, impactLocal, errorPosition = 5 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const error = Math.max(1, Math.min(7, Math.round(errorPosition)));
  const errorEnter = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const bits = [0, 1, 1, 0, 1, 0, 1];
  const cardWidth = 108;
  const cardGap = 12;
  const rowWidth = bits.length * cardWidth + (bits.length - 1) * cardGap;
  const rowLeft = (W - rowWidth) / 2;
  const errorX = rowLeft + (error - 1) * (cardWidth + cardGap) + cardWidth / 2;
  const failed = local >= impactLocal;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: 390,
          textAlign: "center",
          fontFamily: theme.mono,
          fontSize: 28,
          letterSpacing: 3,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        СЕМЬ ПОЗИЦИЙ · ЧЕТЫРЕ ДАННЫХ · ТРИ ПРОВЕРКИ
      </div>
      <div
        style={{
          position: "absolute",
          left: rowLeft,
          top: 610,
          display: "flex",
          gap: cardGap,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 50}px)`,
        }}
      >
        {bits.map((bit, i) => {
          const position = i + 1;
          const parity = position === 1 || position === 2 || position === 4;
          const activeError = failed && position === error;
          const color = activeError ? theme.danger : parity ? theme.accent2 : theme.accent;
          const shownBit = activeError ? 1 - bit : bit;
          const pulse = activeError ? 1 + 0.06 * Math.sin((local - impactLocal) / 5) : 1;
          return (
            <div
              key={position}
              style={{
                width: cardWidth,
                height: 260,
                borderRadius: 24,
                border: `3px solid ${color}${activeError ? "EE" : "99"}`,
                background: `${color}${activeError ? "24" : "12"}`,
                boxShadow: `0 0 ${activeError ? 60 : 30}px ${color}${activeError ? "88" : "22"}`,
                transform: `scale(${pulse})`,
                textAlign: "center",
                paddingTop: 22,
              }}
            >
              <div style={{ fontFamily: theme.mono, fontSize: 24, color: theme.subtext }}>ПОЗИЦИЯ {position}</div>
              <div
                style={{
                  marginTop: 30,
                  fontFamily: theme.mono,
                  fontSize: 86,
                  fontWeight: 800,
                  color,
                  textShadow: `0 0 24px ${color}99`,
                }}
              >
                {shownBit}
              </div>
              <div
                style={{
                  marginTop: 18,
                  fontFamily: theme.font,
                  fontSize: Math.min(20, fitText({
                    text: parity ? "ПРОВЕРКА" : "ДАННЫЕ",
                    withinWidth: cardWidth - 14,
                    fontFamily: theme.font,
                    fontWeight: 800,
                  }).fontSize),
                  fontWeight: 800,
                  color: theme.text,
                  whiteSpace: "nowrap",
                }}
              >
                {parity ? "ПРОВЕРКА" : "ДАННЫЕ"}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 1030,
          transform: "translateX(-50%)",
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 42,
          color: failed ? theme.danger : theme.text,
          opacity: enter,
        }}
      >
        {failed ? `БИТ ${error} ПЕРЕВЁРНУТ` : "КОДОВОЕ СЛОВО"}
      </div>
      {failed ? <PulseRing x={errorX} y={740} triggerFrame={impactLocal} tone="danger" size={170} /> : null}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 1180,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontSize: 28,
          color: failed ? theme.warning : theme.subtext,
          opacity: failed ? errorEnter : enter,
        }}
      >
        {failed ? "ПРОВЕРКИ НАЙДУТ АДРЕС" : "ПРОВЕРКИ СЛЕДЯТ ЗА ГРУППАМИ"}
      </div>
    </>
  );
};

/** Три группы чётности складываются в двоичный синдром — адрес ошибки. */
const HammingSyndromeVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  mode?: "groups" | "syndrome";
  errorPosition?: number;
}> = ({ local, fps, impactLocal, mode = "groups", errorPosition = 5 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const error = Math.max(1, Math.min(7, Math.round(errorPosition)));
  const groups = [
    { label: "П1", positions: [1, 3, 5, 7], value: "1", color: theme.accent },
    { label: "П2", positions: [2, 3, 6, 7], value: "0", color: theme.accent2 },
    { label: "П4", positions: [4, 5, 6, 7], value: "1", color: theme.success },
  ];
  const errorX = 782;
  const rowTop = 500;
  const failed = local >= impactLocal;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: 370,
          textAlign: "center",
          fontFamily: theme.mono,
          fontSize: 28,
          letterSpacing: 3,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        ТРИ ПРОВЕРКИ · ОДИН АДРЕС
      </div>
      {groups.map((group, row) => {
        const y = rowTop + row * 220;
        const result = mode === "groups" ? (failed ? "✓" : "?") : failed ? group.value : "·";
        const resultColor = mode === "groups" ? theme.success : row === 1 ? theme.accent2 : group.color;
        return (
          <div
            key={group.label}
            style={{
              position: "absolute",
              left: 74,
              top: y,
              width: 932,
              height: 158,
              borderRadius: 26,
              background: `${group.color}0D`,
              border: `3px solid ${group.color}66`,
              opacity: enter,
              transform: `translateY(${(1 - enter) * 45}px)`,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 28,
                top: 47,
                width: 100,
                fontFamily: theme.mono,
                fontSize: 36,
                fontWeight: 800,
                color: group.color,
              }}
            >
              {group.label}
            </div>
            {group.positions.map((position, i) => {
              const activeError = failed && position === error;
              return (
                <div
                  key={position}
                  style={{
                    position: "absolute",
                    left: 154 + i * 142,
                    top: 35,
                    width: 108,
                    height: 88,
                    borderRadius: 18,
                    border: `3px solid ${activeError ? theme.danger : group.color}99`,
                    background: activeError ? `${theme.danger}26` : theme.panel,
                    color: activeError ? theme.danger : theme.text,
                    fontFamily: theme.mono,
                    fontSize: 31,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: activeError ? `0 0 32px ${theme.danger}88` : "none",
                  }}
                >
                  {position}
                </div>
              );
            })}
            <div
              style={{
                position: "absolute",
                right: 28,
                top: 38,
                width: 88,
                height: 82,
                borderRadius: 18,
                background: `${resultColor}1C`,
                border: `3px solid ${resultColor}AA`,
                color: resultColor,
                fontFamily: theme.mono,
                fontSize: 38,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: mode === "groups" ? enter : reveal,
              }}
            >
              {result}
            </div>
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 1210,
          transform: "translateX(-50%)",
          minWidth: 620,
          padding: "20px 36px",
          borderRadius: 24,
          textAlign: "center",
          background: `${failed ? theme.success : theme.panel}1F`,
          border: `3px solid ${failed ? theme.success : theme.panelBorder}`,
          color: failed ? theme.success : theme.subtext,
          fontFamily: theme.mono,
          fontSize: 38,
          fontWeight: 800,
          opacity: mode === "groups" ? enter : reveal,
          boxShadow: failed ? `0 0 45px ${theme.success}55` : "none",
        }}
      >
        {mode === "groups" ? "ГРУППЫ ПОЗИЦИЙ" : failed ? "СИНДРОМ 101  →  5" : "СИНДРОМ  ·  ·  ·"}
      </div>
      {failed && mode === "syndrome" ? <PulseRing x={errorX} y={1065} triggerFrame={impactLocal} tone="success" size={150} /> : null}
    </>
  );
};

/** Ключ проходит через хеш-функцию и попадает в конкретную ячейку массива. */
const HashTableVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  keyLabel?: string;
  hash?: string;
  index?: number;
  value?: string;
}> = ({ local, fps, impactLocal, keyLabel = "профиль", hash = "#A7", index = 3, value = "профиль" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } });
  const selected = Math.max(0, Math.min(7, Math.round(index)));
  const cellWidth = 106;
  const cellGap = 10;
  const cellStart = (W - (8 * cellWidth + 7 * cellGap)) / 2;
  const selectedX = cellStart + selected * (cellWidth + cellGap) + cellWidth / 2;
  const tableY = 1030;
  const flowEnd = Math.max(impactLocal - 8, 1);
  const flowP = smooth(clamp01(local / flowEnd));
  const movingX = interpolate(flowP, [0, 1], [160, 520]);
  const movingOpacity = interpolate(local, [0, 14, flowEnd], [1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cellPulse = 1 + 0.06 * Math.sin((local - impactLocal) / 5);
  const safeKey = keyLabel.length > 12 ? `${keyLabel.slice(0, 11)}…` : keyLabel;
  const safeValue = value.length > 10 ? `${value.slice(0, 9)}…` : value;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 74,
          top: 560,
          width: 220,
          height: 170,
          borderRadius: 26,
          background: theme.panel,
          border: `3px solid ${theme.accent}99`,
          boxShadow: `0 0 55px ${theme.accent}22`,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 70}px)`,
          textAlign: "center",
          paddingTop: 24,
        }}
      >
        <div style={{ fontFamily: theme.mono, fontSize: 25, color: theme.subtext }}>КЛЮЧ</div>
        <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 38, color: theme.text, marginTop: 18 }}>
          {safeKey}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 370,
          top: 560,
          width: 300,
          height: 170,
          borderRadius: 26,
          background: `${theme.accent2}12`,
          border: `3px solid ${theme.accent2}99`,
          boxShadow: `0 0 55px ${theme.accent2}22`,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 70}px)`,
          textAlign: "center",
          paddingTop: 18,
        }}
      >
        <IconGlyph name="hash" size={42} color={theme.accent2} strokeWidth={1.8} />
        <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 36, color: theme.text, marginTop: 5 }}>
          h(ключ)
        </div>
        <div style={{ fontFamily: theme.mono, fontSize: 25, color: theme.accent2, marginTop: 7 }}>{hash}</div>
      </div>
      {[{ left: 294, width: 68 }, { left: 680, width: selectedX - 680 - 12 }].map((line, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: line.left,
            top: 644,
            width: Math.max(20, line.width),
            height: 4,
            background: i === 0 ? theme.accent : theme.accent2,
            opacity: enter * 0.8,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: movingX,
          top: 620,
          transform: "translate(-50%, -50%)",
          background: theme.accent,
          color: "#06121A",
          borderRadius: 999,
          padding: "10px 18px",
          fontFamily: theme.mono,
          fontWeight: 800,
          fontSize: 25,
          opacity: movingOpacity * enter,
          boxShadow: `0 0 26px ${theme.accent}AA`,
        }}
      >
        {safeKey}
      </div>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 890,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontSize: 27,
          color: theme.subtext,
          opacity: enter,
          letterSpacing: 3,
        }}
      >
        МАССИВ ВЕДЕР
      </div>
      {Array.from({ length: 8 }).map((_, i) => {
        const active = i === selected && local >= impactLocal;
        const x = cellStart + i * (cellWidth + cellGap);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: tableY,
              width: cellWidth,
              height: 170,
              borderRadius: 18,
              border: `3px solid ${active ? theme.success : theme.panelBorder}`,
              background: active ? `${theme.success}1A` : theme.panel,
              boxShadow: active ? `0 0 ${45 + 20 * Math.max(0, reveal)}px ${theme.success}66` : "none",
              opacity: enter,
              transform: `scale(${active ? cellPulse : 1})`,
              textAlign: "center",
              paddingTop: 14,
            }}
          >
            <div style={{ fontFamily: theme.mono, fontSize: 24, color: active ? theme.success : theme.subtext }}>
              [{i}]
            </div>
            {active ? (
              <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 24, color: theme.text, marginTop: 27 }}>
                {safeValue}
              </div>
            ) : (
              <div style={{ fontFamily: theme.mono, fontSize: 33, color: theme.panelBorder, marginTop: 24 }}>·</div>
            )}
          </div>
        );
      })}
      {local >= impactLocal ? <PulseRing x={selectedX} y={tableY + 85} triggerFrame={impactLocal} tone="success" size={150} /> : null}
      <div
        style={{
          position: "absolute",
          left: selectedX,
          top: 1230,
          transform: "translateX(-50%)",
          fontFamily: theme.font,
          fontWeight: 700,
          fontSize: 30,
          color: theme.success,
          opacity: reveal,
        }}
      >
        индекс {selected}
      </div>
    </>
  );
};

/** Граф достижимости: корни ведут к живым объектам, отдельный цикл остаётся мусором. */
const HeapGraphVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  mode?: "roots" | "unreachable";
}> = ({ local, fps, impactLocal, mode = "unreachable" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const scan = smooth(clamp01(local / Math.max(impactLocal - 10, 1)));
  const sweep = smooth(clamp01((local - impactLocal) / 22));
  const liveColor = interpolateColors(scan, [0, 1], [theme.accent, theme.success]);
  const garbageColor = interpolateColors(sweep, [0, 1], [theme.danger, theme.panelBorder]);
  const garbageOpacity = mode === "roots" ? 0 : 1 - 0.78 * sweep;
  const root = { x: W / 2, y: 400 };
  const liveA = { x: 250, y: 760 };
  const liveB = { x: 540, y: 980 };
  const liveC = { x: 830, y: 760 };
  const garbageA = { x: 290, y: 1260 };
  const garbageB = { x: 560, y: 1370 };

  const edge = (
    key: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: string,
    opacity: number,
    dashed = false,
  ) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return (
      <div
        key={key}
        style={{
          position: "absolute",
          left: from.x,
          top: from.y,
          width: length,
          height: 4,
          transformOrigin: "0 50%",
          transform: `translateY(-50%) rotate(${angle}deg)`,
          background: dashed ? "transparent" : color,
          borderTop: dashed ? `4px dashed ${color}` : undefined,
          opacity: enter * opacity,
          zIndex: 1,
        }}
      >
        <span
          style={{
            position: "absolute",
            right: -4,
            top: "50%",
            transform: "translateY(-50%)",
            color,
            fontFamily: theme.font,
            fontSize: 34,
            lineHeight: 1,
          }}
        >
          ›
        </span>
      </div>
    );
  };

  const node = (
    key: string,
    point: { x: number; y: number },
    label: string,
    icon: string,
    color: string,
    opacity = 1,
    sub?: string,
    scale = 1,
  ) => (
    <div
      key={key}
      style={{
        position: "absolute",
        left: point.x - 112,
        top: point.y - 66,
        width: 224,
        height: 132,
        borderRadius: 24,
        background: theme.panel,
        border: `3px solid ${color}`,
        boxShadow: `0 0 38px ${color}2E`,
        opacity: enter * opacity,
        transform: `translateY(${(1 - enter) * 70}px) scale(${scale})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        zIndex: 2,
      }}
    >
      <IconGlyph name={icon} size={42} color={color} strokeWidth={1.7} />
      <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 30, color: theme.text }}>{label}</div>
      {sub ? <div style={{ fontFamily: theme.mono, fontSize: 21, color }}>{sub}</div> : null}
    </div>
  );

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 260,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontSize: 28,
          letterSpacing: 4,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        КУЧА ПАМЯТИ
      </div>
      {edge("root-a", root, liveA, liveColor, scan)}
      {edge("root-c", root, liveC, liveColor, scan)}
      {edge("a-b", liveA, liveB, liveColor, scan)}
      {edge("b-a", liveB, liveA, liveColor, scan, true)}
      {mode !== "roots" ? edge("garbage-a-b", garbageA, garbageB, garbageColor, garbageOpacity, true) : null}
      {mode !== "roots" ? edge("garbage-b-a", garbageB, garbageA, garbageColor, garbageOpacity, true) : null}
      {node("root", root, "Корни", "scan-search", theme.warning, 1, "старт обхода")}
      {node("live-a", liveA, "объект A", "boxes", liveColor, 1, scan > 0.45 ? "MARK" : "ожидает", 1 + 0.025 * Math.sin(local / 7))}
      {node("live-b", liveB, "объект B", "link", liveColor, 1, scan > 0.58 ? "MARK" : "ожидает", 1 + 0.02 * Math.sin(local / 8 + 1))}
      {node("live-c", liveC, "объект C", "database", liveColor, 1, scan > 0.72 ? "MARK" : "ожидает", 1 + 0.025 * Math.sin(local / 9 + 2))}
      {mode !== "roots"
        ? node("garbage-a", garbageA, "цикл X", "git-branch", garbageColor, garbageOpacity, sweep > 0.55 ? "SWEEP" : "нет корня", 1 - 0.12 * sweep)
        : null}
      {mode !== "roots"
        ? node("garbage-b", garbageB, "цикл Y", "git-branch", garbageColor, garbageOpacity, sweep > 0.55 ? "SWEEP" : "нет корня", 1 - 0.12 * sweep)
        : null}
      {mode !== "roots" && local >= impactLocal ? (
        <PulseRing x={garbageA.x} y={garbageA.y} triggerFrame={impactLocal} tone="danger" size={180} />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 1510,
          transform: "translateX(-50%)",
          padding: "14px 28px",
          borderRadius: 999,
          border: `2px solid ${mode === "roots" ? theme.success : garbageColor}`,
          background: `${mode === "roots" ? theme.success : garbageColor}18`,
          color: mode === "roots" ? theme.success : garbageColor,
          fontFamily: theme.mono,
          fontWeight: 800,
          fontSize: 25,
          letterSpacing: 1,
          opacity: enter,
        }}
      >
        {mode === "roots" ? "ДОСТИЖИМО ОТ КОРНЯ" : "НЕДОСТИЖИМО → МУСОР"}
      </div>
    </>
  );
};

/** Пошаговый проход сборщика: сначала mark, затем sweep; отдельный режим показывает поколения. */
const GcSweepVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  mode?: "mark-sweep" | "generations";
}> = ({ local, fps, impactLocal, mode = "mark-sweep" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const mark = smooth(clamp01((local - 8) / Math.max(impactLocal - 8, 1)));
  const sweep = smooth(clamp01((local - impactLocal) / 24));
  const youngSweep = smooth(clamp01((local - impactLocal) / 28));
  const liveColor = interpolateColors(mark, [0, 1], [theme.accent, theme.success]);
  const garbageColor = interpolateColors(sweep, [0, 1], [theme.danger, theme.panelBorder]);

  const labelStyle: React.CSSProperties = {
    fontFamily: theme.mono,
    fontWeight: 800,
    letterSpacing: 2,
  };

  if (mode === "generations") {
    const generationPanel = (x: number, title: string, color: string, old: boolean) => (
      <div
        style={{
          position: "absolute",
          left: x,
          top: 460,
          width: 390,
          height: 760,
          borderRadius: 28,
          background: theme.panel,
          border: `3px solid ${color}88`,
          boxShadow: `0 0 55px ${color}1F`,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 80}px)`,
        }}
      >
        <div style={{ textAlign: "center", paddingTop: 30, ...labelStyle, fontSize: 25, color }}>{title}</div>
        <div style={{ textAlign: "center", marginTop: 12, fontFamily: theme.font, fontSize: 27, color: theme.subtext }}>
          {old ? "живёт дольше" : "умирает чаще"}
        </div>
        {Array.from({ length: old ? 4 : 6 }).map((_, i) => {
          const row = Math.floor(i / 2);
          const col = i % 2;
          const fade = old ? 1 : 1 - 0.86 * youngSweep;
          const dotColor = old ? theme.accent2 : interpolateColors(youngSweep, [0, 1], [theme.accent, theme.panelBorder]);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 82 + col * 130,
                top: 185 + row * 125,
                width: 92,
                height: 92,
                borderRadius: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `${dotColor}18`,
                border: `3px solid ${dotColor}`,
                color: dotColor,
                opacity: enter * fade,
                transform: `scale(${1 + 0.035 * Math.sin((local + i * 8) / 8)})`,
              }}
            >
              <IconGlyph name={old ? "boxes" : "sprout"} size={40} color={dotColor} strokeWidth={1.7} />
            </div>
          );
        })}
        <div
          style={{
            position: "absolute",
            left: 34,
            right: 34,
            bottom: 36,
            padding: "15px 8px",
            borderRadius: 16,
            textAlign: "center",
            background: `${color}14`,
            color,
            fontFamily: theme.font,
            fontWeight: 700,
            fontSize: 26,
          }}
        >
          {old ? "сканируем реже" : "собираем часто"}
        </div>
      </div>
    );

    return (
      <>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 270,
            transform: "translateX(-50%)",
            ...labelStyle,
            fontSize: 29,
            color: theme.subtext,
            opacity: enter,
          }}
        >
          ПОКОЛЕНИЯ КУЧИ
        </div>
        {generationPanel(105, "МОЛОДАЯ", theme.accent, false)}
        {generationPanel(585, "СТАРАЯ", theme.accent2, true)}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1320,
            transform: "translateX(-50%)",
            padding: "15px 26px",
            borderRadius: 999,
            background: `${theme.success}18`,
            border: `2px solid ${theme.success}`,
            color: theme.success,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 28,
            opacity: enter,
          }}
        >
          МЕНЬШЕ ПАУЗ ДЛЯ ПРОГРАММЫ
        </div>
      </>
    );
  }

  const card = (x: number, label: string, icon: string, color: string, opacity: number, sub: string) => (
    <div
      style={{
        position: "absolute",
        left: x - 120,
        top: 730,
        width: 240,
        height: 190,
        borderRadius: 26,
        background: theme.panel,
        border: `3px solid ${color}`,
        boxShadow: `0 0 45px ${color}2E`,
        opacity: enter * opacity,
        transform: `translateY(${(1 - enter) * 70}px) scale(${1 + 0.025 * Math.sin(local / 8 + x)})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        zIndex: 2,
      }}
    >
      <IconGlyph name={icon} size={48} color={color} strokeWidth={1.7} />
      <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 31, color: theme.text }}>{label}</div>
      <div style={{ ...labelStyle, fontSize: 20, color }}>{sub}</div>
    </div>
  );

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 270,
          transform: "translateX(-50%)",
          ...labelStyle,
          fontSize: 29,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        MARK → SWEEP
      </div>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 390,
          transform: "translateX(-50%)",
          padding: "12px 30px",
          borderRadius: 999,
          background: `${(local < impactLocal ? theme.accent : theme.warning)}18`,
          border: `2px solid ${local < impactLocal ? theme.accent : theme.warning}`,
          color: local < impactLocal ? theme.accent : theme.warning,
          ...labelStyle,
          fontSize: 28,
          opacity: enter,
        }}
      >
        {local < impactLocal ? "MARK: ставим метки" : "SWEEP: убираем мусор"}
      </div>
      <div
        style={{
          position: "absolute",
          left: 130,
          top: 1040,
          width: 820,
          height: 12,
          borderRadius: 999,
          background: theme.panelBorder,
          opacity: enter,
        }}
      >
        <div style={{ width: `${mark * 56 + sweep * 44}%`, height: "100%", borderRadius: 999, background: sweep > 0 ? theme.warning : theme.success }} />
      </div>
      {card(220, "объект A", "check", liveColor, 1, mark > 0.25 ? "MARK" : "живой")}
      {card(540, "объект B", "check", liveColor, 1, mark > 0.48 ? "MARK" : "живой")}
      {card(860, "мусор", "trash-2", garbageColor, 1 - 0.86 * sweep, sweep > 0.45 ? "SWEEP" : "не помечен")}
      <div
        style={{
          position: "absolute",
          left: 220,
          top: 660,
          width: 640,
          height: 4,
          background: `${theme.panelBorder}CC`,
          opacity: enter,
        }}
      />
      {local >= impactLocal ? <PulseRing x={860} y={825} triggerFrame={impactLocal} tone="warning" size={190} /> : null}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 1240,
          transform: "translateX(-50%)",
          color: sweep > 0.5 ? theme.success : theme.subtext,
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 31,
          opacity: enter,
        }}
      >
        {sweep > 0.5 ? "непомеченное освобождено" : "живое остаётся в куче"}
      </div>
    </>
  );
};

/** Одна коллизия, показанная сразу двумя стратегиями: цепочка и probing. */
const CollisionCompare: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  keyA?: string;
  keyB?: string;
  bucket?: number;
}> = ({ local, fps, impactLocal, keyA = "профиль", keyB = "платёж", bucket = 3 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 14, mass: 0.8 } });
  const second = spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } });
  const leftX = 270;
  const rightX = 810;
  const panelTop = 420;
  const cellY = 780;
  const safeA = keyA.length > 10 ? `${keyA.slice(0, 9)}…` : keyA;
  const safeB = keyB.length > 10 ? `${keyB.slice(0, 9)}…` : keyB;
  const pill = (label: string, x: number, y: number, color: string, opacity = 1) => (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        padding: "12px 18px",
        borderRadius: 999,
        background: `${color}22`,
        border: `2px solid ${color}`,
        color: theme.text,
        fontFamily: theme.font,
        fontWeight: 700,
        fontSize: 27,
        whiteSpace: "nowrap",
        opacity: opacity * enter,
      }}
    >
      {label}
    </div>
  );
  const panel = (x: number, title: string, color: string, children: React.ReactNode) => (
    <div
      style={{
        position: "absolute",
        left: x - 215,
        top: panelTop,
        width: 430,
        height: 860,
        borderRadius: 28,
        background: theme.panel,
        border: `3px solid ${color}77`,
        boxShadow: `0 0 60px ${color}18`,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 90}px)`,
      }}
    >
      <div style={{ textAlign: "center", paddingTop: 26, fontFamily: theme.font, fontWeight: 800, fontSize: 37, color }}>
        {title}
      </div>
      {children}
    </div>
  );
  const cell = (x: number, y: number, label: string, color: string, active = false, bucketLabel = bucket) => (
    <div
      style={{
        position: "absolute",
        left: x - 155,
        top: y - 48,
        width: 310,
        height: 96,
        borderRadius: 18,
        border: `3px solid ${active ? color : theme.panelBorder}`,
        background: active ? `${color}18` : "#0D1420",
        boxShadow: active ? `0 0 35px ${color}55` : "none",
        display: "flex",
        alignItems: "center",
        padding: "0 18px",
        gap: 16,
      }}
    >
      <span style={{ fontFamily: theme.mono, fontSize: 25, color: active ? color : theme.subtext }}>[{bucketLabel}]</span>
      <span style={{ fontFamily: theme.font, fontWeight: 700, fontSize: 27, color: theme.text }}>{label}</span>
    </div>
  );
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 300,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontWeight: 700,
          fontSize: 29,
          color: theme.warning,
          opacity: enter,
          letterSpacing: 2,
        }}
      >
        ОДИН ИНДЕКС → ДВА ВЫХОДА
      </div>
      {panel(leftX, "ЦЕПОЧКА", theme.accent, <>
        <div style={{ position: "absolute", left: 50, right: 50, top: 115, fontFamily: theme.mono, fontSize: 24, color: theme.subtext }}>ячейка {bucket} → список</div>
        {cell(215, cellY - panelTop, safeA, theme.accent, true)}
        {pill(safeB, 215, cellY + 112 - panelTop, theme.accent, second)}
        <div style={{ position: "absolute", left: 115, top: cellY + 52 - panelTop, color: theme.accent, fontSize: 38, opacity: second * enter }}>↓</div>
        <div style={{ position: "absolute", left: 50, right: 50, bottom: 55, textAlign: "center", fontFamily: theme.font, fontSize: 28, color: theme.subtext }}>оба живут рядом</div>
      </>)}
      {panel(rightX, "ПРОБА", theme.accent2, <>
        <div style={{ position: "absolute", left: 50, right: 50, top: 115, fontFamily: theme.mono, fontSize: 24, color: theme.subtext }}>ищем свободное место</div>
        {cell(215, cellY - panelTop, safeA, theme.accent2, true)}
        {cell(215, cellY + 140 - panelTop, safeB, theme.success, local >= impactLocal, bucket + 1)}
        <div style={{ position: "absolute", left: 215, top: cellY + 69 - panelTop, color: theme.accent2, fontSize: 34, opacity: second * enter }}>↓</div>
        <div style={{ position: "absolute", left: 50, right: 50, bottom: 55, textAlign: "center", fontFamily: theme.font, fontSize: 28, color: theme.subtext }}>следующая ячейка</div>
      </>)}
      {local >= impactLocal ? (
        <>
          <PulseRing x={leftX} y={cellY + 112} triggerFrame={impactLocal} tone="accent" size={130} />
          <PulseRing x={rightX} y={cellY + 140} triggerFrame={impactLocal} tone="success" size={130} />
        </>
      ) : null}
    </>
  );
};

/** Медаль Лейбница: девиз гравируется по ободу, затем чеканкой выбивает 1 и 0 в центре. */
const MedalMint: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  motto?: string;
  caption?: string;
}> = ({ local, fps, impactLocal, motto = "EX NIHILO OMNIA", caption = "медаль Лейбница" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.9 } });
  const cx = W / 2;
  const cy = 860;
  const R = 340;
  const stamped = local >= impactLocal;
  const press = stamped ? Math.min(1, 0.9 + Math.min(1, (local - impactLocal) / 10) * 0.1) : 1;
  const engrave = smooth(clamp01(local / Math.max(impactLocal - 4, 1)));
  const chars = motto.split("");
  const shown = Math.floor(engrave * chars.length);
  const digitPop = stamped ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.8 } }) : 0;
  const rimFade = stamped
    ? interpolate(local - impactLocal, [0, 20], [1, 0.32], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  const startDeg = 200;
  const endDeg = 340;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx - R,
          top: cy - R,
          width: R * 2,
          height: R * 2,
          borderRadius: "50%",
          opacity: enter,
          transform: `scale(${(0.86 + 0.14 * enter) * press})`,
          background: "radial-gradient(circle at 34% 28%, #EEF2F7, #9AA4B2 55%, #55606E 100%)",
          border: "6px solid rgba(255,255,255,0.35)",
          boxShadow: "0 0 90px rgba(0,0,0,0.55), inset 0 0 60px rgba(0,0,0,0.35)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: cx - (R - 60),
          top: cy - (R - 60),
          width: (R - 60) * 2,
          height: (R - 60) * 2,
          borderRadius: "50%",
          opacity: enter * 0.9,
          transform: `scale(${press})`,
          border: "3px solid rgba(11,14,20,0.4)",
        }}
      />
      {chars.map((ch, i) => {
        if (i > shown) return null;
        const deg = interpolate(i, [0, Math.max(chars.length - 1, 1)], [startDeg, endDeg]);
        const rad = (deg * Math.PI) / 180;
        const rr = R - 46;
        const x = cx + rr * Math.cos(rad);
        const y = cy + rr * Math.sin(rad);
        const rot = deg + 90;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              transform: `translate(-50%, -50%) rotate(${rot}deg)`,
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 30,
              color: "#1B2230",
              opacity: rimFade * enter,
              letterSpacing: 1,
            }}
          >
            {ch === " " ? " " : ch}
          </div>
        );
      })}
      {stamped ? <PulseRing x={cx} y={cy} triggerFrame={impactLocal} size={520} tone="warning" /> : null}
      <div
        style={{
          position: "absolute",
          left: cx - 210,
          top: cy - 90,
          width: 160,
          textAlign: "center",
          transform: `scale(${digitPop})`,
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 150,
          color: theme.accent,
          textShadow: `0 0 40px ${theme.accent}77`,
        }}
      >
        1
      </div>
      <div
        style={{
          position: "absolute",
          left: cx + 50,
          top: cy - 90,
          width: 160,
          textAlign: "center",
          transform: `scale(${digitPop})`,
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 150,
          color: theme.accent2,
          textShadow: `0 0 40px ${theme.accent2}77`,
        }}
      >
        0
      </div>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: cy + R + 60,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontSize: 28,
          letterSpacing: 3,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        {caption.toUpperCase()}
      </div>
    </>
  );
};

/** Древний код: линии гексаграммы И-цзин или долгие/короткие слоги стиха превращаются в биты. */
const AncientCode: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  mode?: "hexagram" | "syllable";
  label?: string;
}> = ({ local, fps, impactLocal, mode = "hexagram", label }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hexBits = [1, 0, 1, 1, 0, 1];
  const sylBits = [1, 1, 0, 1, 0, 0, 1];
  const bits = mode === "hexagram" ? hexBits : sylBits;
  const value = parseInt(bits.join(""), 2);
  const caption = label ?? (mode === "hexagram" ? "И-цзин" : "Чхандах-шастра");
  const cx = W / 2;

  const buildP = (i: number) => smooth(clamp01((local - i * 7) / 18));
  const stampP = (i: number) => {
    const off = local - impactLocal - i * 5;
    if (off < 0) return 0;
    return clamp01(spring({ frame: off, fps, config: { damping: 12, mass: 0.6 } }));
  };

  if (mode === "hexagram") {
    const barW = 380;
    const barH = 30;
    const gap = 30;
    const top = 470;
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: cx,
            top: top - 90,
            transform: "translateX(-50%)",
            opacity: enter,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <IconGlyph name="scroll-text" size={40} color={theme.subtext} strokeWidth={1.6} />
          <div style={{ fontFamily: theme.mono, fontSize: 30, letterSpacing: 3, color: theme.subtext }}>
            {caption.toUpperCase()}
          </div>
        </div>
        {bits.map((bit, i) => {
          const p = buildP(i);
          const y = top + i * (barH + gap);
          const color = bit ? theme.accent : theme.accent2;
          const dp = stampP(i);
          return (
            <React.Fragment key={i}>
              <div
                style={{
                  position: "absolute",
                  left: cx - barW / 2,
                  top: y,
                  width: barW,
                  height: barH,
                  opacity: p,
                  transform: `scaleX(${0.4 + 0.6 * p})`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                {bit ? (
                  <div style={{ width: "100%", height: "100%", borderRadius: 8, background: `${theme.text}CC` }} />
                ) : (
                  <>
                    <div style={{ width: "44%", height: "100%", borderRadius: 8, background: `${theme.text}CC` }} />
                    <div style={{ width: "44%", height: "100%", borderRadius: 8, background: `${theme.text}CC` }} />
                  </>
                )}
              </div>
              <div
                style={{
                  position: "absolute",
                  left: cx + barW / 2 + 50,
                  top: y - 8,
                  transform: `translateX(${(1 - dp) * -20}px) scale(${dp})`,
                  fontFamily: theme.font,
                  fontWeight: 800,
                  fontSize: 46,
                  color,
                  opacity: dp,
                  textShadow: `0 0 24px ${color}77`,
                }}
              >
                {bit}
              </div>
            </React.Fragment>
          );
        })}
        {local >= impactLocal ? (
          <div
            style={{
              position: "absolute",
              left: cx,
              top: top + bits.length * (barH + gap) + 50,
              transform: "translateX(-50%)",
              padding: "12px 26px",
              borderRadius: 999,
              background: `${theme.success}18`,
              border: `2px solid ${theme.success}`,
              color: theme.success,
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 30,
              opacity: stampP(bits.length),
            }}
          >
            = {value}
          </div>
        ) : null}
      </>
    );
  }

  const itemW = 118;
  const totalW = bits.length * itemW;
  const startX = cx - totalW / 2;
  const rowY = 820;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: rowY - 160,
          transform: "translateX(-50%)",
          opacity: enter,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <IconGlyph name="feather" size={38} color={theme.subtext} strokeWidth={1.6} />
        <div style={{ fontFamily: theme.mono, fontSize: 30, letterSpacing: 3, color: theme.subtext }}>
          {caption.toUpperCase()}
        </div>
      </div>
      {bits.map((bit, i) => {
        const p = buildP(i);
        const x = startX + i * itemW + itemW / 2;
        const color = bit ? theme.accent : theme.accent2;
        const dp = stampP(i);
        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: "absolute",
                left: x,
                top: rowY,
                transform: `translate(-50%, -50%) scale(${p})`,
                opacity: p,
              }}
            >
              {bit ? (
                <div style={{ width: 74, height: 26, borderRadius: 13, background: `${theme.text}CC` }} />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: "50%", border: `6px solid ${theme.text}CC` }} />
              )}
            </div>
            <div
              style={{
                position: "absolute",
                left: x,
                top: rowY + 70,
                transform: `translate(-50%, ${(1 - dp) * 16}px) scale(${dp})`,
                fontFamily: theme.font,
                fontWeight: 800,
                fontSize: 44,
                color,
                opacity: dp,
                textShadow: `0 0 20px ${color}77`,
              }}
            >
              {bit}
            </div>
          </React.Fragment>
        );
      })}
      {local >= impactLocal ? (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: rowY + 170,
            transform: "translateX(-50%)",
            padding: "12px 26px",
            borderRadius: 999,
            background: `${theme.success}18`,
            border: `2px solid ${theme.success}`,
            color: theme.success,
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 30,
            opacity: stampP(bits.length),
          }}
        >
          = {value}
        </div>
      ) : null}
    </>
  );
};

/** Антивирус сканирует код: луч бежит по строкам, спиннер крутится, вердикт мигает check/infinity и застывает на «?». */
const VerdictScan: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  label?: string;
}> = ({ local, fps, impactLocal, label = "ЗАВИСНЕТ?" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const panelW = 760;
  const panelX = W / 2 - panelW / 2;
  const panelY = 420;
  const panelH = 620;
  const codeLines = [0.9, 0.55, 0.74, 0.4, 0.63, 0.32];
  const cycle = 52;
  const scanT = smooth(((local % cycle) + cycle) % cycle / cycle);
  const beamY = panelY + 120 + scanT * (panelH - 220);
  const spinDeg = local * 7;
  const settled = local >= impactLocal;
  const qPop = settled ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  const toggleOn = Math.floor(local / 7) % 2 === 0;
  const chipY = panelY + panelH + 140;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: panelX,
          top: panelY,
          width: panelW,
          height: panelH,
          transform: `translateY(${(1 - enter) * 90}px) scale(${0.92 + 0.08 * enter})`,
          opacity: enter,
          background: "#0A0F18",
          border: `2px solid ${theme.panelBorder}`,
          borderRadius: 28,
          overflow: "hidden",
          boxShadow: "0 40px 100px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "22px 26px", background: theme.panel }}>
          <IconGlyph name="shield" size={40} color={theme.accent} strokeWidth={1.8} />
          <div style={{ fontFamily: theme.font, fontWeight: 700, fontSize: 32, color: theme.text }}>Антивирус</div>
          <div style={{ marginLeft: "auto", transform: `rotate(${spinDeg}deg)` }}>
            <IconGlyph name="loader-circle" size={36} color={theme.accent2} strokeWidth={2} />
          </div>
        </div>
        {codeLines.map((w, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 40,
              top: 122 + i * 74,
              width: (panelW - 80) * w,
              height: 30,
              borderRadius: 8,
              background: "#1B2434",
              opacity: enter,
            }}
          />
        ))}
        {!settled ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: beamY,
              height: 6,
              background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)`,
              boxShadow: `0 0 30px ${theme.accent}AA`,
              opacity: enter,
            }}
          />
        ) : null}
      </div>
      {settled ? <PulseRing x={W / 2} y={chipY} triggerFrame={impactLocal} tone="warning" size={280} /> : null}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: chipY,
          transform: `translate(-50%, -50%) scale(${settled ? qPop : 1})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        {settled ? (
          <div
            style={{
              fontFamily: theme.font,
              fontWeight: 800,
              fontSize: 130,
              lineHeight: 1,
              color: theme.warning,
              textShadow: `0 0 50px ${theme.warning}77`,
            }}
          >
            ?
          </div>
        ) : (
          <IconGlyph
            name={toggleOn ? "shield-check" : "infinity"}
            size={90}
            color={toggleOn ? theme.success : theme.danger}
            strokeWidth={1.7}
          />
        )}
        <div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 30, color: theme.subtext, letterSpacing: 2 }}>
          {label.toUpperCase()}
        </div>
      </div>
    </>
  );
};

/** Программа-ловушка кормит собой чёрный ящик-оракул: setup — самоприменение и развилка да/нет,
 * crack — оба предсказания перечёркиваются одновременно, оракул трескается и рассыпается. */
const ParadoxBox: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  trap?: string;
  oracle?: string;
  stage?: "setup" | "crack";
}> = ({ local, fps, impactLocal, trap = "Ди", oracle = "Эйч", stage = "setup" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const trapX = 250;
  const trapY = 900;
  const oracleX = 800;
  const oracleY = 740;

  const box = (x: number, y: number, label: string, icon: string, color: string, size = 220, breathe = true) => (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: 30,
        background: theme.panel,
        border: `3px solid ${color}`,
        boxShadow: `0 0 50px ${color}33`,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 60}px) scale(${breathe ? 1 + 0.02 * Math.sin(local / 9) : 1})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      <IconGlyph name={icon} size={64} color={color} strokeWidth={1.6} />
      <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 34, color: theme.text }}>{label}</div>
    </div>
  );

  if (stage === "crack") {
    const cX = W / 2;
    const cY = 800;
    const cracked = local >= impactLocal;
    const shake = cracked ? 10 * Math.exp(-(local - impactLocal) * 0.28) * Math.sin((local - impactLocal) * 3.4) : 0;
    const crackFade = cracked
      ? interpolate(local - impactLocal, [0, 24], [1, 0.28], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 1;
    const chip = (x: number, label: string, icon: string) => (
      <div
        style={{
          position: "absolute",
          left: x - 145,
          top: cY - 330,
          width: 290,
          height: 130,
          borderRadius: 22,
          background: theme.panel,
          border: `3px solid ${theme.warning}77`,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 50}px)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
        }}
      >
        <IconGlyph name={icon} size={44} color={theme.warning} strokeWidth={1.7} />
        <div style={{ fontFamily: theme.font, fontWeight: 700, fontSize: 30, color: theme.text }}>{label}</div>
        {cracked ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: theme.font,
              fontWeight: 800,
              fontSize: 100,
              color: theme.danger,
              textShadow: `0 0 30px ${theme.danger}AA`,
              opacity: interpolate(local - impactLocal, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            ✕
          </div>
        ) : null}
      </div>
    );
    return (
      <>
        {chip(cX - 270, "«да»", "infinity")}
        {chip(cX + 270, "«нет»", "octagon-x")}
        <div
          style={{
            position: "absolute",
            left: cX - 110 + shake,
            top: cY - 110,
            width: 220,
            height: 220,
            borderRadius: 30,
            background: theme.panel,
            border: `3px solid ${cracked ? theme.danger : theme.accent2}`,
            boxShadow: `0 0 ${cracked ? 70 : 40}px ${cracked ? theme.danger : theme.accent2}44`,
            opacity: enter * crackFade,
            transform: `scale(${cracked ? 1 - 0.16 * clamp01((local - impactLocal) / 26) : 1})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <IconGlyph name="box" size={64} color={cracked ? theme.danger : theme.accent2} strokeWidth={1.6} />
          <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 34, color: theme.text }}>{oracle}</div>
        </div>
        {cracked ? (
          <>
            {[[-70, -60], [50, -30], [-30, 70]].map(([dx, dy], i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: cX + dx,
                  top: cY + dy,
                  width: 220,
                  height: 4,
                  background: `${theme.danger}CC`,
                  transform: `rotate(${30 + i * 55}deg)`,
                  opacity: crackFade,
                }}
              />
            ))}
            <PulseRing x={cX} y={cY} triggerFrame={impactLocal} tone="danger" size={340} />
            {Array.from({ length: 14 }).map((_, i) => {
              const ang = random(`frag${i}`) * 6.28;
              const p = smooth(clamp01((local - impactLocal) / 24));
              const dist = (20 + random(`fd${i}`) * 220) * p;
              const op = 1 - clamp01((local - impactLocal) / 26);
              const rot = random(`fr${i}`) * 360;
              const size = 14 + random(`fs${i}`) * 20;
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: cX + Math.cos(ang) * dist,
                    top: cY + Math.sin(ang) * dist * 0.85,
                    width: size,
                    height: size,
                    background: theme.danger,
                    opacity: op,
                    transform: `rotate(${rot}deg)`,
                    boxShadow: `0 0 14px ${theme.danger}`,
                  }}
                />
              );
            })}
          </>
        ) : null}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: cY + 340,
            transform: "translateX(-50%)",
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 27,
            letterSpacing: 1,
            color: cracked ? theme.danger : theme.subtext,
            opacity: cracked
              ? interpolate(local - impactLocal, [10, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
              : enter,
            textAlign: "center",
          }}
        >
          {cracked ? "НИ ОДИН ОТВЕТ НЕ РАБОТАЕТ" : "ЧТО БЫ ОРАКУЛ НИ ПРЕДСКАЗАЛ"}
        </div>
      </>
    );
  }

  // stage === "setup"
  const flightEnd = Math.max(impactLocal - 6, 1);
  const p = smooth(clamp01(local / flightEnd));
  const ghostX = interpolate(p, [0, 1], [trapX, oracleX - 10]);
  const ghostY = interpolate(p, [0, 1], [trapY, oracleY + 10]);
  const flying = p > 0 && p < 1;
  const fed = local >= impactLocal;
  const askPop = fed ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  const branchP = fed ? smooth(clamp01((local - impactLocal - 10) / 20)) : 0;
  return (
    <>
      {box(trapX, trapY, trap, "repeat", theme.accent2)}
      {box(oracleX, oracleY, oracle, "box", theme.accent, 220, !fed)}
      {p > 0 && p < 1.02 ? (
        <div
          style={{
            position: "absolute",
            left: ghostX,
            top: ghostY,
            transform: `translate(-50%, -50%) scale(${flying ? 0.62 : 0})`,
            opacity: flying ? 0.85 : 0,
            filter: `drop-shadow(0 0 16px ${theme.accent2}AA)`,
          }}
        >
          <IconGlyph name="repeat" size={64} color={theme.accent2} strokeWidth={1.6} />
        </div>
      ) : null}
      {fed ? <PulseRing x={oracleX} y={oracleY} triggerFrame={impactLocal} tone="accent" size={260} /> : null}
      {fed ? (
        <div
          style={{
            position: "absolute",
            left: oracleX,
            top: oracleY - 190,
            transform: `translateX(-50%) scale(${askPop})`,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 44,
            color: theme.accent,
            textShadow: `0 0 24px ${theme.accent}77`,
            whiteSpace: "nowrap",
          }}
        >
          {trap}({trap})?
        </div>
      ) : null}
      {fed
        ? [
            { y: trapY + 190, label: `«да» → ${trap} зациклится`, icon: "infinity", tone: theme.danger, d: 0 },
            { y: trapY + 300, label: `«нет» → ${trap} остановится`, icon: "octagon-x", tone: theme.warning, d: 10 },
          ].map((row, i) => {
            const rp = clamp01(branchP - row.d / 20);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: W / 2,
                  top: row.y,
                  transform: `translate(-50%, 0) translateY(${(1 - rp) * 20}px)`,
                  opacity: rp,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: theme.panel,
                  border: `2px solid ${row.tone}88`,
                  borderRadius: 999,
                  padding: "12px 26px",
                  whiteSpace: "nowrap",
                }}
              >
                <IconGlyph name={row.icon} size={32} color={row.tone} strokeWidth={1.8} />
                <span style={{ fontFamily: theme.font, fontWeight: 700, fontSize: 27, color: theme.text }}>{row.label}</span>
              </div>
            );
          })
        : null}
    </>
  );
};

/** Кукушкиное хеширование: две таблицы, два хеша, ключ прыгает между ними. */
const CuckooTable: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  keyLabel?: string;
  showEviction?: boolean;
}> = ({ local, fps, impactLocal, keyLabel = "ключ", showEviction = true }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const evictP = smooth(clamp01((local - impactLocal + 8) / 28));
  const cx = W / 2;
  const tableW = 340;
  const tableGap = 80;
  const leftX = cx - tableW - tableGap / 2;
  const rightX = cx + tableGap / 2;
  const tableY = 460;
  const rows = 6;
  const cellH = 72;
  const cellW = tableW - 40;
  const key = keyLabel.length > 10 ? `${keyLabel.slice(0, 9)}…` : keyLabel;
  const victim = "хозяин";
  const h1Color = theme.accent;
  const h2Color = theme.accent2;
  const keyColor = theme.success;
  const victimColor = theme.warning;
  const flowP = smooth(clamp01(local / Math.max(impactLocal - 8, 1)));
  const keyStartX = leftX - 180;
  const keyEndX = leftX + 30 + 20 * Math.sin(local / 6);
  const keyY = tableY + 120;

  const cell = (x: number, y: number, row: number, label: string, color: string, active = false, pulse = false) => (
    <div
      key={row}
      style={{
        position: "absolute",
        left: x - cellW / 2,
        top: y + row * cellH,
        width: cellW,
        height: cellH - 8,
        borderRadius: 12,
        border: `3px solid ${active ? color : theme.panelBorder}`,
        background: active ? `${color}1A` : theme.panel,
        boxShadow: active ? `0 0 ${pulse ? 45 : 25}px ${color}55` : "none",
        opacity: enter,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: theme.font,
        fontWeight: 700,
        fontSize: 28,
        color: active ? color : theme.text,
        transform: `scale(${pulse ? 1 + 0.06 * Math.sin(local / 7) : 1})`,
      }}
    >
      {label}
    </div>
  );

  const hashArrow = (x: number, y: number, color: string, label: string, progress: number) => (
    <>
      <div
        style={{
          position: "absolute",
          left: x,
          top: y - 60,
          width: 3,
          height: 70,
          background: `linear-gradient(180deg, transparent, ${color})`,
          opacity: enter * progress,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: x - 8,
          top: y - 50 + 70 * progress,
          transform: "translateX(-50%) rotate(-90deg)",
          borderLeft: "10px solid transparent",
          borderRight: "10px solid transparent",
          borderTop: `14px solid ${color}`,
          opacity: enter * progress,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: x + 25,
          top: y - 40,
          fontFamily: theme.mono,
          fontSize: 22,
          fontWeight: 800,
          color,
          opacity: enter * progress,
        }}
      >
        {label}
      </div>
    </>
  );

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 300,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontWeight: 800,
          fontSize: 28,
          color: theme.subtext,
          opacity: enter,
          letterSpacing: 2,
        }}
      >
        ДВЕ ТАБЛИЦЫ, ДВА ХЕША
      </div>
      {/* Таблица 1 (h₁) */}
      <div
        style={{
          position: "absolute",
          left: leftX - 10,
          top: tableY - 80,
          width: tableW + 20,
          height: rows * cellH + 100,
          borderRadius: 20,
          background: theme.panel,
          border: `3px solid ${h1Color}77`,
          boxShadow: `0 0 50px ${h1Color}18`,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 60}px)`,
        }}
      >
        <div style={{ textAlign: "center", paddingTop: 18, fontFamily: theme.font, fontWeight: 800, fontSize: 32, color: h1Color }}>T₁ (h₁)</div>
        {Array.from({ length: rows }).map((_, i) =>
          cell(leftX + tableW / 2, tableY, i, i === 2 ? victim : "·", h1Color, i === 2 && local >= impactLocal, i === 2 && local >= impactLocal)
        )}
      </div>
      {/* Таблица 2 (h₂) */}
      <div
        style={{
          position: "absolute",
          left: rightX - 10,
          top: tableY - 80,
          width: tableW + 20,
          height: rows * cellH + 100,
          borderRadius: 20,
          background: theme.panel,
          border: `3px solid ${h2Color}77`,
          boxShadow: `0 0 50px ${h2Color}18`,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 60}px)`,
        }}
      >
        <div style={{ textAlign: "center", paddingTop: 18, fontFamily: theme.font, fontWeight: 800, fontSize: 32, color: h2Color }}>T₂ (h₂)</div>
        {Array.from({ length: rows }).map((_, i) =>
          cell(rightX + tableW / 2, tableY, i, i === 4 && showEviction && local >= impactLocal ? key : "·", h2Color, i === 4 && showEviction && local >= impactLocal, i === 4 && showEviction && local >= impactLocal)
        )}
      </div>
      {/* Ключ влетает в T₁ через h₁ */}
      {hashArrow(leftX + tableW / 2, tableY + 2 * cellH, h1Color, "h₁", flowP)}
      <div
        style={{
          position: "absolute",
          left: interpolate(flowP, [0, 1], [keyStartX, keyEndX]),
          top: keyY,
          transform: "translate(-50%, -50%)",
          padding: "10px 18px",
          borderRadius: 999,
          background: keyColor,
          color: "#06121A",
          fontFamily: theme.mono,
          fontWeight: 800,
          fontSize: 26,
          opacity: enter,
          boxShadow: `0 0 30px ${keyColor}AA`,
        }}
      >
        {key}
      </div>
      {/* Вытеснение: хозяин улетает в T₂ через h₂ */}
      {showEviction && local >= impactLocal ? (
        <>
          <div
            style={{
              position: "absolute",
              left: leftX + tableW / 2 + 200,
              top: tableY + 2 * cellH - 10,
              fontFamily: theme.mono,
              fontSize: 24,
              color: h1Color,
              opacity: evictP,
            }}
          >
            h₁ → занято!
          </div>
          <div
            style={{
              position: "absolute",
              left: rightX + tableW / 2,
              top: tableY + 4 * cellH - 60,
              fontFamily: theme.mono,
              fontSize: 24,
              color: h2Color,
              opacity: evictP,
            }}
          >
            h₂ → сюда
          </div>
          <div
            style={{
              position: "absolute",
              left: interpolate(evictP, [0, 1], [leftX + tableW / 2 + 40, rightX + tableW / 2]),
              top: interpolate(evictP, [0, 1], [tableY + 2 * cellH, tableY + 4 * cellH]),
              transform: "translate(-50%, -50%)",
              padding: "8px 16px",
              borderRadius: 999,
              background: victimColor,
              color: "#06121A",
              fontFamily: theme.mono,
              fontWeight: 700,
              fontSize: 24,
              opacity: enter * evictP,
              boxShadow: `0 0 25px ${victimColor}AA`,
            }}
          >
            {victim}
          </div>
          {evictP > 0.85 ? <PulseRing x={rightX + tableW / 2} y={tableY + 4 * cellH} triggerFrame={impactLocal + 18} tone="accent2" size={160} /> : null}
        </>
      ) : null}
      {/* Легенда */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 1320,
          transform: "translateX(-50%)",
          display: "flex",
          gap: 40,
          opacity: enter,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: h1Color }} />
          <span style={{ fontFamily: theme.mono, fontSize: 24, color: theme.text }}>h₁ — первая таблица</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: h2Color }} />
          <span style={{ fontFamily: theme.mono, fontSize: 24, color: theme.text }}>h₂ — вторая таблица</span>
        </div>
      </div>
    </>
  );
};

/** Кукушкиный цикл: путь вытеснений замыкается в себя, вставка падает. */
const CuckooCycle: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  loadFactor?: number;
}> = ({ local, fps, impactLocal, loadFactor = 0.5 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const cycleP = smooth(clamp01((local - impactLocal) / 32));
  const cx = W / 2;
  const tableW = 340;
  const tableGap = 80;
  const leftX = cx - tableW - tableGap / 2;
  const rightX = cx + tableGap / 2;
  const tableY = 420;
  const rows = 6;
  const cellH = 72;
  const cellW = tableW - 40;
  const cyclePath = [
    { table: 1, row: 2, label: "A" },
    { table: 2, row: 4, label: "B" },
    { table: 1, row: 0, label: "C" },
    { table: 2, row: 2, label: "D" },
    { table: 1, row: 2, label: "A" },
  ];

  const cell = (x: number, y: number, row: number, label: string, color: string, highlight = false, tableNum: number) => (
    <div
      key={`${tableNum}-${row}`}
      style={{
        position: "absolute",
        left: x - cellW / 2,
        top: y + row * cellH,
        width: cellW,
        height: cellH - 8,
        borderRadius: 12,
        border: `3px solid ${highlight ? color : theme.panelBorder}`,
        background: highlight ? `${color}1A` : theme.panel,
        boxShadow: highlight ? `0 0 35px ${color}66` : "none",
        opacity: enter,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: theme.font,
        fontWeight: 700,
        fontSize: 28,
        color: highlight ? color : theme.text,
      }}
    >
      {label}
    </div>
  );

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 260,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontWeight: 800,
          fontSize: 28,
          color: theme.danger,
          opacity: enter,
          letterSpacing: 2,
        }}
      >
        ЦИКЛ КУКУШКИ → ВСТАВКА ПАДАЕТ
      </div>
      {/* Таблица 1 */}
      <div
        style={{
          position: "absolute",
          left: leftX - 10,
          top: tableY - 80,
          width: tableW + 20,
          height: rows * cellH + 100,
          borderRadius: 20,
          background: theme.panel,
          border: `3px solid ${theme.accent}77`,
          boxShadow: `0 0 50px ${theme.accent}18`,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 60}px)`,
        }}
      >
        <div style={{ textAlign: "center", paddingTop: 18, fontFamily: theme.font, fontWeight: 800, fontSize: 32, color: theme.accent }}>T₁ (h₁)</div>
        {Array.from({ length: rows }).map((_, i) =>
          cell(leftX + tableW / 2, tableY, i, i === 2 ? "A" : i === 0 && cycleP > 0.4 ? "C" : "·", theme.accent, (i === 2 || (i === 0 && cycleP > 0.4)) && cycleP > 0.2, 1)
        )}
      </div>
      {/* Таблица 2 */}
      <div
        style={{
          position: "absolute",
          left: rightX - 10,
          top: tableY - 80,
          width: tableW + 20,
          height: rows * cellH + 100,
          borderRadius: 20,
          background: theme.panel,
          border: `3px solid ${theme.accent2}77`,
          boxShadow: `0 0 50px ${theme.accent2}18`,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 60}px)`,
        }}
      >
        <div style={{ textAlign: "center", paddingTop: 18, fontFamily: theme.font, fontWeight: 800, fontSize: 32, color: theme.accent2 }}>T₂ (h₂)</div>
        {Array.from({ length: rows }).map((_, i) =>
          cell(rightX + tableW / 2, tableY, i, i === 4 ? "B" : i === 2 && cycleP > 0.7 ? "D" : "·", theme.accent2, (i === 4 || (i === 2 && cycleP > 0.7)) && cycleP > 0.5, 2)
        )}
      </div>
      {/* Стрелки цикла */}
      {cyclePath.slice(0, 4).map((to, i) => {
        const from = cyclePath[i];
        const fx = from.table === 1 ? leftX + tableW / 2 : rightX + tableW / 2;
        const fy = tableY + from.row * cellH;
        const tx = to.table === 1 ? leftX + tableW / 2 : rightX + tableW / 2;
        const ty = tableY + to.row * cellH;
        const color = from.table === 1 ? theme.accent : theme.accent2;
        const progress = smooth(clamp01((cycleP - i * 0.22) / 0.25));
        const mx = fx + (tx - fx) * progress;
        const my = fy + (ty - fy) * progress;
        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: "absolute",
                left: mx,
                top: my,
                width: 14,
                height: 14,
                borderRadius: 7,
                background: color,
                opacity: enter * progress * (1 - progress > 0.1 ? 1 : 0),
                transform: "translate(-50%, -50%)",
                boxShadow: `0 0 20px ${color}`,
              }}
            />
            {progress > 0.9 && i === 3 ? (
              <div
                style={{
                  position: "absolute",
                  left: cx,
                  top: tableY + 5 * cellH + 40,
                  transform: "translateX(-50%)",
                  fontFamily: theme.mono,
                  fontWeight: 800,
                  fontSize: 28,
                  color: theme.danger,
                  opacity: enter * (cycleP - 0.88) / 0.12,
                }}
              >
                ЗАМЫКАНИЕ → ЦИКЛ
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
      {/* Статистика загрузки */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 1280,
          transform: "translateX(-50%)",
          padding: "18px 36px",
          borderRadius: 999,
          background: `${theme.danger}18`,
          border: `2px solid ${theme.danger}`,
          color: theme.danger,
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 28,
          opacity: enter * cycleP,
        }}
      >
        загрузка {Math.round(loadFactor * 100)}% → провал ~1/n²
      </div>
      {local >= impactLocal ? <PulseRing x={cx} y={tableY + 3 * cellH} triggerFrame={impactLocal} tone="danger" size={400} /> : null}
    </>
  );
};

/** Stash-буфер: циклический ключ уходит в стэш, загрузка ползёт к 100%. */
const CuckooStash: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
}> = ({ local, fps, impactLocal }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const stashP = smooth(clamp01((local - impactLocal) / 28));
  const successP = smooth(clamp01((local - impactLocal - 12) / 24));
  const cx = W / 2;
  const tableW = 340;
  const tableGap = 80;
  const leftX = cx - tableW - tableGap / 2;
  const rightX = cx + tableGap / 2;
  const tableY = 420;
  const rows = 6;
  const cellH = 72;
  const cellW = tableW - 40;
  const key = "цикл";
  const stashX = cx;
  const stashY = 1100;

  const cell = (x: number, y: number, row: number, label: string, color: string, highlight = false) => (
    <div
      key={`${x}-${row}`}
      style={{
        position: "absolute",
        left: x - cellW / 2,
        top: y + row * cellH,
        width: cellW,
        height: cellH - 8,
        borderRadius: 12,
        border: `3px solid ${highlight ? color : theme.panelBorder}`,
        background: highlight ? `${color}1A` : theme.panel,
        boxShadow: highlight ? `0 0 30px ${color}55` : "none",
        opacity: enter,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: theme.font,
        fontWeight: 700,
        fontSize: 28,
        color: highlight ? color : theme.text,
      }}
    >
      {label}
    </div>
  );

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 260,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontWeight: 800,
          fontSize: 28,
          color: theme.success,
          opacity: enter,
          letterSpacing: 2,
        }}
      >
        STASH — СТРАХОВКА ОТ ЦИКЛА
      </div>
      {/* Таблица 1 */}
      <div
        style={{
          position: "absolute",
          left: leftX - 10,
          top: tableY - 80,
          width: tableW + 20,
          height: rows * cellH + 100,
          borderRadius: 20,
          background: theme.panel,
          border: `3px solid ${theme.accent}77`,
          boxShadow: `0 0 50px ${theme.accent}18`,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 60}px)`,
        }}
      >
        <div style={{ textAlign: "center", paddingTop: 18, fontFamily: theme.font, fontWeight: 800, fontSize: 32, color: theme.accent }}>T₁ (h₁)</div>
        {Array.from({ length: rows }).map((_, i) =>
          cell(leftX + tableW / 2, tableY, i, i === 2 ? "A" : "·", theme.accent, i === 2 && stashP < 0.5)
        )}
      </div>
      {/* Таблица 2 */}
      <div
        style={{
          position: "absolute",
          left: rightX - 10,
          top: tableY - 80,
          width: tableW + 20,
          height: rows * cellH + 100,
          borderRadius: 20,
          background: theme.panel,
          border: `3px solid ${theme.accent2}77`,
          boxShadow: `0 0 50px ${theme.accent2}18`,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 60}px)`,
        }}
      >
        <div style={{ textAlign: "center", paddingTop: 18, fontFamily: theme.font, fontWeight: 800, fontSize: 32, color: theme.accent2 }}>T₂ (h₂)</div>
        {Array.from({ length: rows }).map((_, i) =>
          cell(rightX + tableW / 2, tableY, i, i === 4 ? "B" : "·", theme.accent2, i === 4 && stashP < 0.5)
        )}
      </div>
      {/* Ключ-цикл уходит в стэш */}
      <div
        style={{
          position: "absolute",
          left: interpolate(stashP, [0, 1], [leftX + tableW / 2, stashX]),
          top: interpolate(stashP, [0, 1], [tableY + 2 * cellH, stashY]),
          transform: "translate(-50%, -50%)",
          padding: "12px 22px",
          borderRadius: 16,
          background: theme.success,
          color: "#06121A",
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 30,
          opacity: enter * stashP,
          boxShadow: `0 0 40px ${theme.success}AA`,
        }}
      >
        {key}
      </div>
      {/* Стэш-коробка */}
      <div
        style={{
          position: "absolute",
          left: stashX - 180,
          top: stashY - 60,
          width: 360,
          height: 140,
          borderRadius: 24,
          background: theme.panel,
          border: `3px solid ${theme.success}88`,
          boxShadow: `0 0 60px ${theme.success}33`,
          opacity: enter * stashP,
          transform: `translateY(${(1 - stashP) * 40}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <div style={{ fontFamily: theme.mono, fontSize: 24, color: theme.success, letterSpacing: 2 }}>STASH (O(log n))</div>
        <div style={{ fontFamily: theme.mono, fontSize: 20, color: theme.subtext }}>буфер для «застрявших» ключей</div>
        <div style={{ fontFamily: theme.font, fontWeight: 700, fontSize: 26, color: theme.text }}>емкость: ~log₂(tableSize)</div>
      </div>
      {/* Результат */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 1320,
          transform: "translateX(-50%)",
          padding: "18px 36px",
          borderRadius: 999,
          background: `${theme.success}18`,
          border: `2px solid ${theme.success}`,
          color: theme.success,
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 28,
          opacity: enter * successP,
        }}
      >
        провал O(n⁻³) · загрузка → 100% · рехэшей 0
      </div>
      {local >= impactLocal ? <PulseRing x={stashX} y={stashY} triggerFrame={impactLocal} tone="success" size={300} /> : null}
    </>
  );
};

/** Итерации Люка—Лемера: run — конвейер значений от старта до нуля; steps — формула со стрелкой на нуль последнего шага. */
const ProofSequence: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  mode?: "run" | "steps";
  start?: number;
  steps?: string;
}> = ({ local, fps, impactLocal, mode = "run", start = 4, steps = "136 000 000" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const cx = W / 2;
  const target = Number((steps || "").replace(/\D/g, "")) || 136000000;
  const fmt = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  const labelStyle: React.CSSProperties = {
    fontFamily: theme.mono,
    fontWeight: 700,
    letterSpacing: 3,
  };

  if (mode === "run") {
    const crateW = 146;
    const gap = 20;
    const total = 6 * crateW + 5 * gap;
    const x0 = cx - total / 2;
    const rowY = 660;
    const crates = [
      { v: String(start), label: "S0", tone: theme.accent },
      { v: "14", label: "S1", tone: theme.accent },
      { v: "194", label: "S2", tone: theme.accent2 },
      { v: "37634", label: "S3", tone: theme.accent2 },
      { v: "…", label: "шаги", tone: theme.subtext },
      { v: done ? "0" : "?", label: "последний", tone: theme.success },
    ];
    const crateP = (i: number) => smooth(clamp01((local - 4 - i * 7) / 16));
    const counterP = smooth(clamp01(local / Math.max(impactLocal, 1)));
    const lastCrateX = x0 + total - crateW / 2;
    const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 300,
            transform: "translateX(-50%)",
            ...labelStyle,
            fontSize: 28,
            color: theme.subtext,
            opacity: enter,
          }}
        >
          КОНВЕЙЕР ЛЮКА—ЛЕМЕРА
        </div>
        {/* лента-конвейер */}
        <div
          style={{
            position: "absolute",
            left: x0 + 26,
            top: rowY + 208,
            width: total - 52,
            height: 14,
            borderRadius: 999,
            background: "#0D1420",
            border: `2px solid ${theme.panelBorder}`,
            overflow: "hidden",
            opacity: enter,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `repeating-linear-gradient(90deg, ${theme.accent}55 0 26px, transparent 26px 52px)`,
              backgroundPosition: `${-((local * 6) % 52)}px 0`,
            }}
          />
        </div>
        <div style={{ position: "absolute", left: x0, top: rowY, display: "flex", alignItems: "center", opacity: enter }}>
          {crates.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 ? (
                <div
                  style={{
                    width: gap,
                    textAlign: "center",
                    fontFamily: theme.font,
                    fontWeight: 800,
                    fontSize: 42,
                    color: theme.subtext,
                    opacity: crateP(i) * 0.8,
                  }}
                >
                  ›
                </div>
              ) : null}
              <div
                style={{
                  width: crateW,
                  height: 150,
                  borderRadius: 22,
                  background: theme.panel,
                  border: `3px solid ${c.tone}`,
                  boxShadow: `0 0 34px ${c.tone}30`,
                  transform: `translateY(${(1 - crateP(i)) * 60}px) scale(${0.5 + 0.5 * crateP(i)})`,
                  opacity: crateP(i) * enter,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontFamily: theme.font,
                    fontWeight: 800,
                    fontSize: c.v.length > 4 ? 34 : 46,
                    color: c.v === "…" || c.v === "?" ? theme.subtext : theme.text,
                  }}
                >
                  {c.v}
                </div>
                <div style={{ fontFamily: theme.mono, fontSize: 19, letterSpacing: 1, color: c.tone }}>{c.label}</div>
              </div>
            </React.Fragment>
          ))}
        </div>
        {done ? <PulseRing x={lastCrateX} y={rowY + 75} triggerFrame={impactLocal} tone="success" size={210} /> : null}
        <div style={{ position: "absolute", left: cx, top: rowY + 300, transform: "translateX(-50%)", textAlign: "center", opacity: enter }}>
          <div style={{ ...labelStyle, fontSize: 24, color: theme.subtext }}>ШАГ</div>
          <div
            style={{
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 56,
              color: done ? theme.success : theme.text,
              textShadow: done ? `0 0 34px ${theme.success}66` : "none",
            }}
          >
            {fmt(Math.round(counterP * target))}
          </div>
        </div>
        {done ? (
          <div
            style={{
              position: "absolute",
              left: cx,
              top: rowY + 420,
              transform: `translateX(-50%) scale(${badgeP})`,
              opacity: badgeP,
              padding: "16px 32px",
              borderRadius: 999,
              background: `${theme.success}18`,
              border: `2px solid ${theme.success}`,
              color: theme.success,
              fontFamily: theme.font,
              fontWeight: 800,
              fontSize: 34,
              whiteSpace: "nowrap",
              boxShadow: `0 0 50px ${theme.success}33`,
            }}
          >
            НОЛЬ → ЧИСЛО ПРОСТОЕ
          </div>
        ) : null}
      </>
    );
  }

  // mode === "steps"
  const chipW = 158;
  const gap = 22;
  const total = 5 * chipW + 4 * gap;
  const x0 = cx - total / 2;
  const rowY = 1060;
  const chips = [
    { v: "4", label: "S(0)", tone: theme.accent },
    { v: "14", label: "S(1)", tone: theme.accent },
    { v: "194", label: "S(2)", tone: theme.accent2 },
    { v: "…", label: "ещё шаги", tone: theme.subtext },
    { v: done ? "0" : "?", label: "последний", tone: theme.success },
  ];
  const chipP = (i: number) => smooth(clamp01((local - 6 - i * 6) / 14));
  const formulaP = smooth(clamp01((local - 4) / 18));
  const arrowP = smooth(clamp01(local / Math.max(impactLocal, 1)));
  const arrowX = interpolate(arrowP, [0, 1], [x0 + chipW / 2, x0 + (chips.length - 1) * (chipW + gap) + chipW / 2]);
  const arrowY = rowY - 160;
  const lastChipX = x0 + total - chipW / 2;
  const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 90,
          top: 330,
          opacity: formulaP * enter,
          transform: `translateY(${(1 - formulaP) * 50}px)`,
        }}
      >
        <div style={{ textAlign: "center", ...labelStyle, fontSize: 27, color: theme.subtext }}>ТЕСТ ЛЮКА—ЛЕМЕРА</div>
        <div
          style={{
            textAlign: "center",
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 62,
            color: theme.accent,
            marginTop: 24,
            textShadow: `0 0 44px ${theme.accent}44`,
          }}
        >
          S(n) = (S(n−1)² − 2) mod M
        </div>
        <div
          style={{
            marginTop: 22,
            textAlign: "center",
            fontFamily: theme.font,
            fontSize: 34,
            color: theme.text,
          }}
        >
          старт{" "}
          <span style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 40, color: theme.success }}>
            S(0) = {start}
          </span>
          , M — само число
        </div>
      </div>
      {/* стрелка, доезжающая до нуля последнего шага */}
      <div
        style={{
          position: "absolute",
          left: arrowX,
          top: arrowY,
          transform: "translateX(-50%)",
          opacity: enter,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 4,
            height: 58,
            background: done ? theme.success : theme.accent,
            boxShadow: `0 0 18px ${done ? theme.success : theme.accent}`,
            opacity: arrowP,
          }}
        />
        <div
          style={{
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 40,
            lineHeight: 1,
            color: done ? theme.success : theme.accent,
            opacity: arrowP,
          }}
        >
          ▼
        </div>
      </div>
      <div style={{ position: "absolute", left: x0, top: rowY, display: "flex", alignItems: "center", opacity: enter }}>
        {chips.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 ? (
              <div style={{ width: gap, textAlign: "center", color: theme.subtext, fontSize: 34, fontWeight: 800, opacity: chipP(i) * 0.8 }}>
                ›
              </div>
            ) : null}
            <div
              style={{
                width: chipW,
                height: 118,
                borderRadius: 20,
                background: theme.panel,
                border: `3px solid ${c.tone}`,
                boxShadow: `0 0 30px ${c.tone}33`,
                transform: `translateY(${(1 - chipP(i)) * 40}px) scale(${0.6 + 0.4 * chipP(i)})`,
                opacity: chipP(i) * enter,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  fontFamily: theme.font,
                  fontWeight: 800,
                  fontSize: 46,
                  color: c.v === "…" || c.v === "?" ? theme.subtext : theme.text,
                }}
              >
                {c.v}
              </div>
              <div style={{ fontFamily: theme.mono, fontSize: 19, letterSpacing: 1, color: c.tone }}>{c.label}</div>
            </div>
          </React.Fragment>
        ))}
      </div>
      {done ? <PulseRing x={lastChipX} y={rowY + 59} triggerFrame={impactLocal} tone="success" size={200} /> : null}
      {done ? (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: rowY + 210,
            transform: `translateX(-50%) scale(${badgeP})`,
            opacity: badgeP,
            padding: "16px 32px",
            borderRadius: 999,
            background: `${theme.success}18`,
            border: `2px solid ${theme.success}`,
            color: theme.success,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 34,
            whiteSpace: "nowrap",
            boxShadow: `0 0 50px ${theme.success}33`,
          }}
        >
          НОЛЬ НА ПОСЛЕДНЕМ ШАГЕ → ПРОСТОЕ
        </div>
      ) : null}
    </>
  );
};

/** Гигантский квадрат числа и его ускорение: FFT раскладывает волну на синусоиды. */
const FftWave: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: "square" | "fft";
}> = ({ local, fps, impactLocal, phase = "square" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const cx = W / 2;

  type Sine = { a: number; f: number; ph: number };
  const sinePath = (waves: Sine[], width: number, baseY: number, t: number): string => {
    const n = 110;
    let d = "";
    for (let i = 0; i <= n; i++) {
      let y = baseY;
      for (const w of waves) y += w.a * Math.sin((2 * Math.PI * w.f * i) / n + t * w.ph);
      d += `${i === 0 ? "M" : "L"} ${((i / n) * width).toFixed(2)} ${y.toFixed(2)} `;
    }
    return d;
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: theme.mono,
    fontWeight: 700,
    letterSpacing: 3,
  };

  if (phase === "fft") {
    const waves: (Sine & { c: string; label: string })[] = [
      { a: 60, f: 1, ph: 0.9, c: theme.accent, label: "низкая частота" },
      { a: 40, f: 3, ph: 2.1, c: theme.accent2, label: "средняя частота" },
      { a: 24, f: 7, ph: 4.3, c: theme.success, label: "высокая частота" },
    ];
    const waveW = 920;
    const waveX = cx - waveW / 2;
    const built = smooth(clamp01(local / 18));
    const splitP = smooth(clamp01((local - impactLocal) / 26));
    const compY = 470;
    const compH = 190;
    const splitY = [730, 880, 1030];
    const splitH = 150;
    const impulseP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.8 } }) : 0;
    return (
      <>
        <div style={{ position: "absolute", left: cx, top: 270, transform: "translateX(-50%)", ...labelStyle, fontSize: 28, color: theme.subtext, opacity: enter }}>
          FFT — БЫСТРОЕ ПРЕОБРАЗОВАНИЕ ФУРЬЕ
        </div>
        {/* составная волна */}
        <div style={{ position: "absolute", left: waveX, top: compY - 30, width: waveW, textAlign: "center", ...labelStyle, fontSize: 24, color: theme.subtext, opacity: built * enter }}>
          ВОЛНА-ГИГАНТ (сумма частот)
        </div>
        <svg width={waveW} height={compH} style={{ position: "absolute", left: waveX, top: compY, opacity: built * enter }}>
          <path
            d={sinePath(waves, waveW, compH / 2, local / 22)}
            fill="none"
            stroke={theme.accent}
            strokeWidth={6}
            strokeLinecap="round"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            left: waveX,
            top: compY + compH + 8,
            width: waveW,
            height: 3,
            background: `linear-gradient(90deg, transparent, ${theme.panelBorder}, transparent)`,
            opacity: built * enter,
          }}
        />
        {/* разложение на синусоиды */}
        {waves.map((w, i) => {
          const p = smooth(clamp01(splitP - i * 0.24));
          if (p <= 0) return null;
          return (
            <React.Fragment key={i}>
              <svg width={waveW} height={splitH} style={{ position: "absolute", left: waveX, top: splitY[i] - splitH / 2, opacity: p }}>
                <path d={sinePath([{ a: w.a, f: w.f, ph: w.ph }], waveW, splitH / 2, local / 22)} fill="none" stroke={w.c} strokeWidth={5} strokeLinecap="round" />
              </svg>
              <div style={{ position: "absolute", left: waveX + 16, top: splitY[i] + splitH / 2 - 44, ...labelStyle, fontSize: 22, color: w.c, opacity: p }}>
                {w.label}
              </div>
            </React.Fragment>
          );
        })}
        {done ? (
          <div
            style={{
              position: "absolute",
              left: cx,
              top: splitY[2] + 90,
              transform: `translateX(-50%) scale(${impulseP})`,
              opacity: impulseP,
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px 32px",
              borderRadius: 999,
              background: `${theme.warning}16`,
              border: `2px solid ${theme.warning}`,
              color: theme.warning,
              fontFamily: theme.font,
              fontWeight: 800,
              fontSize: 34,
              whiteSpace: "nowrap",
              boxShadow: `0 0 50px ${theme.warning}33`,
            }}
          >
            <IconGlyph name="zap" size={40} color={theme.warning} strokeWidth={1.8} />
            КВАДРАТЫ — В СОТНИ ТЫСЯЧ РАЗ БЫСТРЕЕ
          </div>
        ) : null}
      </>
    );
  }

  // phase === "square"
  const square = 640;
  const sqX = cx - square / 2;
  const sqY = 520;
  const rowH = 40;
  const rows = 16;
  const rowDigits = Array.from({ length: rows }).map((_, r) =>
    Array.from({ length: 11 }).map((_, c) => Math.floor(random(`fftd${r}-${c}`) * 10))
  );
  const scroll = -((local * 2) % rowH);
  const hourglassWarn = done;
  return (
    <>
      <div style={{ position: "absolute", left: cx, top: 250, transform: "translateX(-50%)", ...labelStyle, fontSize: 28, color: theme.subtext, opacity: enter }}>
        КВАДРАТ ЧИСЛА-ГИГАНТА
      </div>
      <div style={{ position: "absolute", left: 90, right: 90, top: 330, textAlign: "center", opacity: enter }}>
        <span style={{ fontFamily: theme.mono, fontSize: 34, color: theme.text, fontWeight: 800 }}>
          41 024 320 цифр
        </span>
        <span style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 44, color: theme.accent2, margin: "0 22px" }}>×</span>
        <span style={{ fontFamily: theme.mono, fontSize: 34, color: theme.text, fontWeight: 800 }}>
          41 024 320 цифр
        </span>
        <div style={{ fontFamily: theme.font, fontSize: 30, color: theme.subtext, marginTop: 8 }}>результат — миллиарды знаков</div>
      </div>
      {/* гигантский квадрат цифр */}
      <div
        style={{
          position: "absolute",
          left: sqX,
          top: sqY,
          width: square,
          height: square,
          borderRadius: 30,
          background: "#0D1420",
          border: `3px solid ${theme.accent2}55`,
          boxShadow: `0 0 90px ${theme.accent2}22`,
          overflow: "hidden",
          opacity: enter,
          transform: `translateY(${(1 - enter) * 80}px) scale(${0.92 + 0.08 * enter})`,
        }}
      >
        <div style={{ position: "absolute", inset: 0, transform: `translateY(${scroll}px)` }}>
          {[0, 1].map((copy) => (
            <div key={copy} style={{ position: "absolute", left: 0, right: 0, top: copy * rows * rowH }}>
              {rowDigits.map((row, r) => (
                <div key={r} style={{ display: "flex", justifyContent: "space-between", padding: "0 16px", height: rowH, alignItems: "center" }}>
                  {row.map((d, c) => (
                    <div key={c} style={{ fontFamily: theme.mono, fontSize: 26, color: (r + c) % 2 === 0 ? theme.subtext : theme.panelBorder }}>
                      {d}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(180deg, transparent 30%, #0D142088 100%)",
          }}
        >
          <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 110, color: theme.accent2, textShadow: `0 0 50px ${theme.accent2}66` }}>
            ?
          </div>
        </div>
      </div>
      {/* силуэт кита — масштаб гиганта */}
      <div style={{ position: "absolute", left: 70, top: sqY + square + 40, fontSize: 110, opacity: 0.85, filter: "drop-shadow(0 0 24px rgba(0,0,0,0.6))", transform: `scale(${enter})` }}>
        🐋
      </div>
      <div style={{ position: "absolute", left: 240, top: sqY + square + 96, fontFamily: theme.font, fontSize: 26, color: theme.subtext, opacity: enter }}>
        не разглядеть
      </div>
      {/* часовая песочница: обычное умножение не справится */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: sqY + square + 190,
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "16px 32px",
          borderRadius: 999,
          border: `2px solid ${hourglassWarn ? theme.danger : theme.warning}88`,
          background: `${hourglassWarn ? theme.danger : theme.warning}12`,
          color: hourglassWarn ? theme.danger : theme.warning,
          fontFamily: theme.font,
          fontWeight: 700,
          fontSize: 32,
          opacity: enter,
          whiteSpace: "nowrap",
        }}
      >
        <IconGlyph name="hourglass" size={40} color={hourglassWarn ? theme.danger : theme.warning} strokeWidth={1.8} />
        {hourglassWarn ? "обычное умножение — слишком долго" : "обычное умножение…"}
      </div>
      {done ? <PulseRing x={cx} y={sqY + square + 190} triggerFrame={impactLocal} tone="danger" size={330} /> : null}
    </>
  );
};

/** QR-матрица: damage — модули стираются с угла (поцарапанный/оторванный угол),
 *  restore — стёртые клетки возвращаются по уцелевшим, в конце — бейдж «КОД ЧИТАЕТСЯ»,
 *  encode — данные режутся на 8-битные кодовые слова и добавляются контрольные,
 *  levels — четыре уровня защиты растут вместе с размером квадрата. */
const QrRepair: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: "damage" | "restore" | "encode" | "levels";
  damaged?: number;
  label?: string;
  weather?: boolean;
}> = ({ local, fps, impactLocal, phase = "damage", damaged = 0.33, label, weather = false }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const cx = W / 2;

  const qrDark = "#1A2130";
  const qrCard = "#F7F9FE";

  const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };

  // детерминированные модули данных вне зон finder-паттернов
  const isFinderZone = (S: number, r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= S - 7) || (r >= S - 7 && c < 7);
  const isDark = (S: number, r: number, c: number) =>
    !isFinderZone(S, r, c) && random(`qrc-${S}-${r}-${c}`) > 0.45;

  // «оторванный угол»: треугольный срез от правого нижнего угла матрицы
  const cornerCut = (S: number, frac: number): number => {
    let k = 0;
    const want = S * S * Math.min(1, Math.max(0, frac));
    while ((k * (k + 1)) / 2 < want && k < 2 * S) k++;
    return k;
  };
  const isCut = (S: number, r: number, c: number, k: number) => (S - 1 - r) + (S - 1 - c) < k;

  const finder = (x: number, y: number, m: number) => (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 7 * m,
        height: 7 * m,
        background: qrDark,
        borderRadius: 3 * m,
      }}
    >
      <div style={{ position: "absolute", left: m, top: m, width: 5 * m, height: 5 * m, background: qrCard }} />
      <div style={{ position: "absolute", left: 2 * m, top: 2 * m, width: 3 * m, height: 3 * m, background: qrDark, borderRadius: m }} />
    </div>
  );

  // белая карточка с матрицей модулей; eraseK — радиус стёртой зоны (0 = целая)
  const matrix = (S: number, m: number, centerX: number, centerY: number, eraseK: number) => {
    const q = m; // тихая зона
    const card = S * m + 2 * q;
    return (
      <div
        style={{
          position: "absolute",
          left: centerX - card / 2,
          top: centerY - card / 2,
          width: card,
          height: card,
          padding: q,
          boxSizing: "border-box",
          background: qrCard,
          borderRadius: 26,
          boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
          opacity: enter,
        }}
      >
        <div style={{ position: "relative", width: S * m, height: S * m }}>
          {finder(0, 0, m)}
          {finder((S - 7) * m, 0, m)}
          {finder(0, (S - 7) * m, m)}
          {Array.from({ length: S }).flatMap((_, r) =>
            Array.from({ length: S }).map((_, c) => {
              const erased = isCut(S, r, c, eraseK);
              return (
                <div key={`${r}-${c}`} style={{ position: "absolute", left: c * m, top: r * m, width: m, height: m }}>
                  {erased ? (
                    <div
                      style={{
                        position: "absolute",
                        inset: Math.max(1.5, m * 0.12),
                        border: `1.5px dashed ${theme.danger}`,
                        borderRadius: Math.max(2, m * 0.16),
                        background: `${theme.danger}14`,
                      }}
                    />
                  ) : isDark(S, r, c) ? (
                    <div
                      style={{
                        position: "absolute",
                        inset: Math.max(1, m * 0.14),
                        background: qrDark,
                        borderRadius: Math.max(2, m * 0.2),
                      }}
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  // капли дождя и блик внешнего света — поверх матрицы
  const weatherOverlay = () =>
    weather ? (
      <>
        {Array.from({ length: 9 }).map((_, i) => {
          const x = cx - 330 + random(`rainx${i}`) * 560;
          const y = 380 + ((local * (14 + random(`raink${i}`) * 10) + random(`rainy${i}`) * 860) % 860);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: 2,
                height: 34,
                borderRadius: 2,
                background: "linear-gradient(180deg, transparent, rgba(103,232,249,0.85))",
                transform: "rotate(12deg)",
              }}
            />
          );
        })}
        <div
          style={{
            position: "absolute",
            left: cx - 370,
            top: 400,
            width: 740,
            height: 320,
            borderRadius: "50%",
            transform: "rotate(-14deg)",
            background: "linear-gradient(105deg, transparent, rgba(255,255,255,0.25), transparent)",
            opacity: 0.45 + 0.2 * Math.sin(local / 14),
          }}
        />
      </>
    ) : null;

  if (phase === "damage" || phase === "restore") {
    const S = 21;
    const m = 26;
    const centerX = cx;
    const centerY = 620;
    const kFull = cornerCut(S, damaged);
    const prog =
      phase === "damage"
        ? smooth(clamp01((local - 8) / Math.max(impactLocal - 8, 1)))
        : smooth(clamp01((local - 4) / Math.max(impactLocal - 4, 1)));
    const eraseK = phase === "damage" ? Math.round(kFull * Math.min(1, prog)) : Math.round(kFull * (1 - prog));
    const scratchFade = phase === "damage" && done ? Math.exp(-(local - impactLocal) * 0.16) : 0;
    const badgePop =
      phase === "restore" && done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
    const caption = label ?? (phase === "restore" ? "ВОССТАНОВЛЕНО ПО УЦЕЛЕВШИМ" : "СТЁРТО");

    return (
    <>
      {matrix(S, m, centerX, centerY, eraseK)}
      {scratchFade > 0.01 ? (
        <div
          style={{
            position: "absolute",
            left: centerX - 190,
            top: centerY + 40,
            width: 420,
            height: 8,
            borderRadius: 999,
            background: `linear-gradient(90deg, transparent, ${theme.danger}, transparent)`,
            boxShadow: `0 0 28px ${theme.danger}AA`,
            transform: `rotate(-26deg)`,
            opacity: scratchFade,
          }}
        />
      ) : null}
      {phase === "damage" && done ? <PulseRing x={centerX} y={centerY} triggerFrame={impactLocal} tone="danger" size={620} /> : null}
      {phase === "restore" && done ? <PulseRing x={centerX} y={centerY} triggerFrame={impactLocal} tone="success" size={620} /> : null}
      {weatherOverlay()}
      <div
        style={{
          position: "absolute",
          left: centerX,
          top: centerY + (S * m) / 2 + m + 84,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 25,
          color: phase === "damage" ? theme.danger : theme.subtext,
          opacity: enter,
        }}
      >
        {caption}
      </div>
      {phase === "restore" && done ? (
        <div
          style={{
            position: "absolute",
            left: centerX,
            top: centerY + (S * m) / 2 + m + 150,
            transform: `translateX(-50%) scale(${badgePop})`,
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "16px 32px",
            borderRadius: 999,
            background: `${theme.success}18`,
            border: `2px solid ${theme.success}`,
            color: theme.success,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 32,
            whiteSpace: "nowrap",
            boxShadow: `0 0 50px ${theme.success}33`,
            opacity: badgePop,
          }}
        >
          <IconGlyph name="check-check" size={34} color={theme.success} strokeWidth={2.2} />
          КОД ЧИТАЕТСЯ
        </div>
      ) : null}
      {phase === "damage" && done ? (
        <div
          style={{
            position: "absolute",
            left: centerX,
            top: centerY + (S * m) / 2 + m + 150,
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 30px",
            borderRadius: 999,
            background: `${theme.danger}14`,
            border: `2px solid ${theme.danger}88`,
            color: theme.danger,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 28,
            whiteSpace: "nowrap",
            opacity: enter,
          }}
        >
          <IconGlyph name="eraser" size={30} color={theme.danger} strokeWidth={2} />
          НЕ ПРОЧИТАТЬ
        </div>
      ) : null}
    </>
    );
  }

  if (phase === "encode") {
    const S = 15;
    const m = 18;
    const centerY = 640;
    const byte = (tone: string, lab: string, isCtrl: boolean, opacity: number) => (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "12px 18px",
          borderRadius: 20,
          background: theme.panel,
          border: `2px solid ${tone}88`,
          boxShadow: `0 0 30px ${tone}1F`,
          opacity,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 20px)", gridTemplateRows: "repeat(2, 20px)", gap: 4 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                background: (i * 7 + (isCtrl ? 3 : 1)) % 5 === 0 ? qrCard : qrDark,
                border: `1px solid ${qrDark}44`,
              }}
            />
          ))}
        </div>
        {isCtrl ? <IconGlyph name="shield-plus" size={24} color={tone} strokeWidth={2} /> : null}
        <div style={{ fontFamily: theme.mono, fontSize: 22, letterSpacing: 1, color: tone, whiteSpace: "nowrap" }}>{lab}</div>
      </div>
    );
    const dataP = (i: number) => smooth(clamp01((local - 6 - i * 8) / 14));
    const ctrlP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
    const arrowP = smooth(clamp01((local - 12) / 12));
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 300,
            transform: "translateX(-50%)",
            ...mono,
            fontSize: 25,
            color: theme.subtext,
            opacity: enter,
          }}
        >
          ДАННЫЕ → КОДОВЫЕ СЛОВА · 8 БИТ
        </div>
        {matrix(S, m, cx - 240, centerY, 0)}
        <div
          style={{
            position: "absolute",
            left: cx - 40,
            top: centerY - 14,
            width: 90,
            height: 6,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${theme.accent}00, ${theme.accent})`,
            opacity: arrowP * enter,
          }}
        />
        <div style={{ position: "absolute", left: cx + 66, top: 430, display: "flex", flexDirection: "column", gap: 18, opacity: enter }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`d${i}`}
              style={{
                transform: `translateY(${(1 - dataP(i)) * 26}px) scale(${0.6 + 0.4 * dataP(i)})`,
                opacity: dataP(i),
              }}
            >
              {byte(theme.accent, `слово ${i + 1}`, false, 1)}
            </div>
          ))}
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={`c${i}`} style={{ transform: `translateY(${(1 - ctrlP) * 26}px) scale(${0.6 + 0.4 * ctrlP})`, opacity: ctrlP }}>
              {byte(theme.accent2, `контроль ${i + 1}`, true, ctrlP)}
            </div>
          ))}
        </div>
        {done ? <PulseRing x={cx + 66 + 96} y={640} triggerFrame={impactLocal} tone="accent2" size={330} /> : null}
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1030,
            transform: "translateX(-50%)",
            ...mono,
            fontSize: 24,
            color: theme.accent2,
            opacity: ctrlP,
          }}
        >
          ПЛЮС КОНТРОЛЬ — ВОССТАНОВЯТ СТЁРТОЕ
        </div>
      </>
    );
  }

  // phase === "levels" — четыре уровня защиты, квадрат растёт вместе с уровнем
  const spec = [
    { S: 9, m: 16, L: "L", p: "7%" },
    { S: 11, m: 17, L: "M", p: "15%" },
    { S: 13, m: 18, L: "Q", p: "25%" },
    { S: 15, m: 20, L: "H", p: "30%" },
  ];
  const cols = [200, 880];
  const rows = [530, 900];
  const poss = [
    { x: cols[0], y: rows[0] },
    { x: cols[1], y: rows[0] },
    { x: cols[0], y: rows[1] },
    { x: cols[1], y: rows[1] },
  ];
  const levelP = (i: number) => smooth(clamp01((local - 4 - i * 5) / 14));
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 300,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 25,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        ЧЕТЫРЕ УРОВНЯ ЗАЩИТЫ
      </div>
      {spec.map((s, i) => {
        const pos = poss[i];
        const pp = levelP(i);
        return (
          <div key={i} style={{ position: "absolute", inset: 0, opacity: pp * enter }}>
            {matrix(s.S, s.m, pos.x, pos.y, 0)}
            <div
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y + (s.S * s.m) / 2 + s.m + 18,
                transform: "translateX(-50%)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 42, color: theme.accent }}>{s.L}</span>
              <span style={{ fontFamily: theme.mono, fontSize: 26, color: theme.subtext }}>{s.p}</span>
            </div>
            {i === 3 && done ? <PulseRing x={pos.x} y={pos.y} triggerFrame={impactLocal} tone="accent" size={420} /> : null}
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 1330,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 24,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        {label ?? "БОЛЬШЕ ЗАЩИТЫ — КРУПНЕЕ КВАДРАТ"}
      </div>
    </>
  );
};

/** HyperLogLog буквально: 64-битный хэш, ведущие нули, 16384×6-битные регистры, гармоническое среднее, 12 КБ и 2^64. */
const HllEstimate: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: "hash" | "registers" | "harmonic" | "scale";
  highlight?: number;
}> = ({ local, fps, impactLocal, phase = "hash", highlight = 4 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const cx = W / 2;
  const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };
  if (phase === "hash") {
    const bits = 64;
    const lead = Math.max(1, Math.min(12, Math.round(highlight)));
    const hashY = 560;
    const ribbonW = 940;
    const bitW = ribbonW / bits;
    const ribbonX = cx - ribbonW / 2;
    const ribbonH = 64;
    const cellP = (i: number) => smooth(clamp01((local - 4 - i * 0.6) / 10));
    const tailP = smooth(clamp01((local - impactLocal) / 14));
    return (
      <>
        <div style={{ position: "absolute", left: cx, top: 300, transform: "translateX(-50%)", ...mono, fontSize: 26, color: theme.subtext, opacity: enter }}>
          64 БИТА ХЭША
        </div>
        <div
          style={{
            position: "absolute",
            left: 90,
            top: hashY - 110,
            width: 280,
            borderRadius: 22,
            background: theme.panel,
            border: `3px solid ${theme.accent}88`,
            padding: "18px 0",
            textAlign: "center",
            opacity: enter,
            transform: `translateY(${(1 - enter) * 40}px)`,
          }}
        >
          <div style={{ fontFamily: theme.mono, fontSize: 22, color: theme.subtext }}>ID</div>
          <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 30, color: theme.text, marginTop: 6 }}>user_90421</div>
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2 - 22,
            top: hashY - 74,
            width: 44,
            height: 44,
            borderRadius: 12,
            background: theme.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: enter,
          }}
        >
          <span style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 28, color: "#06121A" }}>→</span>
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2 + 80,
            top: hashY - 110,
            width: 280,
            borderRadius: 22,
            background: `${theme.accent2}14`,
            border: `3px solid ${theme.accent2}88`,
            padding: "14px 0",
            textAlign: "center",
            opacity: enter,
            transform: `translateY(${(1 - enter) * 40}px)`,
          }}
        >
          <IconGlyph name="hash" size={30} color={theme.accent2} strokeWidth={1.8} />
          <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 28, color: theme.text, marginTop: 2 }}>h(ID)</div>
          <div style={{ fontFamily: theme.mono, fontSize: 20, color: theme.accent2 }}>64 бита</div>
        </div>
        <div
          style={{
            position: "absolute",
            left: ribbonX,
            top: hashY + 70,
            width: ribbonW,
            height: ribbonH,
            display: "flex",
            gap: 2,
            opacity: enter,
          }}
        >
          {Array.from({ length: bits }).map((_, i) => {
            const isLead = i < lead;
            const bit = i < lead ? 0 : i % 3 === 0 ? 1 : 0;
            const p = cellP(i);
            const active = isLead && done;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: ribbonH,
                  borderRadius: 6,
                  background: isLead ? (active ? theme.accent : `${theme.accent}44`) : bit ? theme.panelBorder : "#0D1420",
                  border: `1px solid ${isLead ? (active ? theme.accent : `${theme.accent}66`) : theme.panelBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: theme.mono,
                  fontWeight: 800,
                  fontSize: 16,
                  color: isLead ? (active ? "#06121A" : theme.accent) : theme.subtext,
                  transform: `scale(${0.4 + 0.6 * p})`,
                  opacity: p,
                  boxShadow: active ? `0 0 18px ${theme.accent}77` : "none",
                }}
              >
                {bit}
              </div>
            );
          })}
        </div>
        <div
          style={{
            position: "absolute",
            left: ribbonX,
            top: hashY + 150,
            width: lead * (bitW + 2),
            height: 4,
            background: theme.accent,
            opacity: done ? tailP : 0,
            boxShadow: `0 0 14px ${theme.accent}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: ribbonX + 6,
            top: hashY + 164,
            fontFamily: theme.mono,
            fontSize: 22,
            color: theme.accent,
            opacity: done ? tailP : 0,
            letterSpacing: 1,
          }}
        >
          {"0".repeat(lead)} · хвост нулей = {lead}
        </div>
        <div
          style={{
            position: "absolute",
            left: ribbonX,
            top: hashY + 200,
            width: ribbonW,
            display: "flex",
            justifyContent: "space-between",
            opacity: enter,
          }}
        >
          <span style={{ fontFamily: theme.mono, fontSize: 20, color: theme.accent, ...mono }}>14 бит → индекс</span>
          <span style={{ fontFamily: theme.mono, fontSize: 20, color: theme.accent2, ...mono }}>50 бит → ранг нулей</span>
        </div>
        {done ? <PulseRing x={ribbonX + lead * bitW * 0.5 + 6} y={hashY + 102} triggerFrame={impactLocal} tone="accent" size={220} /> : null}
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1140,
            transform: "translateX(-50%)",
            padding: "14px 28px",
            borderRadius: 999,
            background: done ? `${theme.success}18` : `${theme.panel}DD`,
            border: `2px solid ${done ? theme.success : theme.panelBorder}`,
            color: done ? theme.success : theme.subtext,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 30,
            opacity: enter,
            boxShadow: done ? `0 0 40px ${theme.success}33` : "none",
            whiteSpace: "nowrap",
          }}
        >
          {done ? "~ 2^хвост — оценка кардинальности" : "чем длиннее хвост → тем больше разных видел"}
        </div>
      </>
    );
  }
  if (phase === "registers") {
    const gridW = 520;
    const cols = 64;
    const rows = 256; // 64*256=16384 but too many divs heavy — render 64*32=2048 thumbnail + label
    // For literal count we show 16384 tiny dots as 128×128 grid (16k) but use lightweight technique:
    const displayCols = 128;
    const displayRows = 128;
    const cell = 3.2;
    const gap = 0.8;
    const totalW = displayCols * (cell + gap);
    const totalH = displayRows * (cell + gap);
    const gridX = cx - totalW / 2;
    const gridY = 520;
    const streamP = smooth(clamp01(local / Math.max(impactLocal, 1)));
    const hit = Math.floor(random("hllhit") * 16384);
    const hitCol = hit % displayCols;
    const hitRow = Math.floor(hit / displayCols);
    const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
    return (
      <>
        <div style={{ position: "absolute", left: cx, top: 300, transform: "translateX(-50%)", ...mono, fontSize: 26, color: theme.subtext, opacity: enter }}>
          16384 РЕГИСТРОВ × 6 БИТ = 12 КБ
        </div>
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 370,
            transform: "translateX(-50%)",
            background: `${theme.accent}14`,
            border: `2px solid ${theme.accent}66`,
            borderRadius: 999,
            padding: "10px 22px",
            fontFamily: theme.mono,
            fontSize: 24,
            color: theme.accent,
            opacity: enter,
          }}
        >
          16384 × 6 бит = 12288 байт
        </div>
        <div
          style={{
            position: "absolute",
            left: gridX,
            top: gridY,
            width: totalW,
            height: totalH,
            background: "#0D1420",
            border: `2px solid ${theme.panelBorder}`,
            borderRadius: 16,
            overflow: "hidden",
            padding: 6,
            opacity: enter,
            transform: `translateY(${(1 - enter) * 40}px)`,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap, width: totalW - 12, height: totalH - 12 }}>
            {Array.from({ length: displayCols * displayRows }).map((_, i) => {
              const v = Math.floor(random(`reg${i}`) * 6);
              const isHit = i === hitRow * displayCols + hitCol;
              const col = isHit ? theme.success : v > 3 ? theme.accent : v > 1 ? theme.accent2 : theme.panelBorder;
              const bg = isHit ? theme.success : v > 3 ? `${theme.accent}CC` : v > 1 ? `${theme.accent2}99` : "#1B2434";
              return <div key={i} style={{ width: cell, height: cell, borderRadius: 1, background: bg, opacity: isHit ? 1 : 0.9, boxShadow: isHit ? `0 0 10px ${theme.success}` : "none" }} />;
            })}
          </div>
        </div>
        {/* influx arrow */}
        <div
          style={{
            position: "absolute",
            left: cx,
            top: gridY - 58,
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            opacity: enter * streamP,
          }}
        >
          <span style={{ fontFamily: theme.mono, fontSize: 22, color: theme.subtext }}>поток хэшей</span>
          <span style={{ width: 90, height: 4, background: theme.accent, borderRadius: 999 }} />
          <span style={{ color: theme.accent, fontSize: 22 }}>›</span>
          <span style={{ fontFamily: theme.mono, fontSize: 22, color: theme.accent }}>14 бит → регистр</span>
        </div>
        {done ? <PulseRing x={gridX + hitCol * (cell + gap) + cell * 0.5 + 6} y={gridY + hitRow * (cell + gap) + cell * 0.5 + 6} triggerFrame={impactLocal} tone="success" size={120} /> : null}
        <div
          style={{
            position: "absolute",
            left: cx,
            top: gridY + totalH + 34,
            transform: `translateX(-50%) scale(${badgeP || 0.8})`,
            opacity: done ? badgeP : 0.6,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 26px",
            borderRadius: 999,
            background: done ? `${theme.success}18` : theme.panel,
            border: `2px solid ${done ? theme.success : theme.panelBorder}`,
            color: done ? theme.success : theme.subtext,
            fontFamily: theme.font,
            fontWeight: 700,
            fontSize: 27,
            whiteSpace: "nowrap",
          }}
        >
          <IconGlyph name="database" size={28} color={done ? theme.success : theme.subtext} strokeWidth={1.8} />
          {done ? `регистр #${hit} → максимум хвостов = ${highlight}` : "в каждом — максимум нулей"}
        </div>
        <div style={{ position: "absolute", left: cx, top: gridY + totalH + 110, transform: "translateX(-50%)", fontFamily: theme.mono, fontSize: 20, color: theme.subtext, opacity: enter }}>
          6 бит хватает до 50 нулей (log₂ log₂ 2⁶⁴)
        </div>
      </>
    );
  }
  if (phase === "harmonic") {
    const regs = [2, 5, 1, 6, 3, 2, 4, 3];
    const regP = (i: number) => smooth(clamp01((local - 4 - i * 3) / 12));
    const avgP = smooth(clamp01((local - 30) / 20));
    const errP = smooth(clamp01((local - impactLocal) / 18));
    const ceilP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
    return (
      <>
        <div style={{ position: "absolute", left: cx, top: 300, transform: "translateX(-50%)", ...mono, fontSize: 26, color: theme.subtext, opacity: enter }}>
          ГАРМОНИЧЕСКОЕ СРЕДНЕЕ
        </div>
        <div style={{ position: "absolute", left: 90, right: 90, top: 380, display: "flex", justifyContent: "center", gap: 10, opacity: enter }}>
          {regs.map((v, i) => (
            <div
              key={i}
              style={{
                width: 118,
                height: 110,
                borderRadius: 18,
                background: theme.panel,
                border: `3px solid ${theme.accent}77`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                transform: `translateY(${(1 - regP(i)) * 30}px) scale(${0.6 + 0.4 * regP(i)})`,
                opacity: regP(i),
              }}
            >
              <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 40, color: theme.text }}>{v}</div>
              <div style={{ fontFamily: theme.mono, fontSize: 16, color: theme.accent }}>рег {i}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 560,
            width: 4,
            height: 110,
            background: theme.accent,
            opacity: avgP * enter,
            transform: "translateX(-50%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 690,
            transform: `translateX(-50%) scale(${0.8 + 0.2 * avgP})`,
            opacity: avgP * enter,
            background: theme.panel,
            border: `3px solid ${theme.warning}88`,
            borderRadius: 24,
            padding: "20px 36px",
            textAlign: "center",
            boxShadow: `0 0 40px ${theme.warning}22`,
          }}
        >
          <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 30, color: theme.warning }}>
            1 / среднее( 2<span style={{ fontSize: 22 }}>-регистр</span> )
          </div>
          <div style={{ fontFamily: theme.font, fontSize: 26, color: theme.subtext, marginTop: 6 }}>гармоническое → гасит выбросы</div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 90,
            right: 90,
            top: 910,
            display: "flex",
            justifyContent: "space-between",
            opacity: errP,
            transform: `translateY(${(1 - errP) * 20}px)`,
          }}
        >
          <div style={{ background: `${theme.success}14`, border: `2px solid ${theme.success}66`, borderRadius: 20, padding: "16px 22px", flex: 1, marginRight: 14, textAlign: "center" }}>
            <div style={{ fontFamily: theme.mono, fontSize: 30, color: theme.success, fontWeight: 800 }}>ошибка = 1.04 / √m</div>
            <div style={{ fontFamily: theme.mono, fontSize: 24, color: theme.text, marginTop: 6 }}>m=16384 → <span style={{ color: theme.success, fontWeight: 800 }}>0.81%</span></div>
          </div>
          <div style={{ background: `${theme.accent2}14`, border: `2px solid ${theme.accent2}66`, borderRadius: 20, padding: "16px 22px", flex: 1, textAlign: "center" }}>
            <div style={{ fontFamily: theme.mono, fontSize: 30, color: theme.accent2, fontWeight: 800 }}>потолок 2⁶⁴</div>
            <div style={{ fontFamily: theme.mono, fontSize: 20, color: theme.subtext, marginTop: 6 }}>18 446 744×10¹⁵ разных</div>
          </div>
        </div>
        {done ? <PulseRing x={cx} y={1030} triggerFrame={impactLocal} tone="success" size={420} /> : null}
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1170,
            transform: `translateX(-50%) scale(${ceilP || 0.85})`,
            opacity: done ? ceilP : 0.5,
            padding: "14px 28px",
            borderRadius: 999,
            background: done ? `${theme.success}1A` : theme.panel,
            border: `2px solid ${done ? theme.success : theme.panelBorder}`,
            color: done ? theme.success : theme.subtext,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 30,
            whiteSpace: "nowrap",
          }}
        >
          {done ? "16384 регистра → <1% как точный счётчик" : "чем больше регистров — тем точнее"}
        </div>
      </>
    );
  }
  // phase === "scale"
  const mergeP = smooth(clamp01((local - 8) / 18));
  const donePop = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  const box = (x: number, label: string, highlightTone: string, opacityVal: number) => (
    <div
      style={{
        position: "absolute",
        left: x - 185,
        top: 630,
        width: 370,
        height: 360,
        borderRadius: 28,
        background: theme.panel,
        border: `3px solid ${highlightTone}`,
        boxShadow: `0 0 50px ${highlightTone}22`,
        opacity: opacityVal,
        transform: `translateY(${(1 - opacityVal) * 40}px)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      <div style={{ width: 150, height: 110, borderRadius: 14, background: "#0D1420", border: `2px solid ${highlightTone}66`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 44, color: highlightTone }}>12 КБ</span>
      </div>
      <div style={{ fontFamily: theme.mono, fontSize: 24, color: highlightTone, fontWeight: 800 }}>{label}</div>
      <div style={{ fontFamily: theme.font, fontSize: 24, color: theme.subtext }}>12288 байт</div>
    </div>
  );
  return (
    <>
      <div style={{ position: "absolute", left: cx, top: 300, transform: "translateX(-50%)", ...mono, fontSize: 26, color: theme.subtext, opacity: enter }}>
        ПАМЯТЬ ФИКСИРОВАНА
      </div>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 380,
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 18,
          background: `${theme.success}12`,
          border: `2px solid ${theme.success}55`,
          borderRadius: 999,
          padding: "12px 26px",
          opacity: enter,
        }}
      >
        <IconGlyph name="hard-drive" size={32} color={theme.success} strokeWidth={1.8} />
        <span style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 28, color: theme.success }}>12 КБ vs миллиарды ID</span>
      </div>
      {box(295, "HLL 1", theme.accent, enter)}
      {box(785, "HLL 2", theme.accent2, enter)}
      <div
        style={{
          position: "absolute",
          left: cx - 90,
          top: 810,
          width: 180,
          height: 4,
          background: theme.warning,
          opacity: mergeP * enter,
          borderRadius: 999,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 860,
          transform: `translate(-50%, ${(1 - mergeP) * 20}px) scale(${mergeP})`,
          opacity: mergeP,
          background: theme.panel,
          border: `2px solid ${theme.warning}99`,
          borderRadius: 999,
          padding: "10px 22px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 24, color: theme.warning }}>PFMERGE →</span>
        <span style={{ fontFamily: theme.font, fontSize: 24, color: theme.text }}>один HLL 12 КБ</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 1060,
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 40,
          opacity: enter,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 46, color: theme.text }}>~0.81%</div>
          <div style={{ fontFamily: theme.font, fontSize: 24, color: theme.subtext, marginTop: 4 }}>ошибка</div>
        </div>
        <div style={{ width: 2, height: 70, background: theme.panelBorder }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 46, color: theme.text }}>2⁶⁴</div>
          <div style={{ fontFamily: theme.font, fontSize: 24, color: theme.subtext, marginTop: 4 }}>потолок разных</div>
        </div>
      </div>
      {done ? <PulseRing x={cx} y={970} triggerFrame={impactLocal} tone="warning" size={360} /> : null}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 1210,
          transform: `translateX(-50%) scale(${donePop || 0.9})`,
          opacity: done ? donePop : 0.5,
          padding: "14px 28px",
          borderRadius: 999,
          background: done ? `${theme.warning}16` : theme.panel,
          border: `2px solid ${done ? theme.warning : theme.panelBorder}`,
          color: done ? theme.warning : theme.subtext,
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 28,
          whiteSpace: "nowrap",
        }}
      >
        фикс 12 КБ — платишь местом, экономишь подсчётом
      </div>
    </>
  );
};

/** Битовый массив фильтра Блума: ключ проходит через k хеш-функций, каждая ставит единицу в свой слот. */
const BloomBitarray: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  key?: string;
  bits?: number[];
  hashes?: number;
}> = ({ local, fps, impactLocal, key = "user_42", bits = [2, 7, 11, 15], hashes = 4 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const cx = W / 2;
  const arrayY = 920;
  const totalBits = 16;
  const cellW = 50;
  const cellH = 52;
  const gap = 5;
  const arrayW = totalBits * (cellW + gap) - gap;
  const arrayX = cx - arrayW / 2;

  const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };

  // key pill position
  const keyY = 430;
  const keyEnter = spring({ frame: local, fps, config: { damping: 14, mass: 0.7 } });

  // hash function boxes
  const hashBoxW = 130;
  const hashBoxH = 70;
  const hashStartX = cx - (hashes * hashBoxW + (hashes - 1) * 20) / 2;
  const hashY = 620;

  // arrow from key to hash functions
  const arrowP1 = smooth(clamp01((local - 6) / 14));
  // hash function reveal
  const hashReveal = (i: number) => smooth(clamp01((local - 10 - i * 5) / 14));
  // arrow from hash to array
  const arrowP2 = (i: number) => smooth(clamp01((local - 26 - i * 6) / 14));
  // bit flip
  const bitFlip = (i: number) => {
    const f = local - impactLocal - i * 4;
    if (f < 0) return 0;
    return clamp01(spring({ frame: f, fps, config: { damping: 12, mass: 0.6 } }));
  };

  return (
    <>
      {/* header */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 300,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 26,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        БИТОВЫЙ МАССИВ ФИЛЬТРА БЛУМА
      </div>

      {/* key pill */}
      <div
        style={{
          position: "absolute",
          left: cx - 130,
          top: keyY,
          width: 260,
          height: 80,
          borderRadius: 20,
          background: theme.panel,
          border: `3px solid ${theme.accent}`,
          boxShadow: `0 0 40px ${theme.accent}33`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          opacity: keyEnter,
          transform: `translateY(${(1 - keyEnter) * 40}px)`,
        }}
      >
        <IconGlyph name="key-round" size={32} color={theme.accent} strokeWidth={1.8} />
        <span style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 30, color: theme.text }}>{key}</span>
      </div>

      {/* arrow: key → hash functions */}
      <div
        style={{
          position: "absolute",
          left: cx - 2,
          top: keyY + 80,
          width: 4,
          height: hashY - keyY - 80,
          background: `linear-gradient(180deg, ${theme.accent}, ${theme.accent}44)`,
          opacity: arrowP1 * enter,
        }}
      />

      {/* hash function boxes */}
      {Array.from({ length: hashes }).map((_, i) => {
        const x = hashStartX + i * (hashBoxW + 20);
        const p = hashReveal(i);
        const targetBit = bits[i] ?? i * 3;
        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: "absolute",
                left: x,
                top: hashY,
                width: hashBoxW,
                height: hashBoxH,
                borderRadius: 16,
                background: `${theme.accent2}18`,
                border: `2px solid ${theme.accent2}88`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: p,
                transform: `translateY(${(1 - p) * 20}px) scale(${0.7 + 0.3 * p})`,
              }}
            >
              <IconGlyph name="hash" size={24} color={theme.accent2} strokeWidth={1.8} />
              <span style={{ fontFamily: theme.mono, fontSize: 22, color: theme.accent2, fontWeight: 700 }}>h{i + 1}</span>
            </div>
            {/* arrow: hash → bit */}
            <div
              style={{
                position: "absolute",
                left: x + hashBoxW / 2 - 2,
                top: hashY + hashBoxH,
                width: 4,
                height: arrayY - hashY - hashBoxH,
                background: `linear-gradient(180deg, ${theme.accent2}88, ${theme.accent2}22)`,
                opacity: arrowP2(i) * enter,
              }}
            />
            {/* bit index label */}
            <div
              style={{
                position: "absolute",
                left: x + hashBoxW / 2,
                top: arrayY - 34,
                transform: "translateX(-50%)",
                fontFamily: theme.mono,
                fontSize: 18,
                color: theme.accent,
                opacity: arrowP2(i) * enter,
              }}
            >
              [{targetBit}]
            </div>
          </React.Fragment>
        );
      })}

      {/* bit array */}
      <div
        style={{
          position: "absolute",
          left: arrayX,
          top: arrayY,
          width: arrayW,
          display: "flex",
          gap,
          opacity: enter,
        }}
      >
        {Array.from({ length: totalBits }).map((_, i) => {
          const isTarget = bits.includes(i);
          const flipped = isTarget ? bitFlip(bits.indexOf(i)) : 0;
          const isActive = isTarget && local >= impactLocal + bits.indexOf(i) * 4;
          return (
            <div
              key={i}
              style={{
                width: cellW,
                height: cellH,
                borderRadius: 10,
                border: `3px solid ${isActive ? theme.accent : theme.panelBorder}`,
                background: isActive ? `${theme.accent}22` : "#0D1420",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                opacity: enter,
                transform: isTarget ? `scale(${0.8 + 0.2 * flipped})` : undefined,
                boxShadow: isActive ? `0 0 ${20 + 15 * flipped}px ${theme.accent}66` : "none",
              }}
            >
              <div
                style={{
                  fontFamily: theme.mono,
                  fontWeight: 800,
                  fontSize: 18,
                  color: isActive ? theme.accent : theme.subtext,
                }}
              >
                {isActive ? "1" : "0"}
              </div>
              <div style={{ fontFamily: theme.mono, fontSize: 12, color: theme.panelBorder }}>{i}</div>
            </div>
          );
        })}
      </div>

      {/* label under array */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: arrayY + cellH + 28,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 20,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        {totalBits} СЛОТОВ · {hashes} ХЕШ-ФУНКЦИИ
      </div>

      {/* impact badge */}
      {local >= impactLocal ? (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: arrayY + cellH + 80,
            transform: `translateX(-50%) scale(${bitFlip(hashes - 1) || 0.8})`,
            opacity: bitFlip(hashes - 1),
            padding: "14px 28px",
            borderRadius: 999,
            background: `${theme.success}18`,
            border: `2px solid ${theme.success}`,
            color: theme.success,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 28,
            whiteSpace: "nowrap",
            boxShadow: `0 0 40px ${theme.success}33`,
          }}
        >
          КЛЮЧЕЙ НЕТ — ТОЛЬКО БИТЫ
        </div>
      ) : null}
    </>
  );
};

/** Фильтр Блума: запрос проверяет биты — все единицы «возможно есть», хотя бы один ноль «точно нет». */
const BloomProbe: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  key?: string;
  probeBits?: number[];
  result?: "maybe" | "no";
  fileName?: string;
}> = ({ local, fps, impactLocal, key = "user_42", probeBits = [2, 7, 11, 15], result = "no", fileName = "users.sst" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const cx = W / 2;
  const arrayY = 580;
  const totalBits = 16;
  const cellW = 50;
  const cellH = 52;
  const gap = 5;
  const arrayW = totalBits * (cellW + gap) - gap;
  const arrayX = cx - arrayW / 2;

  const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };

  const keyY = 340;
  const keyEnter = spring({ frame: local, fps, config: { damping: 14, mass: 0.7 } });

  // scan animation: probe key travels down, arrow scans bits
  const scanP = smooth(clamp01((local - 8) / Math.max(impactLocal - 12, 1)));
  const scanIdx = Math.min(probeBits.length - 1, Math.floor(scanP * probeBits.length));

  // result reveal
  const done = local >= impactLocal;
  const resultP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;

  // file icon position
  const fileY = 1140;
  const fileEnter = done ? spring({ frame: local - impactLocal - 6, fps, config: { damping: 14, mass: 0.8 } }) : 0;
  const skipX = result === "no" ? interpolate(fileEnter, [0, 1], [cx, W + 200]) : cx;

  return (
    <>
      {/* header */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 240,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 26,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        ЗАПРОС К ФИЛЬТРУ БЛУМА
      </div>

      {/* query key */}
      <div
        style={{
          position: "absolute",
          left: cx - 130,
          top: keyY,
          width: 260,
          height: 80,
          borderRadius: 20,
          background: theme.panel,
          border: `3px solid ${theme.warning}`,
          boxShadow: `0 0 40px ${theme.warning}33`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          opacity: keyEnter,
          transform: `translateY(${(1 - keyEnter) * 40}px)`,
        }}
      >
        <IconGlyph name="search" size={28} color={theme.warning} strokeWidth={2} />
        <span style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 30, color: theme.text }}>{key}</span>
      </div>

      {/* arrow: key → array */}
      <div
        style={{
          position: "absolute",
          left: cx - 2,
          top: keyY + 80,
          width: 4,
          height: arrayY - keyY - 80,
          background: `linear-gradient(180deg, ${theme.warning}, ${theme.warning}44)`,
          opacity: scanP * enter,
        }}
      />

      {/* bit array */}
      <div
        style={{
          position: "absolute",
          left: arrayX,
          top: arrayY,
          width: arrayW,
          display: "flex",
          gap,
          opacity: enter,
        }}
      >
        {Array.from({ length: totalBits }).map((_, i) => {
          const isProbe = probeBits.includes(i);
          const probeIdx = isProbe ? probeBits.indexOf(i) : -1;
          const scanning = isProbe && probeIdx <= scanIdx;
          const isOne = isProbe || random(`bloom-${i}`) > 0.4; // pre-set some bits
          return (
            <div
              key={i}
              style={{
                width: cellW,
                height: cellH,
                borderRadius: 10,
                border: `3px solid ${scanning ? theme.warning : isOne ? `${theme.accent}66` : theme.panelBorder}`,
                background: scanning ? `${theme.warning}22` : isOne ? `${theme.accent}18` : "#0D1420",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                opacity: enter,
                boxShadow: scanning ? `0 0 18px ${theme.warning}55` : "none",
              }}
            >
              <div
                style={{
                  fontFamily: theme.mono,
                  fontWeight: 800,
                  fontSize: 18,
                  color: scanning ? theme.warning : isOne ? theme.accent : theme.subtext,
                }}
              >
                {isOne ? "1" : "0"}
              </div>
              <div style={{ fontFamily: theme.mono, fontSize: 12, color: theme.panelBorder }}>{i}</div>
            </div>
          );
        })}
      </div>

      {/* array label */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: arrayY + cellH + 20,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 20,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        ПРОВЕРЯЕМ БИТЫ ПО ХЕШАМ
      </div>

      {/* result badge */}
      {done ? (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: arrayY + cellH + 80,
            transform: `translateX(-50%) scale(${resultP})`,
            opacity: resultP,
            padding: "18px 36px",
            borderRadius: 999,
            background: result === "no" ? `${theme.success}18` : `${theme.warning}18`,
            border: `2px solid ${result === "no" ? theme.success : theme.warning}`,
            color: result === "no" ? theme.success : theme.warning,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 32,
            whiteSpace: "nowrap",
            boxShadow: `0 0 50px ${result === "no" ? theme.success : theme.warning}33`,
          }}
        >
          {result === "no" ? "ТОЧНО НЕТ" : "ВОЗМОЖНО ЕСТЬ"}
        </div>
      ) : null}

      {/* file card */}
      {done ? (
        <div
          style={{
            position: "absolute",
            left: skipX - 160,
            top: fileY,
            width: 320,
            height: 140,
            borderRadius: 22,
            background: theme.panel,
            border: `3px solid ${result === "no" ? theme.success : theme.warning}88`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            opacity: fileEnter,
            transform: `translateY(${(1 - fileEnter) * 30}px)`,
            boxShadow: `0 0 40px ${(result === "no" ? theme.success : theme.warning)}22`,
          }}
        >
          <IconGlyph
            name={result === "no" ? "file-check" : "file-question"}
            size={48}
            color={result === "no" ? theme.success : theme.warning}
            strokeWidth={1.7}
          />
          <div>
            <div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 28, color: theme.text }}>{fileName}</div>
            <div
              style={{
                fontFamily: theme.font,
                fontSize: 22,
                color: result === "no" ? theme.success : theme.warning,
                marginTop: 4,
              }}
            >
              {result === "no" ? "пропущен" : "нужно читать"}
            </div>
          </div>
        </div>
      ) : null}

      {/* skip arrow for "no" */}
      {done && result === "no" ? (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: fileY + 180,
            transform: `translateX(-50%) scale(${fileEnter})`,
            opacity: fileEnter,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 24px",
            borderRadius: 999,
            background: `${theme.success}12`,
            border: `1px solid ${theme.success}66`,
          }}
        >
          <IconGlyph name="skip-forward" size={28} color={theme.success} strokeWidth={2} />
          <span style={{ fontFamily: theme.font, fontWeight: 700, fontSize: 24, color: theme.success }}>
            ЧТЕНИЕ ДИСКА ЭКОНОМИТСЯ
          </span>
        </div>
      ) : null}
    </>
  );
};

/** Две монетки падают попарно: совпадают — пропускаем, различаются — бит. */
const CoinPairVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  faceA?: string;
  faceB?: string;
  match?: boolean;
}> = ({ local, fps, impactLocal, faceA = "О", faceB = "Р", match = false }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const cx = W / 2;
  const coinR = 110;
  const leftX = cx - 180;
  const rightX = cx + 180;
  const targetY = 860;
  const coin1Y = interpolate(enter, [0, 1], [targetY - 320, targetY]);
  const coin2P = spring({ frame: local - 8, fps, config: { damping: 13, mass: 0.8 } });
  const coin2Y = interpolate(coin2P, [0, 1], [targetY - 320, targetY]);
  const done = local >= impactLocal;
  const resultP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;

  const coinFace = (ch: string) => (
    <div
      style={{
        width: coinR * 2,
        height: coinR * 2,
        borderRadius: "50%",
        background: "radial-gradient(circle at 34% 28%, #EEF2F7, #9AA4B2 55%, #55606E 100%)",
        border: "5px solid rgba(255,255,255,0.35)",
        boxShadow: "0 0 60px rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: theme.font,
        fontWeight: 800,
        fontSize: 100,
        color: "#1B2230",
      }}
    >
      {ch}
    </div>
  );

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 320,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontSize: 28,
          letterSpacing: 3,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        ПАРА БРОСКОВ
      </div>
      {/* coin A */}
      <div
        style={{
          position: "absolute",
          left: leftX - coinR,
          top: coin1Y,
          opacity: enter,
          transform: `rotate(${local * 3}deg)`,
        }}
      >
        {coinFace(faceA)}
      </div>
      {/* coin B */}
      <div
        style={{
          position: "absolute",
          left: rightX - coinR,
          top: coin2Y,
          opacity: coin2P,
          transform: `rotate(${-local * 2.5}deg)`,
        }}
      >
        {coinFace(faceB)}
      </div>
      {/* separator line */}
      <div
        style={{
          position: "absolute",
          left: cx - 1,
          top: targetY - coinR - 10,
          width: 3,
          height: coinR * 2 + 20,
          background: `${theme.panelBorder}66`,
          opacity: enter * 0.5,
        }}
      />
      {/* result badge */}
      {done ? (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: targetY + coinR + 50,
            transform: `translateX(-50%) scale(${resultP})`,
            opacity: resultP,
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "16px 32px",
            borderRadius: 999,
            background: match ? `${theme.subtext}18` : `${theme.success}18`,
            border: `2px solid ${match ? theme.subtext : theme.success}`,
            color: match ? theme.subtext : theme.success,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 32,
            whiteSpace: "nowrap",
            boxShadow: match ? "none" : `0 0 40px ${theme.success}33`,
          }}
        >
          <IconGlyph name={match ? "x" : "check"} size={34} color={match ? theme.subtext : theme.success} strokeWidth={2.2} />
          {match ? "ПРОПУСКАЕМ" : "ЕСТЬ БИТ"}
        </div>
      ) : null}
    </>
  );
};

/** Таблица извлечения битов: HT→1, TH→0, совпадения отброшены. */
const BitExtractorVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
}> = ({ local, fps, impactLocal }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const cx = W / 2;
  const done = local >= impactLocal;
  const rowP = (i: number) => smooth(clamp01((local - 6 - i * 6) / 14));
  const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;

  const rows = [
    { pair: "HT", bit: "1", tone: theme.success, crossed: false },
    { pair: "TH", bit: "0", tone: theme.accent2, crossed: false },
    { pair: "HH", bit: "—", tone: theme.subtext, crossed: true },
    { pair: "TT", bit: "—", tone: theme.subtext, crossed: true },
  ];

  const cellH = 130;
  const tableY = 520;
  const tableW = 760;
  const tableX = cx - tableW / 2;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 320,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontSize: 28,
          letterSpacing: 3,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        ТАБЛИЦА ИЗВЛЕЧЕНИЯ
      </div>
      {/* table rows */}
      {rows.map((r, i) => {
        const p = rowP(i);
        const y = tableY + i * (cellH + 14);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: tableX,
              top: y,
              width: tableW,
              height: cellH,
              borderRadius: 22,
              background: r.crossed ? `${theme.panel}88` : theme.panel,
              border: `3px solid ${r.crossed ? `${theme.panelBorder}66` : r.tone}88`,
              boxShadow: r.crossed ? "none" : `0 0 38px ${r.tone}22`,
              display: "flex",
              alignItems: "center",
              padding: "0 36px",
              gap: 24,
              opacity: p * enter,
              transform: `translateY(${(1 - p) * 30}px) scale(${0.92 + 0.08 * p})`,
            }}
          >
            {/* pair label */}
            <div
              style={{
                width: 120,
                fontFamily: theme.mono,
                fontWeight: 800,
                fontSize: 44,
                color: r.crossed ? theme.panelBorder : theme.text,
                position: "relative",
              }}
            >
              {r.pair}
              {r.crossed ? (
                <div
                  style={{
                    position: "absolute",
                    left: -8,
                    top: "50%",
                    width: 136,
                    height: 5,
                    background: `${theme.danger}CC`,
                    transform: "translateY(-50%) rotate(-8deg)",
                  }}
                />
              ) : null}
            </div>
            {/* arrow */}
            <div
              style={{
                fontFamily: theme.font,
                fontSize: 36,
                color: r.crossed ? theme.panelBorder : r.tone,
              }}
            >
              →
            </div>
            {/* bit value */}
            <div
              style={{
                width: 100,
                textAlign: "center",
                fontFamily: theme.font,
                fontWeight: 800,
                fontSize: 56,
                color: r.crossed ? theme.panelBorder : r.tone,
                textShadow: r.crossed ? "none" : `0 0 24px ${r.tone}55`,
              }}
            >
              {r.bit}
            </div>
            {/* status badge */}
            <div
              style={{
                marginLeft: "auto",
                padding: "10px 20px",
                borderRadius: 999,
                fontFamily: theme.font,
                fontWeight: 700,
                fontSize: 24,
                background: r.crossed ? `${theme.subtext}12` : `${r.tone}18`,
                color: r.crossed ? theme.subtext : r.tone,
                border: `2px solid ${r.crossed ? `${theme.subtext}44` : `${r.tone}66`}`,
                whiteSpace: "nowrap",
              }}
            >
              {r.crossed ? "ПРОПУСК" : "БИТ"}
            </div>
          </div>
        );
      })}
      {/* impact badge */}
      {done ? (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: tableY + rows.length * (cellH + 14) + 30,
            transform: `translateX(-50%) scale(${badgeP})`,
            opacity: badgeP,
            padding: "14px 28px",
            borderRadius: 999,
            background: `${theme.success}18`,
            border: `2px solid ${theme.success}`,
            color: theme.success,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 30,
            whiteSpace: "nowrap",
            boxShadow: `0 0 40px ${theme.success}33`,
          }}
        >
          РАЗЛИЧИЯ = ЧЕСТНЫЕ БИТЫ
        </div>
      ) : null}
    </>
  );
};

/** Таблица истинности Rule 110: 8 комбинаций соседей → результат, или оценка клетки. */
const Rule110Visual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  mode?: "truth-table" | "cell-eval";
}> = ({ local, fps, impactLocal, mode = "truth-table" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const cx = W / 2;

  const rule110 = [
    [1, 1, 1, 0],
    [1, 1, 0, 1],
    [1, 0, 1, 1],
    [1, 0, 0, 0],
    [0, 1, 1, 1],
    [0, 1, 0, 1],
    [0, 0, 1, 1],
    [0, 0, 0, 0],
  ];

  const labelStyle: React.CSSProperties = {
    fontFamily: theme.mono,
    fontWeight: 700,
    letterSpacing: 3,
  };

  if (mode === "cell-eval") {
    const cellW = 80;
    const gap = 6;
    const cells = 20;
    const totalW = cells * cellW + (cells - 1) * gap;
    const startX = cx - totalW / 2;
    const rowY = 820;
    const neighborhood = [0, 1, 1];
    const centerIdx = 10;

    const cellVal = (i: number) => {
      if (i >= centerIdx - 1 && i <= centerIdx + 1) return neighborhood[i - centerIdx + 1];
      return ((i * 7 + 3) % 3 === 0) ? 1 : 0;
    };

    const resultBit = 1;
    const revealP = smooth(clamp01((local - 10) / Math.max(impactLocal - 10, 1)));

    return (
      <>
        <div style={{ position: "absolute", left: cx, top: 300, transform: "translateX(-50%)", ...labelStyle, fontSize: 28, color: theme.subtext, opacity: enter }}>
          ОЦЕНКА КЛЕТКИ
        </div>
        <div style={{ position: "absolute", left: cx, top: 390, transform: "translateX(-50%)", fontFamily: theme.font, fontSize: 32, color: theme.text, opacity: enter }}>
          Три соседа определяют судьбу центральной клетки
        </div>
        <div style={{ position: "absolute", left: cx, top: 480, transform: "translateX(-50%)", ...labelStyle, fontSize: 24, color: theme.accent, opacity: enter }}>
          ПРАВИЛО 110
        </div>
        {Array.from({ length: cells }).map((_, i) => {
          const x = startX + i * (cellW + gap);
          const isCenter = i === centerIdx;
          const isNeighbor = i >= centerIdx - 1 && i <= centerIdx + 1;
          const val = cellVal(i);
          const color = isCenter ? theme.accent : isNeighbor ? theme.accent2 : val ? theme.text : theme.panelBorder;
          const pulse = isCenter ? 1 + 0.04 * Math.sin(local / 6) : 1;
          return (
            <div key={i} style={{
              position: "absolute", left: x, top: rowY,
              width: cellW, height: cellW,
              borderRadius: 16,
              border: `3px solid ${color}`,
              background: isCenter ? `${theme.accent}22` : isNeighbor ? `${theme.accent2}18` : val ? `${theme.text}14` : "#0D1420",
              boxShadow: isCenter ? `0 0 30px ${theme.accent}44` : "none",
              opacity: enter,
              transform: `scale(${pulse})`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 44, color }}>{val}</span>
            </div>
          );
        })}
        {done ? (
          <div style={{
            position: "absolute", left: cx, top: rowY + cellW + 60,
            transform: `translateX(-50%) scale(${revealP})`, opacity: revealP,
            display: "flex", alignItems: "center", gap: 16,
            padding: "16px 32px", borderRadius: 999,
            background: `${theme.success}18`, border: `2px solid ${theme.success}`,
            color: theme.success, fontFamily: theme.font, fontWeight: 800, fontSize: 34,
          }}>
            1 → 0 → 1 → {resultBit}
          </div>
        ) : null}
        {done ? <PulseRing x={cx} y={rowY + cellW / 2} triggerFrame={impactLocal} tone="accent" size={200} /> : null}
      </>
    );
  }

  const rowH = 68;
  const startY = 380;
  const colX = [cx - 200, cx - 70, cx + 70, cx + 200];
  const headers = ["L", "C", "R", "→"];

  return (
    <>
      <div style={{ position: "absolute", left: cx, top: 260, transform: "translateX(-50%)", ...labelStyle, fontSize: 30, color: theme.subtext, opacity: enter }}>
        ПРАВИЛО 110
      </div>
      <div style={{ position: "absolute", left: cx, top: 330, transform: "translateX(-50%)", fontFamily: theme.font, fontSize: 26, color: theme.text, opacity: enter }}>
        8 комбинаций соседей → 8 результатов
      </div>
      {headers.map((h, i) => (
        <div key={i} style={{
          position: "absolute", left: colX[i], top: startY - rowH,
          transform: "translateX(-50%)", ...labelStyle, fontSize: 24, color: i === 3 ? theme.success : theme.accent2,
          opacity: enter,
        }}>
          {h}
        </div>
      ))}
      {rule110.map((row, r) => {
        const rowP = smooth(clamp01((local - r * 4) / 14));
        const highlighted = done && r === 1;
        return (
          <React.Fragment key={r}>
            {row.map((val, c) => {
              const isOutput = c === 3;
              const color = isOutput ? (val ? theme.success : theme.panelBorder) : (val ? theme.accent : theme.accent2);
              return (
                <div key={c} style={{
                  position: "absolute", left: colX[c], top: startY + r * rowH,
                  transform: `translateX(-50%) scale(${highlighted ? 1.15 : 1})`,
                  opacity: rowP * enter,
                  fontFamily: theme.mono, fontWeight: 800, fontSize: isOutput ? 42 : 36,
                  color: highlighted ? theme.accent : color,
                  textShadow: highlighted ? `0 0 20px ${theme.accent}88` : "none",
                }}>
                  {val}
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
      {done ? <PulseRing x={colX[3]} y={startY + 1 * rowH} triggerFrame={impactLocal} tone="success" size={100} /> : null}
    </>
  );
};

/** Глайдеры Rule 110: локализованные структуры движутся и сталкиваются на ленте. */
const GliderCollisionVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
}> = ({ local, fps, impactLocal }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const cx = W / 2;

  const cellW = 52;
  const cols = 18;
  const rows = 14;
  const totalW = cols * cellW;
  const startX = cx - totalW / 2;
  const startY = 360;

  const gliderA = [
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 1],
  ];
  const gliderB = [
    [1, 1, 1],
    [1, 0, 0],
    [0, 1, 0],
  ];

  const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

  const place = (pattern: number[][], rowOffset: number, colOffset: number) => {
    pattern.forEach((pRow, r) =>
      pRow.forEach((val, c) => {
        const rr = rowOffset + r;
        const cc = colOffset + c;
        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) grid[rr][cc] = val;
      })
    );
  };

  const speed = local * 0.12;
  const gARow = 3;
  const gACol = Math.round(2 + speed);
  const gBRow = 8;
  const gBCol = Math.round(14 - speed * 0.7);

  place(gliderA, gARow, gACol);
  place(gliderB, gBRow, gBCol);

  const collide = gACol + 3 >= gBCol;
  if (collide) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] === 1 && r >= gARow && r <= gARow + 4 && c >= gBCol - 2) {
          grid[r][c] = random(`rule110-fragment-${r}-${c}`) > 0.4 ? 1 : 0;
        }
      }
    }
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: theme.mono,
    fontWeight: 700,
    letterSpacing: 3,
  };

  return (
    <>
      <div style={{ position: "absolute", left: cx, top: 260, transform: "translateX(-50%)", ...labelStyle, fontSize: 28, color: theme.subtext, opacity: enter }}>
        ЛОКАЛИЗОВАННЫЕ СТРУКТУРЫ
      </div>
      <div style={{ position: "absolute", left: cx, top: 320, transform: "translateX(-50%)", fontFamily: theme.font, fontSize: 26, color: theme.text, opacity: enter }}>
        Глайдеры движутся, сталкиваются, порождают новые
      </div>
      {grid.map((row, r) =>
        row.map((val, c) => {
          const x = startX + c * cellW;
          const y = startY + r * cellW;
          const isGliderA = r >= gARow && r < gARow + 3 && c >= gACol && c < gACol + 3 && gliderA[r - gARow]?.[c - gACol];
          const isGliderB = r >= gBRow && r < gBRow + 3 && c >= gBCol && c < gBCol + 3 && gliderB[r - gBRow]?.[c - gBCol];
          const color = isGliderA ? theme.accent : isGliderB ? theme.accent2 : val ? theme.text : theme.panelBorder;
          const bg = isGliderA ? `${theme.accent}33` : isGliderB ? `${theme.accent2}33` : val ? `${theme.text}18` : "#0D1420";
          return (
            <div key={`${r}-${c}`} style={{
              position: "absolute", left: x, top: y,
              width: cellW - 2, height: cellW - 2,
              borderRadius: 8,
              background: bg,
              border: `2px solid ${color}`,
              opacity: enter * (val || isGliderA || isGliderB ? 1 : 0.3),
            }} />
          );
        })
      )}
      {done ? <PulseRing x={cx} y={startY + rows * cellW / 2} triggerFrame={impactLocal} tone="warning" size={400} /> : null}
      {done ? (
        <div style={{
          position: "absolute", left: cx, top: startY + rows * cellW + 40,
          transform: "translateX(-50%)", padding: "14px 28px", borderRadius: 999,
          background: `${theme.warning}18`, border: `2px solid ${theme.warning}`,
          color: theme.warning, fontFamily: theme.font, fontWeight: 800, fontSize: 28,
          opacity: enter, whiteSpace: "nowrap",
        }}>
          СТОЛКНОВЕНИЕ → НОВЫЕ ПАТТЕРНЫ
        </div>
      ) : null}
    </>
  );
};

/** Кольцо де Брёйна: window — кольцо битов с 16-битным окном; graph — мини-граф де Брёйна и эйлеров обход; angle — кольцевой датчик угла; linear — разрез кольца в линию с хвостиком. */
const DebruijnCycleVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: "window" | "graph" | "angle" | "linear";
}> = ({ local, fps, impactLocal, phase = "window" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const cx = W / 2;
  const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };

  if (phase === "graph") {
    // Мини-граф де Брёйна для n=3 (вершины 2 бита, рёбра 3 бита) — принцип масштабируется до n=16
    const nodes = [
      { id: "00", x: cx, y: 460, label: "00" },
      { id: "01", x: cx + 240, y: 760, label: "01" },
      { id: "11", x: cx, y: 1040, label: "11" },
      { id: "10", x: cx - 240, y: 760, label: "10" },
    ];
    const edges = [
      { from: 0, to: 0, label: "000" },
      { from: 0, to: 1, label: "001" },
      { from: 1, to: 2, label: "011" },
      { from: 2, to: 3, label: "110" },
      { from: 3, to: 1, label: "101" },
      { from: 1, to: 0, label: "010" },
      { from: 2, to: 2, label: "111" },
      { from: 3, to: 0, label: "100" },
    ];
    const prog = smooth(clamp01((local - 6) / Math.max(impactLocal - 6, 1)));
    const edgeCount = Math.floor(prog * edges.length);
    const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
    const nodePulse = (idx: number) => 1 + 0.03 * Math.sin((local + idx * 8) / 9);
    return (
      <>
        <div style={{ position: "absolute", left: cx, top: 280, transform: "translateX(-50%)", ...mono, fontSize: 26, color: theme.subtext, opacity: enter }}>
          ГРАФ де БРЁЙНА · n=3
        </div>
        <div style={{ position: "absolute", left: cx, top: 330, transform: "translateX(-50%)", fontFamily: theme.font, fontSize: 24, color: theme.subtext, opacity: enter }}>
          вершины 2 бита · рёбра 3 бита
        </div>
        <div style={{ position: "absolute", left: cx, top: 370, transform: "translateX(-50%)", fontFamily: theme.mono, fontSize: 21, color: theme.accent, opacity: enter }}>
          n=16 → 32768 вершин · 65536 рёбер
        </div>
        {edges.map((e, i) => {
          const n1 = nodes[e.from];
          const n2 = nodes[e.to];
          const visible = i < edgeCount || done;
          const isSelf = e.from === e.to;
          if (!visible) return null;
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
          const mx = (n1.x + n2.x) / 2;
          const my = (n1.y + n2.y) / 2;
          if (isSelf) {
            return (
              <React.Fragment key={i}>
                <div
                  style={{
                    position: "absolute",
                    left: n1.x + 58,
                    top: n1.y - 34,
                    width: 86,
                    height: 86,
                    borderRadius: "50%",
                    border: `3px solid ${theme.accent2}`,
                    opacity: enter * 0.9,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: n1.x + 96,
                    top: n1.y - 46,
                    transform: "translateX(-50%)",
                    fontFamily: theme.mono,
                    fontWeight: 800,
                    fontSize: 20,
                    color: theme.accent2,
                    background: theme.panel,
                    padding: "2px 8px",
                    borderRadius: 8,
                    opacity: enter,
                  }}
                >
                  {e.label}
                </div>
              </React.Fragment>
            );
          }
          return (
            <React.Fragment key={i}>
              <div
                style={{
                  position: "absolute",
                  left: n1.x,
                  top: n1.y,
                  width: len,
                  height: 4,
                  transformOrigin: "0 50%",
                  transform: `translateY(-50%) rotate(${ang}deg)`,
                  background: i < edgeCount ? theme.accent : theme.panelBorder,
                  opacity: enter,
                }}
              />
              <div style={{ position: "absolute", left: n1.x + (dx * 2) / 3, top: n1.y + (dy * 2) / 3, transform: `rotate(${ang}deg)` , color: theme.accent, fontSize: 24 }}>›</div>
              <div
                style={{
                  position: "absolute",
                  left: mx,
                  top: my - 18,
                  transform: "translate(-50%, -50%)",
                  fontFamily: theme.mono,
                  fontWeight: 700,
                  fontSize: 19,
                  color: theme.text,
                  background: `${theme.panel}CC`,
                  padding: "2px 8px",
                  borderRadius: 8,
                  opacity: enter,
                }}
              >
                {e.label}
              </div>
            </React.Fragment>
          );
        })}
        {nodes.map((n, i) => (
          <div
            key={n.id}
            style={{
              position: "absolute",
              left: n.x - 62,
              top: n.y - 52,
              width: 124,
              height: 104,
              borderRadius: 20,
              background: theme.panel,
              border: `3px solid ${theme.accent}`,
              boxShadow: `0 0 30px ${theme.accent}22`,
              opacity: enter,
              transform: `scale(${nodePulse(i)})`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 36, color: theme.text }}>{n.label}</div>
            <div style={{ fontFamily: theme.mono, fontSize: 16, color: theme.subtext }}>вершина</div>
          </div>
        ))}
        <div
          style={{
            position: "absolute",
            left: cx,
            top: 1210,
            transform: `translateX(-50%) scale(${done ? badgeP : 0.92})`,
            opacity: done ? badgeP : enter * 0.9,
            padding: "14px 26px",
            borderRadius: 999,
            background: done ? `${theme.success}18` : theme.panel,
            border: `2px solid ${done ? theme.success : theme.panelBorder}`,
            color: done ? theme.success : theme.subtext,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 28,
            whiteSpace: "nowrap",
          }}
        >
          {done ? "эйлеров обход = кольцо де Брёйна" : `пройдено рёбер ${edgeCount}/8`}
        </div>
        {done ? <PulseRing x={cx} y={760} triggerFrame={impactLocal} tone="success" size={520} /> : null}
      </>
    );
  }

  if (phase === "angle") {
    const R = 280;
    const cy = 820;
    const segs = 32;
    const windowSize = 16;
    const activeSeg = Math.floor((local / 4) % segs);
    const readingBits = Array.from({ length: windowSize }).map((_, k) => {
      const idx = (activeSeg + k) % segs;
      return random(`angle-bit-${idx}`) > 0.5 ? 1 : 0;
    });
    const readingVal = parseInt(readingBits.join(""), 2);
    const angleDeg = (Math.round((readingVal / 2 ** windowSize) * 3600) / 10) % 360;
    const tickP = smooth(clamp01((local - 6) / 16));
    const needleA = ((activeSeg / segs) * 360 - 90) * (Math.PI / 180);
    const nx = cx + (R + 54) * Math.cos(needleA);
    const ny = cy + (R + 54) * Math.sin(needleA);
    const reveal = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
    return (
      <>
        <div style={{ position: "absolute", left: cx, top: 300, transform: "translateX(-50%)", ...mono, fontSize: 26, color: theme.subtext, opacity: enter }}>
          КОЛЬЦЕВОЙ ДАТЧИК · 16 БИТ = 65536 УГЛОВ
        </div>
        <div
          style={{
            position: "absolute",
            left: cx - R,
            top: cy - R,
            width: R * 2,
            height: R * 2,
            borderRadius: "50%",
            background: "#0D1420",
            border: `3px solid ${theme.panelBorder}`,
            opacity: enter,
            transform: `scale(${0.92 + 0.08 * enter})`,
            boxShadow: "0 0 60px rgba(0,0,0,0.5)",
            overflow: "hidden",
          }}
        >
          <svg width={R * 2} height={R * 2} style={{ position: "absolute", inset: 0 }}>
            {Array.from({ length: segs }).map((_, i) => {
              const a0 = (i / segs) * 360 - 90;
              const a1 = ((i + 1) / segs) * 360 - 90;
              const r0 = i % 2 === 0 ? 34 : 22;
              const bit = random(`angle-seg-${i}`) > 0.5 ? 1 : 0;
              const isInWindow = ((i - activeSeg + segs) % segs) < windowSize;
              const col = isInWindow ? (bit ? theme.accent : theme.accent2) : bit ? `${theme.accent}33` : `${theme.accent2}33`;
              const largeArc = 0;
              const x0 = R + (R - r0) * Math.cos((a0 * Math.PI) / 180);
              const y0 = R + (R - r0) * Math.sin((a0 * Math.PI) / 180);
              const x1 = R + (R - r0) * Math.cos((a1 * Math.PI) / 180);
              const y1 = R + (R - r0) * Math.sin((a1 * Math.PI) / 180);
              const x2 = R + R * Math.cos((a1 * Math.PI) / 180);
              const y2 = R + R * Math.sin((a1 * Math.PI) / 180);
              const x3 = R + R * Math.cos((a0 * Math.PI) / 180);
              const y3 = R + R * Math.sin((a0 * Math.PI) / 180);
              return <path key={i} d={`M ${x0} ${y0} L ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} Z`} fill={col} stroke={isInWindow ? theme.text : "transparent"} strokeWidth={isInWindow ? 1.2 : 0} />;
            })}
            <circle cx={R} cy={R} r={R - 70} fill={theme.bg} stroke={theme.panelBorder} strokeWidth={2} />
          </svg>
          <div style={{ position: "absolute", left: R - 120, top: R - 40, width: 240, textAlign: "center", fontFamily: theme.mono, fontWeight: 800, fontSize: 56, color: theme.text, opacity: tickP }}>{angleDeg}°</div>
          <div style={{ position: "absolute", left: R - 90, top: R + 26, width: 180, textAlign: "center", fontFamily: theme.mono, fontSize: 20, color: theme.subtext, letterSpacing: 1, opacity: tickP }}>УГОЛ</div>
        </div>
        <div
          style={{
            position: "absolute",
            left: nx - 22,
            top: ny - 22,
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: theme.warning,
            border: `3px solid ${theme.text}`,
            boxShadow: `0 0 20px ${theme.warning}`,
            opacity: tickP,
          }}
        />
        <div style={{ position: "absolute", left: cx - 380, top: cy + R + 50, width: 760, display: "flex", gap: 4, opacity: tickP * enter, justifyContent: "center" }}>
          {readingBits.map((b, i) => (
            <div
              key={i}
              style={{
                width: 40,
                height: 50,
                borderRadius: 12,
                background: b ? theme.accent : theme.accent2,
                color: b ? "#06121A" : theme.text,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: theme.mono,
                fontWeight: 800,
                fontSize: 24,
                border: `2px solid ${b ? theme.accent : theme.accent2}`,
                boxShadow: `0 0 16px ${b ? theme.accent : theme.accent2}55`,
              }}
            >
              {b}
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", left: cx, top: cy + R + 140, transform: "translateX(-50%)", fontFamily: theme.mono, fontSize: 21, color: theme.subtext, letterSpacing: 1, opacity: tickP * enter }}>
          ОКНО {windowSize} БИТ → ОДНОЗНАЧНЫЙ УГОЛ
        </div>
        <div
          style={{
            position: "absolute",
            left: cx,
            top: cy + R + 190,
            transform: `translateX(-50%) scale(${done ? reveal : 0.9})`,
            opacity: done ? reveal : enter * 0.85,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 26px",
            borderRadius: 999,
            background: done ? `${theme.success}18` : theme.panel,
            border: `2px solid ${done ? theme.success : theme.panelBorder}`,
            color: done ? theme.success : theme.subtext,
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 28,
            whiteSpace: "nowrap",
          }}
        >
          <IconGlyph name="scan" size={28} color={done ? theme.success : theme.subtext} strokeWidth={1.8} />
          {done ? "16 ТОЧЕК → ТОЧНЫЙ УГОЛ" : "датчик видит лишь окно рядом"}
        </div>
        {done ? <PulseRing x={cx} y={cy} triggerFrame={impactLocal} tone="success" size={620} /> : null}
      </>
    );
  }

  if (phase === "linear") {
    const R = 230;
    const cy = 780;
    const ringX = 300;
    const lineY = 1180;
    const cutP = smooth(clamp01((local - 10) / Math.max(impactLocal - 10, 1)));
    const tailBits = Array.from({ length: 15 }).map((_, i) => (i % 2 === 0 ? 1 : 0));
    const lineBits = 34;
    const bitW = 18;
    const lineW = lineBits * (bitW + 2);
    const lineX = cx - lineW / 2;
    const lineProg = smooth(clamp01((local - impactLocal) / 18));
    return (
      <>
        <div style={{ position: "absolute", left: cx, top: 300, transform: "translateX(-50%)", ...mono, fontSize: 26, color: theme.subtext, opacity: enter }}>
          КОЛЬЦО → ЛИНИЯ
        </div>
        <div
          style={{
            position: "absolute",
            left: ringX - R,
            top: cy - R,
            width: R * 2,
            height: R * 2,
            borderRadius: "50%",
            border: `4px solid ${theme.accent}`,
            opacity: enter,
            transform: `scale(${0.9 + 0.1 * enter})`,
            boxShadow: `0 0 50px ${theme.accent}22`,
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -18,
              top: R - 3,
              width: 36,
              height: 6,
              background: theme.danger,
              transform: `rotate(${-12 + 30 * cutP}deg)`,
              opacity: cutP,
              boxShadow: `0 0 14px ${theme.danger}`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 28,
              color: theme.accent,
              opacity: enter,
            }}
          >
            65536
          </div>
        </div>
        <div style={{ position: "absolute", left: ringX + R + 30, top: cy - 14, width: 90, height: 4, background: theme.accent, opacity: cutP * enter, borderRadius: 999 }} />
        <div style={{ position: "absolute", left: ringX + R + 40, top: cy - 26, color: theme.accent, fontFamily: theme.font, fontWeight: 800, fontSize: 30, opacity: cutP * enter }}>›</div>
        <div style={{ position: "absolute", left: cx, top: cy + R + 34, transform: "translateX(-50%)", fontFamily: theme.font, fontSize: 24, color: theme.subtext, opacity: cutP * enter }}>разрежешь кольцо</div>
        <div style={{ position: "absolute", left: lineX, top: lineY, width: lineW, height: 54, display: "flex", gap: 2, opacity: enter }}>
          {Array.from({ length: lineBits }).map((_, i) => {
            const isTail = i >= lineBits - 15;
            const v = isTail ? tailBits[i - (lineBits - 15)] : random(`linear-${i}`) > 0.5 ? 1 : 0;
            const hl = isTail && lineProg > 0;
            return (
              <div
                key={i}
                style={{
                  width: bitW,
                  height: 54,
                  borderRadius: 8,
                  background: hl ? theme.warning : v ? `${theme.accent}22` : `${theme.accent2}22`,
                  border: `2px solid ${hl ? theme.warning : v ? theme.accent : theme.accent2}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: theme.mono,
                  fontWeight: 800,
                  fontSize: 18,
                  color: hl ? "#06121A" : v ? theme.accent : theme.accent2,
                  transform: hl ? `scale(${0.9 + 0.1 * lineProg})` : undefined,
                  opacity: enter,
                }}
              >
                {v}
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: lineX + (lineBits - 15) * (bitW + 2), top: lineY + 64, width: 15 * (bitW + 2), height: 3, background: theme.warning, opacity: lineProg }} />
        <div style={{ position: "absolute", left: lineX + (lineBits - 15) * (bitW + 2) + 6, top: lineY + 74, fontFamily: theme.mono, fontSize: 19, color: theme.warning, letterSpacing: 1, opacity: lineProg }}>
          +15 бит начала
        </div>
        <div
          style={{
            position: "absolute",
            left: cx,
            top: lineY + 122,
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "14px 26px",
            borderRadius: 999,
            background: done ? `${theme.success}18` : theme.panel,
            border: `2px solid ${done ? theme.success : theme.panelBorder}`,
            color: done ? theme.success : theme.subtext,
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 26,
            opacity: enter,
          }}
        >
          <span style={{ color: done ? theme.success : theme.subtext }}>{done ? "65551 БИТ ЛИНЕЙНО" : "65536 + 15 БИТ"}</span>
          <span style={{ fontFamily: theme.font, fontWeight: 700, fontSize: 20, color: theme.subtext }}>N + окно − 1</span>
        </div>
        {done ? <PulseRing x={cx} y={lineY + 27} triggerFrame={impactLocal} tone="success" size={760} /> : null}
      </>
    );
  }

  // phase === "window"
  const R = 260;
  const cy = 820;
  const total = 32;
  const win = 16;
  const winStart = Math.floor(((local / 3) % total));
  const bits = Array.from({ length: total }).map((_, i) => (random(`dbw-${i}`) > 0.5 ? 1 : 0));
  const ringEnter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const winP = smooth(clamp01((local - 8) / Math.max(impactLocal - 8, 1)));
  const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  return (
    <>
      <div style={{ position: "absolute", left: cx, top: 300, transform: "translateX(-50%)", ...mono, fontSize: 26, color: theme.subtext, opacity: enter }}>
        КОЛЬЦО де БРЁЙНА · 2¹⁶ = 65536
      </div>
      <div style={{ position: "absolute", left: cx, top: 350, transform: "translateX(-50%)", fontFamily: theme.font, fontSize: 24, color: theme.subtext, opacity: enter }}>
        16-битное окно скользит по кольцу
      </div>
      <div
        style={{
          position: "absolute",
          left: cx - R,
          top: cy - R,
          width: R * 2,
          height: R * 2,
          borderRadius: "50%",
          border: `3px solid ${theme.panelBorder}`,
          opacity: ringEnter,
          transform: `scale(${0.88 + 0.12 * ringEnter})`,
          boxShadow: "0 0 60px rgba(0,0,0,0.5)",
        }}
      />
      {bits.map((b, i) => {
        const ang = (i / total) * 360 - 90;
        const rad = (ang * Math.PI) / 180;
        const inWin = ((i - winStart + total) % total) < win;
        const r = R - 18;
        const x = cx + r * Math.cos(rad);
        const y = cy + r * Math.sin(rad);
        const col = b ? theme.accent : theme.accent2;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - 18,
              top: y - 18,
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: b ? `${theme.accent}22` : `${theme.accent2}22`,
              border: `2px solid ${inWin ? theme.warning : col}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 18,
              color: inWin ? theme.warning : col,
              opacity: ringEnter,
              transform: `scale(${inWin ? 1.18 : 1})`,
              boxShadow: inWin ? `0 0 16px ${theme.warning}55` : "none",
            }}
          >
            {b}
          </div>
        );
      })}
      {/* скоба окна */}
      <svg width={R * 2 + 40} height={R * 2 + 40} style={{ position: "absolute", left: cx - R - 20, top: cy - R - 20, opacity: winP * enter, pointerEvents: "none" }}>
        {(() => {
          const a0 = (winStart / total) * 360 - 90;
          const a1 = ((winStart + win) / total) * 360 - 90;
          const rr = R + 26;
          const x0 = R + 20 + rr * Math.cos((a0 * Math.PI) / 180);
          const y0 = R + 20 + rr * Math.sin((a0 * Math.PI) / 180);
          const x1 = R + 20 + rr * Math.cos((a1 * Math.PI) / 180);
          const y1 = R + 20 + rr * Math.sin((a1 * Math.PI) / 180);
          const largeArc = win / total > 0.5 ? 1 : 0;
          return <path d={`M ${x0} ${y0} A ${rr} ${rr} 0 ${largeArc} 1 ${x1} ${y1}`} fill="none" stroke={theme.warning} strokeWidth={4} strokeLinecap="round" />;
        })()}
      </svg>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: cy + R + 36,
          transform: "translateX(-50%)",
          display: "flex",
          gap: 4,
          opacity: winP * enter,
        }}
      >
        {Array.from({ length: win }).map((_, k) => {
          const bit = bits[(winStart + k) % total];
          return (
            <div
              key={k}
              style={{
                width: 38,
                height: 44,
                borderRadius: 9,
                background: bit ? theme.accent : theme.accent2,
                color: bit ? "#06121A" : theme.text,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: theme.mono,
                fontWeight: 800,
                fontSize: 22,
                border: `2px solid ${bit ? theme.accent : theme.accent2}`,
              }}
            >
              {bit}
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: cx, top: cy + R + 96, transform: "translateX(-50%)", fontFamily: theme.mono, fontSize: 20, color: theme.warning, letterSpacing: 1, opacity: winP * enter }}>
        ОКНО 16 БИТ → ОДИН ИЗ 65536
      </div>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: cy + R + 140,
          transform: `translateX(-50%) scale(${done ? badgeP : 0.94})`,
          opacity: done ? badgeP : enter * 0.9,
          padding: "14px 26px",
          borderRadius: 999,
          background: done ? `${theme.success}18` : theme.panel,
          border: `2px solid ${done ? theme.success : theme.panelBorder}`,
          color: done ? theme.success : theme.subtext,
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 28,
          whiteSpace: "nowrap",
        }}
      >
        {done ? "каждое окно — ровно раз" : "65536 окон · 65536 значений"}
      </div>
      {done ? <PulseRing x={cx} y={cy} triggerFrame={impactLocal} tone="success" size={620} /> : null}
    </>
  );
};

/** Дерево Меркла: build — листья→пары→корень, proof — лист+сиблинги+путь к корню. */
const MerkleTreeVisual: React.FC<{ local: number; fps: number; impactLocal: number; phase?: string; leaf?: number }> = ({
  local,
  fps,
  impactLocal,
  phase = "build",
  leaf = 2,
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const cx = W / 2;
  const isProof = phase === "proof";
  const sel = Math.max(0, Math.min(7, Math.round(leaf)));
  // layout: 8 leaves bottom, 4 parents, 2, root top
  const levels = [
    { count: 1, y: 420, w: 140, h: 64, label: "корень" },
    { count: 2, y: 610, w: 150, h: 56, label: "h" },
    { count: 4, y: 830, w: 150, h: 52, label: "h" },
    { count: 8, y: 1050, w: 100, h: 72, label: "лист" },
  ];
  const span = 980;
  const nodePos = (lvl: number, idx: number) => {
    const c = levels[lvl].count;
    const gap = span / c;
    return { x: cx - span / 2 + gap * (idx + 0.5), y: levels[lvl].y };
  };
  // proof path: collect indices per level containing the leaf's ancestry
  const pathIdx: number[] = [];
  let cur = sel;
  for (let l = 3; l >= 0; l--) {
    pathIdx[l] = cur;
    cur = Math.floor(cur / 2);
  }
  const siblingIdx = (lvl: number) => (pathIdx[lvl] % 2 === 0 ? pathIdx[lvl] + 1 : pathIdx[lvl] - 1);
  const revealP = (delay: number) => smooth(clamp01((local - delay) / 16));
  const pulseP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  const edge = (x1: number, y1: number, x2: number, y2: number, hl: boolean, op: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    return (
      <div
        key={`${x1}-${y1}-${x2}`}
        style={{
          position: "absolute",
          left: x1,
          top: y1,
          width: len,
          height: hl ? 4 : 3,
          transformOrigin: "0 50%",
          transform: `rotate(${ang}deg)`,
          background: hl ? theme.success : theme.panelBorder,
          opacity: op * enter,
          boxShadow: hl ? `0 0 12px ${theme.success}77` : "none",
          zIndex: 1,
        }}
      />
    );
  };
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 300,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontWeight: 800,
          fontSize: 26,
          letterSpacing: 2,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        {isProof ? "ДОКАЗАТЕЛЬСТВО ВКЛЮЧЕНИЯ" : "ДЕРЕВО МЕРКЛА · BUILD"}
      </div>
      {/* edges */}
      {levels.slice(0, 3).map((_, lvl) =>
        Array.from({ length: levels[lvl].count }).map((__, i) => {
          const top = nodePos(lvl, i);
          const left = nodePos(lvl + 1, i * 2);
          const right = nodePos(lvl + 1, i * 2 + 1);
          const hlLeft = isProof && (pathIdx[lvl + 1] === i * 2 || siblingIdx(lvl + 1) === i * 2);
          const hlRight = isProof && (pathIdx[lvl + 1] === i * 2 + 1 || siblingIdx(lvl + 1) === i * 2 + 1);
          const hl = isProof ? ((pathIdx[lvl] === i) as boolean) : false;
          const op = isProof ? (hl ? 1 : 0.35) : revealP(8 + lvl * 12 + i * 2);
          const eOp = isProof ? (hl ? 1 : 0.25) : op;
          return (
            <React.Fragment key={`lvl${lvl}-${i}`}>
              {edge(top.x, top.y + levels[lvl].h / 2, left.x, left.y - levels[lvl + 1].h / 2, (isProof && pathIdx[lvl] === i && pathIdx[lvl + 1] === i * 2) || (!isProof && hlLeft), eOp)}
              {edge(top.x, top.y + levels[lvl].h / 2, right.x, right.y - levels[lvl + 1].h / 2, (isProof && pathIdx[lvl] === i && pathIdx[lvl + 1] === i * 2 + 1) || (!isProof && hlRight), eOp)}
            </React.Fragment>
          );
        }),
      )}
      {/* nodes */}
      {levels.map((lvl, li) =>
        Array.from({ length: lvl.count }).map((__, i) => {
          const p = nodePos(li, i);
          const isPath = isProof && pathIdx[li] === i;
          const isSib = isProof && siblingIdx(li) === i && li >= 1;
          const isLeafSel = isProof && li === 3 && i === sel;
          const color = li === 0 ? theme.success : isPath ? theme.success : isSib ? theme.warning : li === 3 ? theme.accent : theme.accent2;
          const bg = li === 0 ? `${theme.success}1C` : isPath ? `${theme.success}18` : isSib ? `${theme.warning}18` : theme.panel;
          const border = `3px solid ${isPath || isSib || li === 0 ? color : theme.panelBorder}`;
          const reveal = isProof ? 1 : revealP(6 + li * 12 + i * 3);
          const scale = isPath ? 1 + 0.06 * Math.sin(local / 8 + i) : 1;
          const label =
            li === 0 ? "ROOT" : li === 1 ? `H${i}` : li === 2 ? `H${i}` : `L${i}`;
          const sub = li === 3 ? `блок ${i}` : li === 0 ? "32 байта" : "";
          return (
            <div
              key={`n${li}-${i}`}
              style={{
                position: "absolute",
                left: p.x - lvl.w / 2,
                top: p.y - lvl.h / 2,
                width: lvl.w,
                height: lvl.h,
                borderRadius: li === 3 ? 14 : 18,
                background: bg,
                border,
                boxShadow: isPath ? `0 0 30px ${color}55` : isSib ? `0 0 20px ${color}44` : "none",
                opacity: reveal * enter,
                transform: `scale(${scale}) translateY(${(1 - reveal) * 20}px)`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2,
              }}
            >
              {li === 3 ? <IconGlyph name="file-text" size={22} color={color} strokeWidth={1.7} /> : null}
              <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: li === 0 ? 28 : 26, color }}>{label}</div>
              {sub ? <div style={{ fontFamily: theme.mono, fontSize: 14, color: theme.subtext }}>{sub}</div> : null}
              {isLeafSel ? (
                <div style={{ position: "absolute", inset: -6, borderRadius: 16, border: `2px dashed ${theme.success}`, opacity: 0.9 }} />
              ) : null}
            </div>
          );
        }),
      )}
      {isProof ? (
        <>
          <div
            style={{
              position: "absolute",
              left: cx,
              top: 1240,
              transform: "translateX(-50%)",
              display: "flex",
              gap: 10,
              opacity: enter,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 999, background: `${theme.success}18`, border: `2px solid ${theme.success}`, fontFamily: theme.mono, fontSize: 20, color: theme.success, fontWeight: 800 }}>
              <span style={{ width: 12, height: 12, borderRadius: 6, background: theme.success }} /> путь к корню
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 999, background: `${theme.warning}18`, border: `2px solid ${theme.warning}`, fontFamily: theme.mono, fontSize: 20, color: theme.warning, fontWeight: 800 }}>
              <span style={{ width: 12, height: 12, borderRadius: 6, background: theme.warning }} /> сиблинги
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              left: cx,
              top: 1310,
              transform: `translateX(-50%) scale(${pulseP || 0.95})`,
              opacity: done ? pulseP : 0.85,
              padding: "14px 28px",
              borderRadius: 999,
              background: `${theme.success}18`,
              border: `2px solid ${theme.success}`,
              color: theme.success,
              fontFamily: theme.font,
              fontWeight: 800,
              fontSize: 28,
              whiteSpace: "nowrap",
            }}
          >
            нужно {levels.length - 1} хешей, не вся таблица
          </div>
          <PulseRing x={nodePos(0, 0).x} y={nodePos(0, 0).y} triggerFrame={impactLocal} tone="success" size={210} />
        </>
      ) : (
        <>
          <div
            style={{
              position: "absolute",
              left: cx,
              top: 1240,
              transform: "translateX(-50%)",
              fontFamily: theme.mono,
              fontSize: 22,
              color: theme.subtext,
              opacity: enter,
              letterSpacing: 1,
            }}
          >
            листья → пары → корень
          </div>
          {done ? (
            <div
              style={{
                position: "absolute",
                left: cx,
                top: 1300,
                transform: `translateX(-50%) scale(${pulseP || 0.95})`,
                opacity: done ? pulseP : 0,
                padding: "14px 28px",
                borderRadius: 999,
                background: `${theme.success}18`,
                border: `2px solid ${theme.success}`,
                color: theme.success,
                fontFamily: theme.font,
                fontWeight: 800,
                fontSize: 28,
              }}
            >
              корень — один хеш на всё
            </div>
          ) : null}
          {done ? <PulseRing x={nodePos(0, 0).x} y={nodePos(0, 0).y} triggerFrame={impactLocal} tone="success" size={210} /> : null}
        </>
      )}
    </>
  );
};

/** Алгоритм Гейла—Шепли: две колонки (предлагающие и принимающие), движущиеся предложения, удержание лучшего, отказ и финальные стабильные пары. */
const StableMatching: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: "propose" | "hold" | "final";
}> = ({ local, fps, impactLocal, phase = "propose" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const cx = W / 2;
  const proposers = ["A", "B", "C"];
  const acceptors = ["X", "Y", "Z"];
  // финальные стабильные пары: A→Y, B→X, C→Z
  const finalPairs = [
    { p: 0, a: 1 },
    { p: 1, a: 0 },
    { p: 2, a: 2 },
  ];
  const leftX = cx - 320;
  const rightX = cx + 320;
  const startY = 500;
  const gap = 200;
  const cardW = 180;
  const cardH = 130;

  const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };

  const card = (
    x: number,
    y: number,
    label: string,
    color: string,
    highlight: number,
    rejected: boolean,
  ) => {
    const pulse = highlight > 0 ? 1 + 0.04 * Math.sin((local + highlight * 7) / 6) : 1;
    const rejectOp = rejected ? 0.35 : 1;
    return (
      <div
        style={{
          position: "absolute",
          left: x - cardW / 2,
          top: y - cardH / 2,
          width: cardW,
          height: cardH,
          borderRadius: 24,
          background: theme.panel,
          border: `3px solid ${rejected ? theme.panelBorder : color}${highlight > 0 ? "CC" : "66"}`,
          boxShadow: highlight > 0 ? `0 0 ${40 + 12 * highlight}px ${color}44` : "none",
          opacity: enter * rejectOp,
          transform: `translateY(${(1 - enter) * 50}px) scale(${pulse})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <IconGlyph
          name={rejected ? "x" : "user"}
          size={38}
          color={rejected ? theme.danger : color}
          strokeWidth={1.7}
        />
        <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 34, color: rejected ? theme.subtext : theme.text }}>
          {label}
        </div>
      </div>
    );
  };

  // стрелка-предложение от proposer к acceptor
  const proposalArrow = (
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    progress: number,
    color: string,
  ) => {
    const x = interpolate(progress, [0, 1], [fromX, toX]);
    const y = interpolate(progress, [0, 1], [fromY, toY]);
    const op = progress > 0 && progress < 1 ? 1 : 0;
    return (
      <>
        {/* след */}
        <div
          style={{
            position: "absolute",
            left: Math.min(fromX, x),
            top: fromY - 2,
            width: Math.abs(x - fromX) || 4,
            height: 4,
            background: `linear-gradient(90deg, ${color}00, ${color})`,
            borderRadius: 999,
            opacity: op * enter,
          }}
        />
        {/* пилюля */}
        <div
          style={{
            position: "absolute",
            left: x,
            top: y,
            transform: "translate(-50%, -50%)",
            padding: "8px 16px",
            borderRadius: 999,
            background: color,
            color: "#06121A",
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 22,
            opacity: op * enter,
            boxShadow: `0 0 22px ${color}AA`,
            whiteSpace: "nowrap",
          }}
        >
          →
        </div>
      </>
    );
  };

  if (phase === "propose") {
    // A proposes to X
    const flowEnd = Math.max(impactLocal - 4, 1);
    const p = smooth(clamp01(local / flowEnd));
    return (
      <>
        <div style={{ position: "absolute", left: cx, top: 300, transform: "translateX(-50%)", ...mono, fontSize: 26, color: theme.subtext, opacity: enter }}>
          ПРЕДЛАГАЮЩИЕ → ПРИНИМАЮЩИЕ
        </div>
        <div style={{ position: "absolute", left: leftX, top: startY - 120, transform: "translateX(-50%)", ...mono, fontSize: 22, color: theme.accent, opacity: enter }}>
          ПРЕДЛАГАЮЩИЕ
        </div>
        <div style={{ position: "absolute", left: rightX, top: startY - 120, transform: "translateX(-50%)", ...mono, fontSize: 22, color: theme.accent2, opacity: enter }}>
          ПРИНИМАЮЩИЕ
        </div>
        {proposers.map((name, i) => (
          <React.Fragment key={`p${i}`}>
            {card(leftX, startY + i * gap, name, theme.accent, i === 0 ? 1 : 0, false)}
          </React.Fragment>
        ))}
        {acceptors.map((name, i) => (
          <React.Fragment key={`a${i}`}>
            {card(rightX, startY + i * gap, name, theme.accent2, 0, false)}
          </React.Fragment>
        ))}
        {/* A → X */}
        {proposalArrow(leftX + cardW / 2, startY, rightX - cardW / 2, startY, p, theme.accent)}
        {local >= impactLocal ? <PulseRing x={rightX} y={startY} triggerFrame={impactLocal} tone="accent2" size={180} /> : null}
        <div style={{ position: "absolute", left: cx, top: startY + 3 * gap + 60, transform: "translateX(-50%)", fontFamily: theme.font, fontWeight: 700, fontSize: 28, color: theme.subtext, opacity: enter }}>
          A делает предложение X
        </div>
      </>
    );
  }

  if (phase === "hold") {
    // A holds X, B proposes to X (rejected), C proposes to Z
    const flowP = smooth(clamp01(local / Math.max(impactLocal - 8, 1)));
    const rejectP = local >= impactLocal ? smooth(clamp01((local - impactLocal) / 16)) : 0;
    return (
      <>
        <div style={{ position: "absolute", left: cx, top: 300, transform: "translateX(-50%)", ...mono, fontSize: 26, color: theme.warning, opacity: enter }}>
          ПРИНИМАЮЩИЙ ДЕРЖИТ ЛУЧШИЙ ВАРИАНТ
        </div>
        <div style={{ position: "absolute", left: leftX, top: startY - 120, transform: "translateX(-50%)", ...mono, fontSize: 22, color: theme.accent, opacity: enter }}>
          ПРЕДЛАГАЮЩИЕ
        </div>
        <div style={{ position: "absolute", left: rightX, top: startY - 120, transform: "translateX(-50%)", ...mono, fontSize: 22, color: theme.accent2, opacity: enter }}>
          ПРИНИМАЮЩИЕ
        </div>
        {proposers.map((name, i) => (
          <React.Fragment key={`p${i}`}>
            {card(leftX, startY + i * gap, name, theme.accent, i === 0 ? 1 : 0, i === 1 && rejectP > 0.5)}
          </React.Fragment>
        ))}
        {acceptors.map((name, i) => (
          <React.Fragment key={`a${i}`}>
            {card(rightX, startY + i * gap, name, theme.accent2, i === 0 ? 1 : 0, false)}
          </React.Fragment>
        ))}
        {/* A holds X — solid line */}
        <div
          style={{
            position: "absolute",
            left: leftX + cardW / 2,
            top: startY - 2,
            width: rightX - leftX - cardW,
            height: 4,
            background: theme.success,
            opacity: enter,
            boxShadow: `0 0 14px ${theme.success}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: cx,
            top: startY - 30,
            transform: "translateX(-50%)",
            padding: "6px 16px",
            borderRadius: 999,
            background: `${theme.success}22`,
            border: `2px solid ${theme.success}`,
            color: theme.success,
            fontFamily: theme.mono,
            fontWeight: 700,
            fontSize: 20,
            opacity: enter,
          }}
        >
          удерживает
        </div>
        {/* B → X rejected */}
        {proposalArrow(leftX + cardW / 2, startY + gap, rightX - cardW / 2, startY, flowP, theme.warning)}
        {rejectP > 0.3 ? (
          <div
            style={{
              position: "absolute",
              left: rightX + cardW / 2 + 30,
              top: startY - 14,
              fontFamily: theme.mono,
              fontWeight: 800,
              fontSize: 26,
              color: theme.danger,
              opacity: rejectP,
            }}
          >
            ✕ отказ
          </div>
        ) : null}
        {local >= impactLocal ? <PulseRing x={rightX} y={startY} triggerFrame={impactLocal} tone="warning" size={200} /> : null}
        <div style={{ position: "absolute", left: cx, top: startY + 3 * gap + 60, transform: "translateX(-50%)", fontFamily: theme.font, fontWeight: 700, fontSize: 28, color: theme.warning, opacity: enter }}>
          X держит A, отказывает B
        </div>
      </>
    );
  }

  // phase === "final" — стабильные пары
  const lockP = smooth(clamp01(local / Math.max(impactLocal - 6, 1)));
  const badgeP = local >= impactLocal ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  return (
    <>
      <div style={{ position: "absolute", left: cx, top: 300, transform: "translateX(-50%)", ...mono, fontSize: 26, color: theme.success, opacity: enter }}>
        СТАБИЛЬНЫЕ ПАРЫ
      </div>
      <div style={{ position: "absolute", left: leftX, top: startY - 120, transform: "translateX(-50%)", ...mono, fontSize: 22, color: theme.accent, opacity: enter }}>
        ПРЕДЛАГАЮЩИЕ
      </div>
      <div style={{ position: "absolute", left: rightX, top: startY - 120, transform: "translateX(-50%)", ...mono, fontSize: 22, color: theme.accent2, opacity: enter }}>
        ПРИНИМАЮЩИЕ
      </div>
      {proposers.map((name, i) => (
        <React.Fragment key={`p${i}`}>
          {card(leftX, startY + i * gap, name, theme.success, 1, false)}
        </React.Fragment>
      ))}
      {acceptors.map((name, i) => (
        <React.Fragment key={`a${i}`}>
          {card(rightX, startY + i * gap, name, theme.success, 1, false)}
        </React.Fragment>
      ))}
      {/* линии стабильных пар */}
      {finalPairs.map((pair, i) => {
        const py = startY + pair.p * gap;
        const ay = startY + pair.a * gap;
        const lineP = smooth(clamp01(lockP - i * 0.22));
        const x1 = leftX + cardW / 2;
        const x2 = rightX - cardW / 2;
        const y1 = py;
        const y2 = ay;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x1,
              top: y1,
              width: len * lineP,
              height: 5,
              transformOrigin: "0 50%",
              transform: `translateY(-50%) rotate(${angle}deg)`,
              background: theme.success,
              borderRadius: 999,
              boxShadow: `0 0 18px ${theme.success}88`,
              opacity: enter * lineP,
            }}
          />
        );
      })}
      {local >= impactLocal ? (
        <>
          <PulseRing x={cx} y={startY + gap} triggerFrame={impactLocal} tone="success" size={500} />
          <div
            style={{
              position: "absolute",
              left: cx,
              top: startY + 3 * gap + 60,
              transform: `translateX(-50%) scale(${badgeP})`,
              opacity: badgeP,
              padding: "14px 30px",
              borderRadius: 999,
              background: `${theme.success}18`,
              border: `2px solid ${theme.success}`,
              color: theme.success,
              fontFamily: theme.font,
              fontWeight: 800,
              fontSize: 30,
              whiteSpace: "nowrap",
              boxShadow: `0 0 40px ${theme.success}33`,
            }}
          >
            нет стабильных разочарований
          </div>
        </>
      ) : null}
    </>
  );
};

/** Поток элементов входит в один слот резервуара; разные фазы показывают замену и доказательство честности. */
const ReservoirSamplingVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: "stream" | "replace" | "survive" | "proof" | "fair";
  chance?: string;
}> = ({ local, fps, impactLocal, phase = "stream", chance }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const arrived = local >= impactLocal;
  const flow = smooth(clamp01(local / Math.max(impactLocal - 8, 1)));
  const incomingX = interpolate(flow, [0, 1], [120, 560]);
  const current = phase === "replace" && arrived ? "2" : phase === "proof" && arrived ? "4" : "1";
  const incoming = phase === "proof" ? "4" : phase === "survive" ? "3" : phase === "fair" ? "N" : phase === "replace" ? "2" : "1";
  const reservoirColor = phase === "survive" ? theme.accent : arrived ? theme.success : theme.accent2;
  const survivalLabel = chance ? `ПЕРЕЖИТЬ: ${chance} · ОСТАВИТЬ СТАРЫЙ` : "ОСТАВИТЬ СТАРЫЙ";
  const bottomLabel =
    phase === "proof"
      ? "1/4 × 3/4 = 1/4"
      : phase === "fair"
        ? "ПОСЛЕ N: КАЖДЫЙ 1/N"
        : phase === "survive"
          ? survivalLabel
          : phase === "replace"
            ? `ЗАМЕНИТЬ С ВЕРОЯТНОСТЬЮ ${chance ?? "1/2"}`
            : "ОДНА ЯЧЕЙКА · ОДИН ПРОХОД";
  const title =
    phase === "proof" ? "ПРОВЕРКА ЧЕСТНОСТИ" : phase === "fair" ? "РАВНЫЕ ШАНСЫ" : "ПОТОК → РЕЗЕРВУАР";
  const item = (label: string, x: number, color: string, opacity = 1) => (
    <div
      key={`${label}-${x}`}
      style={{
        position: "absolute",
        left: x,
        top: 575,
        width: 82,
        height: 82,
        borderRadius: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `${color}18`,
        border: `3px solid ${color}99`,
        color,
        fontFamily: theme.mono,
        fontSize: 32,
        fontWeight: 800,
        opacity: enter * opacity,
      }}
    >
      {label}
    </div>
  );

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 260,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontSize: 28,
          letterSpacing: 3,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        {title}
      </div>
      <div
        style={{
          position: "absolute",
          left: 92,
          top: 615,
          width: 500,
          height: 4,
          background: `linear-gradient(90deg, ${theme.accent}00, ${theme.accent}AA, ${theme.accent}00)`,
          opacity: enter,
        }}
      />
      {["1", "2", "3", "4", "…"].map((label, i) => item(label, 98 + i * 108, i === 0 ? theme.accent : theme.subtext, phase === "fair" ? 0.38 : 0.8))}
      <div
        style={{
          position: "absolute",
          left: incomingX,
          top: 575,
          width: 82,
          height: 82,
          borderRadius: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${theme.warning}28`,
          border: `3px solid ${theme.warning}`,
          color: theme.warning,
          fontFamily: theme.mono,
          fontSize: 32,
          fontWeight: 800,
          opacity: enter * (phase === "fair" ? 0.55 : 1),
          boxShadow: `0 0 28px ${theme.warning}55`,
        }}
      >
        {incoming}
      </div>
      <div
        style={{
          position: "absolute",
          left: 610,
          top: 420,
          width: 350,
          height: 360,
          borderRadius: 30,
          background: `${reservoirColor}12`,
          border: `3px solid ${reservoirColor}AA`,
          boxShadow: `0 0 60px ${reservoirColor}2E`,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 70}px)`,
          textAlign: "center",
        }}
      >
        <div style={{ paddingTop: 30, fontFamily: theme.mono, fontSize: 25, color: reservoirColor, letterSpacing: 2 }}>
          РЕЗЕРВУАР
        </div>
        <IconGlyph name="database" size={54} color={reservoirColor} strokeWidth={1.7} />
        <div style={{ marginTop: 8, fontFamily: theme.font, fontSize: 26, color: theme.subtext }}>одна ячейка</div>
        <div
          style={{
            margin: "22px auto 0",
            width: 116,
            height: 104,
            borderRadius: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${reservoirColor}22`,
            border: `3px solid ${reservoirColor}`,
            color: theme.text,
            fontFamily: theme.mono,
            fontSize: 50,
            fontWeight: 800,
            transform: `scale(${1 + (arrived ? 0.04 : 0) * Math.sin((local - impactLocal) / 5)})`,
          }}
        >
          {current}
        </div>
      </div>
      {phase === "proof" ? (
        <div
          style={{
            position: "absolute",
            left: 120,
            top: 925,
            width: 840,
            height: 210,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: enter,
          }}
        >
          <div style={{ width: 330, padding: "22px 16px", borderRadius: 22, background: `${theme.warning}18`, border: `3px solid ${theme.warning}88`, textAlign: "center", fontFamily: theme.mono, fontSize: 29, color: theme.warning }}>
            новый: 1/4
          </div>
          <div style={{ fontFamily: theme.font, fontSize: 46, color: theme.subtext }}>×</div>
          <div style={{ width: 330, padding: "22px 16px", borderRadius: 22, background: `${theme.accent}18`, border: `3px solid ${theme.accent}88`, textAlign: "center", fontFamily: theme.mono, fontSize: 29, color: theme.accent }}>
            старый: 3/4
          </div>
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: phase === "proof" ? 1190 : 990,
          transform: "translateX(-50%)",
          minWidth: 610,
          padding: "18px 30px",
          borderRadius: 999,
          textAlign: "center",
          background: `${arrived ? theme.success : theme.panel}1F`,
          border: `3px solid ${arrived ? theme.success : theme.panelBorder}`,
          color: arrived ? theme.success : theme.subtext,
          fontFamily: theme.mono,
          fontSize: 29,
          fontWeight: 800,
          opacity: enter,
          boxShadow: arrived ? `0 0 38px ${theme.success}44` : "none",
        }}
      >
        {bottomLabel}
      </div>
      {arrived ? <PulseRing x={phase === "proof" ? W / 2 : 785} y={phase === "proof" ? 1030 : 600} triggerFrame={impactLocal} tone={phase === "survive" ? "accent" : "success"} size={phase === "proof" ? 180 : 160} /> : null}
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
    "password-leak": { scale: 1.05, y: -30 },
    "hash-table": { scale: 0.98, y: -20 },
    "collision-compare": { scale: 0.9, y: -20 },
    "heap-graph": { scale: 0.86, y: -20 },
    "gc-sweep": { scale: 0.9, y: -30 },
    "medal-mint": { scale: 0.96, y: -10 },
    "ancient-code": { scale: 0.92, y: -20 },
    "verdict-scan": { scale: 0.98, y: -10 },
    "paradox-box": { scale: 0.9, y: -30 },
    "proof-sequence": { scale: 0.92, y: -20 },
    "fft-wave": { scale: 0.94, y: -30 },
    "orbit-fft-groups": { scale: 0.88, y: -30 },
    "qr-repair": { scale: 0.9, y: -30 },
    "hll-estimate": { scale: 0.92, y: -20 },
    "bloom-bitarray": { scale: 0.88, y: -30 },
    "bloom-probe": { scale: 0.88, y: -20 },
    "coin-pair": { scale: 0.96, y: -10 },
    "bit-extractor": { scale: 0.92, y: -20 },
    "debruijn-cycle": { scale: 0.92, y: -20 },
    "hamming-word": { scale: 0.9, y: -25 },
    "hamming-syndrome": { scale: 0.88, y: -25 },
    "gps-relativity": { scale: 0.9, y: -20 },
    "cuckoo-table": { scale: 0.9, y: -30 },
    "cuckoo-cycle": { scale: 0.88, y: -30 },
    "cuckoo-stash": { scale: 0.9, y: -20 },
    "inverse-sqrt-bits": { scale: 0.92, y: -20 },
    "merkle-tree": { scale: 0.92, y: -20 },
    "stable-matching": { scale: 0.88, y: -20 },
    "busy-beaver": { scale: 0.9, y: -20 },
    "secret-sharing": { scale: 0.9, y: -20 },
    "reservoir-sampling": { scale: 0.9, y: -20 },
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
      case "password-leak":
        return (
          <PasswordLeak
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            password={slot.beat.params?.password as string | undefined}
          />
        );
      case "hash-table":
        return (
          <HashTableVisual
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            keyLabel={slot.beat.params?.key as string | undefined}
            hash={slot.beat.params?.hash as string | undefined}
            index={slot.beat.params?.index as number | undefined}
            value={slot.beat.params?.value as string | undefined}
          />
        );
      case "collision-compare":
        return (
          <CollisionCompare
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            keyA={slot.beat.params?.keyA as string | undefined}
            keyB={slot.beat.params?.keyB as string | undefined}
            bucket={slot.beat.params?.bucket as number | undefined}
          />
        );
      case "heap-graph":
        return (
          <HeapGraphVisual
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            mode={(slot.beat.params?.mode as "roots" | "unreachable" | undefined) ?? "unreachable"}
          />
        );
      case "gc-sweep":
        return (
          <GcSweepVisual
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            mode={(slot.beat.params?.mode as "mark-sweep" | "generations" | undefined) ?? "mark-sweep"}
          />
        );
      case "medal-mint":
        return (
          <MedalMint
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            motto={slot.beat.params?.motto as string | undefined}
            caption={slot.beat.params?.caption as string | undefined}
          />
        );
      case "ancient-code":
        return (
          <AncientCode
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            mode={(slot.beat.params?.mode as "hexagram" | "syllable" | undefined) ?? "hexagram"}
            label={slot.beat.params?.label as string | undefined}
          />
        );
      case "verdict-scan":
        return (
          <VerdictScan
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            label={slot.beat.params?.label as string | undefined}
          />
        );
      case "paradox-box":
        return (
          <ParadoxBox
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            trap={slot.beat.params?.trap as string | undefined}
            oracle={slot.beat.params?.oracle as string | undefined}
            stage={(slot.beat.params?.stage as "setup" | "crack" | undefined) ?? "setup"}
          />
        );
      case "proof-sequence":
        return (
          <ProofSequence
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            mode={(slot.beat.params?.mode as "run" | "steps" | undefined) ?? "run"}
            start={slot.beat.params?.start as number | undefined}
            steps={slot.beat.params?.steps as string | undefined}
          />
        );
      case "fft-wave":
        return (
          <FftWave
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            phase={(slot.beat.params?.phase as "square" | "fft" | undefined) ?? "square"}
          />
        );
      case "qr-repair":
        return (
          <QrRepair
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            phase={(slot.beat.params?.phase as "damage" | "restore" | "encode" | "levels" | undefined) ?? "damage"}
            damaged={slot.beat.params?.damaged as number | undefined}
            label={slot.beat.params?.label as string | undefined}
            weather={slot.beat.params?.weather as boolean | undefined}
          />
        );
      case "hll-estimate":
        return (
          <HllEstimate
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            phase={(slot.beat.params?.phase as "hash" | "registers" | "harmonic" | "scale" | undefined) ?? "hash"}
            highlight={slot.beat.params?.highlight as number | undefined}
          />
        );
      case "bloom-bitarray":
        return (
          <BloomBitarray
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            key={slot.beat.params?.key as string | undefined}
            bits={slot.beat.params?.bits as number[] | undefined}
            hashes={slot.beat.params?.hashes as number | undefined}
          />
        );
      case "bloom-probe":
        return (
          <BloomProbe
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            key={slot.beat.params?.key as string | undefined}
            probeBits={slot.beat.params?.probeBits as number[] | undefined}
            result={(slot.beat.params?.result as "maybe" | "no" | undefined) ?? "no"}
            fileName={slot.beat.params?.fileName as string | undefined}
          />
        );
      case "coin-pair":
        return (
          <CoinPairVisual
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            faceA={slot.beat.params?.faceA as string | undefined}
            faceB={slot.beat.params?.faceB as string | undefined}
            match={slot.beat.params?.match as boolean | undefined}
          />
        );
      case "bit-extractor":
        return (
          <BitExtractorVisual
            local={local}
            fps={fps}
            impactLocal={impactLocal}
          />
        );
      case "rule-110":
        return (
          <Rule110Visual
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            mode={(slot.beat.params?.mode as "truth-table" | "cell-eval" | undefined) ?? "truth-table"}
          />
        );
      case "glider-collision":
        return (
          <GliderCollisionVisual
            local={local}
            fps={fps}
            impactLocal={impactLocal}
          />
        );
      case "debruijn-cycle":
        return (
          <DebruijnCycleVisual
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            phase={(slot.beat.params?.phase as "window" | "graph" | "angle" | "linear" | undefined) ?? "window"}
          />
        );
      case "hamming-word":
        return (
          <HammingWordVisual
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            errorPosition={slot.beat.params?.errorPosition as number | undefined}
          />
        );
      case "hamming-syndrome":
        return (
          <HammingSyndromeVisual
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            mode={(slot.beat.params?.mode as "groups" | "syndrome" | undefined) ?? "groups"}
            errorPosition={slot.beat.params?.errorPosition as number | undefined}
          />
        );
      case "gps-relativity":
        return (
          <GpsRelativity
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            phase={(slot.beat.params?.phase as "orbit" | "speed" | "gravity" | "balance" | "factory" | "correction" | undefined) ?? "orbit"}
          />
        );
      case "orbit-fft-groups":
        return (
          <OrbitFftGroups
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            phase={(slot.beat.params?.phase as "orbit" | "groups" | "stages" | undefined) ?? "orbit"}
            asteroid={slot.beat.params?.asteroid as string | undefined}
            observations={slot.beat.params?.observations as number | undefined}
            year={slot.beat.params?.year as string | undefined}
          />
        );
      case "cuckoo-table":
        return (
          <CuckooTable
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            keyLabel={slot.beat.params?.key as string | undefined}
            showEviction={slot.beat.params?.evict as boolean | undefined}
          />
        );
      case "cuckoo-cycle":
        return (
          <CuckooCycle
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            loadFactor={slot.beat.params?.load as number | undefined}
          />
        );
      case "cuckoo-stash":
        return (
          <CuckooStash
            local={local}
            fps={fps}
            impactLocal={impactLocal}
          />
        );
      case "inverse-sqrt-bits":
        return (
          <InverseSqrtBits
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            phase={(slot.beat.params?.phase as "strip" | "newton" | undefined) ?? "strip"}
          />
        );
      case "merkle-tree":
        return (
          <MerkleTreeVisual
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            phase={(slot.beat.params?.phase as "build" | "proof" | undefined) ?? "build"}
            leaf={slot.beat.params?.leaf as number | undefined}
          />
        );
      case "stable-matching":
        return (
          <StableMatching
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            phase={(slot.beat.params?.phase as "propose" | "hold" | "final" | undefined) ?? "propose"}
          />
        );
      case "busy-beaver":
        return <BusyBeaverVisual local={local} fps={fps} impactLocal={impactLocal} />;
      case "secret-sharing":
        return (
          <SecretSharingVisual
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            phase={(slot.beat.params?.phase as "shares" | "curve" | "candidates" | "recover" | undefined) ?? "curve"}
          />
        );
      case "reservoir-sampling":
        return (
          <ReservoirSamplingVisual
            local={local}
            fps={fps}
            impactLocal={impactLocal}
            phase={(slot.beat.params?.phase as "stream" | "replace" | "survive" | "proof" | "fair" | undefined) ?? "stream"}
            chance={slot.beat.params?.chance as string | undefined}
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

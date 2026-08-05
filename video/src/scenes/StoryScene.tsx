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
    if (beat.visual === "password-leak") impact = start + Math.round(dur * 0.4);
    if (beat.visual === "hash-table") impact = start + Math.round(dur * 0.62);
    if (beat.visual === "collision-compare") impact = start + 18;
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

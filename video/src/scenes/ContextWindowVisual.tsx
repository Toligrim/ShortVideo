import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

const W = layout.width;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

export type ContextWindowPhase =
  | "no-memory"
  | "stack"
  | "tokens"
  | "desk"
  | "why-big"
  | "evict"
  | "cut"
  | "summary"
  | "memory"
  | "finite";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: ContextWindowPhase;
};

const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };

const phaseTitle: Record<ContextWindowPhase, string> = {
  "no-memory": "МЕЖДУ РЕПЛИКАМИ ПАМЯТИ НЕТ",
  stack: "ВСЯ ПЕРЕПИСКА — ОДНОЙ СТОПКОЙ НА ВХОД",
  tokens: "МЕРЯЮТ НЕ СЛОВАМИ, А ТОКЕНАМИ",
  desk: "СТОЛ ФИКСИРОВАННОГО РАЗМЕРА · КОНТЕКСТНОЕ ОКНО",
  "why-big": "ПОЧЕМУ НЕ СДЕЛАТЬ СТОЛ ОГРОМНЫМ?",
  evict: "НОВОЕ — С КРАЮ, СТАРОЕ — ЗА БОРТ",
  cut: "РЕЖУТ САМОЕ СТАРОЕ",
  summary: "НАЧАЛО УЖИМАЮТ В ПЕРЕСКАЗ",
  memory: "ОТДЕЛЬНАЯ ПАМЯТЬ О ТЕБЕ",
  finite: "СТОЛ ВСЁ РАВНО КОНЕЧЕН",
};

// Стол «контекстное окно», вид сверху.
const DESK = { x: W / 2 - 380, y: 470, w: 760, h: 430 };

const Sheet: React.FC<{
  x: number;
  y: number;
  w?: number;
  h?: number;
  tone?: string;
  opacity?: number;
  rot?: number;
  strike?: boolean;
}> = ({ x, y, w = 112, h = 150, tone = theme.accent, opacity = 1, rot = 0, strike = false }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      height: h,
      borderRadius: 10,
      background: `${theme.bg}E8`,
      border: `2px solid ${tone}AA`,
      boxShadow: `0 4px 14px ${theme.bg}80`,
      opacity,
      transform: `rotate(${rot}deg)`,
      overflow: "hidden",
    }}
  >
    {[0, 1, 2, 3].map((i) => (
      <div
        key={i}
        style={{
          position: "absolute",
          left: 12,
          right: 12 + (i % 2) * 18,
          top: 18 + i * 22,
          height: 6,
          borderRadius: 3,
          background: `${tone}66`,
        }}
      />
    ))}
    {strike ? (
      <div
        style={{
          position: "absolute",
          left: -10,
          top: h / 2 - 2,
          width: w + 20,
          height: 4,
          background: theme.danger,
          transform: "rotate(-18deg)",
        }}
      />
    ) : null}
  </div>
);

const DeskTop: React.FC<{ enter: number; hardEdge?: boolean; huge?: number }> = ({
  enter,
  hardEdge = false,
  huge = 0,
}) => {
  const edge = hardEdge ? theme.danger : theme.accent;
  return (
    <>
      {huge > 0 ? (
        <div
          style={{
            position: "absolute",
            left: DESK.x - huge,
            top: DESK.y - huge * 0.5,
            width: DESK.w + huge * 2,
            height: DESK.h + huge * 0.7,
            borderRadius: 28,
            border: `3px dashed ${theme.subtext}66`,
            opacity: enter,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: DESK.x,
          top: DESK.y,
          width: DESK.w,
          height: DESK.h,
          borderRadius: 20,
          background: `${theme.panel}D0`,
          border: `${hardEdge ? 7 : 5}px solid ${edge}`,
          boxShadow: `0 0 44px ${edge}22, inset 0 0 30px ${edge}14`,
          opacity: enter,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: DESK.y - 34,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 22,
          color: edge,
          whiteSpace: "nowrap",
          opacity: enter,
        }}
      >
        КОНТЕКСТНОЕ ОКНО
      </div>
    </>
  );
};

const Header: React.FC<{ phase: ContextWindowPhase; enter: number }> = ({ phase, enter }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 250,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: theme.subtext,
      fontSize: 24,
      whiteSpace: "nowrap",
      opacity: enter,
      ...mono,
    }}
  >
    <IconGlyph name="table" size={28} color={theme.accent} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const Badge: React.FC<{ text: string; tone?: string; opacity: number; y?: number }> = ({
  text,
  tone = theme.accent,
  opacity,
  y = 1080,
}) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: y,
      transform: "translateX(-50%)",
      padding: "16px 36px",
      borderRadius: 999,
      background: `${tone}18`,
      border: `2px solid ${tone}99`,
      color: tone,
      ...mono,
      fontSize: 25,
      whiteSpace: "nowrap",
      opacity,
      boxShadow: `0 0 32px ${tone}25`,
    }}
  >
    {text}
  </div>
);

// Ряд листов на столе.
const deskSheets = (n: number, opts: { extraTransform?: (i: number) => string; tone?: (i: number) => string; opacity?: (i: number) => number } = {}) => {
  const gap = (DESK.w - 80 - 112) / Math.max(n - 1, 1);
  const y = DESK.y + DESK.h - 190;
  return Array.from({ length: n }).map((_, i) => (
    <div key={i} style={{ position: "absolute", left: DESK.x + 40 + i * gap, top: y, transform: opts.extraTransform?.(i) }}>
      <Sheet x={0} y={0} tone={opts.tone?.(i) ?? theme.accent} opacity={opts.opacity?.(i) ?? 1} />
    </div>
  ));
};

export const ContextWindowVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "desk" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 13, mass: 0.7 } });
  const after = smooth(clamp01((local - impactLocal) / 16));

  // ─── no-memory ───
  if (phase === "no-memory") {
    return (
      <>
        <Header phase={phase} enter={enter} />
        {/* две реплики с провалом между ними */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 300,
            top: 430,
            width: 240,
            padding: "18px 20px",
            borderRadius: 18,
            borderBottomLeftRadius: 4,
            background: `${theme.accent}1E`,
            border: `2px solid ${theme.accent}88`,
            color: theme.text,
            fontSize: 24,
            opacity: enter,
            ...mono,
          }}
        >
          РЕПЛИКА N
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2 + 60,
            top: 560,
            width: 240,
            padding: "18px 20px",
            borderRadius: 18,
            borderBottomRightRadius: 4,
            background: `${theme.accent2}1E`,
            border: `2px solid ${theme.accent2}88`,
            color: theme.text,
            fontSize: 24,
            opacity: enter,
            ...mono,
          }}
        >
          РЕПЛИКА N+1
        </div>
        {/* мозг-память перечёркнут */}
        <div style={{ position: "absolute", left: W / 2 - 70, top: 740, opacity: enter }}>
          <IconGlyph name="brain" size={140} color={theme.subtext} strokeWidth={1.5} />
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2 - 130,
            top: 810,
            width: 260,
            height: 6,
            background: theme.danger,
            transform: "rotate(-24deg)",
            opacity: enter,
            boxShadow: `0 0 16px ${theme.danger}`,
          }}
        />
        <Badge text="МОДЕЛЬ НЕ ПОМНИТ ПРОШЛЫЙ ХОД" tone={theme.danger} opacity={enter} />
        <PulseRing x={W / 2} y={810} triggerFrame={impactLocal} tone="danger" size={180} />
      </>
    );
  }

  // ─── stack ───
  if (phase === "stack") {
    const collapse = smooth(clamp01((local - impactLocal * 0.3) / (impactLocal * 0.9 + 1)));
    return (
      <>
        <Header phase={phase} enter={enter} />
        {/* пузыри переписки схлопываются в стопку */}
        {[0, 1, 2, 3, 4].map((i) => {
          const bx = W / 2 - 320 + (i % 2) * 360;
          const by = 400 + i * 70;
          const tx = W / 2 - 56;
          const ty = 560;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: bx + (tx - bx) * collapse,
                top: by + (ty + i * 6 - by) * collapse,
                width: 220 - 108 * collapse,
                height: 46 + (150 - 46) * collapse,
                borderRadius: 14 - 4 * collapse,
                background: `${theme.bg}E8`,
                border: `2px solid ${theme.accent}${collapse > 0.5 ? "AA" : "77"}`,
                opacity: enter,
              }}
            />
          );
        })}
        {/* стрелка на вход */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 760,
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            opacity: enter * reveal,
          }}
        >
          <IconGlyph name="arrow-right" size={44} color={theme.accent} strokeWidth={2} />
          <span style={{ ...mono, fontSize: 24, color: theme.accent }}>ВХОД МОДЕЛИ</span>
        </div>
        <Badge text="ИСТОРИЮ ПОДАЮТ ЦЕЛИКОМ, КАЖДЫЙ РАЗ" tone={theme.accent} opacity={enter} />
        <PulseRing x={W / 2} y={620} triggerFrame={impactLocal} tone="accent" size={170} />
      </>
    );
  }

  // ─── tokens ───
  if (phase === "tokens") {
    const chips: { t: string; c: string; sub: string }[] = [
      { t: "прив", c: theme.accent, sub: "часть слова" },
      { t: "ет", c: theme.accent2, sub: "часть слова" },
      { t: "␣", c: theme.warning, sub: "пробел" },
      { t: ",", c: theme.warning, sub: "запятая" },
    ];
    return (
      <>
        <Header phase={phase} enter={enter} />
        {/* стопка + линейка */}
        <div style={{ position: "absolute", left: W / 2 - 150, top: 360, opacity: enter }}>
          <Sheet x={0} y={0} w={220} h={280} tone={theme.accent} />
          <Sheet x={16} y={16} w={220} h={280} tone={theme.accent} opacity={0.55} />
        </div>
        <div style={{ position: "absolute", left: W / 2 + 110, top: 360, opacity: enter }}>
          <IconGlyph name="ruler" size={40} color={theme.subtext} strokeWidth={1.8} />
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 8,
                top: 60 + i * 26,
                width: i % 2 ? 16 : 28,
                height: 3,
                background: `${theme.subtext}AA`,
              }}
            />
          ))}
          <span style={{ position: "absolute", left: 0, top: 320, ...mono, fontSize: 22, color: theme.accent }}>
            ТОКЕНЫ
          </span>
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 350,
              ...mono,
              fontSize: 20,
              color: theme.subtext,
              textDecoration: "line-through",
            }}
          >
            слова
          </span>
        </div>
        {/* чипы токенов */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 780,
            transform: "translateX(-50%)",
            display: "flex",
            gap: 16,
            opacity: enter * reveal,
          }}
        >
          {chips.map((ch, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  padding: "16px 22px",
                  borderRadius: 12,
                  background: `${ch.c}1E`,
                  border: `2px solid ${ch.c}AA`,
                  color: ch.c,
                  ...mono,
                  fontSize: 34,
                }}
              >
                {ch.t}
              </div>
              <span style={{ ...mono, fontSize: 17, color: theme.subtext }}>{ch.sub}</span>
            </div>
          ))}
        </div>
        <Badge text="1 СЛОВО ≈ НЕСКОЛЬКО ТОКЕНОВ" tone={theme.accent} opacity={enter} y={1090} />
        <PulseRing x={W / 2} y={500} triggerFrame={impactLocal} tone="accent" size={170} />
      </>
    );
  }

  // ─── desk ───
  if (phase === "desk") {
    const drop = 1 - smooth(clamp01((local - impactLocal * 0.2) / (impactLocal * 0.9 + 1)));
    return (
      <>
        <Header phase={phase} enter={enter} />
        <DeskTop enter={enter} />
        {deskSheets(6, { extraTransform: () => `translateY(${-drop * 220}px)` })}
        <Badge text="РАЗМЕР ОКНА ЗАДАН ЖЁСТКО" tone={theme.accent} opacity={enter} />
        <PulseRing x={W / 2} y={DESK.y + DESK.h - 120} triggerFrame={impactLocal} tone="accent" size={180} />
      </>
    );
  }

  // ─── why-big ───
  if (phase === "why-big") {
    const shrink = smooth(clamp01((local - impactLocal) / 18));
    const huge = 240 * (1 - shrink);
    return (
      <>
        <Header phase={phase} enter={enter} />
        <DeskTop enter={enter} huge={huge} />
        {deskSheets(6)}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: DESK.y + 40,
            transform: "translateX(-50%)",
            ...mono,
            fontSize: 120,
            color: theme.subtext,
            opacity: enter * (1 - shrink),
          }}
        >
          ?
        </div>
        <Badge
          text={shrink > 0.5 ? "ОГРОМНЫЙ СТОЛ НЕ БЕСПЛАТЕН" : "СДЕЛАТЬ ОГРОМНЫМ?"}
          tone={shrink > 0.5 ? theme.warning : theme.subtext}
          opacity={enter}
        />
        <PulseRing x={W / 2} y={DESK.y + DESK.h / 2} triggerFrame={impactLocal} tone="warning" size={190} />
      </>
    );
  }

  // ─── evict ───
  if (phase === "evict") {
    const slideIn = smooth(clamp01((local - impactLocal * 0.2) / (impactLocal + 1)));
    const push = after;
    return (
      <>
        <Header phase={phase} enter={enter} />
        <DeskTop enter={enter} />
        {/* листы на столе, сдвигаются влево */}
        {deskSheets(5, {
          extraTransform: (i) => `translateX(${-push * 140}px)`,
          opacity: (i) => (i === 0 ? 1 - push : 1),
        })}
        {/* новый лист въезжает справа */}
        <div
          style={{
            position: "absolute",
            left: DESK.x + DESK.w - 150,
            top: DESK.y + DESK.h - 190,
            transform: `translateX(${(1 - slideIn) * 220}px)`,
          }}
        >
          <Sheet x={0} y={0} tone={theme.success} />
        </div>
        {/* старый лист падает со стола */}
        <div
          style={{
            position: "absolute",
            left: DESK.x - 30,
            top: DESK.y + DESK.h - 190,
            transform: `translate(${-push * 120}px, ${push * 360}px) rotate(${-push * 55}deg)`,
            opacity: 1 - push * 0.4,
          }}
        >
          <Sheet x={0} y={0} tone={theme.danger} />
        </div>
        {/* первый лист уже на полу */}
        <div style={{ position: "absolute", left: DESK.x - 40, top: DESK.y + DESK.h + 120, opacity: enter }}>
          <Sheet x={0} y={0} tone={theme.subtext} rot={-12} opacity={0.55} />
          <span style={{ position: "absolute", left: -6, top: 158, ...mono, fontSize: 18, color: theme.subtext }}>
            НАЧАЛО
          </span>
        </div>
        <Badge text="НАЧАЛА РАЗГОВОРА ПЕРЕД МОДЕЛЬЮ НЕТ" tone={theme.danger} opacity={enter} />
        <PulseRing x={DESK.x} y={DESK.y + DESK.h - 60} triggerFrame={impactLocal} tone="danger" size={170} />
      </>
    );
  }

  // ─── cut ───
  if (phase === "cut") {
    return (
      <>
        <Header phase={phase} enter={enter} />
        <DeskTop enter={enter} />
        {deskSheets(6, {
          tone: (i) => (i < 2 ? theme.danger : theme.accent),
          opacity: (i) => (i < 2 ? 1 - after * 0.7 : 1),
        })}
        <div
          style={{
            position: "absolute",
            left: DESK.x + 20,
            top: DESK.y + DESK.h / 2 - 20,
            opacity: enter,
            transform: `translateX(${after * 18}px)`,
          }}
        >
          <IconGlyph name="scissors" size={56} color={theme.danger} strokeWidth={2} />
        </div>
        <Badge text="ОБРЕЗАЮТ САМЫЕ СТАРЫЕ ЛИСТЫ" tone={theme.danger} opacity={enter} />
        <PulseRing x={DESK.x + 60} y={DESK.y + DESK.h / 2} triggerFrame={impactLocal} tone="danger" size={160} />
      </>
    );
  }

  // ─── summary ───
  if (phase === "summary") {
    const squeeze = after;
    return (
      <>
        <Header phase={phase} enter={enter} />
        <DeskTop enter={enter} />
        {/* свежие листы */}
        {deskSheets(4, { extraTransform: () => `translateX(${squeeze * 40}px)`, tone: () => theme.accent }).slice(2)}
        {/* старая пачка ужимается в один конспект */}
        <div
          style={{
            position: "absolute",
            left: DESK.x + 40,
            top: DESK.y + DESK.h - 190,
            transform: `scaleX(${1 - squeeze * 0.55}) scaleY(${1 - squeeze * 0.35})`,
            transformOrigin: "left bottom",
          }}
        >
          <Sheet x={0} y={0} tone={theme.warning} />
          <Sheet x={14} y={12} tone={theme.warning} opacity={0.5} />
          {squeeze > 0.5 ? (
            <span style={{ position: "absolute", left: 8, top: 160, ...mono, fontSize: 18, color: theme.warning }}>
              ПЕРЕСКАЗ
            </span>
          ) : null}
        </div>
        <Badge text="НАЧАЛО → КОРОТКИЙ КОНСПЕКТ" tone={theme.warning} opacity={enter} />
        <PulseRing x={DESK.x + 90} y={DESK.y + DESK.h - 110} triggerFrame={impactLocal} tone="warning" size={160} />
      </>
    );
  }

  // ─── memory ───
  if (phase === "memory") {
    return (
      <>
        <Header phase={phase} enter={enter} />
        <DeskTop enter={enter} />
        {deskSheets(6)}
        {/* карточка «память о тебе» вне стола */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 150,
            top: DESK.y + DESK.h + 70,
            width: 300,
            padding: "18px 20px",
            borderRadius: 16,
            background: `${theme.success}18`,
            border: `2px solid ${theme.success}AA`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            opacity: enter * reveal,
            boxShadow: `0 0 26px ${theme.success}22`,
          }}
        >
          <IconGlyph name="user" size={34} color={theme.success} strokeWidth={2} />
          <span style={{ ...mono, fontSize: 22, color: theme.success }}>ПАМЯТЬ О ТЕБЕ</span>
        </div>
        <Badge text="ОТДЕЛЬНАЯ ЗАМЕТКА, НЕ В ОКНЕ" tone={theme.success} opacity={enter} />
        <PulseRing x={W / 2} y={DESK.y + DESK.h + 110} triggerFrame={impactLocal} tone="success" size={170} />
      </>
    );
  }

  // ─── finite ───
  const spill = after;
  return (
    <>
      <Header phase={phase} enter={enter} />
      <DeskTop enter={enter} hardEdge />
      {deskSheets(6, { tone: () => theme.danger })}
      {/* пара листов через край */}
      <div
        style={{
          position: "absolute",
          left: DESK.x + DESK.w - 90,
          top: DESK.y + DESK.h - 190,
          transform: `translate(${spill * 90}px, ${spill * 300}px) rotate(${spill * 40}deg)`,
          opacity: 1 - spill * 0.3,
        }}
      >
        <Sheet x={0} y={0} tone={theme.danger} />
      </div>
      <Badge text="ЛЮБОЙ ПРИЁМ УПИРАЕТСЯ В КРАЙ СТОЛА" tone={theme.danger} opacity={enter} />
      <PulseRing x={W / 2} y={DESK.y + DESK.h / 2} triggerFrame={impactLocal} tone="danger" size={200} />
    </>
  );
};

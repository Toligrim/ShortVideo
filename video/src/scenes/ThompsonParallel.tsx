import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const W = layout.width;

/**
 * ThompsonParallel — алгоритм Томпсона: все нити идут параллельно.
 * Показывает NFA-состояния, продвигающиеся по символам без возврата назад.
 *
 * params:
 *   threads  — число параллельных нитей (по умолчанию 4)
 *   symbols  — число символов в строке (по умолчанию 6)
 */
export const ThompsonParallelVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  threads?: number;
  symbols?: number;
}> = ({ local, fps, impactLocal, threads = 4, symbols = 6 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const cx = W / 2;

  const mono: React.CSSProperties = {
    fontFamily: theme.mono,
    fontWeight: 800,
    letterSpacing: 2,
  };

  // строка символов
  const inputStr = "a a a a a a";
  const symW = 120;
  const symH = 64;
  const symGap = 16;
  const symTotal = symbols * symW + (symbols - 1) * symGap;
  const symX0 = cx - symTotal / 2;
  const symY = 380;

  // нити
  const threadH = 40;
  const threadGap = 24;
  const threadTotal = threads * threadH + (threads - 1) * threadGap;
  const threadY0 = 620;

  // прогресс: нити продвигаются по символам
  const stepP = smooth(clamp01(local / Math.max(impactLocal - 10, 1)));
  const activeStep = Math.min(symbols - 1, Math.floor(stepP * symbols));

  // подсветка активного символа
  const symActive = (i: number) => i <= activeStep;

  // каждая нить — на своей позиции, но все двигаются вперёд синхронно
  const threadX = (t: number) => {
    const base = symX0 + activeStep * (symW + symGap);
    const jitter = 8 * Math.sin((local + t * 11) / 10);
    return base + jitter;
  };

  const badgeP = done
    ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } })
    : 0;

  return (
    <>
      {/* заголовок */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 260,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 28,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        АЛГОРИТМ ТОМПСОНА: ВСЕ ПАРАЛЛЕЛЬНО
      </div>

      {/* входная строка */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: symY - 60,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 20,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        СТРОКА
      </div>
      <div style={{ position: "absolute", left: symX0, top: symY, display: "flex", gap: symGap, opacity: enter }}>
        {Array.from({ length: symbols }).map((_, i) => {
          const active = symActive(i);
          const past = i < activeStep;
          return (
            <div
              key={i}
              style={{
                width: symW,
                height: symH,
                borderRadius: 14,
                background: active ? `${theme.accent}22` : theme.panel,
                border: `3px solid ${active ? theme.accent : theme.panelBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: theme.mono,
                fontWeight: 800,
                fontSize: 34,
                color: active ? theme.accent : theme.subtext,
                boxShadow: active && !past ? `0 0 24px ${theme.accent}44` : "none",
              }}
            >
              a
            </div>
          );
        })}
      </div>

      {/* разделитель */}
      <div
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          top: symY + symH + 40,
          height: 3,
          borderRadius: 999,
          background: `linear-gradient(90deg, transparent, ${theme.panelBorder}, transparent)`,
          opacity: enter,
        }}
      />

      {/* нити */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: threadY0 - 50,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 20,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        НИТИ НФА (ОТ ЭН СОСТОЯНИЙ)
      </div>
      <div
        style={{
          position: "absolute",
          left: 80,
          top: threadY0,
          display: "flex",
          flexDirection: "column",
          gap: threadGap,
          opacity: enter,
        }}
      >
        {Array.from({ length: threads }).map((_, t) => {
          const x = threadX(t);
          const hue = t % 2 === 0 ? theme.accent : theme.accent2;
          return (
            <div key={t} style={{ position: "relative", height: threadH }}>
              {/* дорожка-трек */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: threadH / 2 - 2,
                  width: W - 160,
                  height: 4,
                  borderRadius: 999,
                  background: `${hue}22`,
                }}
              />
              {/* текущая позиция нити */}
              <div
                style={{
                  position: "absolute",
                  left: x,
                  top: 0,
                  width: 100,
                  height: threadH,
                  borderRadius: 12,
                  background: hue,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: theme.mono,
                  fontWeight: 800,
                  fontSize: 22,
                  color: "#06121A",
                  boxShadow: `0 0 24px ${hue}66`,
                  transform: `translateX(-50%)`,
                }}
              >
                N{t + 1}
              </div>
            </div>
          );
        })}
      </div>

      {/* стрелка «вперёд, никогда назад» */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: threadY0 + threadTotal + 60,
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          opacity: enter,
        }}
      >
        <IconGlyph name="arrow-right" size={36} color={theme.success} strokeWidth={2.2} />
        <span
          style={{
            fontFamily: theme.font,
            fontWeight: 700,
            fontSize: 28,
            color: theme.success,
          }}
        >
          только вперёд — без возвратов
        </span>
      </div>

      {/* счётчик состояний */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 1180,
          transform: "translateX(-50%)",
          textAlign: "center",
          opacity: enter,
        }}
      >
        <div style={{ ...mono, fontSize: 22, color: theme.subtext }}>СОСТОЯНИЙ НА СИМВОЛ</div>
        <div
          style={{
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 80,
            color: done ? theme.success : theme.text,
            textShadow: done ? `0 0 50px ${theme.success}66` : "none",
          }}
        >
          ≤ O(n)
        </div>
      </div>

      {/* бейдж на импакте */}
      {done ? (
        <>
          <PulseRing x={cx} y={1220} triggerFrame={impactLocal} tone="success" size={320} />
          <div
            style={{
              position: "absolute",
              left: cx,
              top: 1380,
              transform: `translateX(-50%) scale(${badgeP})`,
              opacity: badgeP,
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
              fontSize: 30,
              whiteSpace: "nowrap",
              boxShadow: `0 0 50px ${theme.success}33`,
            }}
          >
            <IconGlyph name="check-circle" size={34} color={theme.success} strokeWidth={2} />
            ЛИНЕЙНОЕ ВРЕМЯ — БЕЗ ЭКСПОНЕНТЫ
          </div>
        </>
      ) : null}
    </>
  );
};

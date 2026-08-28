import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type WifiAirtimePhase = "signal" | "contention" | "backoff" | "airtime" | "anomaly";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: WifiAirtimePhase;
}

const W = layout.width;
const CX = W / 2;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

const TITLE: Record<WifiAirtimePhase, string> = {
  signal: "ПОЛНЫЙ СИГНАЛ — А СТРАНИЦА ПОЛЗЁТ",
  contention: "ОДНА РАЦИЯ НА ВСЮ КОМНАТУ",
  backoff: "СЛУШАЙ ТИШИНУ · ТЯНИ ЖРЕБИЙ",
  airtime: "РАВНЫЕ ХОДЫ, НЕ РАВНОЕ ВРЕМЯ",
  anomaly: "ОДИН МЕДЛЕННЫЙ РОНЯЕТ ВСЕХ",
};
const ICON: Record<WifiAirtimePhase, string> = {
  signal: "wifi",
  contention: "radio",
  backoff: "dice-5",
  airtime: "hourglass",
  anomaly: "chart-column",
};

const Badge: React.FC<{ y: number; text: string; color: string; opacity?: number }> = ({
  y,
  text,
  color,
  opacity = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: y,
      transform: "translateX(-50%)",
      padding: "13px 30px",
      borderRadius: 999,
      background: `${color}18`,
      border: `2px solid ${color}`,
      color,
      fontFamily: theme.mono,
      fontWeight: 800,
      fontSize: 24,
      letterSpacing: 1,
      whiteSpace: "nowrap",
      opacity,
    }}
  >
    {text}
  </div>
);

/** Wi-Fi как общий эфир: полный сигнал но медленно, одна «рация» на всех,
 *  CSMA/CA со случайным откатом и коллизией, равные ходы ≠ равное время,
 *  аномалия 2003 — один медленный клиент роняет пропускную способность всех. */
export const WifiAirtimeVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "signal" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const p = smooth(clamp01(local / Math.max(impactLocal, 1)));
  const hit = local >= impactLocal;
  const post = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 13, mass: 0.7 } }) : 0;
  const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1.5 };

  const header = (
    <div
      style={{
        position: "absolute",
        left: CX,
        top: phase === "anomaly" ? 360 : 240,
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
      <IconGlyph name={ICON[phase]} size={30} color={theme.accent} strokeWidth={1.8} />
      <span>{TITLE[phase]}</span>
    </div>
  );

  /* ─────────────────────────── SIGNAL ─────────────────────────── */
  let body: React.ReactNode = null;
  if (phase === "signal") {
    const phoneTop = 360;
    const phoneW = 460;
    const phoneH = 900;
    const load = 0.05 + 0.13 * p; // страница ползёт: ~5% → ~18%
    const bars = [26, 44, 62, 82];
    const cardTop = phoneTop + 250;
    const cardW = phoneW - 90;
    body = (
      <div style={{ position: "absolute", inset: 0, opacity: enter }}>
        {/* корпус телефона */}
        <div
          style={{
            position: "absolute",
            left: CX,
            top: phoneTop,
            transform: "translateX(-50%)",
            width: phoneW,
            height: phoneH,
            borderRadius: 56,
            background: theme.panel,
            border: `6px solid ${theme.panelBorder}`,
          }}
        />
        {/* сигнал: 4 полные полоски */}
        {bars.map((h, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: CX - 96 + i * 34,
              top: phoneTop + 170 - h,
              width: 24,
              height: h,
              borderRadius: 6,
              background: theme.success,
              boxShadow: `0 0 16px ${theme.success}88`,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: CX,
            top: phoneTop + 185,
            transform: "translateX(-50%)",
            color: theme.success,
            fontSize: 26,
            ...mono,
          }}
        >
          СИГНАЛ 100%
        </div>
        {/* карточка браузера */}
        <div
          style={{
            position: "absolute",
            left: CX,
            top: cardTop,
            transform: "translateX(-50%)",
            width: cardW,
            height: 430,
            borderRadius: 20,
            background: theme.bg,
            border: `3px solid ${theme.panelBorder}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: CX,
            top: cardTop + 40,
            transform: "translateX(-50%)",
            color: theme.subtext,
            fontSize: 22,
            ...mono,
          }}
        >
          сайт открывается…
        </div>
        {/* полоса загрузки */}
        <div
          style={{
            position: "absolute",
            left: CX - (cardW - 60) / 2,
            top: cardTop + 120,
            width: cardW - 60,
            height: 26,
            borderRadius: 13,
            background: theme.panelBorder,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: `${load * 100}%`,
              borderRadius: 13,
              background: theme.warning,
              boxShadow: `0 0 18px ${theme.warning}`,
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: CX,
            top: cardTop + 170,
            transform: "translateX(-50%)",
            color: theme.warning,
            fontSize: 30,
            ...mono,
          }}
        >
          {Math.round(load * 100)}%
        </div>
        {/* спиннер */}
        {[0, 1, 2].map((i) => (
          <div
            key={`d${i}`}
            style={{
              position: "absolute",
              left: CX - 30 + i * 30,
              top: cardTop + 250,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: theme.accent,
              opacity: 0.3 + 0.7 * Math.abs(Math.sin(local / 6 - i * 0.8)),
            }}
          />
        ))}
        {/* лупа детектива */}
        <div
          style={{
            position: "absolute",
            left: CX + 250 + Math.sin(local / 12) * 10,
            top: phoneTop + 60 + Math.cos(local / 10) * 8,
          }}
        >
          <IconGlyph name="search" size={70} color={theme.accent2} strokeWidth={2.2} />
        </div>
        <Badge y={1330} text="ПОЛОСКИ ПОЛНЫЕ · СТРАНИЦА ПОЛЗЁТ" color={theme.warning} opacity={enter} />
      </div>
    );
  }

  /* ─────────────────────────── CONTENTION ─────────────────────────── */
  if (phase === "contention") {
    const routerY = 380;
    const devX = [190, 420, 660, 890];
    const devY = 700;
    const devIcons = ["smartphone", "laptop", "smartphone", "laptop"];
    const holder = 1;
    body = (
      <div style={{ position: "absolute", inset: 0, opacity: enter }}>
        <svg
          width={W}
          height={layout.height}
          viewBox={`0 0 ${W} ${layout.height}`}
          style={{ position: "absolute", inset: 0, overflow: "visible" }}
        >
          {devX.map((x, i) => (
            <line
              key={i}
              x1={CX}
              y1={routerY + 60}
              x2={x}
              y2={devY - 50}
              stroke={i === holder ? theme.accent : theme.panelBorder}
              strokeWidth={i === holder ? 4 : 2}
              strokeDasharray={i === holder ? undefined : "8 10"}
            />
          ))}
        </svg>
        {/* роутер */}
        <div style={{ position: "absolute", left: CX, top: routerY, transform: "translate(-50%,-50%)" }}>
          <IconGlyph name="router" size={96} color={theme.accent} strokeWidth={1.8} />
        </div>
        <div
          style={{
            position: "absolute",
            left: CX,
            top: routerY + 66,
            transform: "translateX(-50%)",
            color: theme.subtext,
            fontSize: 22,
            ...mono,
          }}
        >
          РОУТЕР
        </div>
        {/* устройства */}
        {devX.map((x, i) => {
          const isHolder = i === holder;
          return (
            <div key={i}>
              <div style={{ position: "absolute", left: x, top: devY, transform: "translate(-50%,-50%)" }}>
                <IconGlyph
                  name={devIcons[i]}
                  size={78}
                  color={isHolder ? theme.accent : theme.text}
                  strokeWidth={1.8}
                />
              </div>
              {isHolder ? (
                <>
                  <div
                    style={{ position: "absolute", left: x, top: devY - 120, transform: "translate(-50%,-50%)" }}
                  >
                    <IconGlyph name="radio" size={54} color={theme.accent} strokeWidth={2} />
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      left: x + 70,
                      top: devY - 120,
                      transform: "translateY(-50%)",
                      color: theme.accent,
                      fontSize: 30,
                      ...mono,
                    }}
                  >
                    «…»
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{ position: "absolute", left: x, top: devY - 110, transform: "translate(-50%,-50%)" }}
                  >
                    <IconGlyph name="hand" size={40} color={theme.subtext} strokeWidth={2} />
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      left: x,
                      top: devY + 74,
                      transform: "translateX(-50%)",
                      color: theme.success,
                      fontSize: 19,
                      ...mono,
                    }}
                  >
                    полоски 100%
                  </div>
                  {hit ? (
                    <div
                      style={{
                        position: "absolute",
                        left: x,
                        top: devY + 108,
                        transform: "translateX(-50%)",
                        padding: "4px 14px",
                        borderRadius: 999,
                        border: `2px solid ${theme.warning}`,
                        color: theme.warning,
                        fontSize: 18,
                        opacity: post,
                        ...mono,
                      }}
                    >
                      ОЧЕРЕДЬ
                    </div>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
        <Badge y={1010} text="ГОВОРИТ ОДИН · ОСТАЛЬНЫЕ ЖДУТ" color={theme.accent} opacity={enter} />
        {hit ? (
          <Badge y={1330} text="ПОЛНЫЕ ПОЛОСКИ НЕ ОТМЕНЯЮТ ОЧЕРЕДЬ" color={theme.warning} opacity={post} />
        ) : null}
        {hit ? <PulseRing x={devX[holder]} y={devY} triggerFrame={impactLocal} tone="accent" size={190} /> : null}
      </div>
    );
  }

  /* ─────────────────────────── BACKOFF ─────────────────────────── */
  if (phase === "backoff") {
    const trackLeft = 150;
    const trackW = 800;
    const ticks = 10;
    const gap = trackW / (ticks - 1);
    const pick = 4; // оба тянут одинаковый жребий
    const rows = [
      { y: 560, label: "устройство A", dieY: 486 },
      { y: 800, label: "устройство B", dieY: 726 },
    ];
    const walked = clamp01(local / Math.max(impactLocal, 1));
    const collideX = trackLeft + gap * pick;
    body = (
      <div style={{ position: "absolute", inset: 0, opacity: enter }}>
        <div
          style={{
            position: "absolute",
            left: CX,
            top: 410,
            transform: "translateX(-50%)",
            color: theme.subtext,
            fontSize: 21,
            ...mono,
          }}
        >
          ПУСТЫЕ СЛОТЫ ЭФИРА
        </div>
        {rows.map((row, ri) => {
          const consumed = Math.min(pick, Math.round(walked * pick));
          const tokenX = trackLeft + gap * Math.min(pick, walked * pick);
          return (
            <div key={ri}>
              {/* дорожка */}
              <div
                style={{
                  position: "absolute",
                  left: trackLeft,
                  top: row.y,
                  width: trackW,
                  height: 4,
                  background: theme.panelBorder,
                }}
              />
              {Array.from({ length: ticks }).map((_, t) => (
                <div
                  key={t}
                  style={{
                    position: "absolute",
                    left: trackLeft + t * gap,
                    top: row.y - 16,
                    width: 4,
                    height: 32,
                    transform: "translateX(-50%)",
                    background: t < consumed ? theme.warning : theme.panelBorder,
                    boxShadow: t < consumed ? `0 0 10px ${theme.warning}` : undefined,
                  }}
                />
              ))}
              {/* кубик со жребием = 4 */}
              <div style={{ position: "absolute", left: 70, top: row.dieY }}>
                <IconGlyph name="dice-5" size={58} color={theme.accent} strokeWidth={1.8} />
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 70,
                  top: row.dieY + 60,
                  color: theme.accent,
                  fontSize: 20,
                  ...mono,
                }}
              >
                жду 4
              </div>
              {/* токен-«ухо», слушает и идёт по слотам */}
              {walked <= 0.97 ? (
                <div
                  style={{
                    position: "absolute",
                    left: tokenX,
                    top: row.y - 52,
                    transform: "translateX(-50%)",
                  }}
                >
                  <IconGlyph name="ear" size={40} color={theme.text} strokeWidth={2} />
                </div>
              ) : null}
              {/* залп передачи по достижении слота 4 */}
              {walked > 0.97 ? (
                <div
                  style={{
                    position: "absolute",
                    left: collideX,
                    top: row.y - 8,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    transform: "translate(-50%,-50%)",
                    background: theme.danger,
                    boxShadow: `0 0 24px ${theme.danger}`,
                  }}
                />
              ) : null}
            </div>
          );
        })}
        {/* коллизия между дорожками */}
        {hit ? (
          <>
            <div
              style={{
                position: "absolute",
                left: collideX,
                top: 660,
                transform: "translate(-50%,-50%)",
                fontSize: 96,
                lineHeight: 1,
                color: theme.danger,
                fontFamily: theme.mono,
                fontWeight: 900,
                textShadow: `0 0 24px ${theme.danger}`,
                opacity: post,
              }}
            >
              ✳
            </div>
            <div
              style={{
                position: "absolute",
                left: collideX,
                top: 620,
                transform: "translateX(-50%)",
                color: theme.danger,
                fontSize: 20,
                whiteSpace: "nowrap",
                opacity: post,
                ...mono,
              }}
            >
              нет квитанции
            </div>
          </>
        ) : null}
        {/* окно конкуренции удваивается */}
        {hit ? (
          <div
            style={{
              position: "absolute",
              left: CX,
              top: 1010,
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 16,
              color: theme.text,
              fontSize: 26,
              opacity: post,
              ...mono,
            }}
          >
            <span>0–15</span>
            <IconGlyph name="arrow-right" size={34} color={theme.danger} />
            <span style={{ color: theme.danger }}>0–31</span>
          </div>
        ) : null}
        <Badge y={1230} text="ТИШИНА → ЖРЕБИЙ 0–15 СЛОТОВ" color={theme.accent} opacity={enter} />
        {hit ? (
          <Badge y={1330} text="СОВПАЛО · НЕТ ОТВЕТА · ОКНО ×2" color={theme.danger} opacity={post} />
        ) : null}
      </div>
    );
  }

  /* ─────────────────────────── AIRTIME ─────────────────────────── */
  if (phase === "airtime") {
    const hgY = 380;
    const devX = [180, 420, 660, 900];
    const devY = 580;
    const devIcons = ["smartphone", "smartphone", "laptop", "laptop"];
    const weak = 3;
    const barLeft = 170;
    const barTop = 720;
    const barGap = 96;
    const barH = 48;
    const rowLabel = ["телефон", "телефон", "ноутбук", "дальний ноут"];
    body = (
      <div style={{ position: "absolute", inset: 0, opacity: enter }}>
        {/* песочные часы раздают ходы */}
        <div style={{ position: "absolute", left: CX, top: hgY, transform: "translate(-50%,-50%)" }}>
          <IconGlyph name="hourglass" size={84} color={theme.accent} strokeWidth={1.8} />
        </div>
        <div
          style={{
            position: "absolute",
            left: CX,
            top: hgY + 60,
            transform: "translateX(-50%)",
            color: theme.subtext,
            fontSize: 21,
            ...mono,
          }}
        >
          ПО ОДНОМУ ХОДУ КАЖДОМУ
        </div>
        {/* устройства + одинаковый талон «ХОД» */}
        {devX.map((x, i) => (
          <div key={i}>
            <div style={{ position: "absolute", left: x, top: devY, transform: "translate(-50%,-50%)" }}>
              <IconGlyph
                name={devIcons[i]}
                size={70}
                color={i === weak ? theme.warning : theme.text}
                strokeWidth={1.8}
              />
            </div>
            <div
              style={{
                position: "absolute",
                left: x,
                top: devY - 82,
                transform: "translate(-50%,-50%)",
                padding: "5px 14px",
                borderRadius: 8,
                border: `2px solid ${theme.accent}`,
                color: theme.accent,
                fontSize: 18,
                ...mono,
              }}
            >
              ХОД
            </div>
          </div>
        ))}
        {/* полосы эфирного времени */}
        {rowLabel.map((lab, i) => {
          const isWeak = i === weak;
          const wBar = isWeak ? interpolate(p, [0, 1], [130, 620], { extrapolateRight: "clamp" }) : 130;
          const col = isWeak ? theme.warning : theme.accent;
          return (
            <div key={i}>
              <div
                style={{
                  position: "absolute",
                  left: barLeft - 6,
                  top: barTop + i * barGap - 26,
                  color: theme.subtext,
                  fontSize: 18,
                  ...mono,
                }}
              >
                {lab}
              </div>
              <div
                style={{
                  position: "absolute",
                  left: barLeft,
                  top: barTop + i * barGap,
                  width: wBar,
                  height: barH,
                  borderRadius: 10,
                  background: col,
                  boxShadow: `0 0 20px ${col}77`,
                }}
              />
              {isWeak ? (
                <div
                  style={{
                    position: "absolute",
                    left: barLeft + wBar + 16,
                    top: barTop + i * barGap + barH / 2,
                    transform: "translateY(-50%)",
                    color: theme.warning,
                    fontSize: 18,
                    whiteSpace: "nowrap",
                    ...mono,
                  }}
                >
                  тихая связь → длинная реплика
                </div>
              ) : null}
            </div>
          );
        })}
        <Badge y={1210} text="РАВНОЕ ЧИСЛО ХОДОВ" color={theme.accent} opacity={enter} />
        {hit ? (
          <Badge y={1310} text="СЛАБЫЙ ДЕРЖИТ ЭФИР ДОЛЬШЕ" color={theme.warning} opacity={post} />
        ) : null}
      </div>
    );
  }

  /* ─────────────────────────── ANOMALY ─────────────────────────── */
  if (phase === "anomaly") {
    const baseY = 1180;
    const barW = 120;
    const gapX = 60;
    const groupLeft = (W - (4 * barW + 3 * gapX)) / 2;
    const fastFull = 520;
    const slowH = 60;
    const labels = ["быстрый", "быстрый", "у роутера", "медленный"];
    const slowLevelY = baseY - slowH - 24;
    const enterSlow = clamp01(local / Math.max(impactLocal * 0.55, 1));
    body = (
      <div style={{ position: "absolute", inset: 0, opacity: enter }}>
        <div
          style={{
            position: "absolute",
            left: CX,
            top: 320,
            transform: "translateX(-50%)",
            color: theme.subtext,
            fontSize: 22,
            ...mono,
          }}
        >
          ИЗМЕРЕНО · 2003 · Мбит/с
        </div>
        {/* ось */}
        <div
          style={{
            position: "absolute",
            left: groupLeft - 30,
            top: baseY,
            width: 4 * barW + 3 * gapX + 60,
            height: 4,
            background: theme.panelBorder,
          }}
        />
        {/* пунктир уровня медленного */}
        <div
          style={{
            position: "absolute",
            left: groupLeft - 30,
            top: slowLevelY,
            width: 4 * barW + 3 * gapX + 60,
            height: 0,
            borderTop: `3px dashed ${theme.danger}`,
            opacity: 0.8,
          }}
        />
        {labels.map((lab, i) => {
          const isSlow = i === 3;
          let h: number;
          if (isSlow) h = slowH * enterSlow;
          else h = hit ? interpolate(post, [0, 1], [fastFull, 46], { extrapolateRight: "clamp" }) : fastFull;
          const x = groupLeft + i * (barW + gapX);
          const col = isSlow ? theme.danger : hit ? theme.danger : theme.success;
          return (
            <div key={i}>
              <div
                style={{
                  position: "absolute",
                  left: x,
                  top: baseY - h,
                  width: barW,
                  height: h,
                  borderRadius: "8px 8px 0 0",
                  background: col,
                  boxShadow: `0 0 20px ${col}66`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: x + barW / 2,
                  top: baseY - h - 34,
                  transform: "translateX(-50%)",
                  color: col,
                  fontSize: 22,
                  ...mono,
                }}
              >
                {isSlow ? "1" : hit ? "<1" : "11"}
              </div>
              <div
                style={{
                  position: "absolute",
                  left: x + barW / 2,
                  top: baseY + 16,
                  transform: "translateX(-50%)",
                  color: theme.subtext,
                  fontSize: 19,
                  whiteSpace: "nowrap",
                  ...mono,
                }}
              >
                {lab}
              </div>
            </div>
          );
        })}
        <Badge y={1250} text="МЕДЛЕННЫЙ КЛИЕНТ ВХОДИТ В СЕТЬ" color={theme.warning} opacity={enter} />
        {hit ? (
          <Badge y={1330} text="ВСЕ ПРОВАЛИЛИСЬ НИЖЕ 1 Мбит/с" color={theme.danger} opacity={post} />
        ) : null}
      </div>
    );
  }

  return (
    <>
      {header}
      {body}
    </>
  );
};

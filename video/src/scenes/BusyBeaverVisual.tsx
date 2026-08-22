import React from "react";
import { random, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

const W = layout.width;
const CX = W / 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
};

// BB(5) = 47 176 870 шагов, 4098 единиц — канонический рекорд
const TARGET_STEPS = 47176870;
const fmt = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export const BusyBeaverVisual: React.FC<Props> = ({ local, fps, impactLocal }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const haltP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;

  // --- счётчик шагов: бежит всё время бита, на импакте фиксируется на максимуме
  const counterT = smooth(clamp01(local / Math.max(impactLocal, 1)));
  // квадратичный разгон: счётчик ускоряется к концу
  const easedT = 1 - Math.pow(1 - counterT, 2.2);
  const steps = Math.round(easedT * TARGET_STEPS);

  // --- состояния A–E + HALT
  const states = ["A", "B", "C", "D", "E"] as const;
  // до импакта циклично перебираем A→E, после — HALT
  const stateIdx = done ? 5 : Math.floor(local / 11) % 5;
  const stateName = done ? "HALT" : states[stateIdx];

  // --- лента: вертикальная, головка фиксирована в центре, лента движется
  const CELL_H = 84;
  const CELL_GAP = 10;
  const CELL_W = 360;
  const VISIBLE = 7; // нечётное, центр — головка
  const HALF = Math.floor(VISIBLE / 2);
  const tapeLen = 31;
  // детерминированные биты «после прогона» — много единиц вокруг центра
  const baseBits = Array.from({ length: tapeLen }, (_, i) => {
    const dist = Math.abs(i - Math.floor(tapeLen / 2));
    // ближе к центру плотнее единицы (BB оставляет плотный блок)
    if (dist < 3) return 1;
    if (dist < 6) return random(`bb${i}`) > 0.28 ? 1 : 0;
    if (dist < 10) return random(`bb${i}`) > 0.5 ? 1 : 0;
    return random(`bb${i}`) > 0.62 ? 1 : 0;
  });

  // лента «оживает» постепенно: биты проявляются как будто машина их пишет
  const tapeReveal = (idx: number) => smooth(clamp01((local - idx * 1.6) / 22));

  // головка «пишет» текущий бит: вспышка при смене состояния
  const writePulse = Math.exp(-((local % 11) * 0.35));

  // смещение ленты: головка движется вверх/вниз на ±1 клетку каждый такт
  // симулируем движение ленты под неподвижной головкой
  const headOffset = Math.round(Math.sin(local / 9) * 1.2 + Math.sin(local / 13 + 2) * 0.9);
  const tapeShift = headOffset * (CELL_H + CELL_GAP) * 0.55;
  const drift = tapeShift * 0.35;

  // позиция головки на экране
  const headY = 820;
  const tapeTop = headY - HALF * (CELL_H + CELL_GAP) - CELL_H / 2;

  // центральный индекс ленты
  const centerIdx = Math.floor(tapeLen / 2);
  // видимые индексы ленты (сдвинутые headOffset)
  const visibleIdx = Array.from({ length: VISIBLE }, (_, k) => centerIdx + (k - HALF) - headOffset);

  return (
    <div style={{ position: "absolute", inset: 0, width: W, height: 1920, overflow: "hidden", fontFamily: theme.font }}>
      {/* заголовок */}
      <div
        style={{
          position: "absolute",
          left: CX,
          top: 230,
          transform: "translateX(-50%)",
          textAlign: "center",
          opacity: enter,
        }}
      >
        <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 27, letterSpacing: 3, color: theme.subtext }}>
          BUSY BEAVER · 5 СОСТОЯНИЙ
        </div>
        <div
          style={{
            marginTop: 10,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 18px",
            borderRadius: 999,
            background: `${done ? theme.success : theme.warning}14`,
            border: `2px solid ${done ? theme.success : theme.warning}66`,
            color: done ? theme.success : theme.warning,
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 22,
          }}
        >
          <IconGlyph name={done ? "octagon-pause" : "cog"} size={22} color={done ? theme.success : theme.warning} strokeWidth={2} />
          {done ? "HALT · МАКСИМУМ ДОСТИГНУТ" : `СОСТОЯНИЕ ${stateName} · ШАГ ${fmt(steps)}`}
        </div>
      </div>

      {/* ряд состояний A–E */}
      <div
        style={{
          position: "absolute",
          left: CX,
          top: 380,
          transform: "translateX(-50%)",
          display: "flex",
          gap: 18,
          opacity: enter,
        }}
      >
        {states.map((s, i) => {
          const active = !done && i === stateIdx;
          const finished = done;
          const bg = finished ? `${theme.subtext}14` : active ? `${theme.accent}1A` : `${theme.panel}DD`;
          const border = finished ? theme.panelBorder : active ? theme.accent : theme.panelBorder;
          const color = finished ? theme.subtext : active ? theme.accent : theme.subtext;
          const scale = active ? 1 + 0.06 * Math.sin(local / 6) : 1;
          return (
            <div
              key={s}
              style={{
                width: 94,
                height: 94,
                borderRadius: 20,
                background: bg,
                border: `3px solid ${border}`,
                boxShadow: active ? `0 0 32px ${theme.accent}55` : "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                transform: `scale(${scale})`,
                opacity: finished ? 0.55 : 1,
              }}
            >
              <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 36, color, lineHeight: 1 }}>{s}</div>
              <div style={{ fontFamily: theme.mono, fontSize: 16, color, opacity: 0.7, marginTop: 2 }}>{active ? "●" : "○"}</div>
            </div>
          );
        })}
        {/* HALT бейдж */}
        <div
          style={{
            width: 94,
            height: 94,
            borderRadius: 20,
            background: done ? `${theme.success}1A` : `${theme.panel}99`,
            border: `3px solid ${done ? theme.success : theme.panelBorder}`,
            boxShadow: done ? `0 0 36px ${theme.success}66` : "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${done ? haltP : 1})`,
            opacity: done ? 1 : 0.45,
          }}
        >
          <IconGlyph name={done ? "octagon-pause" : "pause"} size={36} color={done ? theme.success : theme.subtext} strokeWidth={1.8} />
          <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 15, color: done ? theme.success : theme.subtext, marginTop: 4 }}>
            HALT
          </div>
        </div>
      </div>

      {/* направляющая ленты */}
      <div
        style={{
          position: "absolute",
          left: CX - 2,
          top: tapeTop - 40,
          width: 4,
          height: VISIBLE * (CELL_H + CELL_GAP) + 80,
          background: `linear-gradient(180deg, transparent, ${theme.panelBorder}66, transparent)`,
          opacity: enter * 0.7,
        }}
      />

      {/* клетки ленты */}
      <div
        style={{
          position: "absolute",
          left: CX - CELL_W / 2,
          top: tapeTop,
          width: CELL_W,
          opacity: enter,
          transform: `translateY(${drift}px)`,
        }}
      >
        {visibleIdx.map((tapeIdx, k) => {
          const bit = baseBits[tapeIdx] ?? 0;
          const isHead = k === HALF;
          const r = tapeReveal(k + Math.abs(headOffset));
          const active = isHead && !done;
          // головка подсвечивает текущую клетку
          const border = isHead
            ? done
              ? theme.success
              : theme.accent
            : bit
              ? `${theme.accent}66`
              : theme.panelBorder;
          const bg = isHead
            ? done
              ? `${theme.success}18`
              : `${theme.accent}14`
            : bit
              ? `${theme.accent}12`
              : theme.panel;
          const bitColor = bit ? theme.accent : theme.subtext;
          const glow = isHead && writePulse > 0.5 ? `0 0 28px ${theme.accent}66` : bit ? `0 0 18px ${theme.accent}22` : "none";
          return (
            <div
              key={k}
              style={{
                position: "absolute",
                left: 0,
                top: k * (CELL_H + CELL_GAP),
                width: CELL_W,
                height: CELL_H,
                borderRadius: 18,
                border: `3px solid ${border}`,
                background: bg,
                boxShadow: glow,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 28px",
                transform: `scale(${0.88 + 0.12 * r}) translateX(${(1 - r) * 18}px)`,
                opacity: r,
              }}
            >
              <span style={{ fontFamily: theme.mono, fontSize: 22, color: theme.subtext, letterSpacing: 1 }}>ячейка {tapeIdx - centerIdx >= 0 ? `+${tapeIdx - centerIdx}` : `${tapeIdx - centerIdx}`}</span>
              <span
                style={{
                  fontFamily: theme.mono,
                  fontWeight: 800,
                  fontSize: 54,
                  color: isHead && !done && writePulse > 0.6 ? theme.warning : bitColor,
                  textShadow: bit ? `0 0 16px ${bitColor}55` : "none",
                  transform: active ? `scale(${1 + 0.08 * Math.sin(local / 3)})` : undefined,
                }}
              >
                {bit}
              </span>
              <span style={{ width: 22, height: 22, borderRadius: 11, background: bit ? theme.accent : theme.panelBorder, opacity: bit ? 1 : 0.3, boxShadow: bit ? `0 0 12px ${theme.accent}88` : "none" }} />
            </div>
          );
        })}
      </div>

      {/* головка */}
      <div
        style={{
          position: "absolute",
          left: CX + CELL_W / 2 + 18,
          top: headY + CELL_H / 2,
          transform: "translateY(-50%)",
          opacity: enter,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px 14px 14px",
            borderRadius: 18,
            background: done ? theme.success : theme.accent,
            boxShadow: `0 0 ${done ? 50 : 36}px ${done ? theme.success : theme.accent}88`,
            transform: `scale(${0.92 + 0.08 * enter})`,
          }}
        >
          <div style={{ width: 0, height: 0, borderTop: "14px solid transparent", borderBottom: "14px solid transparent", borderRight: `18px solid ${done ? "#06121A" : "#06121A"}`, marginLeft: -6 }} />
          <IconGlyph name={done ? "octagon-pause" : "scan"} size={36} color="#06121A" strokeWidth={1.9} />
          <span style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 26, color: "#06121A" }}>{done ? "HALT" : stateName}</span>
        </div>
        <div
          style={{
            marginTop: 10,
            textAlign: "center",
            fontFamily: theme.mono,
            fontSize: 18,
            color: done ? theme.success : theme.accent,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          ◀ ГОЛОВКА
        </div>
      </div>

      {/* луч-сканер на текущей клетке (до HALT) */}
      {!done ? (
        <div
          style={{
            position: "absolute",
            left: CX - CELL_W / 2,
            top: headY,
            width: CELL_W,
            height: CELL_H,
            borderRadius: 18,
            border: `2px dashed ${theme.accent}88`,
            opacity: 0.35 + 0.2 * Math.sin(local / 5),
            pointerEvents: "none",
          }}
        />
      ) : null}

      {done ? <PulseRing x={CX} y={headY + CELL_H / 2} triggerFrame={impactLocal} tone="success" size={420} /> : null}

      {/* счётчик шагов + легенда */}
      <div
        style={{
          position: "absolute",
          left: CX,
          top: 1190,
          transform: "translateX(-50%)",
          textAlign: "center",
          opacity: enter,
        }}
      >
        <div style={{ fontFamily: theme.mono, fontSize: 24, letterSpacing: 3, color: theme.subtext }}>ШАГОВ ВЫПОЛНЕНО</div>
        <div
          style={{
            marginTop: 8,
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 62,
            color: done ? theme.success : theme.text,
            textShadow: done ? `0 0 32px ${theme.success}66` : `0 0 24px ${theme.accent}33`,
            letterSpacing: 2,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {fmt(steps)}
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 14, justifyContent: "center", opacity: enter }}>
          <span style={{ padding: "8px 16px", borderRadius: 999, background: `${theme.accent}12`, border: `2px solid ${theme.accent}55`, color: theme.accent, fontFamily: theme.mono, fontWeight: 800, fontSize: 20 }}>
            0 → пусто
          </span>
          <span style={{ padding: "8px 16px", borderRadius: 999, background: `${theme.accent}22`, border: `2px solid ${theme.accent}`, color: theme.text, fontFamily: theme.mono, fontWeight: 800, fontSize: 20 }}>
            1 → закрашено
          </span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: CX,
        top: 1410,
          transform: "translateX(-50%)",
          fontFamily: theme.mono,
          fontSize: 20,
          letterSpacing: 1.5,
          color: theme.subtext,
          opacity: enter * (done ? haltP : 0.85),
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        {done ? "Σ(5)=4098 единиц · S(5)=47 176 870 шагов · дальше — недоказуемо" : "пишет единицу → сдвигается → меняет состояние"}
      </div>

      {/* прогресс-бар шагов */}
      <div
        style={{
          position: "absolute",
          left: CX - 260,
          top: 1470,
          width: 520,
          height: 8,
          borderRadius: 999,
          background: theme.panelBorder,
          overflow: "hidden",
          opacity: enter,
        }}
      >
        <div style={{ width: `${easedT * 100}%`, height: "100%", background: done ? theme.success : theme.accent, borderRadius: 999, boxShadow: `0 0 12px ${done ? theme.success : theme.accent}` }} />
      </div>
    </div>
  );
};

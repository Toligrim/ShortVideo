import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type CapacitiveTouchPhase = "grid" | "scan" | "touch" | "glove";

const W = layout.width;

const COLS = 7;
const ROWS = 9;
const GRID_LEFT = 200;
const GRID_RIGHT = 880;
const GRID_TOP = 420;
const GRID_BOTTOM = 1080;
const DX = (GRID_RIGHT - GRID_LEFT) / (COLS - 1);
const DY = (GRID_BOTTOM - GRID_TOP) / (ROWS - 1);

const nodeX = (c: number) => GRID_LEFT + c * DX;
const nodeY = (r: number) => GRID_TOP + r * DY;

const TOUCH_C = 3;
const TOUCH_R = 4;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Проецированный ёмкостный тачскрин: сетка электродов, сканирование, падение
 *  взаимной ёмкости у узла под пальцем, экранирование перчаткой. */
export const CapacitiveTouchVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: CapacitiveTouchPhase;
}> = ({ local, fps, impactLocal, phase = "grid" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };
  const tx = nodeX(TOUCH_C);
  const ty = nodeY(TOUCH_R);

  const phaseTitle: Record<CapacitiveTouchPhase, string> = {
    grid: "СЕТКА ЭЛЕКТРОДОВ ПОД СТЕКЛОМ",
    scan: "КОНТРОЛЛЕР ОПРАШИВАЕТ УЗЛЫ",
    touch: "ПАЛЕЦ ОТТЯГИВАЕТ ПОЛЕ",
    glove: "ПЕРЧАТКА ЭКРАНИРУЕТ ПОЛЕ",
  };
  const header = (
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
        fontSize: 25,
        whiteSpace: "nowrap",
        opacity: enter,
        ...mono,
      }}
    >
      <IconGlyph name="grid-3x3" size={30} color={theme.accent} strokeWidth={1.8} />
      <span>{phaseTitle[phase]}</span>
    </div>
  );

  /* сама сетка: строки (accent) + столбцы (accent2) + узлы-перекрёстки */
  const grid = (
    <div style={{ position: "absolute", left: 0, top: 0, opacity: enter }} key="grid">
      {Array.from({ length: ROWS }).map((_, r) => (
        <div
          key={`row${r}`}
          style={{
            position: "absolute",
            left: GRID_LEFT - 30,
            top: nodeY(r),
            width: (GRID_RIGHT - GRID_LEFT) + 60,
            height: 3,
            background: `${theme.accent}55`,
            transform: "translateY(-50%)",
          }}
        />
      ))}
      {Array.from({ length: COLS }).map((_, c) => (
        <div
          key={`col${c}`}
          style={{
            position: "absolute",
            left: nodeX(c),
            top: GRID_TOP - 30,
            height: (GRID_BOTTOM - GRID_TOP) + 60,
            width: 3,
            background: `${theme.accent2}55`,
            transform: "translateX(-50%)",
          }}
        />
      ))}
      {Array.from({ length: ROWS }).map((_, r) =>
        Array.from({ length: COLS }).map((_, c) => {
          const isTouch = c === TOUCH_C && r === TOUCH_R;
          return (
            <div
              key={`n${r}-${c}`}
              style={{
                position: "absolute",
                left: nodeX(c),
                top: nodeY(r),
                width: 16,
                height: 16,
                borderRadius: "50%",
                transform: "translate(-50%, -50%)",
                background: isTouch ? theme.warning : theme.text,
                boxShadow: `0 0 12px ${isTouch ? theme.warning : theme.text}55`,
              }}
            />
          );
        })
      )}
    </div>
  );

  const glass = (
    <div style={{ position: "absolute", left: 0, top: 0, opacity: enter }} key="glass">
      <div
        style={{
          position: "absolute",
          left: GRID_LEFT - 60,
          top: GRID_TOP - 70,
          width: GRID_RIGHT - GRID_LEFT + 120,
          height: 40,
          borderRadius: 10,
          background: "rgba(180,200,230,0.10)",
          border: `2px solid rgba(180,200,230,0.3)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: GRID_TOP - 96,
          transform: "translateX(-50%)",
          color: theme.subtext,
          fontFamily: theme.mono,
          fontSize: 20,
          whiteSpace: "nowrap",
        }}
      >
        СТЕКЛО · не проводит
      </div>
    </div>
  );

  /* сканирование: яркая строка бежит сверху вниз, узлы вспыхивают */
  let scanEl: React.ReactNode = null;
  if (phase === "scan") {
    const p = smooth(clamp01(local / Math.max(impactLocal, 1)));
    const activeRow = Math.round(p * (ROWS - 1));
    scanEl = (
      <>
        <div
          style={{
            position: "absolute",
            left: GRID_LEFT - 40,
            top: nodeY(0),
            width: GRID_RIGHT - GRID_LEFT + 80,
            height: DY,
            transform: `translateY(${p * (GRID_BOTTOM - GRID_TOP) - DY / 2}px)`,
            background: `${theme.accent}22`,
            borderTop: `3px solid ${theme.accent}`,
            borderBottom: `3px solid ${theme.accent}`,
            borderRadius: 6,
            opacity: enter,
          }}
        />
        {Array.from({ length: COLS }).map((_, c) => {
          const lit = c === TOUCH_C ? 0.5 : 1;
          return (
            <div
              key={`spark${c}`}
              style={{
                position: "absolute",
                left: nodeX(c),
                top: nodeY(activeRow),
                width: 26,
                height: 26,
                borderRadius: "50%",
                transform: "translate(-50%, -50%)",
                background: theme.accent,
                boxShadow: `0 0 26px ${theme.accent}`,
                opacity: enter * lit,
              }}
            />
          );
        })}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1190,
            transform: "translateX(-50%)",
            padding: "14px 30px",
            borderRadius: 999,
            background: `${theme.accent}16`,
            border: `2px solid ${theme.accent}88`,
            color: theme.accent,
            fontFamily: theme.mono,
            fontSize: 25,
            fontWeight: 800,
            whiteSpace: "nowrap",
            opacity: enter,
          }}
        >
          ВЗАИМНАЯ ЁМКОСТЬ В КАЖДОМ УЗЛЕ
        </div>
      </>
    );
  }

  /* касание пальцем: поле оттягивается к земле, заряд в узле падает */
  let touchEl: React.ReactNode = null;
  if (phase === "touch" || phase === "glove") {
    const p = smooth(clamp01(local / Math.max(impactLocal, 1)));
    const blocked = phase === "glove";
    const fingerY = 150 + p * (ty - 130 - 150); // опускается к стеклу
    const dropP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 13, mass: 0.7 } });
    const charge = blocked ? 1 : 1 - 0.7 * dropP; // у перчатки заряд не падает
    // поле-линии от узла к пальцу (земля)
    const lineOpacity = blocked ? 0.12 : 0.85 - 0.4 * dropP;
    const fieldLines = Array.from({ length: 5 }).map((_, i) => {
      const sx = tx + (i - 2) * 26;
      const ex = tx + (i - 2) * 8;
      return (
        <path
          key={i}
          d={`M ${sx} ${ty} Q ${sx + (ex - sx) * 0.5} ${(ty + fingerY) / 2} ${ex} ${fingerY}`}
          fill="none"
          stroke={blocked ? theme.warning : theme.danger}
          strokeWidth="3"
          strokeDasharray={blocked ? "8 10" : undefined}
          opacity={lineOpacity}
        />
      );
    });
    touchEl = (
      <>
        <svg width={W} height={layout.height} viewBox={`0 0 ${W} ${layout.height}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {fieldLines}
        </svg>
        {/* палец / перчатка */}
        <div
          style={{
            position: "absolute",
            left: tx,
            top: fingerY,
            transform: "translate(-50%, -50%)",
            width: 150,
            height: 200,
            borderRadius: "70px 70px 60px 60px",
            background: blocked ? "#3A3550" : "#E7B89A",
            border: `4px solid ${blocked ? theme.warning : "rgba(0,0,0,0.2)"}`,
            boxShadow: `0 0 50px ${blocked ? theme.warning : theme.danger}44`,
            opacity: enter,
          }}
        />
        {/* узел касания: заряд падает */}
        <div
          style={{
            position: "absolute",
            left: tx,
            top: ty,
            width: 44,
            height: 44,
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            background: blocked ? theme.text : theme.danger,
            boxShadow: `0 0 ${20 + (1 - charge) * 40}px ${blocked ? theme.text : theme.danger}`,
            opacity: enter,
          }}
        />
        {/* столбик заряда у узла */}
        <div
          style={{
            position: "absolute",
            left: tx + 70,
            top: ty - 90,
            width: 22,
            height: 180,
            borderRadius: 11,
            background: theme.panelBorder,
            opacity: enter,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              width: "100%",
              height: `${charge * 100}%`,
              borderRadius: 11,
              background: blocked ? theme.subtext : theme.accent,
              boxShadow: `0 0 22px ${blocked ? theme.subtext : theme.accent}`,
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: tx + 70,
            top: ty + 100,
            transform: "translateX(-50%)",
            color: blocked ? theme.subtext : theme.accent,
            fontFamily: theme.mono,
            fontSize: 20,
            whiteSpace: "nowrap",
            opacity: enter,
          }}
        >
          ЗАРЯД {Math.round(charge * 100)}%
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1190,
            transform: "translateX(-50%)",
            padding: "14px 30px",
            borderRadius: 999,
            background: blocked ? `${theme.warning}16` : `${theme.danger}16`,
            border: `2px solid ${blocked ? theme.warning : theme.danger}`,
            color: blocked ? theme.warning : theme.danger,
            fontFamily: theme.mono,
            fontSize: 25,
            fontWeight: 800,
            whiteSpace: "nowrap",
            opacity: enter,
          }}
        >
          {blocked ? "СИГНАЛ ПОГАС · ЗАРЯД НЕ ПАДАЕТ" : "ЗАРЯД УПАЛ · КОНТРОЛЛЕР ВИДИТ ПРОВАЛ"}
        </div>
      </>
    );
  }

  let pulse: React.ReactNode = null;
  if ((phase === "touch" || phase === "scan") && local >= impactLocal) {
    pulse = <PulseRing x={tx} y={ty} triggerFrame={impactLocal} tone={phase === "touch" ? "danger" : "accent"} size={200} />;
  }

  return (
    <>
      {header}
      {grid}
      {glass}
      {scanEl}
      {touchEl}
      {pulse}
    </>
  );
};

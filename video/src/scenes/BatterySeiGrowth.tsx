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

export type SeiPhase = "ions" | "high-voltage" | "sei-growth" | "resistance";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: SeiPhase;
};

const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };

const phaseTitle: Record<SeiPhase, string> = {
  ions: "ЛИТИЙ МЕЖДУ ЭЛЕКТРОДАМИ",
  "high-voltage": "ПОЛНЫЙ ЗАРЯД · НАПРЯЖЕНИЕ ВЕЛИКО",
  "sei-growth": "РАСТЁТ ПЛЁНКА {СЕИ|}",
  resistance: "СОПРОТИВЛЕНИЕ РАСТЁТ",
};

export const BatterySeiGrowthVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "ions" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });

  const panel = (color: string): React.CSSProperties => ({
    borderRadius: 24,
    background: `${theme.panel}E8`,
    border: `3px solid ${color}66`,
    boxShadow: `0 0 42px ${color}20`,
  });

  // === Phase: ions —锂离子在正负极间移动 ===
  if (phase === "ions") {
    const ionProgress = smooth(clamp01(local / Math.max(impactLocal, 1)));
    const ions = Array.from({ length: 6 }, (_, i) => ({
      id: i,
      startX: 220,
      endX: 860,
      y: 520 + i * 65,
      delay: i * 0.12,
    }));

    return (
      <>
        {/* Cathode (left) */}
        <div
          style={{
            position: "absolute",
            left: 100,
            top: 400,
            width: 220,
            height: 520,
            ...panel(theme.accent2),
            opacity: enter,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <IconGlyph name="minus-circle" size={48} color={theme.accent2} strokeWidth={1.8} />
          <div style={{ ...mono, fontSize: 28, color: theme.accent2 }}>КАТОД</div>
          <div style={{ ...mono, fontSize: 20, color: theme.subtext }}>LiCoO₂</div>
        </div>
        {/* Anode (right) */}
        <div
          style={{
            position: "absolute",
            right: 100,
            top: 400,
            width: 220,
            height: 520,
            ...panel(theme.accent),
            opacity: enter,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <IconGlyph name="plus-circle" size={48} color={theme.accent} strokeWidth={1.8} />
          <div style={{ ...mono, fontSize: 28, color: theme.accent }}>АНОД</div>
          <div style={{ ...mono, fontSize: 20, color: theme.subtext }}>Графит</div>
        </div>
        {/* Arrow */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 640,
            transform: "translateX(-50%)",
            color: theme.warning,
            fontFamily: theme.mono,
            fontSize: 48,
            fontWeight: 800,
            opacity: enter,
          }}
        >
          Li⁺ →
        </div>
        {/* Moving ions */}
        {ions.map((ion) => {
          const t = clamp01((ionProgress - ion.delay) / 0.7);
          const x = ion.startX + (ion.endX - ion.startX) * t;
          const pulse = 0.6 + 0.4 * Math.sin(local / 6 + ion.id);
          return (
            <div
              key={ion.id}
              style={{
                position: "absolute",
                left: x,
                top: ion.y,
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: `${theme.warning}${Math.round(pulse * 200).toString(16).padStart(2, "0")}`,
                border: `3px solid ${theme.warning}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: theme.text,
                fontFamily: theme.mono,
                fontSize: 16,
                fontWeight: 800,
                boxShadow: `0 0 ${12 + pulse * 18}px ${theme.warning}66`,
                opacity: enter * (t > 0.02 ? 1 : 0),
              }}
            >
              Li⁺
            </div>
          );
        })}
        {/* Bottom badge */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1100,
            transform: "translateX(-50%)",
            padding: "16px 34px",
            borderRadius: 999,
            background: `${theme.success}18`,
            border: `2px solid ${theme.success}99`,
            color: theme.success,
            ...mono,
            fontSize: 26,
            whiteSpace: "nowrap",
            opacity: enter,
          }}
        >
          ЗАРЯДКА: Li⁺ БЕГУТ К АНОДУ
        </div>
        <PulseRing x={W / 2} y={900} triggerFrame={impactLocal} tone="warning" size={160} />
      </>
    );
  }

  // === Phase: high-voltage — полный заряд, высокое напряжение ===
  if (phase === "high-voltage") {
    const voltagePulse = 0.5 + 0.5 * Math.sin(local / 8);
    return (
      <>
        {/* Cell voltage meter */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 260,
            top: 390,
            width: 520,
            height: 200,
            ...panel(theme.danger),
            opacity: enter,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <div style={{ ...mono, fontSize: 24, color: theme.subtext }}>НАПРЯЖЕНИЕ ЯЧЕЙКИ</div>
          <div style={{ fontFamily: theme.mono, fontSize: 82, fontWeight: 800, color: theme.danger, textShadow: `0 0 ${20 + voltagePulse * 25}px ${theme.danger}66` }}>
            4.2 В
          </div>
          <div style={{ ...mono, fontSize: 22, color: theme.warning }}>МАКСИМУМ</div>
        </div>
        {/* Anode potential */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 260,
            top: 660,
            width: 520,
            height: 180,
            ...panel(theme.accent),
            opacity: enter,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <div style={{ ...mono, fontSize: 24, color: theme.subtext }}>ПОТЕНЦИАЛ АНОДА</div>
          <div style={{ fontFamily: theme.mono, fontSize: 68, fontWeight: 800, color: theme.accent }}>
            0.05 В →≈ 0 В
          </div>
          <div style={{ ...mono, fontSize: 22, color: theme.danger }}>НИЗКИЙ · ЭЛЕКТРОЛИТ РАЗЛАГАЕТСЯ</div>
        </div>
        {/* Warning badge */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 960,
            transform: "translateX(-50%)",
            padding: "20px 44px",
            borderRadius: 999,
            background: `${theme.danger}18`,
            border: `3px solid ${theme.danger}99`,
            color: theme.danger,
            ...mono,
            fontSize: 28,
            fontWeight: 800,
            whiteSpace: "nowrap",
            opacity: enter,
            boxShadow: `0 0 40px ${theme.danger}33`,
          }}
        >
          ⚠ ПАРАЗИТНЫЕ РЕАКЦИИ ЗАПУЩЕНЫ
        </div>
        <PulseRing x={W / 2} y={810} triggerFrame={impactLocal} tone="danger" size={180} />
      </>
    );
  }

  // === Phase: sei-growth — плёнка растёт на аноде ===
  if (phase === "sei-growth") {
    const filmThickness = smooth(clamp01((local - impactLocal * 0.3) / (impactLocal * 0.7)));
    const filmH = 12 + filmThickness * 180;
    return (
      <>
        {/* Anode cross-section */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 300,
            top: 400,
            width: 600,
            height: 500,
            ...panel(theme.accent),
            opacity: enter,
          }}
        >
          {/* Graphite anode body */}
          <div
            style={{
              position: "absolute",
              left: 40,
              bottom: 40,
              width: 520,
              height: 260,
              borderRadius: 16,
              background: `linear-gradient(180deg, ${theme.accent}33, ${theme.accent}18)`,
              border: `2px solid ${theme.accent}88`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              ...mono,
              fontSize: 26,
              color: theme.accent,
            }}
          >
            ГРАФИТОВЫЙ АНОД
          </div>
          {/* SEI film growing on top */}
          <div
            style={{
              position: "absolute",
              left: 40,
              bottom: 300,
              width: 520,
              height: filmH,
              borderRadius: "12px 12px 0 0",
              background: `linear-gradient(180deg, ${theme.warning}88, ${theme.warning}44, ${theme.warning}22)`,
              border: `3px solid ${theme.warning}CC`,
              borderBottom: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              ...mono,
              fontSize: filmH > 60 ? 24 : 18,
              color: theme.text,
              boxShadow: `0 0 ${20 + filmThickness * 30}px ${theme.warning}44`,
              transition: "height 0.3s",
            }}
          >
            {filmH > 50 && "СЕИ-ПЛЁНКА"}
          </div>
          {/* Label */}
          <div
            style={{
              position: "absolute",
              right: -140,
              top: 300 - filmH / 2,
              ...mono,
              fontSize: 20,
              color: theme.warning,
              whiteSpace: "nowrap",
              opacity: filmH > 40 ? 1 : 0,
            }}
          >
            толщина ↑
          </div>
        </div>
        {/* Badge */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1000,
            transform: "translateX(-50%)",
            padding: "18px 38px",
            borderRadius: 999,
            background: `${theme.warning}18`,
            border: `2px solid ${theme.warning}99`,
            color: theme.warning,
            ...mono,
            fontSize: 26,
            whiteSpace: "nowrap",
            opacity: enter * reveal,
          }}
        >
          ПЛЁНКА ЗАБИРАЕТ ЦИКЛИЧЕСКИЙ ЛИТИЙ
        </div>
        <PulseRing x={W / 2} y={700} triggerFrame={impactLocal} tone="warning" size={200} />
      </>
    );
  }

  // === Phase: resistance — сопротивление растёт ===
  if (phase === "resistance") {
    const resistP = smooth(clamp01((local - impactLocal * 0.2) / (impactLocal * 0.8)));
    return (
      <>
        {/* Impedance meter */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 280,
            top: 390,
            width: 560,
            height: 240,
            ...panel(theme.danger),
            opacity: enter,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
          }}
        >
          <div style={{ ...mono, fontSize: 24, color: theme.subtext }}>СОПРОТИВЛЕНИЕ</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span style={{ fontFamily: theme.mono, fontSize: 56, fontWeight: 800, color: theme.success, opacity: 1 - resistP * 0.7 }}>
              50 мΩ
            </span>
            <span style={{ fontFamily: theme.mono, fontSize: 56, fontWeight: 800, color: theme.danger, opacity: resistP }}>
              → 250 мΩ
            </span>
          </div>
          <div style={{ ...mono, fontSize: 22, color: theme.warning }}>×5 РОСТ</div>
        </div>
        {/* Consequence */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 280,
            top: 700,
            width: 560,
            height: 200,
            ...panel(theme.accent2),
            opacity: enter,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
          }}
        >
          <div style={{ ...mono, fontSize: 24, color: theme.accent2 }}>ПОТЕРЯ ЁМКОСТИ</div>
          <div style={{ fontFamily: theme.mono, fontSize: 48, fontWeight: 800, color: theme.accent2 }}>
            100% → 80% за 500 циклов
          </div>
          <div style={{ ...mono, fontSize: 20, color: theme.subtext }}>ЛИТИЙ ЗАБЛОКИРОВАН В ПЛЁНКЕ</div>
        </div>
        {/* Badge */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1000,
            transform: "translateX(-50%)",
            padding: "18px 38px",
            borderRadius: 999,
            background: `${theme.danger}18`,
            border: `2px solid ${theme.danger}99`,
            color: theme.danger,
            ...mono,
            fontSize: 26,
            fontWeight: 800,
            whiteSpace: "nowrap",
            opacity: enter * resistP,
            boxShadow: `0 0 36px ${theme.danger}33`,
          }}
        >
          ЖАРА + ПОЛНЫЙ ЗАРЯД = УСКОРЕННЫЙ ИЗНОС
        </div>
        <PulseRing x={W / 2} y={850} triggerFrame={impactLocal} tone="danger" size={180} />
      </>
    );
  }

  return null;
};

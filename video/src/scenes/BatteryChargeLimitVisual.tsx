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

export type ChargeLimitPhase = "full" | "limit80" | "heat";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: ChargeLimitPhase;
};

const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };

const phaseTitle: Record<ChargeLimitPhase, string> = {
  full: "ЗАРЯДКА ДО 100% · СКЛАД ЗАБИТ",
  limit80: "ОГРАНИЧЕНИЕ НА 80% · ОПТИМИЗАЦИЯ",
  heat: "ЖАРА + ДОЛГИЙ ПОЛНЫЙ ЗАРЯД",
};

/** Планшет склада: коробки давят на стены, крошка упаковки. */
const WarehouseVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  full: boolean;
}> = ({ local, fps, impactLocal, full }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const pressure = full ? smooth(clamp01((local - impactLocal * 0.2) / (impactLocal * 0.8))) : 0.3;
  const boxCount = full ? 12 : 7;
  const crumble = full ? pressure : 0;

  return (
    <div
      style={{
        position: "absolute",
        left: W / 2 - 300,
        top: 400,
        width: 600,
        height: 440,
        borderRadius: 24,
        background: `${theme.panel}E8`,
        border: `3px solid ${full ? theme.danger : theme.success}66`,
        boxShadow: `0 0 ${30 + pressure * 25}px ${full ? theme.danger : theme.success}20`,
        opacity: enter,
        overflow: "hidden",
      }}
    >
      {/* Warehouse frame */}
      <div
        style={{
          position: "absolute",
          left: 20,
          top: 20,
          right: 20,
          bottom: 20,
          border: `2px solid ${theme.subtext}44`,
          borderRadius: 12,
        }}
      />
      {/* Boxes stacked */}
      <div
        style={{
          position: "absolute",
          left: 40,
          bottom: 40,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          width: 520,
        }}
      >
        {Array.from({ length: boxCount }).map((_, i) => {
          const row = Math.floor(i / 4);
          const squeeze = full ? pressure * (1 - row * 0.15) : 0;
          return (
            <div
              key={i}
              style={{
                width: 120,
                height: 72,
                borderRadius: 8,
                background: `${full ? theme.warning : theme.success}${full ? "44" : "33"}`,
                border: `2px solid ${full ? theme.warning : theme.success}88`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `translateY(${-squeeze * 8}px) scaleX(${1 - squeeze * 0.06})`,
                opacity: 0.7 + pressure * 0.3,
              }}
            />
          );
        })}
      </div>
      {/* Pressure arrows */}
      {full && (
        <>
          <div
            style={{
              position: "absolute",
              left: 30,
              top: "50%",
              transform: "translateY(-50%)",
              color: theme.danger,
              fontSize: 36,
              opacity: pressure,
            }}
          >
            →
          </div>
          <div
            style={{
              position: "absolute",
              right: 30,
              top: "50%",
              transform: "translateY(-50%) scaleX(-1)",
              color: theme.danger,
              fontSize: 36,
              opacity: pressure,
            }}
          >
            →
          </div>
        </>
      )}
      {/* Crumble particles */}
      {full &&
        crumble > 0.2 &&
        Array.from({ length: 6 }).map((_, i) => (
          <div
            key={`crumb-${i}`}
            style={{
              position: "absolute",
              left: 80 + i * 80,
              top: 340 + Math.sin(i * 2.3) * 20,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: theme.warning,
              opacity: crumble * 0.6,
              transform: `translateY(${crumble * (10 + i * 5)}px)`,
            }}
          />
        ))}
    </div>
  );
};

export const BatteryChargeLimitVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "full" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });

  const header = (
    <div
      style={{
        position: "absolute",
        left: W / 2,
        top: 245,
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
      <IconGlyph name="battery-full" size={30} color={phase === "limit80" ? theme.success : theme.danger} strokeWidth={1.8} />
      <span>{phaseTitle[phase]}</span>
    </div>
  );

  // === Phase: full — 100% charge, warehouse packed ===
  if (phase === "full") {
    return (
      <>
        <WarehouseVisual local={local} fps={fps} impactLocal={impactLocal} full={true} />
        {/* Phone battery indicator */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 100,
            top: 920,
            width: 200,
            height: 80,
            borderRadius: 16,
            background: `${theme.danger}22`,
            border: `3px solid ${theme.danger}AA`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            opacity: enter,
          }}
        >
          <IconGlyph name="battery-full" size={36} color={theme.danger} strokeWidth={1.8} />
          <span style={{ fontFamily: theme.mono, fontSize: 36, fontWeight: 800, color: theme.danger }}>100%</span>
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1050,
            transform: "translateX(-50%)",
            ...mono,
            fontSize: 24,
            color: theme.subtext,
            opacity: enter,
          }}
        >
          ДАВЛЕНИЕ В АНОДЕ · ПЛЁНКА РАСТЁТ
        </div>
        <PulseRing x={W / 2} y={960} triggerFrame={impactLocal} tone="danger" size={160} />
      </>
    );
  }

  // === Phase: limit80 — optimized charging at 80% ===
  if (phase === "limit80") {
    return (
      <>
        <WarehouseVisual local={local} fps={fps} impactLocal={impactLocal} full={false} />
        {/* Phone battery indicator */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 100,
            top: 920,
            width: 200,
            height: 80,
            borderRadius: 16,
            background: `${theme.success}22`,
            border: `3px solid ${theme.success}AA`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            opacity: enter,
          }}
        >
          <IconGlyph name="battery-medium" size={36} color={theme.success} strokeWidth={1.8} />
          <span style={{ fontFamily: theme.mono, fontSize: 36, fontWeight: 800, color: theme.success }}>80%</span>
        </div>
        {/* Apple badge */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1050,
            transform: "translateX(-50%)",
            padding: "18px 38px",
            borderRadius: 999,
            background: `${theme.success}18`,
            border: `2px solid ${theme.success}99`,
            color: theme.success,
            ...mono,
            fontSize: 26,
            fontWeight: 800,
            whiteSpace: "nowrap",
            opacity: enter * reveal,
          }}
        >
          OPTIMIZED CHARGING · ЗАДЕРЖКА ЗА 80%
        </div>
        <PulseRing x={W / 2} y={960} triggerFrame={impactLocal} tone="success" size={160} />
      </>
    );
  }

  // === Phase: heat — temperature + long full charge ===
  if (phase === "heat") {
    const heatPulse = 0.5 + 0.5 * Math.sin(local / 7);
    return (
      <>
        {/* Thermometer */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 60,
            top: 400,
            width: 120,
            height: 340,
            borderRadius: 60,
            background: `linear-gradient(180deg, ${theme.danger}66, ${theme.danger}22)`,
            border: `3px solid ${theme.danger}AA`,
            opacity: enter,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: `${60 + heatPulse * 30}%`,
              background: `linear-gradient(180deg, ${theme.danger}88, ${theme.danger}CC)`,
              borderRadius: "0 0 57px 57px",
            }}
          />
        </div>
        {/* Temperature label */}
        <div
          style={{
            position: "absolute",
            left: W / 2 + 80,
            top: 500,
            ...mono,
            fontSize: 48,
            fontWeight: 800,
            color: theme.danger,
            opacity: enter,
          }}
        >
          40–45°C
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2 + 80,
            top: 570,
            ...mono,
            fontSize: 22,
            color: theme.subtext,
            opacity: enter,
          }}
        >
          НАГРЕВ ОТ ПОЛНОГО ЗАРЯДА
        </div>
        {/* Consequence cards */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 340,
            top: 820,
            width: 310,
            height: 160,
            borderRadius: 20,
            background: `${theme.panel}E8`,
            border: `2px solid ${theme.warning}88`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            opacity: enter,
          }}
        >
          <div style={{ ...mono, fontSize: 22, color: theme.warning }}>УСКОРЕНИЕ РОСТА</div>
          <div style={{ ...mono, fontSize: 28, fontWeight: 800, color: theme.warning }}>СЕИ ×2–3</div>
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2 + 30,
            top: 820,
            width: 310,
            height: 160,
            borderRadius: 20,
            background: `${theme.panel}E8`,
            border: `2px solid ${theme.danger}88`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            opacity: enter,
          }}
        >
          <div style={{ ...mono, fontSize: 22, color: theme.danger }}>РАЗЛОЖЕНИЕ</div>
          <div style={{ ...mono, fontSize: 28, fontWeight: 800, color: theme.danger }}>ЭЛЕКТРОЛИТА</div>
        </div>
        {/* Badge */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1060,
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
            opacity: enter,
            boxShadow: `0 0 36px ${theme.danger}33`,
          }}
        >
          ЖАРА + ПОЛНЫЙ ЗАРЯД = САМЫЙ БЫСТРЫЙ ИЗНОС
        </div>
        <PulseRing x={W / 2} y={940} triggerFrame={impactLocal} tone="danger" size={180} />
      </>
    );
  }

  return null;
};

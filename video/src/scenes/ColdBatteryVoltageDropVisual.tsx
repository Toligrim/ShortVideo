import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

const W = layout.width;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export type ColdBatteryPhase = "cold" | "resistance" | "drop" | "shutdown";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: ColdBatteryPhase;
};

const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1,
};

const phaseTitle: Record<ColdBatteryPhase, string> = {
  cold: "МОРОЗ · БАТАРЕЯ ЕСТЬ",
  resistance: "ХОЛОД · RВН РАСТЁТ",
  drop: "ПОД НАГРУЗКОЙ · U ↓",
  shutdown: "ЗАЩИТА · U < МИНИМУМА",
};

const panel = (color: string): React.CSSProperties => ({
  borderRadius: 24,
  background: `${theme.panel}F2`,
  border: `3px solid ${color}66`,
  boxShadow: `0 0 42px ${color}22`,
});

/** Реальная модель ячейки: холодная оболочка, оставшийся заряд и движущаяся энергия. */
const BatteryCell: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  level?: number;
  cold?: boolean;
  pulse?: number;
  opacity?: number;
}> = ({ left, top, width, height, level = 0.78, cold = true, pulse = 0, opacity = 1 }) => {
  const frostPulse = 0.62 + 0.18 * Math.sin(pulse / 9);
  const fillColor = cold ? theme.accent : theme.success;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        borderRadius: 28,
        background: `linear-gradient(145deg, ${cold ? "#18384A" : theme.panel} 0%, ${theme.panel} 70%)`,
        border: `4px solid ${cold ? theme.accent : fillColor}99`,
        boxShadow: `0 0 ${cold ? 34 : 24}px ${fillColor}33`,
        opacity,
        overflow: "visible",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: width / 2 - 38,
          top: -20,
          width: 76,
          height: 22,
          borderRadius: "9px 9px 0 0",
          background: cold ? `${theme.accent}66` : `${theme.subtext}66`,
          border: `3px solid ${cold ? theme.accent : theme.subtext}99`,
          borderBottom: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 25,
          right: 25,
          top: 48,
          bottom: 25,
          borderRadius: 17,
          border: `2px solid ${theme.panelBorder}`,
          background: `${theme.bg}CC`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: `${clamp01(level) * 100}%`,
            background: `linear-gradient(180deg, ${fillColor}88, ${fillColor}22)`,
            boxShadow: `0 0 28px ${fillColor}44`,
          }}
        />
        {Array.from({ length: 6 }).map((_, i) => {
          const y = 18 + i * 44;
          const x = 24 + ((i * 37) % Math.max(40, width - 100));
          const energyOpacity = 0.35 + 0.35 * Math.sin(pulse / 8 + i);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                bottom: 18 + y,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: fillColor,
                boxShadow: `0 0 16px ${fillColor}`,
                opacity: cold ? energyOpacity : 0.24,
              }}
            />
          );
        })}
      </div>
      {cold && (
        <>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={`frost-${i}`}
              style={{
                position: "absolute",
                left: 16 + i * Math.max(22, (width - 80) / 5),
                top: 75 + (i % 2) * 112,
                width: 34,
                height: 8,
                borderRadius: 8,
                background: theme.text,
                opacity: frostPulse,
                transform: `rotate(${i % 2 === 0 ? -28 : 24}deg)`,
                boxShadow: `0 0 13px ${theme.accent}`,
              }}
            />
          ))}
          <div
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              top: 12,
              height: 20,
              borderRadius: 20,
              background: `linear-gradient(90deg, transparent, ${theme.text}55, transparent)`,
              opacity: 0.8,
              transform: "rotate(-9deg)",
            }}
          />
        </>
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 86,
          display: "flex",
          justifyContent: "center",
          opacity: 0.96,
        }}
      >
        <IconGlyph name={cold ? "snowflake" : "battery-medium"} size={46} color={cold ? theme.accent : fillColor} strokeWidth={1.7} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 145,
          textAlign: "center",
          color: cold ? theme.accent : theme.text,
          fontSize: 24,
          ...mono,
        }}
      >
        {cold ? "−10°C" : "Li-ION"}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 50,
          textAlign: "center",
          color: fillColor,
          fontSize: 38,
          ...mono,
        }}
      >
        {Math.round(clamp01(level) * 100)}%
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 18,
          textAlign: "center",
          color: theme.subtext,
          fontSize: 14,
          ...mono,
        }}
      >
        ХИМИЧЕСКАЯ ЭНЕРГИЯ
      </div>
    </div>
  );
};

const PhoneCard: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  powered?: number;
  battery?: number;
  label?: string;
}> = ({ left, top, width, height, powered = 1, battery = 0.78, label = "ЗАПРОС МОЩНОСТИ" }) => {
  const live = clamp01(powered);
  const color = live > 0.3 ? theme.accent : theme.danger;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        borderRadius: 30,
        background: `linear-gradient(150deg, ${theme.panelBorder}, ${theme.bg})`,
        border: `4px solid ${color}99`,
        boxShadow: `0 0 34px ${color}33`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: width / 2 - 35,
          top: 15,
          width: 70,
          height: 9,
          borderRadius: 9,
          background: theme.bg,
          border: `2px solid ${theme.panelBorder}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 18,
          right: 18,
          top: 42,
          bottom: 18,
          borderRadius: 21,
          background: live > 0.3 ? `linear-gradient(180deg, ${theme.accent}18, ${theme.panel})` : theme.bg,
          border: `2px solid ${color}55`,
          opacity: 0.9,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 82,
            textAlign: "center",
            color,
            opacity: live > 0.3 ? 1 : 0.72,
          }}
        >
          <IconGlyph name={live > 0.3 ? "battery-medium" : "power"} size={50} color={color} strokeWidth={1.7} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 152,
            textAlign: "center",
            fontSize: 38,
            color,
            ...mono,
          }}
        >
          {live > 0.3 ? `${Math.round(battery * 100)}%` : "OFF"}
        </div>
        <div
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 34,
            textAlign: "center",
            fontSize: 17,
            color: theme.subtext,
            opacity: live > 0.3 ? 1 : 0.65,
            ...mono,
          }}
        >
          {live > 0.3 ? label : "ЭКРАН ПОГАС"}
        </div>
      </div>
    </div>
  );
};

/** Поток с настоящим бутылочным горлышком: при росте RВН канал сужается. */
const FlowPipe: React.FC<{
  left: number;
  top: number;
  width: number;
  narrow?: boolean;
  progress: number;
  speed?: number;
  color?: string;
}> = ({ left, top, width, narrow = false, progress, speed = 0.7, color = theme.accent }) => {
  const dots = Array.from({ length: 6 });
  return (
    <svg
      width={width}
      height={190}
      viewBox="0 0 600 190"
      style={{ position: "absolute", left, top, overflow: "visible" }}
    >
      <path
        d={narrow ? "M20 42 H205 L270 70 H330 L395 42 H580 V148 H395 L330 120 H270 L205 148 H20 Z" : "M20 35 H580 V155 H20 Z"}
        fill={`${color}18`}
        stroke={`${color}88`}
        strokeWidth="4"
      />
      <path
        d={narrow ? "M28 95 H205 L270 95 H330 L395 95 H572" : "M28 95 H572"}
        fill="none"
        stroke={`${color}55`}
        strokeWidth={narrow ? 8 : 14}
        strokeLinecap="round"
        strokeDasharray={narrow ? "10 13" : "18 12"}
      />
      {dots.map((_, i) => {
        const x = 34 + (((progress * speed + i * 0.16) % 1) * (width - 70));
        const neck = narrow && x > width * 0.34 && x < width * 0.66;
        const y = neck ? 95 + (i % 2 === 0 ? -10 : 10) : 95 + (i % 3 - 1) * 22;
        const dotColor = neck ? theme.warning : color;
        return (
          <circle
            key={i}
            cx={x * (600 / width)}
            cy={y}
            r={neck ? 8 : 11}
            fill={dotColor}
            opacity={0.72 + (i % 3) * 0.08}
          />
        );
      })}
      <path d="M540 77 L572 95 L540 113" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const VoltageMeter: React.FC<{ left: number; top: number; sag: number }> = ({ left, top, sag }) => {
  const voltage = interpolate(sag, [0, 1], [3.8, 2.9], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const loadedHeight = interpolate(voltage, [0, 4], [0, 126], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left, top, width: 560, height: 260, ...panel(theme.danger), padding: "20px 30px", boxSizing: "border-box" }}>
      <div style={{ ...mono, color: theme.subtext, fontSize: 22, textAlign: "center" }}>НАПРЯЖЕНИЕ НА КЛЕММАХ</div>
      <div style={{ position: "absolute", left: 72, top: 65, width: 416, height: 130, display: "flex", alignItems: "flex-end", justifyContent: "space-around" }}>
        <div style={{ width: 92, height: 120, borderRadius: "12px 12px 4px 4px", background: `${theme.accent}77`, boxShadow: `0 0 22px ${theme.accent}33` }} />
        <div style={{ position: "absolute", left: 192, top: 28, height: 82, borderLeft: `5px dashed ${theme.warning}99` }} />
        <div style={{ width: 92, height: loadedHeight, minHeight: 8, borderRadius: "12px 12px 4px 4px", background: `${theme.danger}CC`, boxShadow: `0 0 24px ${theme.danger}55` }} />
        <div style={{ position: "absolute", left: 196, top: 14, color: theme.warning, fontSize: 25, ...mono }}>↓</div>
      </div>
      <div style={{ position: "absolute", left: 55, bottom: 20, width: 150, textAlign: "center", color: theme.accent, fontSize: 22, ...mono }}>БЕЗ НАГРУЗКИ<br />3.8 В</div>
      <div style={{ position: "absolute", right: 45, bottom: 20, width: 185, textAlign: "center", color: theme.danger, fontSize: 22, ...mono }}>ПОД НАГРУЗКОЙ<br />{voltage.toFixed(1)} В</div>
      <div style={{ position: "absolute", right: 24, top: 12, color: theme.warning, fontSize: 16, ...mono }}>MIN 3.0 В</div>
    </div>
  );
};

const ControllerCard: React.FC<{ left: number; top: number; trip: number }> = ({ left, top, trip }) => {
  const color = trip > 0.35 ? theme.danger : theme.warning;
  return (
    <div style={{ position: "absolute", left, top, width: 360, height: 250, ...panel(color), padding: "22px 26px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, color, ...mono, fontSize: 22 }}>
        <IconGlyph name="shield-check" size={38} color={color} strokeWidth={1.7} />
        КОНТРОЛЛЕР ПИТАНИЯ
      </div>
      <div style={{ marginTop: 28, textAlign: "center", color: theme.danger, fontSize: 29, ...mono }}>U = 2.9 В &lt; MIN</div>
      <div style={{ position: "absolute", left: 34, right: 34, bottom: 34, height: 46, borderRadius: 24, background: `${theme.bg}CC`, border: `2px solid ${color}66` }}>
        <div style={{ position: "absolute", left: 22, top: 20, width: 190 * (1 - trip), borderTop: `7px solid ${theme.success}`, transformOrigin: "left center" }} />
        <div style={{ position: "absolute", left: 216, top: 9, width: 32, height: 28, borderLeft: `5px solid ${theme.danger}`, transform: `rotate(${trip > 0.5 ? -28 : 0}deg)`, opacity: 0.85 }} />
        <div style={{ position: "absolute", right: 15, top: 10, color: trip > 0.5 ? theme.danger : theme.subtext, fontSize: 19, ...mono }}>{trip > 0.5 ? "ОТКЛ." : "СЛУШАЕТ"}</div>
      </div>
    </div>
  );
};

export const ColdBatteryVoltageDropVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "cold" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const flowProgress = local / 8;

  const header = (
    <div
      style={{
        position: "absolute",
        left: W / 2,
        top: 235,
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
      <IconGlyph name={phase === "shutdown" ? "shield-check" : phase === "drop" ? "gauge" : "snowflake"} size={31} color={phase === "shutdown" ? theme.danger : theme.accent} strokeWidth={1.8} />
      <span>{phaseTitle[phase]}</span>
    </div>
  );

  if (phase === "cold") {
    return (
      <>
        {header}
        <BatteryCell left={92} top={420} width={270} height={390} pulse={local} />
        <FlowPipe left={350} top={550} width={360} progress={flowProgress} speed={0.52} color={theme.accent} />
        <PhoneCard left={760} top={420} width={230} height={390} label="ТОК ОТДАЁТСЯ" />
        <div style={{ position: "absolute", left: 360, top: 485, color: theme.subtext, fontSize: 20, ...mono }}>ТОК →</div>
        <div style={{ position: "absolute", left: W / 2, top: 1030, transform: "translateX(-50%)", color: theme.warning, fontSize: 25, whiteSpace: "nowrap", ...mono }}>ЗАРЯД ЕСТЬ · ХОЛОД МЕШАЕТ ОТДАЧЕ</div>
        <PulseRing x={850} y={605} triggerFrame={impactLocal} tone="accent" size={150} />
      </>
    );
  }

  if (phase === "resistance") {
    const resistance = smooth((local - impactLocal * 0.18) / Math.max(impactLocal * 0.82, 1));
    return (
      <>
        {header}
        <BatteryCell left={72} top={420} width={260} height={380} pulse={local} />
        <FlowPipe left={330} top={515} width={430} progress={flowProgress} speed={0.34} narrow color={theme.warning} />
        <div style={{ position: "absolute", left: 710, top: 760, width: 300, height: 210, ...panel(theme.danger), padding: "22px 24px", boxSizing: "border-box", opacity: enter }}>
          <div style={{ ...mono, color: theme.subtext, fontSize: 21, textAlign: "center" }}>ВНУТРЕННЕЕ R</div>
          <div style={{ position: "relative", height: 54, marginTop: 18, borderRadius: 12, background: `${theme.bg}CC`, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${35 + resistance * 65}%`, background: `linear-gradient(90deg, ${theme.warning}99, ${theme.danger}CC)`, boxShadow: `0 0 26px ${theme.danger}44` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 15, ...mono }}>
            <span style={{ color: theme.subtext, fontSize: 23, opacity: 1 - resistance * 0.8 }}>1×</span>
            <span style={{ color: theme.danger, fontSize: 33, opacity: 0.25 + resistance * 0.75 }}>3×</span>
          </div>
        </div>
        <div style={{ position: "absolute", left: W / 2, top: 1030, transform: "translateX(-50%)", color: theme.warning, fontSize: 25, whiteSpace: "nowrap", ...mono }}>УЗКИЙ ПРОХОД · ТОК СЛАБЕЕ</div>
        <PulseRing x={570} y={610} triggerFrame={impactLocal} tone="warning" size={170} />
      </>
    );
  }

  if (phase === "drop") {
    const sag = smooth((local - impactLocal * 0.25) / Math.max(impactLocal * 0.75, 1));
    return (
      <>
        {header}
        <BatteryCell left={72} top={410} width={255} height={375} pulse={local} />
        <FlowPipe left={320} top={525} width={370} progress={flowProgress} speed={0.5} color={theme.danger} />
        <PhoneCard left={760} top={410} width={230} height={375} powered={1 - sag * 0.35} label="ПРОСИТ МОЩНОСТЬ ↑" />
        <div style={{ position: "absolute", left: 770, top: 825, color: theme.warning, fontSize: 23, whiteSpace: "nowrap", ...mono, opacity: enter }}>МОЩНОСТЬ ↑</div>
        <VoltageMeter left={260} top={870} sag={sag} />
        <PulseRing x={545} y={995} triggerFrame={impactLocal} tone="danger" size={170} />
      </>
    );
  }

  const trip = smooth((local - impactLocal * 0.2) / Math.max(impactLocal * 0.8, 1));
  return (
    <>
      {header}
      <BatteryCell left={72} top={410} width={255} height={375} pulse={local} />
      <ControllerCard left={350} top={430} trip={trip} />
      <div style={{ position: "absolute", left: 700, top: 604, width: 76, borderTop: `8px solid ${trip > 0.5 ? theme.danger : theme.success}`, opacity: enter }} />
      <div style={{ position: "absolute", left: 726, top: 578, width: 36, height: 52, borderLeft: `7px solid ${theme.danger}`, transform: `rotate(${trip > 0.5 ? -35 : 0}deg)`, opacity: trip }} />
      <PhoneCard left={780} top={410} width={220} height={375} powered={1 - trip} label="КОМПОНЕНТЫ ЦЕЛЫ" />
      <div style={{ position: "absolute", left: 72, top: 850, width: 255, textAlign: "center", color: theme.success, fontSize: 22, ...mono, opacity: enter }}>ЭНЕРГИЯ ЕЩЁ ЕСТЬ</div>
      <div style={{ position: "absolute", left: W / 2, top: 1040, transform: "translateX(-50%)", padding: "18px 34px", borderRadius: 999, background: `${theme.danger}18`, border: `3px solid ${theme.danger}99`, color: theme.danger, fontSize: 26, whiteSpace: "nowrap", ...mono, opacity: enter * (0.35 + trip * 0.65), boxShadow: `0 0 36px ${theme.danger}33` }}>ЗАЩИТА ОТКЛЮЧИЛА · ЭНЕРГИЯ ОСТАЛАСЬ</div>
      <PulseRing x={530} y={555} triggerFrame={impactLocal} tone="danger" size={180} />
    </>
  );
};

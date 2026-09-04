import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type TrafficSegmentPhase =
  | "ahead"
  | "phones"
  | "points"
  | "aggregate"
  | "status"
  | "delay";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: TrafficSegmentPhase;
}

const W = layout.width;
const CX = W / 2;
const ROAD_X = 90;
const ROAD_Y = 470;
const ROAD_W = 900;
const ROAD_H = 405;
const INNER_X = 30;
const INNER_Y = 92;
const INNER_W = 840;
const INNER_H = 275;
const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const phaseTitle: Record<TrafficSegmentPhase, string> = {
  ahead: "КАРТА ВИДИТ ЗАДЕРЖКУ ВПЕРЕДИ",
  phones: "ОДИН УЧАСТОК · МНОЖЕСТВО ТЕЛЕФОНОВ",
  points: "ПОСЛЕДОВАТЕЛЬНЫЕ ТОЧКИ",
  aggregate: "КОЛЛЕКТИВНЫЙ СПИДОМЕТР",
  status: "СКОРОСТЬ → СОСТОЯНИЕ УЧАСТКА",
  delay: "ЗАДЕРЖКА ПОЛУЧАЕТ КРАСНЫЙ ЦВЕТ",
};

const phaseIcon: Record<TrafficSegmentPhase, string> = {
  ahead: "map",
  phones: "smartphone",
  points: "map-pin",
  aggregate: "timer",
  status: "gauge",
  delay: "alert-triangle",
};

const phaseTone: Record<TrafficSegmentPhase, string> = {
  ahead: theme.danger,
  phones: theme.accent,
  points: theme.accent2,
  aggregate: theme.success,
  status: theme.warning,
  delay: theme.danger,
};

const Header: React.FC<{ phase: TrafficSegmentPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 225,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: phaseTone[phase],
      fontSize: 24,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={31} color={phaseTone[phase]} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const FooterBadge: React.FC<{ text: string; color: string; opacity: number }> = ({ text, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 1215,
      transform: "translateX(-50%)",
      padding: "15px 30px",
      borderRadius: 999,
      border: `2px solid ${color}`,
      background: `${color}18`,
      color,
      fontSize: 23,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    {text}
  </div>
);

const Chip: React.FC<{
  left: number;
  top: number;
  text: string;
  color: string;
  opacity?: number;
  width?: number;
}> = ({ left, top, text, color, opacity = 1, width }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      minHeight: 48,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "8px 15px",
      borderRadius: 14,
      border: `2px solid ${color}88`,
      background: `${theme.panel}E8`,
      color,
      fontSize: 19,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    {text}
  </div>
);

const RoadFrame: React.FC<{
  children: React.ReactNode;
  opacity: number;
  labelColor?: string;
}> = ({ children, opacity, labelColor = theme.accent }) => (
  <div
    style={{
      position: "absolute",
      left: ROAD_X,
      top: ROAD_Y,
      width: ROAD_W,
      height: ROAD_H,
      borderRadius: 30,
      background: `${theme.panel}E8`,
      border: `3px solid ${labelColor}66`,
      boxShadow: `0 0 44px ${labelColor}1C`,
      opacity,
    }}
  >
    <div
      style={{
        position: "absolute",
        left: 28,
        top: 24,
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: labelColor,
        fontSize: 21,
        ...mono,
      }}
    >
      <IconGlyph name="route" size={29} color={labelColor} strokeWidth={1.8} />
      <span>ДОРОЖНЫЙ УЧАСТОК A → B</span>
    </div>
    <div
      style={{
        position: "absolute",
        left: INNER_X,
        top: INNER_Y,
        width: INNER_W,
        height: INNER_H,
        overflow: "hidden",
        borderRadius: 22,
        background: "linear-gradient(180deg, #202B3A 0%, #121923 100%)",
        border: `2px solid ${theme.panelBorder}`,
      }}
    >
      {[68, 137, 206].map((y) => (
        <div
          key={y}
          style={{
            position: "absolute",
            left: 22,
            right: 22,
            top: y,
            borderTop: `3px dashed ${theme.subtext}55`,
          }}
        />
      ))}
      <div style={{ position: "absolute", left: 18, top: 18, bottom: 18, borderLeft: `3px solid ${theme.subtext}55` }} />
      <div style={{ position: "absolute", right: 18, top: 18, bottom: 18, borderLeft: `3px solid ${theme.subtext}55` }} />
      <div style={{ position: "absolute", left: 4, top: 112, color: theme.subtext, fontSize: 16, ...mono }}>A</div>
      <div style={{ position: "absolute", right: 1, top: 112, color: theme.subtext, fontSize: 16, ...mono }}>B</div>
      {children}
    </div>
  </div>
);

const PhoneMarker: React.FC<{
  left: number;
  top: number;
  color: string;
  opacity: number;
  label?: string;
  size?: number;
}> = ({ left, top, color, opacity, label, size = 45 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 3,
      color,
      opacity,
      transform: "translate(-50%, -50%)",
    }}
  >
    <IconGlyph name="smartphone" size={size} color={color} strokeWidth={1.8} />
    {label ? <span style={{ ...mono, fontSize: 14, color: theme.text }}>{label}</span> : null}
  </div>
);

const AheadPhase: React.FC<{ local: number; fps: number; impactLocal: number; enter: number }> = ({
  local,
  fps,
  impactLocal,
  enter,
}) => {
  const drive = smooth(interpolate(local, [0, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const red = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 13, mass: 0.7 } });
  const carLeft = 130 + drive * 180;
  return (
    <>
      <Header phase="ahead" opacity={enter} />
      <RoadFrame opacity={enter} labelColor={theme.danger}>
        <div
          style={{
            position: "absolute",
            left: 530,
            top: 75,
            width: 265,
            height: 62,
            borderRadius: 16,
            background: `${theme.danger}${red > 0.45 ? "B8" : "35"}`,
            border: `4px solid ${theme.danger}`,
            boxShadow: `0 0 34px ${theme.danger}66`,
            opacity: 0.55 + 0.45 * red,
          }}
        >
          <div style={{ textAlign: "center", color: theme.text, fontSize: 21, paddingTop: 17, ...mono }}>ЗАДЕРЖКА</div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 520,
            top: 151,
            width: 285,
            height: 8,
            borderRadius: 6,
            background: theme.danger,
            boxShadow: `0 0 24px ${theme.danger}`,
            opacity: 0.65 + 0.35 * red,
          }}
        />
        <div style={{ position: "absolute", left: carLeft, top: 188, transform: "translate(-50%, -50%)" }}>
          <IconGlyph name="car-front" size={68} color={theme.success} strokeWidth={1.8} />
          <div style={{ position: "absolute", top: 72, left: "50%", transform: "translateX(-50%)", color: theme.success, fontSize: 16, whiteSpace: "nowrap", ...mono }}>
            ТЫ · ЕЩЁ ЕДЕШЬ
          </div>
        </div>
        <Chip left={45} top={28} text="СЕЙЧАС · СВОБОДНО" color={theme.success} width={245} />
        <Chip left={545} top={178} text="ВПЕРЕДИ · КРАСНАЯ ЛИНИЯ" color={theme.danger} width={275} />
      </RoadFrame>
      <FooterBadge text="КРАСНОЕ ПОЯВИЛОСЬ РАНЬШЕ ТЕБЯ" color={theme.danger} opacity={enter * (0.7 + red * 0.3)} />
      <PulseRing x={ROAD_X + 90 + 530 + 130} y={ROAD_Y + INNER_Y + 112} triggerFrame={impactLocal} tone="danger" size={210} />
    </>
  );
};

const PhonesPhase: React.FC<{ local: number; fps: number; impactLocal: number; enter: number }> = ({
  local,
  fps,
  impactLocal,
  enter,
}) => {
  const colors = [theme.accent, theme.accent2, theme.success, theme.warning, theme.accent];
  const positions = [42, 208, 374, 540, 706];
  const move = local * 1.45;
  const crowdReveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 15, mass: 0.7 } });
  return (
    <>
      <Header phase="phones" opacity={enter} />
      <RoadFrame opacity={enter} labelColor={theme.accent}>
        {positions.map((base, i) => {
          const x = 84 + ((base + move * (0.75 + i * 0.07)) % 690);
          const y = 51 + (i % 3) * 70;
          return (
            <React.Fragment key={i}>
              <div style={{ position: "absolute", left: Math.max(28, x - 62), top: y, width: 54, borderTop: `3px solid ${colors[i]}55`, opacity: enter * 0.8 }} />
              <PhoneMarker left={x} top={y} color={colors[i]} opacity={enter * (0.65 + 0.35 * crowdReveal)} label={`Т${i + 1}`} size={40} />
            </React.Fragment>
          );
        })}
        <div style={{ position: "absolute", left: 40, top: 232, color: theme.subtext, fontSize: 18, ...mono }}>НЕ СПУТНИКИ · НЕ КАМЕРА</div>
      </RoadFrame>
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 930,
          width: 780,
          height: 104,
          borderRadius: 20,
          border: `2px solid ${theme.accent}77`,
          background: `${theme.panel}E8`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          color: theme.text,
          fontSize: 24,
          ...mono,
          opacity: enter,
        }}
      >
        <IconGlyph name="smartphone" size={38} color={theme.accent} strokeWidth={1.8} />
        <span>АНОНИМНЫЕ СИГНАЛЫ · ОДИН УЧАСТОК</span>
      </div>
      <FooterBadge text="МНОЖЕСТВО ТЕЛЕФОНОВ · ОДИН УЧАСТОК" color={theme.accent} opacity={enter} />
      <PulseRing x={ROAD_X + INNER_X + 410} y={ROAD_Y + INNER_Y + 135} triggerFrame={impactLocal} tone="accent" size={230} />
    </>
  );
};

const PointsPhase: React.FC<{ local: number; fps: number; impactLocal: number; enter: number }> = ({
  local,
  fps,
  impactLocal,
  enter,
}) => {
  const colors = [theme.accent, theme.accent2, theme.success];
  const ys = [45, 135, 225];
  const pointXs = [92, 250, 420, 588, 748];
  const pointP = smooth(interpolate(local, [8, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const last = Math.min(pointXs.length - 1, Math.floor(pointP * pointXs.length));
  const pulse = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  return (
    <>
      <Header phase="points" opacity={enter} />
      <RoadFrame opacity={enter} labelColor={theme.accent2}>
        <svg width={INNER_W} height={INNER_H} style={{ position: "absolute", inset: 0 }}>
          {ys.map((y, row) => (
            <React.Fragment key={row}>
              <polyline
                points={pointXs.map((x) => `${x},${y}`).join(" ")}
                fill="none"
                stroke={colors[row]}
                strokeWidth={4}
                strokeDasharray="12 10"
                opacity={0.28 + 0.45 * pointP}
              />
              {pointXs.map((x, i) => (
                <React.Fragment key={`${row}-${i}`}>
                  <circle cx={x} cy={y} r={i <= last ? 13 : 8} fill={i <= last ? colors[row] : theme.panelBorder} opacity={i <= last ? 0.95 : 0.55} />
                  {i <= last ? (
                    <text x={x} y={y - 22} textAnchor="middle" fill={theme.text} fontFamily={theme.mono} fontSize="15">
                      t{i}
                    </text>
                  ) : null}
                </React.Fragment>
              ))}
            </React.Fragment>
          ))}
        </svg>
        <PhoneMarker left={pointXs[Math.min(last, pointXs.length - 1)]} top={ys[1]} color={theme.accent2} opacity={enter * (0.75 + 0.25 * pulse)} label="Т2" size={36} />
        <div style={{ position: "absolute", left: 40, top: 238, color: theme.subtext, fontSize: 17, ...mono }}>КАЖДАЯ ТОЧКА = МЕСТО + ВРЕМЯ</div>
      </RoadFrame>
      <div
        style={{
          position: "absolute",
          left: 180,
          top: 935,
          width: 720,
          height: 112,
          borderRadius: 20,
          border: `2px solid ${theme.accent2}77`,
          background: `${theme.panel}E8`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 26,
          color: theme.text,
          fontSize: 24,
          ...mono,
          opacity: enter,
        }}
      >
        <span style={{ color: theme.accent2 }}>ΔS</span>
        <span style={{ color: theme.subtext }}>÷</span>
        <span style={{ color: theme.warning }}>ΔT</span>
        <span style={{ color: theme.subtext }}>→</span>
        <span>ЛОКАЛЬНАЯ СКОРОСТЬ</span>
      </div>
      <FooterBadge text="ПОСЛЕДОВАТЕЛЬНОСТЬ ТОЧЕК ДАЁТ ДВИЖЕНИЕ" color={theme.accent2} opacity={enter} />
      <PulseRing x={ROAD_X + INNER_X + pointXs[Math.min(last, pointXs.length - 1)]} y={ROAD_Y + INNER_Y + ys[1]} triggerFrame={impactLocal} tone="accent2" size={185} />
    </>
  );
};

const AggregatePhase: React.FC<{ local: number; fps: number; impactLocal: number; enter: number }> = ({
  local,
  fps,
  impactLocal,
  enter,
}) => {
  const colors = [theme.accent, theme.accent2, theme.success];
  const speeds = [42, 38, 40];
  const move = smooth(interpolate(local, [0, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const summary = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 13, mass: 0.75 } });
  return (
    <>
      <Header phase="aggregate" opacity={enter} />
      <RoadFrame opacity={enter} labelColor={theme.success}>
        <div style={{ position: "absolute", left: 40, top: 17, color: theme.subtext, fontSize: 17, ...mono }}>ОДИН И ТОТ ЖЕ ОТРЕЗОК · ОБЩИЙ ТАЙМЕР</div>
        {speeds.map((speed, i) => {
          const y = 50 + i * 72;
          const x = 100 + ((move * 560 + i * 160) % 610);
          return (
            <React.Fragment key={speed}>
              <div style={{ position: "absolute", left: 55, top: y, width: 625, borderTop: `4px solid ${colors[i]}66` }} />
              <PhoneMarker left={x} top={y} color={colors[i]} opacity={enter} label={`Т${i + 1}`} size={38} />
              <Chip left={700} top={y - 24} text={`${speed} КМ/Ч`} color={colors[i]} width={115} />
            </React.Fragment>
          );
        })}
      </RoadFrame>
      <div
        style={{
          position: "absolute",
          left: 230,
          top: 915,
          width: 620,
          height: 155,
          borderRadius: 24,
          border: `3px solid ${theme.success}`,
          background: `${theme.success}18`,
          boxShadow: `0 0 38px ${theme.success}22`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          opacity: enter * summary,
          transform: `scale(${0.9 + summary * 0.1})`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: theme.success, fontSize: 22, ...mono }}>
          <IconGlyph name="timer" size={32} color={theme.success} strokeWidth={1.8} />
          <span>ОБЩИЙ СЕКУНДОМЕР</span>
        </div>
        <div style={{ color: theme.text, fontSize: 35, ...mono }}>СВОДНАЯ · 40 КМ/Ч</div>
      </div>
      <FooterBadge text="МНОГО ТРАЕКТОРИЙ → ОДНА СКОРОСТЬ" color={theme.success} opacity={enter * (0.7 + 0.3 * summary)} />
      <PulseRing x={CX} y={992} triggerFrame={impactLocal} tone="success" size={250} />
    </>
  );
};

const StatusCard: React.FC<{
  left: number;
  title: string;
  value: string;
  color: string;
  opacity: number;
  active: boolean;
}> = ({ left, title, value, color, opacity, active }) => (
  <div
    style={{
      position: "absolute",
      left,
      top: 105,
      width: 365,
      height: 330,
      boxSizing: "border-box",
      borderRadius: 24,
      border: `3px solid ${color}${active ? "DD" : "55"}`,
      background: `${active ? color : theme.panel}${active ? "20" : "E8"}`,
      boxShadow: active ? `0 0 34px ${color}28` : "none",
      opacity,
      textAlign: "center",
    }}
  >
    <div style={{ marginTop: 37, color, fontSize: 24, ...mono }}>{title}</div>
    <div style={{ marginTop: 28, color: theme.text, fontSize: 52, ...mono }}>{value}</div>
    <div style={{ margin: "26px auto 0", width: 245, height: 15, borderRadius: 9, background: `${theme.panelBorder}` }}>
      <div style={{ width: active ? "82%" : "34%", height: "100%", borderRadius: 9, background: color, boxShadow: `0 0 18px ${color}66` }} />
    </div>
    <div style={{ marginTop: 20, color: theme.subtext, fontSize: 18, ...mono }}>ЦВЕТ ЛИНИИ</div>
  </div>
);

const StatusPhase: React.FC<{ local: number; fps: number; impactLocal: number; enter: number }> = ({
  local,
  fps,
  impactLocal,
  enter,
}) => {
  const focus = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 14, mass: 0.7 } });
  return (
    <>
      <Header phase="status" opacity={enter} />
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 470,
          width: 840,
          height: 470,
          borderRadius: 30,
          border: `3px solid ${theme.warning}66`,
          background: `${theme.panel}E8`,
          boxShadow: `0 0 42px ${theme.warning}1A`,
          opacity: enter,
        }}
      >
        <div style={{ position: "absolute", left: 0, right: 0, top: 30, textAlign: "center", color: theme.subtext, fontSize: 21, ...mono }}>
          АГРЕГИРОВАННАЯ СКОРОСТЬ ВЫБИРАЕТ СОСТОЯНИЕ
        </div>
        <StatusCard left={45} title="СВОБОДНО" value="48 КМ/Ч" color={theme.success} opacity={enter} active={focus < 0.5} />
        <StatusCard left={430} title="МЕДЛЕННО" value="18 КМ/Ч" color={theme.warning} opacity={enter * (0.65 + 0.35 * focus)} active={focus >= 0.5} />
      </div>
      <div style={{ position: "absolute", left: CX, top: 950, transform: "translateX(-50%)", color: theme.warning, fontSize: 25, ...mono, opacity: enter }}>
        СВОДНАЯ СКОРОСТЬ → СТАТУС УЧАСТКА
      </div>
      <FooterBadge text="НЕ ОДИН ТЕЛЕФОН · ОБЩЕЕ СОСТОЯНИЕ" color={theme.warning} opacity={enter} />
      <PulseRing x={CX + 190} y={710} triggerFrame={impactLocal} tone="warning" size={190} />
    </>
  );
};

const DelayPhase: React.FC<{ local: number; fps: number; impactLocal: number; enter: number }> = ({
  local,
  fps,
  impactLocal,
  enter,
}) => {
  const red = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.75 } });
  const carShift = smooth(interpolate(local, [0, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <>
      <Header phase="delay" opacity={enter} />
      <RoadFrame opacity={enter} labelColor={theme.danger}>
        <div style={{ position: "absolute", left: 62, top: 82, width: 385, height: 62, borderRadius: 15, background: `${theme.success}2A`, border: `4px solid ${theme.success}99` }}>
          <div style={{ textAlign: "center", color: theme.success, fontSize: 20, paddingTop: 17, ...mono }}>СВОБОДНО · 42 КМ/Ч</div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 445,
            top: 82,
            width: 350,
            height: 62,
            borderRadius: 15,
            background: `${theme.danger}${red > 0.35 ? "B8" : "45"}`,
            border: `4px solid ${theme.danger}`,
            boxShadow: `0 0 36px ${theme.danger}66`,
            opacity: 0.62 + 0.38 * red,
          }}
        >
          <div style={{ textAlign: "center", color: theme.text, fontSize: 20, paddingTop: 17, ...mono }}>ЗАДЕРЖКА · 12 КМ/Ч</div>
        </div>
        <div style={{ position: "absolute", left: 442, top: 155, width: 356, height: 9, borderRadius: 6, background: theme.danger, boxShadow: `0 0 24px ${theme.danger}`, opacity: 0.65 + red * 0.35 }} />
        <div style={{ position: "absolute", left: 180 + carShift * 120, top: 210, transform: "translate(-50%, -50%)" }}>
          <IconGlyph name="car-front" size={62} color={theme.success} strokeWidth={1.8} />
        </div>
        <div style={{ position: "absolute", left: 652, top: 208, transform: "translate(-50%, -50%)" }}>
          <IconGlyph name="alert-triangle" size={55} color={theme.danger} strokeWidth={1.8} />
        </div>
        <div style={{ position: "absolute", left: 505, top: 237, color: theme.danger, fontSize: 17, ...mono }}>КРАСНАЯ ЛИНИЯ</div>
      </RoadFrame>
      <div
        style={{
          position: "absolute",
          left: 250,
          top: 930,
          width: 580,
          height: 130,
          borderRadius: 22,
          border: `3px solid ${theme.danger}`,
          background: `${theme.danger}18`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          color: theme.danger,
          fontSize: 26,
          ...mono,
          opacity: enter * (0.7 + 0.3 * red),
        }}
      >
        <IconGlyph name="alert-triangle" size={36} color={theme.danger} strokeWidth={1.8} />
        <span>СЕРЬЁЗНАЯ ЗАДЕРЖКА</span>
      </div>
      <FooterBadge text="КРАСНЫЙ = СКОРОСТЬ УЧАСТКА УПАЛА" color={theme.danger} opacity={enter * (0.7 + 0.3 * red)} />
      <PulseRing x={ROAD_X + INNER_X + 620} y={ROAD_Y + INNER_Y + 112} triggerFrame={impactLocal} tone="danger" size={240} />
    </>
  );
};

/** Дорожный участок: от коллективных GPS-сигналов к сводной скорости и цвету задержки. */
export const TrafficSegmentVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "ahead" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });

  if (phase === "ahead") return <AheadPhase local={local} fps={fps} impactLocal={impactLocal} enter={enter} />;
  if (phase === "phones") return <PhonesPhase local={local} fps={fps} impactLocal={impactLocal} enter={enter} />;
  if (phase === "points") return <PointsPhase local={local} fps={fps} impactLocal={impactLocal} enter={enter} />;
  if (phase === "aggregate") return <AggregatePhase local={local} fps={fps} impactLocal={impactLocal} enter={enter} />;
  if (phase === "status") return <StatusPhase local={local} fps={fps} impactLocal={impactLocal} enter={enter} />;
  return <DelayPhase local={local} fps={fps} impactLocal={impactLocal} enter={enter} />;
};

export default TrafficSegmentVisual;

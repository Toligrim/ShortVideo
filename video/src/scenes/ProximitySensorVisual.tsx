import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type ProximitySensorPhase = "near" | "emit" | "threshold" | "lock";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: ProximitySensorPhase;
};

const W = layout.width;
const H = layout.height;
const PHONE_TOP = 450;
const PHONE_WIDTH = 260;
const PHONE_HEIGHT = 620;
const BASE_PHONE_LEFT = 182;
const HEAD_CX = 780;
const HEAD_CY = 720;
const EAR_CX = 530;
const EAR_CY = 690;
const SURFACE_X = 505;
const SURFACE_Y = 650;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.2,
};

const phaseTitle: Record<ProximitySensorPhase, string> = {
  near: "БЛИЗКО ≠ «УЗНАЛ УХО»",
  emit: "ИК-СВЕТОДИОД ШЛЁТ НЕВИДИМЫЙ СВЕТ",
  threshold: "ОТРАЖЕНИЕ СВЕРЯЕТСЯ С ПОРОГОМ",
  lock: "БЛИЗКО · ЭКРАН И ТАЧ ЗАПЕРТЫ",
};

const phaseColor: Record<ProximitySensorPhase, string> = {
  near: theme.accent,
  emit: theme.accent,
  threshold: theme.warning,
  lock: theme.success,
};

const movingPoint = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  progress: number
) => ({
  x: mix(from.x, to.x, clamp01(progress)),
  y: mix(from.y, to.y, clamp01(progress)),
});

const LegendChip: React.FC<{ left: number; color: string; label: string; detail: string }> = ({
  left,
  color,
  label,
  detail,
}) => (
  <div
    style={{
      position: "absolute",
      left,
      top: 1100,
      width: 390,
      height: 62,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "0 18px",
      borderRadius: 16,
      background: `${color}12`,
      border: `2px solid ${color}66`,
      color: theme.text,
      ...mono,
      fontSize: 18,
      whiteSpace: "nowrap",
    }}
  >
    <span
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 18px ${color}`,
        flex: "0 0 auto",
      }}
    />
    <span style={{ color }}>{label}</span>
    <span style={{ color: theme.subtext, fontSize: 16 }}>{detail}</span>
  </div>
);

const StatusBadge: React.FC<{ phase: ProximitySensorPhase; opacity: number; pop: number }> = ({
  phase,
  opacity,
  pop,
}) => {
  const color = phaseColor[phase];
  const text = {
    near: "УХО / ЩЕКА У СТЕКЛА · БЕЗ НАЖАТИЯ",
    emit: "ОТРАЖЕНИЕ ВОЗВРАЩАЕТСЯ В ПРИЁМНИК",
    lock: "ЭКРАН OFF · СЕНСОРНЫЙ ВВОД ЗАПЕРТ",
    threshold: "СВЕТ 82%  >  ПОРОГ 40% · БЛИЗКО",
  }[phase];
  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        top: 1200,
        width: 900,
        minHeight: 84,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "14px 28px",
        borderRadius: 999,
        background: `${color}16`,
        border: `3px solid ${color}99`,
        color,
        ...mono,
        fontSize: 22,
        textAlign: "center",
        whiteSpace: "nowrap",
        opacity,
        transform: `scale(${0.96 + pop * 0.04})`,
        boxShadow: `0 0 34px ${color}22`,
      }}
    >
      {phase === "lock" ? <IconGlyph name="lock-keyhole" size={28} color={color} strokeWidth={1.8} /> : null}
      {text}
    </div>
  );
};

/**
 * Proximity sensor in side view: the phone is beside an ear/cheek, an IR LED
 * sends an invisible beam, the photoreceiver gets the reflection, and the
 * threshold result turns the screen off and rejects touch input.
 */
export const ProximitySensorVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "near",
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit
    ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } })
    : 0;
  const approach = phase === "near" ? smooth(local / 42) : 1;
  const phoneLeft = BASE_PHONE_LEFT + 30 * approach;
  const phoneRight = phoneLeft + PHONE_WIDTH;
  const sensorX = phoneRight - 9;
  const led = { x: sensorX, y: PHONE_TOP + 76 };
  const receiver = { x: sensorX, y: PHONE_TOP + 116 };
  const reflection = { x: SURFACE_X, y: SURFACE_Y };
  const showBeam = phase !== "near";
  const beamIn = smooth((local + 6) / 28);
  const returnIn = smooth((local - 14) / 28);
  const outDot = movingPoint(led, reflection, smooth((local - 4) / 24));
  const returnDot = movingPoint(reflection, receiver, smooth((local - 20) / 24));
  const screenOff = phase === "lock" && hit;
  const lockProgress = phase === "lock" ? (hit ? pop : 0) : 0;
  const surfacePulse = 0.55 + 0.25 * Math.sin(local / 7);
  const color = phaseColor[phase];

  const header = (
    <div
      style={{
        position: "absolute",
        left: W / 2,
        top: 228,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        color,
        ...mono,
        fontSize: 23,
        whiteSpace: "nowrap",
        opacity: enter,
      }}
    >
      <IconGlyph name="scan-line" size={30} color={color} strokeWidth={1.8} />
      <span>{phaseTitle[phase]}</span>
    </div>
  );

  return (
    <div style={{ position: "relative", width: W, height: H, overflow: "hidden" }}>
      {header}

      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        {/* Телефон: стекло видно спереди, сенсорный узел смотрит к уху справа. */}
        <g opacity={enter}>
          <rect
            x={phoneLeft}
            y={PHONE_TOP}
            width={PHONE_WIDTH}
            height={PHONE_HEIGHT}
            rx={38}
            fill={`url(#phone-gradient-${phase})`}
            stroke={`${theme.accent2}AA`}
            strokeWidth={4}
          />
          <rect
            x={phoneLeft + 19}
            y={PHONE_TOP + 55}
            width={PHONE_WIDTH - 38}
            height={PHONE_HEIGHT - 78}
            rx={24}
            fill={screenOff ? theme.bg : "#102330"}
            stroke={screenOff ? `${theme.subtext}66` : `${theme.accent}66`}
            strokeWidth={3}
          />
          <rect
            x={phoneLeft + 102}
            y={PHONE_TOP + 21}
            width={56}
            height={9}
            rx={6}
            fill={theme.bg}
            stroke={`${theme.panelBorder}`}
            strokeWidth={2}
          />
          <text
            x={phoneLeft + 130}
            y={PHONE_TOP + 92}
            textAnchor="middle"
            fill={screenOff ? theme.subtext : theme.accent}
            fontFamily={theme.mono}
            fontSize={19}
            fontWeight={800}
            letterSpacing={2}
          >
            СТЕКЛО
          </text>
          {!screenOff ? (
            <>
              <circle cx={phoneLeft + 130} cy={PHONE_TOP + 245} r={54} fill={`${theme.accent}16`} stroke={`${theme.accent}88`} strokeWidth={3} />
              <path
                d={`M ${phoneLeft + 103} ${PHONE_TOP + 245} C ${phoneLeft + 112} ${PHONE_TOP + 220}, ${phoneLeft + 148} ${PHONE_TOP + 220}, ${phoneLeft + 157} ${PHONE_TOP + 245}`}
                fill="none"
                stroke={theme.accent}
                strokeWidth={7}
                strokeLinecap="round"
              />
              <text
                x={phoneLeft + 130}
                y={PHONE_TOP + 330}
                textAnchor="middle"
                fill={theme.text}
                fontFamily={theme.mono}
                fontSize={25}
                fontWeight={800}
                letterSpacing={2}
              >
                ЗВОНОК
              </text>
              <text
                x={phoneLeft + 130}
                y={PHONE_TOP + 480}
                textAnchor="middle"
                fill={theme.subtext}
                fontFamily={theme.mono}
                fontSize={18}
                fontWeight={800}
                letterSpacing={1}
              >
                СЕНСОРНЫЙ ЭКРАН
              </text>
            </>
          ) : (
            <>
              <text
                x={phoneLeft + 130}
                y={PHONE_TOP + 302}
                textAnchor="middle"
                fill={theme.subtext}
                fontFamily={theme.mono}
                fontSize={27}
                fontWeight={800}
                letterSpacing={2}
                opacity={0.75 + lockProgress * 0.25}
              >
                ЭКРАН ПОГАШЕН
              </text>
              <circle
                cx={phoneLeft + 130}
                cy={PHONE_TOP + 422}
                r={42 + lockProgress * 8}
                fill={`${theme.danger}12`}
                stroke={theme.danger}
                strokeWidth={3}
                opacity={0.7 + lockProgress * 0.3}
              />
              <path
                d={`M ${phoneLeft + 98} ${PHONE_TOP + 390} L ${phoneLeft + 162} ${PHONE_TOP + 454} M ${phoneLeft + 162} ${PHONE_TOP + 390} L ${phoneLeft + 98} ${PHONE_TOP + 454}`}
                stroke={theme.danger}
                strokeWidth={7}
                strokeLinecap="round"
                opacity={0.7 + lockProgress * 0.3}
              />
              <text
                x={phoneLeft + 130}
                y={PHONE_TOP + 510}
                textAnchor="middle"
                fill={theme.danger}
                fontFamily={theme.mono}
                fontSize={18}
                fontWeight={800}
                letterSpacing={1}
              >
                ТАЧ · ОТКЛОНЁН
              </text>
            </>
          )}

          {/* Два разных физических элемента датчика у края стекла. */}
          <circle cx={led.x} cy={led.y} r={11} fill={theme.accent} stroke={theme.text} strokeWidth={2} />
          <circle cx={receiver.x} cy={receiver.y} r={11} fill={theme.accent2} stroke={theme.text} strokeWidth={2} />
          <line x1={phoneLeft + 238} y1={PHONE_TOP + 42} x2={phoneRight + 5} y2={PHONE_TOP + 42} stroke={`${theme.text}55`} strokeWidth={2} />
        </g>

        <defs>
          <linearGradient id={`phone-gradient-${phase}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={theme.panelBorder} />
            <stop offset="100%" stopColor={theme.bg} />
          </linearGradient>
        </defs>

        {/* Ухо/щека рядом со стеклом: это физическая поверхность, не распознаваемый ID. */}
        <g opacity={enter}>
          <ellipse cx={HEAD_CX} cy={HEAD_CY} rx={250} ry={330} fill={`${theme.panel}DD`} stroke={`${theme.accent2}88`} strokeWidth={4} />
          <path
            d={`M ${HEAD_CX - 174} ${HEAD_CY - 260} C ${HEAD_CX - 86} ${HEAD_CY - 338}, ${HEAD_CX + 126} ${HEAD_CY - 324}, ${HEAD_CX + 198} ${HEAD_CY - 214}`}
            fill="none"
            stroke={`${theme.accent2}55`}
            strokeWidth={22}
            strokeLinecap="round"
          />
          <ellipse cx={EAR_CX} cy={EAR_CY} rx={58} ry={92} fill={`${theme.accent2}20`} stroke={theme.accent2} strokeWidth={4} />
          <path
            d={`M ${EAR_CX + 3} ${EAR_CY - 42} C ${EAR_CX - 34} ${EAR_CY - 54}, ${EAR_CX - 40} ${EAR_CY + 18}, ${EAR_CX - 8} ${EAR_CY + 25} C ${EAR_CX + 27} ${EAR_CY + 31}, ${EAR_CX + 28} ${EAR_CY - 12}, ${EAR_CX + 3} ${EAR_CY - 42}`}
            fill="none"
            stroke={`${theme.accent2}CC`}
            strokeWidth={5}
          />
          <path
            d={`M ${EAR_CX - 48} ${EAR_CY + 84} C ${EAR_CX + 4} ${EAR_CY + 122}, ${EAR_CX + 86} ${EAR_CY + 104}, ${EAR_CX + 114} ${EAR_CY + 58}`}
            fill="none"
            stroke={`${theme.warning}99`}
            strokeWidth={8}
            strokeLinecap="round"
          />
          <circle cx={HEAD_CX + 42} cy={HEAD_CY - 34} r={10} fill={theme.text} />
          <text x={HEAD_CX + 104} y={HEAD_CY + 245} textAnchor="middle" fill={theme.subtext} fontFamily={theme.mono} fontSize={20} fontWeight={800} letterSpacing={2}>
            ЛИЦО
          </text>
          <text x={EAR_CX} y={EAR_CY + 142} textAnchor="middle" fill={theme.accent2} fontFamily={theme.mono} fontSize={19} fontWeight={800} letterSpacing={1}>
            УХО / ЩЕКА
          </text>
        </g>

        {/* Невидимый ИК-путь: LED → отражение от кожи → фотоприёмник. */}
        {showBeam ? (
          <g>
            <line
              x1={led.x}
              y1={led.y}
              x2={reflection.x}
              y2={reflection.y}
              stroke={theme.accent}
              strokeWidth={7}
              strokeDasharray="13 13"
              strokeDashoffset={-local * 2}
              opacity={enter * (0.35 + 0.65 * beamIn)}
            />
            <line
              x1={reflection.x}
              y1={reflection.y}
              x2={receiver.x}
              y2={receiver.y}
              stroke={theme.accent2}
              strokeWidth={7}
              strokeDasharray="13 13"
              strokeDashoffset={local * 2}
              opacity={enter * (0.25 + 0.75 * returnIn)}
            />
            <circle cx={reflection.x} cy={reflection.y} r={18 + 5 * surfacePulse} fill={`${theme.accent}22`} stroke={theme.accent} strokeWidth={3} opacity={enter * surfacePulse} />
            <circle cx={outDot.x} cy={outDot.y} r={9} fill={theme.accent} opacity={enter * beamIn} />
            <circle cx={returnDot.x} cy={returnDot.y} r={9} fill={theme.accent2} opacity={enter * returnIn} />
            <text x={reflection.x + 24} y={reflection.y - 20} fill={theme.warning} fontFamily={theme.mono} fontSize={18} fontWeight={800} letterSpacing={1}>
              ОТРАЖЕНИЕ
            </text>
          </g>
        ) : null}

        {/* Близость видна геометрически: короткий зазор, но нет стрелки нажатия. */}
        {phase === "near" ? (
          <g opacity={enter}>
            <line x1={phoneRight} y1={590} x2={phoneRight} y2={820} stroke={theme.accent} strokeWidth={3} strokeDasharray="8 10" opacity={0.75} />
            <circle cx={phoneRight} cy={SURFACE_Y} r={16} fill={`${theme.accent}22`} stroke={theme.accent} strokeWidth={3} />
            <text x={phoneRight + 34} y={975} textAnchor="start" fill={theme.accent} fontFamily={theme.mono} fontSize={18} fontWeight={800} letterSpacing={1}>
              СТЕКЛО ↔ КОЖА · БЕЗ НАЖАТИЯ
            </text>
          </g>
        ) : null}

      </svg>

      {phase === "lock" && hit ? <PulseRing x={reflection.x} y={reflection.y} triggerFrame={impactLocal} tone="success" size={230} /> : null}

      {phase !== "near" ? (
        <>
          <div
            style={{
              position: "absolute",
              left: sensorX - 153,
              top: PHONE_TOP + 10,
              width: 230,
              padding: "9px 12px",
              borderRadius: 12,
              background: `${theme.accent}18`,
              border: `2px solid ${theme.accent}66`,
              color: theme.accent,
              ...mono,
              fontSize: 16,
              textAlign: "center",
              whiteSpace: "nowrap",
              opacity: enter,
            }}
          >
            ИК-СВЕТОДИОД · НЕВИДИМЫЙ
          </div>
          <div
            style={{
              position: "absolute",
              left: sensorX - 153,
              top: PHONE_TOP + 142,
              width: 230,
              padding: "9px 12px",
              borderRadius: 12,
              background: `${theme.accent2}18`,
              border: `2px solid ${theme.accent2}66`,
              color: theme.accent2,
              ...mono,
              fontSize: 16,
              textAlign: "center",
              whiteSpace: "nowrap",
              opacity: enter,
            }}
          >
            ФОТОПРИЁМНИК · RX
          </div>
        </>
      ) : null}

      {phase === "threshold" ? (
        <div
          style={{
            position: "absolute",
            left: 170,
            top: 1010,
            width: 740,
            height: 62,
            borderRadius: 18,
            background: `${theme.warning}12`,
            border: `2px solid ${theme.warning}66`,
            opacity: enter,
          }}
        >
          <div style={{ position: "absolute", left: 18, top: 17, color: theme.subtext, ...mono, fontSize: 16 }}>СВЕТ</div>
          <div style={{ position: "absolute", left: 92, top: 19, width: 410, height: 22, borderRadius: 12, background: theme.panelBorder, overflow: "hidden" }}>
            <div style={{ width: "82%", height: "100%", borderRadius: 12, background: theme.warning, boxShadow: `0 0 22px ${theme.warning}88` }} />
            <div style={{ position: "absolute", left: "40%", top: -5, width: 3, height: 32, background: theme.text }} />
          </div>
          <div style={{ position: "absolute", left: 525, top: 17, color: theme.warning, ...mono, fontSize: 16 }}>82% &gt; 40%</div>
          <div style={{ position: "absolute", right: 18, top: 15, color: theme.success, ...mono, fontSize: 20 }}>БЛИЗКО</div>
        </div>
      ) : null}

      <LegendChip left={135} color={theme.accent} label="ИК-СВЕТОДИОД" detail="луч" />
      <LegendChip left={555} color={theme.accent2} label="ФОТОПРИЁМНИК" detail="RX" />
      <StatusBadge phase={phase} opacity={enter} pop={pop} />
    </div>
  );
};

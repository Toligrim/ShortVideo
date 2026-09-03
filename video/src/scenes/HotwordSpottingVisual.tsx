import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type HotwordSpottingPhase = "listen" | "features" | "trigger" | "offline";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: HotwordSpottingPhase;
};

const W = layout.width;
const H = layout.height;
const CX = W / 2;
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

const phaseTitle: Record<HotwordSpottingPhase, string> = {
  listen: "ДЕЖУРНЫЙ СЛУШАЕТ ЛОКАЛЬНО",
  features: "ПОТОК ЗВУКА → ЧИСЛОВЫЕ ПРИЗНАКИ",
  trigger: "ПОРОГ БУДИТ ОСНОВНОЙ ПРОЦЕССОР",
  offline: "БЕЗ СЕТИ · ТОЛЬКО АКТИВАЦИЯ",
};

const phaseIcon: Record<HotwordSpottingPhase, string> = {
  listen: "shield-check",
  features: "audio-lines",
  trigger: "cpu",
  offline: "wifi-off",
};

const phaseColor: Record<HotwordSpottingPhase, string> = {
  listen: theme.accent,
  features: theme.accent2,
  trigger: theme.success,
  offline: theme.warning,
};

const Header: React.FC<{ phase: HotwordSpottingPhase; enter: number }> = ({ phase, enter }) => {
  const color = phaseColor[phase];
  return (
    <div
      style={{
        position: "absolute",
        left: CX,
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
      <IconGlyph name={phaseIcon[phase]} size={30} color={color} strokeWidth={1.8} />
      <span>{phaseTitle[phase]}</span>
    </div>
  );
};

const Panel: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  title: string;
  icon: string;
  enter: number;
  titleSize?: number;
  children: React.ReactNode;
}> = ({ x, y, width, height, color, title, icon, enter, titleSize, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 26,
      background: `${theme.panel}EE`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 38px ${color}1E`,
      opacity: enter,
      transform: `translateY(${(1 - enter) * 28}px)`,
      overflow: "hidden",
    }}
  >
    <div
      style={{
        position: "absolute",
        left: 26,
        top: 22,
        right: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color,
        ...mono,
        fontSize: titleSize ?? 21,
        whiteSpace: "nowrap",
      }}
    >
      <IconGlyph name={icon} size={30} color={color} strokeWidth={1.8} />
      <span>{title}</span>
    </div>
    {children}
  </div>
);

const Chip: React.FC<{
  x: number;
  y: number;
  width?: number;
  text: string;
  color: string;
  opacity?: number;
}> = ({ x, y, width = 220, text, color, opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      boxSizing: "border-box",
      padding: "11px 14px",
      borderRadius: 15,
      background: `${color}16`,
      border: `2px solid ${color}88`,
      color,
      textAlign: "center",
      ...mono,
      fontSize: 18,
      whiteSpace: "nowrap",
      opacity,
    }}
  >
    {text}
  </div>
);

const BottomBadge: React.FC<{ text: string; color: string; enter: number; scale?: number }> = ({
  text,
  color,
  enter,
  scale = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left: 70,
      top: 1190,
      width: 940,
      minHeight: 78,
      boxSizing: "border-box",
      padding: "16px 28px",
      borderRadius: 999,
      background: `${color}16`,
      border: `3px solid ${color}99`,
      color,
      textAlign: "center",
      ...mono,
      fontSize: 22,
      whiteSpace: "nowrap",
      opacity: enter,
      transform: `scale(${0.96 + 0.04 * scale})`,
      boxShadow: `0 0 34px ${color}24`,
    }}
  >
    {text}
  </div>
);

const NetworkOff: React.FC<{ x: number; y: number; opacity: number; size?: number }> = ({
  x,
  y,
  opacity,
  size = 48,
}) => (
  <div style={{ position: "absolute", left: x, top: y, opacity }}>
    <IconGlyph name="wifi-off" size={size} color={theme.danger} strokeWidth={1.8} />
    <div
      style={{
        position: "absolute",
        left: -7,
        top: size / 2 - 2,
        width: size + 14,
        height: 4,
        borderRadius: 4,
        background: theme.danger,
        transform: "rotate(-38deg)",
        boxShadow: `0 0 14px ${theme.danger}99`,
      }}
    />
  </div>
);

const ArrowLine: React.FC<{ x1: number; x2: number; y: number; color: string; opacity: number }> = ({
  x1,
  x2,
  y,
  color,
  opacity,
}) => (
  <svg
    width={W}
    height={H}
    viewBox={`0 0 ${W} ${H}`}
    style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity }}
  >
    <line x1={x1} y1={y} x2={x2 - 13} y2={y} stroke={color} strokeWidth={4} strokeDasharray="12 10" />
    <path d={`M ${x2 - 20} ${y - 12} L ${x2} ${y} L ${x2 - 20} ${y + 12}`} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Waveform: React.FC<{ x: number; y: number; width: number; height: number; color: string; progress: number }> = ({
  x,
  y,
  width,
  height,
  color,
  progress,
}) => {
  const points = Array.from({ length: 15 }, (_, i) => {
    const xx = (i / 14) * width;
    const envelope = 0.35 + 0.65 * Math.sin((i + progress * 5) * 0.9) ** 2;
    const yy = height / 2 + Math.sin(i * 1.7 + progress * 4) * height * 0.33 * envelope;
    return `${xx},${yy}`;
  }).join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", left: x, top: y, overflow: "visible" }}
    >
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={`${color}44`} strokeWidth={2} strokeDasharray="6 8" />
      <polyline points={points} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const NumericVector: React.FC<{ x: number; y: number; color: string; opacity: number; compact?: boolean }> = ({
  x,
  y,
  color,
  opacity,
  compact = false,
}) => {
  const values = ["0,18", "0,72", "0,04", "0,91", "0,33", "0,64", "0,12", "0,80"];
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: compact ? 250 : 210,
        display: "grid",
        gridTemplateColumns: compact ? "repeat(4, 1fr)" : "repeat(2, 1fr)",
        gap: compact ? 8 : 10,
        opacity,
      }}
    >
      {values.map((value, index) => (
        <div
          key={value}
          style={{
            padding: compact ? "9px 4px" : "11px 5px",
            borderRadius: 10,
            border: `2px solid ${color}${index % 3 === 0 ? "AA" : "55"}`,
            background: `${color}${index % 3 === 0 ? "1C" : "0D"}`,
            color: index % 3 === 0 ? color : theme.text,
            textAlign: "center",
            ...mono,
            fontSize: compact ? 17 : 18,
          }}
        >
          {value}
        </div>
      ))}
    </div>
  );
};

const ListenPhase: React.FC<{ local: number; enter: number; impactLocal: number }> = ({ local, enter, impactLocal }) => {
  const pulse = 0.72 + 0.18 * Math.sin(local / 6);
  return (
    <>
      <Panel x={60} y={400} width={460} height={620} color={theme.accent} title="ТЕЛЕФОН" icon="smartphone" enter={enter}>
        <div
          style={{
            position: "absolute",
            left: 134,
            top: 100,
            width: 192,
            height: 350,
            borderRadius: 32,
            border: `5px solid ${theme.accent}AA`,
            background: `${theme.bg}CC`,
            boxShadow: `0 0 30px ${theme.accent}22`,
          }}
        >
          <div style={{ position: "absolute", left: 68, top: 30, opacity: pulse }}>
            <IconGlyph name="mic" size={54} color={theme.accent} strokeWidth={1.8} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 105, textAlign: "center", color: theme.text, ...mono, fontSize: 19 }}>
            ОКЕЙ, ГУГЛ
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 166, textAlign: "center", color: theme.accent, ...mono, fontSize: 16 }}>
            СЛУШАЮ
          </div>
          <div style={{ position: "absolute", left: 28, right: 28, top: 224, height: 3, background: `${theme.accent}55` }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 246, textAlign: "center", color: theme.subtext, ...mono, fontSize: 14 }}>
            ЛОКАЛЬНО
          </div>
        </div>
        <NetworkOff x={44} y={122} opacity={enter} size={48} />
        <div style={{ position: "absolute", left: 28, right: 28, bottom: 46, textAlign: "center", color: theme.danger, ...mono, fontSize: 18 }}>
          СЕТЬ ПЕРЕЧЁРКНУТА
        </div>
      </Panel>

      <Panel x={560} y={400} width={460} height={620} color={theme.accent2} title="ДЕЖУРНЫЙ · ДСП" icon="shield-check" enter={enter}>
        <div
          style={{
            position: "absolute",
            left: 50,
            top: 100,
            width: 360,
            height: 164,
            borderRadius: 20,
            border: `2px solid ${theme.accent2}66`,
            background: `${theme.accent2}0D`,
          }}
        >
          <IconGlyph name="door-open" size={54} color={theme.accent2} strokeWidth={1.7} />
          <div style={{ position: "absolute", left: 76, top: 26, color: theme.text, ...mono, fontSize: 22 }}>ДЕЖУРНЫЙ</div>
          <div style={{ position: "absolute", left: 76, top: 68, color: theme.subtext, ...mono, fontSize: 16 }}>ПРОПУСКАЕТ ПАРОЛЬ</div>
          <Chip x={76} y={103} width={245} text="ОКЕЙ, ГУГЛ" color={theme.warning} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 50,
            top: 304,
            width: 360,
            height: 164,
            borderRadius: 20,
            border: `2px solid ${theme.accent}66`,
            background: `${theme.accent}0D`,
          }}
        >
          <IconGlyph name="cpu" size={52} color={theme.accent} strokeWidth={1.7} />
          <div style={{ position: "absolute", left: 76, top: 24, color: theme.accent, ...mono, fontSize: 20 }}>ДСП · МАЛОМОЩНЫЙ</div>
          <div style={{ position: "absolute", left: 76, top: 66, color: theme.subtext, ...mono, fontSize: 16 }}>СЛУШАЕТ НЕПРЕРЫВНО</div>
          <div style={{ position: "absolute", left: 76, top: 103, color: theme.text, ...mono, fontSize: 16 }}>НЕ РАЗБИРАЕТ ВСЮ БЕСЕДУ</div>
        </div>
      </Panel>
      <BottomBadge text="ДЕЖУРНЫЙ ОТКРЫВАЕТ ДВЕРЬ ТОЛЬКО ПО ПАРОЛЮ" color={theme.accent2} enter={enter} />
      <PulseRing x={250} y={640} triggerFrame={impactLocal} tone="accent" size={190} />
    </>
  );
};

const FeaturesPhase: React.FC<{ local: number; enter: number; impactLocal: number }> = ({ local, enter, impactLocal }) => {
  const streamProgress = smooth(local / 28);
  const windowProgress = smooth((local - 8) / 28);
  const featureProgress = smooth((local - 18) / 34);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 55,
          top: 385,
          width: 970,
          height: 650,
          borderRadius: 28,
          background: `${theme.panel}BC`,
          border: `3px solid ${theme.accent2}55`,
          boxShadow: `0 0 40px ${theme.accent2}16`,
          opacity: enter,
        }}
      />
      <Chip x={315} y={415} width={450} text="ДСП · МАЛОМОЩНЫЙ АУДИОПРОЦЕССОР" color={theme.accent2} opacity={enter} />
      <Panel x={80} y={500} width={260} height={430} color={theme.accent} title="ПОТОК ЗВУКА" icon="mic" enter={enter}>
        <Waveform x={25} y={150} width={210} height={120} color={theme.accent} progress={streamProgress} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 292, textAlign: "center", color: theme.text, ...mono, fontSize: 20 }}>НЕПРЕРЫВНО</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 334, textAlign: "center", color: theme.subtext, ...mono, fontSize: 16 }}>МИКРОФОН → ДСП</div>
      </Panel>
      <ArrowLine x1={350} x2={385} y={715} color={theme.accent} opacity={enter * (0.25 + 0.75 * windowProgress)} />
      <Panel x={385} y={500} width={260} height={430} color={theme.warning} title="ОКНА" icon="scissors" enter={enter}>
        <div style={{ position: "absolute", left: 34, top: 142, width: 192 }}>
          {[0, 1, 2].map((index) => {
            const reveal = smooth((local - 8 - index * 8) / 16);
            return (
              <div
                key={index}
                style={{
                  height: 52,
                  marginBottom: 15,
                  borderRadius: 12,
                  border: `3px solid ${theme.warning}${index === 1 ? "CC" : "66"}`,
                  background: `${theme.warning}${index === 1 ? "22" : "0D"}`,
                  color: index === 1 ? theme.warning : theme.subtext,
                  opacity: enter * (0.35 + 0.65 * reveal),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  ...mono,
                  fontSize: 18,
                }}
              >
                ОКНО {index + 1}
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 355, textAlign: "center", color: theme.warning, ...mono, fontSize: 17 }}>ЗВУК РЕЖЕТСЯ</div>
      </Panel>
      <ArrowLine x1={655} x2={690} y={715} color={theme.warning} opacity={enter * (0.25 + 0.75 * featureProgress)} />
      <Panel x={690} y={500} width={260} height={430} color={theme.accent2} title="ПРИЗНАКИ" icon="sliders-horizontal" enter={enter}>
        <NumericVector x={25} y={142} color={theme.accent2} opacity={enter * (0.2 + 0.8 * featureProgress)} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 380, textAlign: "center", color: theme.accent2, ...mono, fontSize: 17 }}>НАБОР ЧИСЕЛ</div>
      </Panel>
      <BottomBadge text="ПОТОК → ОКНА → ЧИСЛОВЫЕ ПРИЗНАКИ" color={theme.accent2} enter={enter} />
      <PulseRing x={820} y={720} triggerFrame={impactLocal} tone="accent2" size={200} />
    </>
  );
};

const ConfidenceGauge: React.FC<{ local: number; impactLocal: number; opacity: number }> = ({ local, impactLocal, opacity }) => {
  const confidence = interpolate(smooth(local / Math.max(impactLocal, 1)), [0, 1], [0.25, 0.94]);
  const threshold = 0.8;
  const hit = confidence >= threshold;
  return (
    <div style={{ position: "absolute", left: 34, top: 350, width: 302, opacity }}>
      <div style={{ display: "flex", justifyContent: "space-between", color: theme.subtext, ...mono, fontSize: 16 }}>
        <span>УВЕРЕННОСТЬ</span>
        <span style={{ color: hit ? theme.success : theme.warning }}>{confidence.toFixed(2).replace(".", ",")}</span>
      </div>
      <div style={{ position: "relative", marginTop: 14, height: 18, borderRadius: 99, background: theme.panelBorder, overflow: "visible" }}>
        <div style={{ width: `${confidence * 100}%`, height: "100%", borderRadius: 99, background: hit ? theme.success : theme.warning, boxShadow: `0 0 18px ${hit ? theme.success : theme.warning}88` }} />
        <div style={{ position: "absolute", left: `${threshold * 100}%`, top: -14, bottom: -14, width: 4, background: theme.text, boxShadow: `0 0 12px ${theme.text}88` }} />
      </div>
      <div style={{ marginTop: 12, textAlign: "right", color: theme.text, ...mono, fontSize: 15 }}>ПОРОГ 0,80</div>
    </div>
  );
};

const TriggerPhase: React.FC<{ local: number; fps: number; enter: number; impactLocal: number }> = ({ local, fps, enter, impactLocal }) => {
  const wake = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const preWake = 0.36 + 0.64 * wake;
  return (
    <>
      <Panel x={40} y={405} width={278} height={575} color={theme.accent} title="ТЕЛЕФОН · СЕТИ НЕТ" titleSize={15} icon="smartphone" enter={enter}>
        <NetworkOff x={112} y={104} opacity={enter} size={46} />
        <Chip x={29} y={185} width={220} text="ОКЕЙ, ГУГЛ" color={theme.accent} opacity={enter} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 264, textAlign: "center", color: theme.subtext, ...mono, fontSize: 16 }}>ФРАЗА ПОЙМАНА</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 358, textAlign: "center", color: theme.accent, ...mono, fontSize: 18 }}>ТОЛЬКО ЛОКАЛЬНО</div>
      </Panel>
      <ArrowLine x1={325} x2={355} y={700} color={theme.accent} opacity={enter} />
      <Panel x={355} y={405} width={370} height={575} color={theme.warning} title="КЛАССИФИКАТОР" icon="scan-line" enter={enter}>
        <div style={{ position: "absolute", left: 40, top: 100, color: theme.warning, ...mono, fontSize: 16 }}>МАЛЕНЬКАЯ МОДЕЛЬ</div>
        <div style={{ position: "absolute", left: 40, top: 128, color: theme.subtext, ...mono, fontSize: 16 }}>СРАВНИВАЕТ С ШАБЛОНОМ</div>
        <Chip x={45} y={170} width={280} text="ОКЕЙ, ГУГЛ" color={theme.warning} opacity={enter} />
        <NumericVector x={60} y={248} color={theme.accent2} opacity={enter} compact />
        <ConfidenceGauge local={local} impactLocal={impactLocal} opacity={enter} />
      </Panel>
      <ArrowLine x1={732} x2={762} y={700} color={theme.success} opacity={enter * preWake} />
      <Panel x={762} y={405} width={278} height={575} color={theme.success} title="ОСНОВНОЙ ПРОЦЕССОР" titleSize={15} icon="cpu" enter={enter}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 118, textAlign: "center", color: theme.success, ...mono, fontSize: 19, opacity: preWake }}>ПРОБУЖДЁН</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 220, textAlign: "center", color: wake > 0.3 ? theme.text : theme.subtext, ...mono, fontSize: 17, opacity: preWake }}>ПОЛНЫЙ</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 252, textAlign: "center", color: wake > 0.3 ? theme.text : theme.subtext, ...mono, fontSize: 17, opacity: preWake }}>РАСПОЗНАВАТЕЛЬ</div>
        <div style={{ position: "absolute", left: 32, right: 32, top: 330, height: 3, background: `${theme.success}55`, opacity: preWake }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 372, textAlign: "center", color: theme.subtext, ...mono, fontSize: 15, opacity: preWake }}>ЖДЁТ ВОПРОС</div>
      </Panel>
      <BottomBadge text="ПОРОГ ПРЕВЫШЕН · ПРОЦЕССОР ПРОСНУЛСЯ" color={theme.success} enter={enter * (0.5 + 0.5 * preWake)} scale={preWake} />
      <PulseRing x={900} y={700} triggerFrame={impactLocal} tone="success" size={230} />
    </>
  );
};

const OfflinePhase: React.FC<{ local: number; enter: number; impactLocal: number }> = ({ local, enter, impactLocal }) => {
  const reveal = smooth(local / Math.max(impactLocal, 1));
  return (
    <>
      <Panel x={65} y={415} width={435} height={570} color={theme.success} title="ЛОКАЛЬНО" icon="smartphone" enter={enter}>
        <NetworkOff x={188} y={100} opacity={enter} size={46} />
        <Chip x={75} y={185} width={285} text="ОКЕЙ, ГУГЛ" color={theme.success} opacity={enter} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 272, textAlign: "center", color: theme.success, ...mono, fontSize: 20 }}>АКТИВАЦИЯ ✓</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 365, textAlign: "center", color: theme.subtext, ...mono, fontSize: 16 }}>ФРАЗА УСЛЫШАНА</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 428, textAlign: "center", color: theme.warning, ...mono, fontSize: 15 }}>ВОЗМОЖНОСТИ ЗАВИСЯТ ОТ ТЕЛЕФОНА</div>
      </Panel>
      <ArrowLine x1={510} x2={570} y={700} color={theme.danger} opacity={enter * reveal} />
      <Panel x={580} y={415} width={435} height={570} color={theme.danger} title="ПОЛНЫЙ ОТВЕТ" icon="cloud-off" enter={enter}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 112, textAlign: "center", color: theme.subtext, ...mono, fontSize: 18 }}>ВОПРОС</div>
        <div style={{ position: "absolute", left: 74, right: 74, top: 158, height: 3, background: `${theme.danger}55` }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 206, textAlign: "center", color: theme.subtext, ...mono, fontSize: 18, opacity: 0.6 }}>ОТВЕТ</div>
        <div style={{ position: "absolute", left: 62, top: 195, width: 310, height: 5, borderRadius: 5, background: theme.danger, transform: "rotate(-12deg)", opacity: 0.85 }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 330, textAlign: "center", color: theme.danger, ...mono, fontSize: 19 }}>СЕТИ НЕТ · НЕ УХОДИТ</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 415, textAlign: "center", color: theme.subtext, ...mono, fontSize: 16 }}>ПОЛНАЯ РАСШИФРОВКА ЖДЁТ СЕТЬ</div>
      </Panel>
      <BottomBadge text="БЕЗ СЕТИ: ТОЛЬКО ПРОБУЖДЕНИЕ · ОТВЕТУ НУЖНА СЕТЬ" color={theme.warning} enter={enter} />
      <PulseRing x={285} y={700} triggerFrame={impactLocal} tone="success" size={210} />
    </>
  );
};

/** Буквальный конвейер keyword spotting: локальный ДСП слушает, извлекает признаки, поднимает порог и будит CPU. */
export const HotwordSpottingVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "listen" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });

  return (
    <div style={{ position: "relative", width: W, height: H, overflow: "hidden" }}>
      <Header phase={phase} enter={enter} />
      {phase === "listen" ? <ListenPhase local={local} enter={enter} impactLocal={impactLocal} /> : null}
      {phase === "features" ? <FeaturesPhase local={local} enter={enter} impactLocal={impactLocal} /> : null}
      {phase === "trigger" ? <TriggerPhase local={local} fps={fps} enter={enter} impactLocal={impactLocal} /> : null}
      {phase === "offline" ? <OfflinePhase local={local} enter={enter} impactLocal={impactLocal} /> : null}
    </div>
  );
};

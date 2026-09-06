import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type GpuDataCenterPhase = "hall" | "scale" | "queue" | "parallel" | "shards";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: GpuDataCenterPhase;
}

const W = layout.width;
const CX = W / 2;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

const phaseInfo: Record<GpuDataCenterPhase, { title: string; icon: string; color: string }> = {
  hall: { title: "ЗАЛ ДАТА-ЦЕНТРА", icon: "building-2", color: theme.accent },
  scale: { title: "МАСШТАБ · ТЫСЯЧИ GPU", icon: "server", color: theme.accent2 },
  queue: { title: "БЕЗ GPU · ОТВЕТ ЕСТЬ, НО ЖДЁТ", icon: "clock-3", color: theme.warning },
  parallel: { title: "ОДИН GPU · МНОЖЕСТВО ОПЕРАЦИЙ", icon: "cpu", color: theme.accent },
  shards: { title: "НЕСКОЛЬКО GPU · ОДНА МОДЕЛЬ", icon: "layers", color: theme.success },
};

const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 2,
};

const Header: React.FC<{ phase: GpuDataCenterPhase; opacity: number }> = ({ phase, opacity }) => {
  const info = phaseInfo[phase];
  return (
    <div
      style={{
        position: "absolute",
        left: CX,
        top: 226,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        ...mono,
        fontSize: 24,
        color: info.color,
        opacity,
        whiteSpace: "nowrap",
      }}
    >
      <IconGlyph name={info.icon} size={30} color={info.color} strokeWidth={1.8} />
      {info.title}
    </div>
  );
};

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color?: string;
  opacity?: number;
  children: React.ReactNode;
}> = ({ left, top, width, height, color = theme.accent, opacity = 1, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      borderRadius: 28,
      background: `${theme.panel}E8`,
      border: `3px solid ${color}66`,
      boxShadow: `0 0 48px ${color}1C`,
      opacity,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const Rack: React.FC<{
  x: number;
  y: number;
  width?: number;
  height?: number;
  color: string;
  opacity?: number;
  index: number;
  compact?: boolean;
  activeP?: number;
}> = ({ x, y, width = 190, height = 360, color, opacity = 1, index, compact = false, activeP = 1 }) => {
  const slots = compact ? 4 : 5;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        borderRadius: 20,
        background: `${theme.bg}CC`,
        border: `3px solid ${color}88`,
        boxShadow: `0 0 26px ${color}20`,
        opacity,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 16,
          top: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
          ...mono,
          fontSize: 15,
          color,
        }}
      >
        <IconGlyph name="server" size={22} color={color} strokeWidth={1.7} />
        RACK {String(index + 1).padStart(2, "0")}
      </div>
      {Array.from({ length: slots }).map((_, i) => {
        const lit = clamp01((activeP * (slots + 1) - i) / 1.4);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 16,
              right: 16,
              top: 64 + i * (compact ? 64 : 57),
              height: compact ? 44 : 40,
              borderRadius: 10,
              background: `${color}${lit > 0.4 ? "22" : "0B"}`,
              border: `2px solid ${color}${lit > 0.4 ? "99" : "38"}`,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 10px",
              color: lit > 0.4 ? theme.text : theme.subtext,
              opacity: 0.45 + 0.55 * lit,
              transform: `translateX(${lit > 0.7 ? 4 : 0}px)`,
            }}
          >
            <IconGlyph name="cpu" size={compact ? 20 : 18} color={lit > 0.4 ? color : theme.subtext} strokeWidth={1.7} />
            <span style={{ ...mono, fontSize: compact ? 14 : 13, letterSpacing: 1 }}>GPU</span>
            <span style={{ marginLeft: "auto", ...mono, fontSize: 12, color: lit > 0.4 ? color : theme.subtext }}>
              {lit > 0.4 ? "ON" : "—"}
            </span>
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: 18,
          right: 18,
          bottom: 16,
          height: 4,
          borderRadius: 4,
          background: `linear-gradient(90deg, ${color}00, ${color}CC, ${color}00)`,
          opacity: 0.7,
        }}
      />
    </div>
  );
};

const SmallLabel: React.FC<{ x: number; y: number; text: string; color?: string; opacity?: number }> = ({
  x,
  y,
  text,
  color = theme.subtext,
  opacity = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: "translateX(-50%)",
      ...mono,
      fontSize: 17,
      color,
      opacity,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

const BottomPill: React.FC<{ text: string; color: string; opacity: number; scale?: number; y?: number }> = ({
  text,
  color,
  opacity,
  scale = 1,
  y = 1160,
}) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: y,
      transform: `translateX(-50%) scale(${scale})`,
      padding: "14px 28px",
      borderRadius: 999,
      background: `${color}18`,
      border: `3px solid ${color}`,
      color,
      ...mono,
      fontSize: 23,
      textAlign: "center",
      whiteSpace: "nowrap",
      opacity,
      boxShadow: `0 0 34px ${color}3A`,
    }}
  >
    {text}
  </div>
);

const RequestPill: React.FC<{ x: number; y: number; label: string; color: string; opacity: number; drift: number }> = ({
  x,
  y,
  label,
  color,
  opacity,
  drift,
}) => (
  <div
    style={{
      position: "absolute",
      left: x + drift,
      top: y,
      transform: "translate(-50%, -50%)",
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 18px",
      borderRadius: 999,
      background: `${color}18`,
      border: `2px solid ${color}AA`,
      color: theme.text,
      ...mono,
      fontSize: 18,
      opacity,
      whiteSpace: "nowrap",
    }}
  >
    <IconGlyph name="message-circle" size={22} color={color} strokeWidth={1.8} />
    {label}
  </div>
);

/** Наблюдаемый дата-центр: стойки GPU, масштаб парка, очередь без него и шардирование модели. */
export const GpuDataCenterVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "hall" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hit = local >= impactLocal;
  const pop = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  const info = phaseInfo[phase];

  if (phase === "hall") {
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <Panel left={58} top={370} width={964} height={620} color={theme.accent} opacity={enter}>
          <div style={{ position: "absolute", left: 28, top: 24, display: "flex", alignItems: "center", gap: 10, ...mono, fontSize: 20, color: theme.accent }}>
            <IconGlyph name="server" size={28} color={theme.accent} strokeWidth={1.7} />
            СЕРВЕРНЫЙ ЗАЛ · ХОЛОДНЫЙ КОРИДОР
          </div>
          {[0, 1, 2, 3].map((i) => (
            <Rack key={i} x={45 + i * 226} y={102} index={i} color={i % 2 ? theme.accent2 : theme.accent} opacity={enter} />
          ))}
          <div
            style={{
              position: "absolute",
              left: 45,
              right: 45,
              bottom: 28,
              height: 6,
              borderRadius: 8,
              background: `repeating-linear-gradient(90deg, ${theme.accent}88 0 42px, transparent 42px 78px)`,
              opacity: 0.75,
            }}
          />
        </Panel>
        <SmallLabel x={CX} y={1036} text="ЗДЕСЬ ИДЁТ РАСЧЁТ ОТВЕТА" color={theme.text} opacity={enter} />
        <BottomPill text="ИИ-ЗАПРОС → СТОЙКИ → РАСЧЁТ" color={info.color} opacity={enter} y={1130} />
        <PulseRing x={CX} y={690} triggerFrame={impactLocal} tone="accent" size={260} />
      </>
    );
  }

  if (phase === "scale") {
    const activeP = smooth(clamp01((local - 4) / 28));
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <Panel left={48} top={370} width={984} height={640} color={theme.accent2} opacity={enter}>
          <div style={{ position: "absolute", left: 30, top: 24, display: "flex", alignItems: "center", gap: 10, ...mono, fontSize: 20, color: theme.accent2 }}>
            <IconGlyph name="server" size={28} color={theme.accent2} strokeWidth={1.7} />
            ПОВТОРЯЮЩИЕСЯ GPU-МОДУЛИ
          </div>
          {[0, 1, 2, 3].map((i) => (
            <Rack
              key={i}
              x={38 + i * 228}
              y={100}
              height={390}
              index={i}
              color={i % 2 ? theme.accent : theme.accent2}
              opacity={enter}
              compact
              activeP={clamp01(activeP + i * 0.08)}
            />
          ))}
          <div style={{ position: "absolute", left: 40, right: 40, bottom: 28, display: "flex", alignItems: "center", justifyContent: "space-between", ...mono }}>
            <span style={{ color: theme.subtext, fontSize: 18 }}>ОДИНАКОВЫЕ УЗЛЫ</span>
            <span style={{ color: theme.accent2, fontSize: 32 }}>GPU × 1000+</span>
          </div>
        </Panel>
        <SmallLabel x={CX} y={1050} text="БОЛЬШОЙ ПАРК ОДИНАКОВЫХ УСКОРИТЕЛЕЙ" color={theme.text} opacity={enter} />
        <BottomPill text="ТЫСЯЧИ GPU В ОДНОМ РАСЧЁТЕ" color={theme.accent2} opacity={enter * (0.35 + 0.65 * pop)} scale={0.92 + 0.08 * pop} y={1132} />
        <PulseRing x={CX} y={710} triggerFrame={impactLocal} tone="accent2" size={280} />
      </>
    );
  }

  if (phase === "queue") {
    const removeP = smooth(clamp01((local - impactLocal) / 18));
    const queueP = smooth(clamp01((local - impactLocal + 4) / 28));
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <Panel left={50} top={410} width={372} height={550} color={theme.danger} opacity={enter * (1 - 0.24 * removeP)}>
          <div style={{ position: "absolute", left: 26, top: 24, display: "flex", alignItems: "center", gap: 9, ...mono, fontSize: 20, color: theme.danger }}>
            <IconGlyph name="server" size={28} color={theme.danger} strokeWidth={1.7} />
            GPU-ПАРК
          </div>
          <Rack x={86} y={100} width={200} height={320} index={0} color={theme.danger} compact opacity={enter * (1 - 0.6 * removeP)} activeP={1 - 0.7 * removeP} />
          <div style={{ position: "absolute", left: 186, top: 258, transform: `translate(-50%, -50%) rotate(-18deg) scale(${0.7 + 0.3 * removeP})`, color: theme.danger, fontSize: 160, fontWeight: 300, opacity: removeP, textShadow: `0 0 30px ${theme.danger}66` }}>×</div>
          <SmallLabel x={186} y={470} text="УБРАЛИ" color={theme.danger} opacity={enter * removeP} />
        </Panel>
        <Panel left={455} top={410} width={575} height={620} color={theme.warning} opacity={enter}>
          <div style={{ position: "absolute", left: 28, top: 24, display: "flex", alignItems: "center", gap: 9, ...mono, fontSize: 20, color: theme.warning }}>
            <IconGlyph name="list" size={28} color={theme.warning} strokeWidth={1.8} />
            ОЧЕРЕДЬ ЗАПРОСОВ
          </div>
          {[0, 1, 2, 3].map((i) => {
            const rowP = smooth(clamp01((queueP * 4 - i) / 1.2));
            const rowColor = i === 0 ? theme.success : theme.warning;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 28,
                  right: 28,
                  top: 105 + i * 102,
                  height: 68,
                  borderRadius: 15,
                  background: `${rowColor}${i === 0 ? "1D" : "12"}`,
                  border: `2px solid ${rowColor}${i === 0 ? "AA" : "55"}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "0 18px",
                  color: i === 0 ? theme.text : theme.subtext,
                  ...mono,
                  fontSize: 18,
                  opacity: enter * (0.35 + 0.65 * rowP),
                  transform: `translateX(${4 * rowP}px)`,
                }}
              >
                <IconGlyph name={i === 0 ? "check" : "clock-3"} size={25} color={rowColor} strokeWidth={1.9} />
                {i === 0 ? "ОТВЕТ ГОТОВ" : `ЗАПРОС № ${i + 1}`}
                {i > 0 ? <span style={{ marginLeft: "auto", color: theme.warning }}>ЖДЁТ</span> : null}
              </div>
            );
          })}
          <div style={{ position: "absolute", left: 28, right: 28, bottom: 24, display: "flex", justifyContent: "space-between", ...mono, fontSize: 17 }}>
            <span style={{ color: theme.subtext }}>РАСЧЁТ ВОЗМОЖЕН</span>
            <span style={{ color: theme.warning }}>ВРЕМЯ ↑</span>
          </div>
        </Panel>
        <BottomPill text="ЕСТЬ ОТВЕТ · НО ЖДЁМ ДОЛЬШЕ" color={theme.warning} opacity={enter * (0.3 + 0.7 * pop)} scale={0.9 + 0.1 * pop} y={1160} />
        <PulseRing x={760} y={650} triggerFrame={impactLocal} tone="warning" size={260} />
      </>
    );
  }

  if (phase === "parallel") {
    const opP = smooth(clamp01((local - 4) / 26));
    const operations = ["×", "+", "×", "+", "×", "+", "×", "+", "×", "+", "×", "+"];
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <Panel left={48} top={420} width={342} height={500} color={theme.accent} opacity={enter}>
          <div style={{ position: "absolute", left: 26, top: 24, ...mono, fontSize: 19, color: theme.accent }}>ОДНА ВИДЕОКАРТА</div>
          <div style={{ position: "absolute", left: 171, top: 118, transform: "translateX(-50%)", color: theme.accent, opacity: enter }}>
            <IconGlyph name="cpu" size={126} color={theme.accent} strokeWidth={1.4} />
          </div>
          <div style={{ position: "absolute", left: 171, top: 263, transform: "translateX(-50%)", ...mono, fontSize: 25, color: theme.text }}>GPU</div>
          <div style={{ position: "absolute", left: 28, right: 28, bottom: 28, display: "flex", justifyContent: "space-between", ...mono, fontSize: 16, color: theme.subtext }}>
            <span>ПОТОКИ</span><span style={{ color: theme.accent }}>МНОГО</span>
          </div>
        </Panel>
        <div style={{ position: "absolute", left: 405, top: 650, transform: "translate(-50%, -50%)", color: theme.accent, fontSize: 60, opacity: enter }}>→</div>
        <Panel left={455} top={420} width={577} height={500} color={theme.accent2} opacity={enter}>
          <div style={{ position: "absolute", left: 28, top: 24, ...mono, fontSize: 19, color: theme.accent2 }}>ОДИНАКОВЫЕ ОПЕРАЦИИ</div>
          <div style={{ position: "absolute", left: 28, right: 28, top: 94, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {operations.map((op, i) => {
              const tileP = smooth(clamp01((opP * operations.length - i) / 2.2));
              return (
                <div
                  key={`${op}-${i}`}
                  style={{
                    height: 76,
                    borderRadius: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: `${theme.accent2}${tileP > 0.5 ? "2E" : "0B"}`,
                    border: `2px solid ${theme.accent2}${tileP > 0.5 ? "CC" : "45"}`,
                    color: tileP > 0.5 ? theme.accent2 : theme.subtext,
                    fontFamily: theme.mono,
                    fontWeight: 900,
                    fontSize: 38,
                    opacity: 0.35 + 0.65 * tileP,
                    transform: `scale(${0.92 + 0.08 * tileP})`,
                  }}
                >
                  {op}
                </div>
              );
            })}
          </div>
          <div style={{ position: "absolute", left: 28, right: 28, bottom: 30, textAlign: "center", ...mono, fontSize: 23, color: theme.text }}>
            <span style={{ color: theme.accent2 }}>× + × + × +</span> · ВСЕ СРАЗУ
          </div>
        </Panel>
        <BottomPill text="МНОЖЕСТВО ОДИНАКОВЫХ ОПЕРАЦИЙ → ПАРАЛЛЕЛЬНО" color={theme.accent} opacity={enter * (0.3 + 0.7 * pop)} scale={0.9 + 0.1 * pop} y={1110} />
        <PulseRing x={622} y={660} triggerFrame={impactLocal} tone="accent" size={260} />
      </>
    );
  }

  const shardP = smooth(clamp01((local - 4) / 24));
  const shardColors = [theme.accent, theme.accent2, theme.success];
  return (
    <>
      <Header phase={phase} opacity={enter} />
      <Panel left={44} top={420} width={268} height={490} color={theme.warning} opacity={enter}>
        <div style={{ position: "absolute", left: 24, top: 24, ...mono, fontSize: 18, color: theme.warning }}>БОЛЬШАЯ МОДЕЛЬ</div>
        <div style={{ position: "absolute", left: 48, top: 100, width: 172, height: 270, borderRadius: 20, background: `${theme.warning}12`, border: `3px solid ${theme.warning}88`, padding: 14 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: 36, marginBottom: 9, borderRadius: 9, background: `${theme.warning}${i === 4 ? "55" : "20"}`, border: `2px solid ${theme.warning}66`, display: "flex", alignItems: "center", justifyContent: "center", ...mono, fontSize: 13, color: theme.warning }}>
              СЛОЙ {i + 1}
            </div>
          ))}
        </div>
      </Panel>
      {[0, 1, 2].map((i) => {
        const cardP = smooth(clamp01((shardP * 3 - i) / 1.1));
        const color = shardColors[i];
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", left: 335 + i * 226, top: 610, transform: "translate(-50%, -50%)", color, fontSize: 46, opacity: enter * cardP }}>→</div>
            <Panel left={350 + i * 226} top={420} width={194} height={490} color={color} opacity={enter * (0.35 + 0.65 * cardP)}>
              <div style={{ position: "absolute", left: 22, top: 22, ...mono, fontSize: 17, color }}>GPU {String(i + 1).padStart(2, "0")}</div>
              <div style={{ position: "absolute", left: 65, top: 76, transform: "translateX(-50%)" }}>
                <IconGlyph name="cpu" size={58} color={color} strokeWidth={1.5} />
              </div>
              <div style={{ position: "absolute", left: 22, right: 22, top: 180 }}>
                {[0, 1, 2].map((j) => (
                  <div key={j} style={{ height: 48, marginBottom: 12, borderRadius: 11, background: `${color}${j === i ? "42" : "16"}`, border: `2px solid ${color}${j === i ? "CC" : "55"}`, display: "flex", alignItems: "center", justifyContent: "center", ...mono, fontSize: 14, color: j === i ? theme.text : theme.subtext, opacity: cardP }}>
                    ЧАСТЬ {j + 1}
                  </div>
                ))}
              </div>
              <div style={{ position: "absolute", left: 20, right: 20, bottom: 22, textAlign: "center", ...mono, fontSize: 14, color: theme.subtext }}>ДЕРЖИТ ФРАГМЕНТ</div>
            </Panel>
          </React.Fragment>
        );
      })}
      <RequestPill x={470} y={1010} label="ЗАПРОС 1" color={theme.accent} opacity={enter * shardP} drift={8 * Math.sin(local / 12)} />
      <RequestPill x={720} y={1080} label="ЗАПРОС 2" color={theme.accent2} opacity={enter * smooth(clamp01((shardP - 0.25) / 0.75))} drift={8 * Math.sin(local / 14 + 1)} />
      <BottomPill text="ЧАСТИ МОДЕЛИ · БОЛЬШЕ ОДНОВРЕМЕННЫХ ЗАПРОСОВ" color={theme.success} opacity={enter * (0.3 + 0.7 * pop)} scale={0.88 + 0.12 * pop} y={1190} />
      <PulseRing x={690} y={660} triggerFrame={impactLocal} tone="success" size={260} />
    </>
  );
};

export default GpuDataCenterVisual;

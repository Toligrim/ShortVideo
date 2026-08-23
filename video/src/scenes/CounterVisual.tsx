import React from "react";
import { random, spring } from "remotion";
import { theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

const W = 1080;

export type CounterPhase =
  | "exact"
  | "flip"
  | "decay"
  | "formula"
  | "logarithm"
  | "accuracy"
  | "tradeoff";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: CounterPhase;
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

const EVENT_START = 14;
const EVENT_EVERY = 6;
const EVENT_COUNT = 64;
const DEMO_LEVEL = 17;

interface SimEvent {
  inc: boolean;
  levelBefore: number;
}

const SIM: SimEvent[] = (() => {
  const out: SimEvent[] = [];
  let level = 0;
  for (let i = 0; i < EVENT_COUNT; i++) {
    const prob = Math.pow(2, -Math.min(level, 30));
    const inc = random(`morris-flip-${i}`) < prob;
    out.push({ inc, levelBefore: level });
    if (inc) level += 1;
  }
  return out;
})();

const simSeen = (local: number) =>
  Math.max(0, Math.min(EVENT_COUNT, Math.floor((local - EVENT_START) / EVENT_EVERY) + 1));

const simLevel = (local: number) => {
  const seen = simSeen(local);
  return seen === 0 ? 0 : SIM[seen - 1].levelBefore + (SIM[seen - 1].inc ? 1 : 0);
};

const chancePercent = (level: number) => 100 / Math.pow(2, Math.max(0, level));

const Label: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 300,
      transform: "translateX(-50%)",
      fontFamily: theme.mono,
      fontSize: 28,
      letterSpacing: 4,
      color: theme.subtext,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

const Badge: React.FC<{ text: string; tone: string; opacity: number }> = ({ text, tone, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 1290,
      transform: `translateX(-50%) scale(${0.9 + 0.1 * opacity})`,
      padding: "18px 36px",
      borderRadius: 999,
      background: `${tone}18`,
      border: `3px solid ${tone}`,
      color: tone,
      fontFamily: theme.mono,
      fontWeight: 800,
      fontSize: 32,
      whiteSpace: "nowrap",
      opacity,
      boxShadow: `0 0 45px ${tone}44`,
    }}
  >
    {text}
  </div>
);

const Card: React.FC<{
  children: React.ReactNode;
  color?: string;
  style?: React.CSSProperties;
}> = ({ children, color = theme.panelBorder, style }) => (
  <div
    style={{
      position: "absolute",
      left: 90,
      right: 90,
      background: theme.panel,
      border: `3px solid ${color}`,
      borderRadius: 26,
      padding: 34,
      textAlign: "center",
      boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
      ...style,
    }}
  >
    {children}
  </div>
);

const ByteRegister: React.FC<{ value: number; active?: boolean; compact?: boolean }> = ({
  value,
  active = false,
  compact = false,
}) => {
  const v = Math.max(0, Math.min(255, Math.round(value)));
  const bits = v.toString(2).padStart(8, "0").split("");
  const cell = compact ? 32 : 62;
  const gap = compact ? 4 : 10;
  return (
    <div style={{ display: "flex", gap, justifyContent: "center" }}>
      {bits.map((bit, i) => (
        <div
          key={i}
          style={{
            width: cell,
            height: compact ? 54 : 82,
            borderRadius: 14,
            background: bit === "1" ? (active ? theme.success : theme.accent) : "#0A0F18",
            border: `3px solid ${bit === "1" ? (active ? theme.success : theme.accent) : theme.panelBorder}`,
            color: bit === "1" ? "#06121A" : theme.subtext,
            fontFamily: theme.mono,
            fontSize: compact ? 28 : 38,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: bit === "1" ? `0 0 24px ${active ? theme.success : theme.accent}55` : "none",
          }}
        >
          {bit}
        </div>
      ))}
    </div>
  );
};

const ExactPhase: React.FC<{ local: number; fps: number; impactLocal: number; enter: number }> = ({
  local,
  fps,
  impactLocal,
  enter,
}) => {
  const value = Math.floor(local * (local / 26 + 7));
  const bits = value.toString(2).length;
  const cells = Math.min(12, Math.ceil(bits / 8));
  const hit = local >= impactLocal;
  const grow = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 11, mass: 0.7 } });
  return (
    <>
      <Label text="ТОЧНЫЙ СЧЁТЧИК" />
      <Card color={hit ? theme.warning : theme.accent} style={{ top: 420, opacity: enter }}>
        <div style={{ fontFamily: theme.mono, fontSize: 26, color: theme.subtext }}>СОБЫТИЙ ПОСЧИТАНО</div>
        <div
          style={{
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 112,
            color: hit ? theme.warning : theme.text,
            marginTop: 16,
            textShadow: `0 0 40px ${theme.accent}44`,
          }}
        >
          {fmt(value)}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 26 }}>
          {Array.from({ length: cells }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 54,
                height: 54,
                borderRadius: 10,
                background: `${theme.danger}22`,
                border: `2px solid ${theme.danger}99`,
                color: theme.danger,
                fontFamily: theme.mono,
                fontSize: 22,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              8Б
            </div>
          ))}
        </div>
        <div style={{ fontFamily: theme.font, fontSize: 30, color: theme.subtext, marginTop: 24 }}>
          каждое событие — плюс один · уже {bits} бит памяти
        </div>
      </Card>
      {hit ? <PulseRing x={W / 2} y={760} triggerFrame={impactLocal} tone="danger" size={420} /> : null}
      <Badge text="ПАМЯТЬ РАСТЁТ БЕЗ ПРЕДЕЛА" tone={theme.danger} opacity={grow} />
    </>
  );
};

const FlipPhase: React.FC<{ local: number; fps: number; impactLocal: number; enter: number }> = ({
  local,
  fps,
  impactLocal,
  enter,
}) => {
  const seen = simSeen(local);
  const level = simLevel(local);
  const lastInc = seen > 0 && SIM[seen - 1].inc;
  const approx = Math.pow(2, Math.min(level, 30)) - 1;
  const pct = chancePercent(level);
  const hit = local >= impactLocal;
  const recent = SIM.slice(Math.max(0, seen - 7), seen).reverse();
  const lastAt = EVENT_START + Math.max(0, seen - 1) * EVENT_EVERY;
  const coinPop =
    lastInc && seen > 0
      ? spring({ frame: Math.max(0, local - lastAt), fps, config: { damping: 10, mass: 0.6 } })
      : 0;
  return (
    <>
      <Label text="МОРРИС: ПЛЮС ОДИН — ТОЛЬКО ИНОГДА" />
      <Card color={hit ? theme.success : theme.panelBorder} style={{ top: 400, opacity: enter }}>
        <ByteRegister value={level} active={hit} />
        <div style={{ fontFamily: theme.mono, fontSize: 26, color: theme.subtext, marginTop: 20 }}>
          регистр: уровень {level} · один байт
        </div>
      </Card>
      <Card style={{ top: 770, opacity: enter }}>
        <div style={{ fontFamily: theme.mono, fontSize: 26, color: theme.subtext }}>
          ОЖИДАЕМО СОБЫТИЙ ≈ 2^УРОВЕНЬ
        </div>
        <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 92, color: theme.accent, marginTop: 12 }}>
          {fmt(approx)}
        </div>
        <div style={{ fontFamily: theme.font, fontSize: 30, color: theme.text, marginTop: 14 }}>
          шанс следующего шага:{" "}
          <span style={{ color: theme.accent2, fontWeight: 800 }}>
            {pct >= 1 ? pct.toFixed(1) : pct.toFixed(2)}%
          </span>
        </div>
      </Card>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1130,
          display: "flex",
          gap: 14,
          justifyContent: "center",
          opacity: enter,
        }}
      >
        {recent.map((e, i) => (
          <div
            key={`${seen}-${i}`}
            style={{
              width: 96,
              height: 72,
              borderRadius: 16,
              background: e.inc ? `${theme.success}22` : "#0A0F18",
              border: `3px solid ${e.inc ? theme.success : theme.panelBorder}`,
              color: e.inc ? theme.success : theme.subtext,
              fontFamily: theme.mono,
              fontSize: e.inc ? 34 : 40,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: i === 0 ? 0.4 + 0.6 * clamp01((local - lastAt) / 5) : 1 - i * 0.09,
            }}
          >
            {e.inc ? "+1" : "·"}
          </div>
        ))}
      </div>
      {lastInc && seen > 0 && coinPop > 0.05 ? (
        <PulseRing x={W / 2} y={520} triggerFrame={lastAt} tone="success" size={260} />
      ) : null}
      {hit ? <PulseRing x={W / 2} y={520} triggerFrame={impactLocal} tone="accent" size={300} /> : null}
      <Badge text={`СОБЫТИЙ: ${seen} · УРОВЕНЬ: ${level}`} tone={theme.accent} opacity={enter * 0.9} />
    </>
  );
};

const DecayPhase: React.FC<{ local: number; impactLocal: number; enter: number }> = ({
  local,
  impactLocal,
  enter,
}) => {
  const hit = local >= impactLocal;
  const active = Math.min(8, 1 + Math.floor(local / 15));
  return (
    <>
      <Label text="ЧЕМ ВЫШЕ ЧИСЛО — ТЕ РЕЖЕ ШАГ" />
      {[8, 7, 6, 5, 4, 3, 2, 1].map((x) => {
        const pct = chancePercent(x);
        const isActive = x <= active;
        const rowY = 400 + (8 - x) * 100;
        return (
          <div
            key={x}
            style={{
              position: "absolute",
              left: 110,
              right: 110,
              top: rowY,
              height: 84,
              borderRadius: 18,
              background: isActive ? `${theme.accent}14` : "#0A0F18",
              border: `2px solid ${isActive ? theme.accent : theme.panelBorder}`,
              opacity: enter * (isActive ? 1 : 0.45),
              display: "flex",
              alignItems: "center",
              paddingLeft: 24,
              gap: 18,
            }}
          >
            <div style={{ fontFamily: theme.mono, fontSize: 32, fontWeight: 800, color: theme.accent, width: 120 }}>
              X = {x}
            </div>
            <div style={{ flex: 1, height: 26, borderRadius: 13, background: "#141A26", overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.max(1.5, pct * 2)}%`,
                  height: "100%",
                  borderRadius: 13,
                  background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`,
                }}
              />
            </div>
            <div
              style={{
                fontFamily: theme.mono,
                fontSize: 28,
                fontWeight: 700,
                color: x === active ? theme.accent2 : theme.subtext,
                width: 150,
                textAlign: "right",
              }}
            >
              {pct >= 1 ? pct.toFixed(0) : pct.toFixed(2)}%
            </div>
          </div>
        );
      })}
      <Badge text={`ТЕКУЩИЙ УРОВЕНЬ X = ${active} → ШАНС ${chancePercent(active) >= 1 ? chancePercent(active).toFixed(0) : chancePercent(active).toFixed(2)}%`} tone={theme.accent2} opacity={enter * (hit ? 1 : 0.75)} />
      {hit ? <PulseRing x={W / 2} y={400 + (8 - active) * 100 + 42} triggerFrame={impactLocal} tone="accent2" size={240} /> : null}
    </>
  );
};

const FormulaPhase: React.FC<{ local: number; impactLocal: number; enter: number }> = ({
  local,
  impactLocal,
  enter,
}) => {
  const hit = local >= impactLocal;
  const level = Math.max(1, simLevel(local));
  const pct = chancePercent(level);
  return (
    <>
      <Label text="ВЕРОЯТНОСТЬ ШАГА" />
      <Card color={theme.accent2} style={{ top: 430, opacity: enter }}>
        <div style={{ fontFamily: theme.mono, fontSize: 26, color: theme.subtext }}>ПРАВИЛО МОРРИСА</div>
        <div
          style={{
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 130,
            color: theme.accent2,
            marginTop: 20,
            textShadow: `0 0 60px ${theme.accent2}55`,
          }}
        >
          P(+) = 2⁻ˣ
        </div>
        <div style={{ fontFamily: theme.font, fontSize: 34, color: theme.text, marginTop: 26 }}>
          сейчас в регистре X ={" "}
          <span style={{ fontFamily: theme.mono, fontWeight: 800, color: theme.accent }}>{level}</span> → шанс{" "}
          <span style={{ fontFamily: theme.mono, fontWeight: 800, color: theme.success }}>
            {pct >= 1 ? pct.toFixed(1) : pct.toFixed(2)}%
          </span>
        </div>
      </Card>
      {[
        { x: 1, note: "в начале — шаг почти каждый раз" },
        { x: 5, note: "уже заметно реже" },
        { x: 17, note: "шаг — редкость" },
      ].map((row, i) => (
        <div
          key={row.x}
          style={{
            position: "absolute",
            left: 110,
            width: 860,
            top: 900 + i * 110,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 30px",
            borderRadius: 20,
            background: "#0A0F18",
            border: `2px solid ${theme.panelBorder}`,
            opacity: enter * clamp01((local - 12 - i * 10) / 10),
          }}
        >
          <div style={{ fontFamily: theme.mono, fontSize: 34, fontWeight: 800, color: theme.accent }}>
            X = {row.x}
          </div>
          <div style={{ fontFamily: theme.mono, fontSize: 32, fontWeight: 700, color: theme.accent2 }}>
            {chancePercent(row.x) >= 1 ? chancePercent(row.x).toFixed(0) : chancePercent(row.x).toFixed(3)}%
          </div>
          <div style={{ fontFamily: theme.font, fontSize: 27, color: theme.subtext }}>{row.note}</div>
        </div>
      ))}
      <Badge text="ДВА В СТЕПЕНИ МИНУС УРОВЕНЬ" tone={theme.accent2} opacity={enter * (hit ? 1 : 0.7)} />
      {hit ? <PulseRing x={W / 2} y={640} triggerFrame={impactLocal} tone="accent2" size={380} /> : null}
    </>
  );
};

const LogarithmPhase: React.FC<{ local: number; fps: number; impactLocal: number; enter: number }> = ({
  local,
  fps,
  impactLocal,
  enter,
}) => {
  const hit = local >= impactLocal;
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  return (
    <>
      <Label text="ВНУТРИ ХРАНИТСЯ ЛОГАРИФМ" />
      <Card color={theme.accent} style={{ top: 420, width: 400, left: 90, boxSizing: "border-box", opacity: enter }}>
        <div style={{ fontFamily: theme.mono, fontSize: 25, color: theme.subtext }}>ХРАНИМ</div>
        <div style={{ marginTop: 22 }}>
          <ByteRegister value={DEMO_LEVEL} active={hit} compact />
        </div>
        <div style={{ fontFamily: theme.mono, fontSize: 44, fontWeight: 800, color: theme.accent, marginTop: 24 }}>
          X = {DEMO_LEVEL}
        </div>
      </Card>
      <div
        style={{
          position: "absolute",
          left: 500,
          top: 600,
          transform: "translate(-50%, -50%)",
          fontFamily: theme.mono,
          fontSize: 64,
          fontWeight: 800,
          color: theme.subtext,
          opacity: enter,
        }}
      >
        ≈
      </div>
      <Card color={theme.success} style={{ top: 420, width: 460, left: 550, boxSizing: "border-box", opacity: enter }}>
        <div style={{ fontFamily: theme.mono, fontSize: 25, color: theme.subtext }}>СЧИТАЕМ</div>
        <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 76, color: theme.success, marginTop: 30 }}>
          {fmt(Math.pow(2, DEMO_LEVEL) - 1)}
        </div>
        <div style={{ fontFamily: theme.font, fontSize: 28, color: theme.subtext, marginTop: 22 }}>
          событий ≈ 2^{DEMO_LEVEL} − 1
        </div>
      </Card>
      <Card style={{ top: 850, opacity: enter }}>
        <div style={{ fontFamily: theme.font, fontSize: 32, color: theme.text }}>
          не количество, а его логарифм: растёт на 1 — число удваивается
        </div>
      </Card>
      {hit ? <PulseRing x={W / 2} y={620} triggerFrame={impactLocal} tone="success" size={360} /> : null}
      <Badge text="8 БИТ ЛОВЯТ ДО 130 000 СОБЫТИЙ" tone={theme.success} opacity={reveal} />
    </>
  );
};

const AccuracyPhase: React.FC<{ local: number; fps: number; impactLocal: number; enter: number }> = ({
  local,
  fps,
  impactLocal,
  enter,
}) => {
  const hit = local >= impactLocal;
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const ERROR_DOTS = [7, 23, 41, 66, 88];
  return (
    <>
      <Label text="ЦЕНА ВОПРОСА — ОШИБКА" />
      <Card color={theme.warning} style={{ top: 410, opacity: enter }}>
        <div style={{ fontFamily: theme.mono, fontSize: 26, color: theme.subtext }}>ОТНОСИТЕЛЬНАЯ ОШИБКА</div>
        <div
          style={{
            fontFamily: theme.mono,
            fontWeight: 800,
            fontSize: 120,
            color: theme.warning,
            marginTop: 12,
            textShadow: `0 0 50px ${theme.warning}55`,
          }}
        >
          ≤ 24%
        </div>
        <div style={{ marginTop: 24, height: 30, borderRadius: 15, background: "#0A0F18", border: `2px solid ${theme.panelBorder}`, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${24 / 0.5}%`, background: `${theme.warning}33` }} />
          <div style={{ position: "absolute", left: `${24 / 0.5}%`, top: -8, bottom: -8, width: 6, background: theme.warning, transform: "translateX(-3px)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: theme.mono, fontSize: 24, color: theme.subtext, marginTop: 12 }}>
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
        </div>
      </Card>
      <Card style={{ top: 780, opacity: enter }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 10 }}>
          {Array.from({ length: 100 }).map((_, i) => {
            const bad = ERROR_DOTS.includes(i);
            const appear = clamp01((local - 16 - i * 0.7) / 8);
            return (
              <div
                key={i}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: bad ? `${theme.danger}33` : `${theme.success}22`,
                  border: `2px solid ${bad ? theme.danger : theme.success}88`,
                  opacity: appear,
                }}
              />
            );
          })}
        </div>
      </Card>
      {hit ? <PulseRing x={W / 2} y={1080} triggerFrame={impactLocal} tone="warning" size={320} /> : null}
      <Badge text="95 СЛУЧАЕВ ИЗ 100" tone={theme.warning} opacity={reveal} />
    </>
  );
};

const TradeoffPhase: React.FC<{ local: number; fps: number; impactLocal: number; enter: number }> = ({
  local,
  fps,
  impactLocal,
  enter,
}) => {
  const hit = local >= impactLocal;
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const cardStyle = (color: string): React.CSSProperties => ({
    position: "absolute",
    top: 430,
    width: 430,
    boxSizing: "border-box",
    padding: 36,
    borderRadius: 26,
    background: theme.panel,
    border: `3px solid ${color}`,
    boxShadow: `0 0 55px ${color}22`,
    textAlign: "center",
    opacity: enter,
  });
  return (
    <>
      <Label text="ТОЧНОСТЬ ↔ ПАМЯТЬ" />
      <div style={{ ...cardStyle(`${theme.danger}99`), left: 80 }}>
        <div style={{ fontFamily: theme.mono, fontSize: 25, color: theme.danger }}>ТОЧНЫЙ СЧЁТЧИК</div>
        <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 38, color: theme.text, marginTop: 22 }}>
          хранить каждую единицу
        </div>
        <div style={{ fontFamily: theme.mono, fontSize: 28, color: theme.subtext, marginTop: 22 }}>
          память ↑ без предела
        </div>
      </div>
      <div style={{ ...cardStyle(theme.success), left: 560, borderColor: hit ? theme.success : `${theme.success}99` }}>
        <div style={{ fontFamily: theme.mono, fontSize: 25, color: theme.success }}>СЧЁТЧИК МОРРИСА</div>
        <div style={{ fontFamily: theme.font, fontWeight: 800, fontSize: 38, color: theme.text, marginTop: 22 }}>
          заметить рост потока
        </div>
        <div style={{ fontFamily: theme.mono, fontSize: 28, color: theme.success, marginTop: 22 }}>
          память: 1 байт · всегда
        </div>
      </div>
      <Card style={{ top: 830, opacity: enter }}>
        <div style={{ fontFamily: theme.font, fontSize: 32, color: theme.text }}>
          для датчика и сетевой статистики важнее тренд, а не каждая единица
        </div>
      </Card>
      {hit ? <PulseRing x={775} y={640} triggerFrame={impactLocal} tone="success" size={340} /> : null}
      <Badge text="МАЛЕНЬКАЯ ОШИБКА — БОЛЬШАЯ ЭКОНОМИЯ" tone={theme.success} opacity={reveal} />
    </>
  );
};

export const CounterVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "flip" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  if (phase === "exact") return <ExactPhase local={local} fps={fps} impactLocal={impactLocal} enter={enter} />;
  if (phase === "flip") return <FlipPhase local={local} fps={fps} impactLocal={impactLocal} enter={enter} />;
  if (phase === "decay") return <DecayPhase local={local} impactLocal={impactLocal} enter={enter} />;
  if (phase === "formula") return <FormulaPhase local={local} impactLocal={impactLocal} enter={enter} />;
  if (phase === "logarithm")
    return <LogarithmPhase local={local} fps={fps} impactLocal={impactLocal} enter={enter} />;
  if (phase === "accuracy") return <AccuracyPhase local={local} fps={fps} impactLocal={impactLocal} enter={enter} />;
  return <TradeoffPhase local={local} fps={fps} impactLocal={impactLocal} enter={enter} />;
};

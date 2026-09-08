import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type StorageCapacityPhase =
  | "symptom"
  | "gap"
  | "scales"
  | "decimal"
  | "bytes"
  | "binary"
  | "division"
  | "result";

const W = layout.width;
const H = layout.height;
const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1,
};
const phaseTitle: Record<StorageCapacityPhase, string> = {
  symptom: "ОДИН НАКОПИТЕЛЬ · ДВА ПОКАЗАНИЯ",
  gap: "РАЗНИЦА В ПОКАЗАНИИ",
  scales: "ДВЕ ЛИНЕЙКИ · ОДИН ЗАПАС БАЙТОВ",
  decimal: "МАРКИРОВКА · ДЕСЯТИЧНАЯ ШКАЛА",
  bytes: "ЭТИКЕТКА ПЕРЕВОДИТСЯ В БАЙТЫ",
  binary: "ОС СЧИТАЕТ ДВОИЧНЫМИ ЕДИНИЦАМИ",
  division: "БУКВАЛЬНОЕ ДЕЛЕНИЕ",
  result: "ИТОГ · 128 GB → 119,2 GiB",
};

const phaseIcon: Record<StorageCapacityPhase, string> = {
  symptom: "hard-drive",
  gap: "scan-line",
  scales: "ruler",
  decimal: "factory",
  bytes: "database",
  binary: "monitor",
  division: "calculator",
  result: "check",
};

const phaseColor: Record<StorageCapacityPhase, string> = {
  symptom: theme.accent,
  gap: theme.danger,
  scales: theme.accent2,
  decimal: theme.accent,
  bytes: theme.accent,
  binary: theme.accent2,
  division: theme.warning,
  result: theme.success,
};

const Header: React.FC<{ phase: StorageCapacityPhase; enter: number }> = ({ phase, enter }) => (
  <div
    style={{
      position: "absolute",
      left: 32,
      right: 32,
      top: 220,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      color: phaseColor[phase],
      fontSize: 23,
      whiteSpace: "nowrap",
      opacity: enter,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={30} color={phaseColor[phase]} strokeWidth={1.8} />
    {phaseTitle[phase]}
  </div>
);

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  enter: number;
  children: React.ReactNode;
}> = ({ left, top, width, height, color, enter, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 26,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 18px 48px ${color}20`,
      opacity: enter,
      transform: `translateY(${(1 - enter) * 28}px)`,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const Pill: React.FC<{
  text: string;
  color: string;
  top: number;
  opacity: number;
  scale?: number;
}> = ({ text, color, top, opacity, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: "50%",
      top,
      transform: `translateX(-50%) scale(${scale})`,
      padding: "13px 28px",
      borderRadius: 999,
      background: `${color}18`,
      border: `3px solid ${color}99`,
      color,
      fontSize: 24,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    {text}
  </div>
);

const Ruler: React.FC<{
  top: number;
  color: string;
  title: string;
  count: string;
  detail: string;
  enter: number;
  emphasis?: number;
}> = ({ top, color, title, count, detail, enter, emphasis = 1 }) => (
  <Panel left={72} top={top} width={936} height={280} color={color} enter={enter}>
    <div style={{ position: "absolute", left: 28, top: 22, ...mono, fontSize: 22, color }}>
      {title}
    </div>
    <div
      style={{
        position: "absolute",
        left: 30,
        right: 30,
        top: 122,
        height: 8,
        borderRadius: 8,
        background: `${theme.subtext}55`,
        boxShadow: `0 0 18px ${color}22`,
      }}
    >
      {Array.from({ length: 11 }).map((_, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: `${index * 10}%`,
            top: index % 5 === 0 ? -24 : -13,
            width: 3,
            height: index % 5 === 0 ? 56 : 34,
            borderRadius: 3,
            background: color,
            opacity: 0.65 + emphasis * 0.35,
          }}
        />
      ))}
    </div>
    <div style={{ position: "absolute", left: 30, top: 162, ...mono, fontSize: 18, color: theme.subtext }}>
      0
    </div>
    <div style={{ position: "absolute", right: 30, top: 158, ...mono, fontSize: 34, color, whiteSpace: "nowrap" }}>
      {count}
    </div>
    <div style={{ position: "absolute", left: 30, top: 218, ...mono, fontSize: 20, color: theme.text }}>
      {detail}
    </div>
  </Panel>
);

const SymptomPhase: React.FC<{ enter: number; impactLocal: number }> = ({ enter, impactLocal }) => (
  <>
    <Panel left={58} top={430} width={425} height={390} color={theme.accent} enter={enter}>
      <div style={{ position: "absolute", top: 35, left: 0, right: 0, textAlign: "center" }}>
        <IconGlyph name="hard-drive" size={72} color={theme.accent} strokeWidth={1.7} />
      </div>
      <div style={{ position: "absolute", top: 142, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 23, color: theme.subtext }}>
        ЭТИКЕТКА НАКОПИТЕЛЯ
      </div>
      <div style={{ position: "absolute", top: 190, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 56, color: theme.text, whiteSpace: "nowrap" }}>
        128 GB
      </div>
      <div style={{ position: "absolute", top: 286, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 20, color: theme.accent }}>
        ОБЕЩАННЫЙ ОБЪЁМ
      </div>
    </Panel>
    <div style={{ position: "absolute", left: 482, top: 614, width: 116, borderTop: `4px dashed ${theme.subtext}99`, opacity: enter }}>
      <span style={{ position: "absolute", right: -2, top: -26, color: theme.subtext, fontSize: 38 }}>›</span>
    </div>
    <Panel left={597} top={430} width={425} height={390} color={theme.accent2} enter={enter}>
      <div style={{ position: "absolute", top: 35, left: 0, right: 0, textAlign: "center" }}>
        <IconGlyph name="monitor" size={72} color={theme.accent2} strokeWidth={1.7} />
      </div>
      <div style={{ position: "absolute", top: 142, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 23, color: theme.subtext }}>
        ПОКАЗАНИЕ КОМПЬЮТЕРА
      </div>
      <div style={{ position: "absolute", top: 190, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 49, color: theme.text, whiteSpace: "nowrap" }}>
        ≈119,2 GiB
      </div>
      <div style={{ position: "absolute", top: 286, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 20, color: theme.accent2 }}>
        ТОТ ЖЕ НАКОПИТЕЛЬ
      </div>
    </Panel>
    <Pill text="ОДИН ЗАПАС · ДВА ПОКАЗАНИЯ" color={theme.warning} top={1040} opacity={enter} />
    <PulseRing x={810} y={625} triggerFrame={impactLocal} tone="accent2" size={220} />
  </>
);

const GapPhase: React.FC<{ enter: number; local: number; fps: number; impactLocal: number }> = ({ enter, local, fps, impactLocal }) => {
  const pop = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.72 } });
  return (
    <>
      <Panel left={65} top={450} width={410} height={355} color={theme.accent} enter={enter}>
        <div style={{ position: "absolute", top: 34, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 22, color: theme.accent }}>
          НА ЭТИКЕТКЕ
        </div>
        <div style={{ position: "absolute", top: 125, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 58, color: theme.text }}>
          128 GB
        </div>
        <div style={{ position: "absolute", top: 230, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 20, color: theme.subtext }}>
          ДЕСЯТИЧНЫЕ ЕДИНИЦЫ
        </div>
      </Panel>
      <div style={{ position: "absolute", left: 475, top: 595, width: 130, textAlign: "center", color: theme.danger, ...mono, fontSize: 42, opacity: enter }}>
        →
      </div>
      <Panel left={605} top={450} width={410} height={355} color={theme.accent2} enter={enter}>
        <div style={{ position: "absolute", top: 34, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 22, color: theme.accent2 }}>
          НА ЭКРАНЕ
        </div>
        <div style={{ position: "absolute", top: 125, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 52, color: theme.text, whiteSpace: "nowrap" }}>
          ≈119,2 GiB
        </div>
        <div style={{ position: "absolute", top: 230, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 20, color: theme.subtext }}>
          ДВОИЧНЫЕ ЕДИНИЦЫ
        </div>
      </Panel>
      <Pill text="РАЗНИЦА ≈ 8,8 ЕДИНИЦЫ · ОКОЛО 9" color={theme.danger} top={1030} opacity={enter * (0.6 + pop * 0.4)} scale={0.96 + pop * 0.04} />
      <PulseRing x={810} y={625} triggerFrame={impactLocal} tone="danger" size={230} />
    </>
  );
};

const ScalesPhase: React.FC<{ enter: number; impactLocal: number }> = ({ enter, impactLocal }) => (
  <>
    <Ruler top={405} color={theme.accent} title="GB · ДЕСЯТИЧНАЯ ЛИНЕЙКА" count="1 000" detail="ОДИН ГИГАБАЙТ = 1 000 000 000 БАЙТ" enter={enter} />
    <Ruler top={755} color={theme.accent2} title="GiB · ДВОИЧНАЯ ЛИНЕЙКА" count="1 024" detail="ОДИН ГИБИБАЙТ = 1 073 741 824 БАЙТА" enter={enter} emphasis={0.8} />
    <Pill text="ОДИН МЕТР · РАЗНЫЕ ДЕЛЕНИЯ" color={theme.warning} top={1110} opacity={enter} />
    <PulseRing x={820} y={890} triggerFrame={impactLocal} tone="accent2" size={210} />
  </>
);

const DecimalPhase: React.FC<{ enter: number; impactLocal: number }> = ({ enter, impactLocal }) => (
  <>
    <Panel left={68} top={430} width={944} height={400} color={theme.accent} enter={enter}>
      <div style={{ position: "absolute", left: 36, top: 30, display: "flex", alignItems: "center", gap: 12, ...mono, fontSize: 23, color: theme.accent }}>
        <IconGlyph name="factory" size={34} color={theme.accent} strokeWidth={1.7} />
        ПРОИЗВОДИТЕЛЬ · УПАКОВКА
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 120, textAlign: "center", ...mono, fontSize: 58, color: theme.text }}>
        128 GB
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 210, textAlign: "center", color: theme.accent, fontSize: 42 }}>＝</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 278, textAlign: "center", ...mono, fontSize: 39, color: theme.text, whiteSpace: "nowrap" }}>
        128 000 000 000 B
      </div>
    </Panel>
    <Pill text="GB = 10⁹ БАЙТ · СЧЁТ ПО УПАКОВКЕ" color={theme.accent} top={955} opacity={enter} />
    <PulseRing x={540} y={630} triggerFrame={impactLocal} tone="accent" size={230} />
  </>
);

const BytesPhase: React.FC<{ enter: number; impactLocal: number }> = ({ enter, impactLocal }) => (
  <>
    <Panel left={58} top={440} width={964} height={420} color={theme.accent} enter={enter}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 32, textAlign: "center", ...mono, fontSize: 24, color: theme.accent }}>
        ОДИН И ТОТ ЖЕ ЗАПАС БАЙТОВ
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 132, textAlign: "center", ...mono, fontSize: 56, color: theme.text, whiteSpace: "nowrap" }}>
        128 000 000 000 B
      </div>
      <div style={{ position: "absolute", left: 105, right: 105, top: 244, height: 42, borderRadius: 12, background: `${theme.accent}18`, border: `2px solid ${theme.accent}66`, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, width: "100%", background: `linear-gradient(90deg, ${theme.accent}CC 0%, ${theme.accent}CC 78%, ${theme.accent2}AA 78%, ${theme.accent2}AA 100%)` }} />
      </div>
      <div style={{ position: "absolute", left: 105, top: 310, ...mono, fontSize: 19, color: theme.subtext }}>128 GB</div>
      <div style={{ position: "absolute", right: 105, top: 310, ...mono, fontSize: 19, color: theme.accent2 }}>ПОКА ЕЩЁ БЕЗ ПЕРЕВОДА</div>
    </Panel>
    <Pill text="МАРКИРОВКА = ЧИСЛО БАЙТОВ" color={theme.accent} top={1000} opacity={enter} />
    <PulseRing x={540} y={650} triggerFrame={impactLocal} tone="accent" size={230} />
  </>
);

const BinaryPhase: React.FC<{ enter: number; impactLocal: number }> = ({ enter, impactLocal }) => (
  <>
    <Panel left={52} top={430} width={456} height={440} color={theme.accent} enter={enter}>
      <div style={{ position: "absolute", top: 32, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 21, color: theme.accent }}>
        ТОТ ЖЕ ЗАПАС
      </div>
      <div style={{ position: "absolute", top: 125, left: 20, right: 20, textAlign: "center", ...mono, fontSize: 34, color: theme.text, whiteSpace: "nowrap" }}>
        128 000 000 000 B
      </div>
      <div style={{ position: "absolute", top: 247, left: 0, right: 0, textAlign: "center", color: theme.accent, fontSize: 43 }}>↓</div>
      <div style={{ position: "absolute", top: 329, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 20, color: theme.subtext }}>
        БАЙТЫ НЕ ИСЧЕЗЛИ
      </div>
    </Panel>
    <div style={{ position: "absolute", left: 508, top: 640, width: 64, textAlign: "center", color: theme.accent2, fontSize: 42, opacity: enter }}>→</div>
    <Panel left={572} top={430} width={456} height={440} color={theme.accent2} enter={enter}>
      <div style={{ position: "absolute", top: 32, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 21, color: theme.accent2 }}>
        ПОКАЗАНИЕ ОС
      </div>
      <div style={{ position: "absolute", top: 125, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 57, color: theme.text, whiteSpace: "nowrap" }}>
        ≈119,2 GiB
      </div>
      <div style={{ position: "absolute", top: 247, left: 0, right: 0, textAlign: "center", color: theme.accent2, fontSize: 43 }}>↓</div>
      <div style={{ position: "absolute", top: 329, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 19, color: theme.subtext }}>
        ДЕЛЕНИЕ НА 1 GiB
      </div>
    </Panel>
    <Pill text="GB → GiB · ЗАПАС ОДИН" color={theme.accent2} top={1030} opacity={enter} />
    <PulseRing x={800} y={650} triggerFrame={impactLocal} tone="accent2" size={230} />
  </>
);

const DivisionPhase: React.FC<{ enter: number; local: number; fps: number; impactLocal: number }> = ({ enter, local, fps, impactLocal }) => {
  const hit = local >= impactLocal;
  const resultP = hit ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  return (
    <>
      <Panel left={55} top={400} width={970} height={570} color={theme.warning} enter={enter}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 32, textAlign: "center", ...mono, fontSize: 24, color: theme.warning }}>
          128 000 000 000 B ÷ 1 073 741 824 B
        </div>
        <div style={{ position: "absolute", left: 70, right: 70, top: 126, height: 2, background: `${theme.warning}66` }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 165, textAlign: "center", ...mono, fontSize: 55, color: theme.text, whiteSpace: "nowrap" }}>
          128 000 000 000 B
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 272, textAlign: "center", color: theme.warning, fontSize: 42 }}>÷</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 350, textAlign: "center", ...mono, fontSize: 39, color: theme.text, whiteSpace: "nowrap" }}>
          1 073 741 824 B
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 444, textAlign: "center", ...mono, fontSize: 45, color: theme.success, opacity: 0.35 + resultP * 0.65, transform: `scale(${0.92 + resultP * 0.08})`, whiteSpace: "nowrap" }}>
          = ≈119,2 GiB
        </div>
      </Panel>
      <Pill text="БАЙТЫ СОКРАЩАЮТСЯ · ОСТАЁТСЯ ЧИСЛО GiB" color={theme.warning} top={1060} opacity={enter} />
      <PulseRing x={760} y={820} triggerFrame={impactLocal} tone="success" size={230} />
    </>
  );
};

const ResultPhase: React.FC<{ enter: number; local: number; fps: number; impactLocal: number }> = ({ enter, local, fps, impactLocal }) => {
  const pop = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 11, mass: 0.72 } });
  return (
    <>
      <Panel left={54} top={455} width={972} height={390} color={theme.success} enter={enter}>
        <div style={{ position: "absolute", top: 40, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 25, color: theme.success }}>
          РАСЧЁТ СХОДИТСЯ
        </div>
        <div style={{ position: "absolute", top: 137, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 58, color: theme.text, transform: `scale(${0.94 + pop * 0.06})`, whiteSpace: "nowrap" }}>
          128 GB → 119,2 GiB
        </div>
        <div style={{ position: "absolute", top: 270, left: 0, right: 0, textAlign: "center", ...mono, fontSize: 23, color: theme.subtext, whiteSpace: "nowrap" }}>
          128 000 000 000 B ÷ 1 073 741 824 B
        </div>
      </Panel>
      <Pill text="НЕ ПРОПАЛО · ПРОСТО ДРУГАЯ ШКАЛА" color={theme.success} top={1040} opacity={enter * (0.55 + pop * 0.45)} scale={0.96 + pop * 0.04} />
      <PulseRing x={540} y={650} triggerFrame={impactLocal} tone="success" size={250} />
    </>
  );
};

/** Две шкалы ёмкости и буквальное преобразование байтов в GB/GiB. */
export const StorageCapacityVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: StorageCapacityPhase;
}> = ({ local, fps, impactLocal, phase = "symptom" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });

  return (
    <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
      <Header phase={phase} enter={enter} />
      {phase === "symptom" ? <SymptomPhase enter={enter} impactLocal={impactLocal} /> : null}
      {phase === "gap" ? <GapPhase enter={enter} local={local} fps={fps} impactLocal={impactLocal} /> : null}
      {phase === "scales" ? <ScalesPhase enter={enter} impactLocal={impactLocal} /> : null}
      {phase === "decimal" ? <DecimalPhase enter={enter} impactLocal={impactLocal} /> : null}
      {phase === "bytes" ? <BytesPhase enter={enter} impactLocal={impactLocal} /> : null}
      {phase === "binary" ? <BinaryPhase enter={enter} impactLocal={impactLocal} /> : null}
      {phase === "division" ? <DivisionPhase enter={enter} local={local} fps={fps} impactLocal={impactLocal} /> : null}
      {phase === "result" ? <ResultPhase enter={enter} local={local} fps={fps} impactLocal={impactLocal} /> : null}
    </div>
  );
};

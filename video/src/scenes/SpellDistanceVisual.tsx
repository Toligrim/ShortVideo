import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

const W = layout.width;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export type SpellDistancePhase = "typo" | "repair" | "dictionary" | "rank";

type Props = {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: SpellDistancePhase;
  query?: string;
  correction?: string;
  source?: string;
  target?: string;
  limit?: number;
};

const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.5,
};

const phaseTitle: Record<SpellDistancePhase, string> = {
  typo: "ЗАПРОС С ОПЕЧАТКОЙ",
  repair: "МИНИМУМ ПРАВОК",
  dictionary: "КАНДИДАТЫ ИЗ СЛОВАРЯ",
  rank: "СОРТ КАНДИДАТОВ",
};

const Header: React.FC<{ phase: SpellDistancePhase; enter: number }> = ({ phase, enter }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 245,
      transform: "translateX(-50%)",
      color: theme.subtext,
      fontSize: 24,
      whiteSpace: "nowrap",
      opacity: enter,
      textAlign: "center",
      ...mono,
    }}
  >
    {phaseTitle[phase]}
  </div>
);

const Panel: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  opacity?: number;
  children: React.ReactNode;
}> = ({ x, y, width, height, color = theme.accent, opacity = 1, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height,
      borderRadius: 24,
      background: `${theme.panel}F0`,
      border: `3px solid ${color}66`,
      boxShadow: `0 0 42px ${color}20`,
      opacity,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const BottomBadge: React.FC<{ text: string; color: string; opacity: number; scale?: number }> = ({
  text,
  color,
  opacity,
  scale = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 1160,
      transform: `translateX(-50%) scale(${scale})`,
      padding: "15px 34px",
      borderRadius: 999,
      background: `${color}18`,
      border: `2px solid ${color}AA`,
      color,
      ...mono,
      fontSize: 27,
      whiteSpace: "nowrap",
      opacity,
      boxShadow: `0 0 34px ${color}28`,
    }}
  >
    {text}
  </div>
);

const WordBox: React.FC<{
  x: number;
  y: number;
  width: number;
  label: string;
  word: string;
  color: string;
  opacity: number;
  highlightIndex?: number;
}> = ({ x, y, width, label, word, color, opacity, highlightIndex = -1 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height: 150,
      borderRadius: 22,
      background: `${color}12`,
      border: `3px solid ${color}88`,
      opacity,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    }}
  >
    <div style={{ ...mono, fontSize: 19, color: theme.subtext }}>{label}</div>
    <div style={{ fontFamily: theme.mono, fontWeight: 800, fontSize: 39, color: theme.text }}>
      {Array.from(word).map((letter, index) => (
        <span key={`${letter}-${index}`} style={{ color: index === highlightIndex ? color : theme.text }}>
          {letter}
        </span>
      ))}
    </div>
  </div>
);

const OperationCard: React.FC<{
  x: number;
  title: string;
  example: string;
  color: string;
  opacity: number;
}> = ({ x, title, example, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: 620,
      width: 300,
      height: 250,
      borderRadius: 22,
      background: `${color}10`,
      border: `3px solid ${color}70`,
      opacity,
      transform: `translateY(${(1 - opacity) * 24}px)`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 25,
      boxShadow: `0 0 30px ${color}18`,
    }}
  >
    <div style={{ ...mono, fontSize: 25, color }}>{title}</div>
    <div style={{ fontFamily: theme.mono, fontSize: 30, fontWeight: 800, color: theme.text }}>{example}</div>
  </div>
);

const candidates = [
  { word: "завтра", distance: 1, color: theme.success, keep: true },
  { word: "завод", distance: 2, color: theme.accent, keep: true },
  { word: "завеса", distance: 2, color: theme.accent2, keep: true },
  { word: "машина", distance: 4, color: theme.danger, keep: false },
];

export const SpellDistanceVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "typo",
  query = "погода завра",
  correction = "погода завтра",
  source = "завра",
  target = "завтра",
  limit = 50,
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const impact = local >= impactLocal ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;

  if (phase === "typo") {
    const typed = Math.max(1, Math.min(query.length, Math.round(interpolate(local, [0, 28], [0, query.length], { extrapolateRight: "clamp" }))));
    const typedQuery = query.slice(0, typed);
    const arrowP = smooth((local - 16) / 20);
    const correctionP = local >= impactLocal ? impact : smooth((local - 30) / 18);
    return (
      <>
        <Header phase={phase} enter={enter} />
        <Panel x={55} y={390} width={430} height={310} color={theme.danger} opacity={enter}>
          <div style={{ ...mono, position: "absolute", left: 28, top: 25, fontSize: 21, color: theme.danger }}>ВВОД</div>
          <div style={{ position: "absolute", left: 28, right: 20, top: 110, fontFamily: theme.mono, fontSize: 37, fontWeight: 800, whiteSpace: "nowrap", color: theme.text }}>
            {typedQuery.slice(0, Math.max(0, typedQuery.length - source.length))}
            <span style={{ color: theme.danger }}>{typedQuery.slice(Math.max(0, typedQuery.length - source.length))}</span>
            <span style={{ color: theme.accent, opacity: 0.8 + 0.2 * Math.sin(local / 5) }}>▌</span>
          </div>
          <div style={{ ...mono, position: "absolute", left: 28, bottom: 28, fontSize: 18, color: theme.danger }}>«ЗАВРА» · ПРОПУСК</div>
        </Panel>
        <div style={{ position: "absolute", left: 540, top: 515, transform: `translateX(-50%) scale(${0.7 + 0.3 * arrowP})`, color: theme.accent, fontFamily: theme.mono, fontSize: 74, fontWeight: 800, opacity: enter * arrowP }}>→</div>
        <Panel x={595} y={390} width={430} height={310} color={theme.success} opacity={enter * correctionP}>
          <div style={{ ...mono, position: "absolute", left: 28, top: 25, fontSize: 21, color: theme.success }}>ПРОГНОЗ</div>
          <div style={{ position: "absolute", left: 28, right: 20, top: 110, fontFamily: theme.mono, fontSize: 37, fontWeight: 800, whiteSpace: "nowrap", color: theme.text }}>
            {correction.slice(0, Math.max(0, correction.length - target.length))}
            <span style={{ color: theme.success }}>{correction.slice(Math.max(0, correction.length - target.length))}</span>
          </div>
          <div style={{ ...mono, position: "absolute", left: 28, bottom: 28, fontSize: 18, color: theme.success }}>ЗАПРОС ПОНЯТ</div>
        </Panel>
        <div style={{ position: "absolute", left: 540, top: 705, transform: `translateX(-50%) scale(${0.7 + 0.3 * correctionP})`, color: theme.success, fontFamily: theme.mono, fontSize: 30, fontWeight: 800, opacity: enter * correctionP, whiteSpace: "nowrap" }}>+ т</div>
        <BottomBadge text="ОДНА БУКВА ПРОПУЩЕНА" color={theme.warning} opacity={enter * (0.45 + 0.55 * correctionP)} />
        <PulseRing x={810} y={545} triggerFrame={impactLocal} tone="success" size={210} />
      </>
    );
  }

  if (phase === "repair") {
    const repairP = smooth(local / 28);
    return (
      <>
        <Header phase={phase} enter={enter} />
        <WordBox x={75} y={370} width={390} label="БЫЛО" word={source} color={theme.danger} opacity={enter} />
        <div style={{ position: "absolute", left: W / 2, top: 415, transform: `translateX(-50%) scale(${0.75 + 0.25 * repairP})`, color: theme.accent, fontFamily: theme.mono, fontSize: 64, fontWeight: 800, opacity: enter * repairP }}>→</div>
        <WordBox x={615} y={370} width={390} label="СТАЛО" word={target} color={theme.success} opacity={enter} highlightIndex={target.indexOf("т")} />
        <OperationCard x={35} title="ВСТАВИТЬ" example="завра + т" color={theme.success} opacity={enter * smooth((local - 0) / 18)} />
        <OperationCard x={390} title="УДАЛИТЬ" example="завтра − т" color={theme.accent2} opacity={enter * smooth((local - 7) / 18)} />
        <OperationCard x={745} title="ЗАМЕНИТЬ" example="а → я" color={theme.warning} opacity={enter * smooth((local - 14) / 18)} />
        <BottomBadge text="РАССТОЯНИЕ d = 1 · ОДНА ПРАВКА" color={theme.success} opacity={enter * (0.35 + 0.65 * impact)} scale={0.96 + 0.04 * impact} />
        <PulseRing x={W / 2} y={745} triggerFrame={impactLocal} tone="success" size={230} />
      </>
    );
  }

  if (phase === "dictionary") {
    const listP = smooth(local / 30);
    return (
      <>
        <Header phase={phase} enter={enter} />
        <Panel x={55} y={470} width={300} height={190} color={theme.warning} opacity={enter}>
          <div style={{ ...mono, position: "absolute", left: 28, top: 25, fontSize: 20, color: theme.warning }}>ЗАПРОС</div>
          <div style={{ position: "absolute", left: 28, right: 20, top: 92, fontFamily: theme.mono, fontSize: 43, fontWeight: 800, color: theme.text }}>{source}</div>
        </Panel>
        <div style={{ position: "absolute", left: 395, top: 535, transform: `translateX(-50%) scale(${0.7 + 0.3 * listP})`, color: theme.accent, fontFamily: theme.mono, fontSize: 56, fontWeight: 800, opacity: enter * listP }}>→</div>
        <Panel x={435} y={350} width={590} height={735} color={theme.accent2} opacity={enter}>
          <div style={{ ...mono, position: "absolute", left: 28, top: 25, fontSize: 21, color: theme.accent2 }}>СЛОВАРЬ · ПОИСК</div>
          {candidates.map((candidate, index) => {
            const rowP = smooth((local - index * 6) / 18);
            const visible = enter * rowP;
            return (
              <div key={candidate.word} style={{ position: "absolute", left: 25, right: 25, top: 94 + index * 150, height: 112, borderRadius: 16, background: `${candidate.color}12`, border: `2px solid ${candidate.color}66`, display: "flex", alignItems: "center", padding: "0 22px", gap: 18, opacity: visible, transform: `translateX(${(1 - rowP) * 35}px)` }}>
                <div style={{ width: 34, color: candidate.color, ...mono, fontSize: 22 }}>{index + 1}</div>
                <div style={{ flex: 1, color: theme.text, fontFamily: theme.mono, fontWeight: 800, fontSize: 34 }}>{candidate.word}</div>
                <div style={{ ...mono, fontSize: 24, color: candidate.color }}>d={candidate.distance}</div>
                <div style={{ ...mono, width: 100, fontSize: 16, textAlign: "right", color: candidate.keep ? theme.success : theme.danger }}>{candidate.keep ? "ОСТАВИТЬ" : "ОТСЕЧЬ"}</div>
              </div>
            );
          })}
        </Panel>
        <BottomBadge text="МАЛО ПРАВОК → ОСТАВИТЬ" color={theme.success} opacity={enter * (0.35 + 0.65 * impact)} />
        <PulseRing x={760} y={500} triggerFrame={impactLocal} tone="success" size={230} />
      </>
    );
  }

  const limitText = Math.max(1, Math.round(limit));
  const rankP = smooth(local / 32);
  return (
    <>
      <Header phase={phase} enter={enter} />
      <Panel x={50} y={360} width={650} height={690} color={theme.accent} opacity={enter}>
        <div style={{ ...mono, position: "absolute", left: 28, top: 25, fontSize: 21, color: theme.accent }}>БЛИЗКИЕ ВАРИАНТЫ</div>
        <div style={{ position: "absolute", right: 28, top: 25, ...mono, fontSize: 22, color: theme.warning }}>d ↑</div>
        {candidates.map((candidate, index) => {
          const rowP = smooth((local - index * 5) / 18);
          const visible = enter * rowP;
          return (
            <div key={candidate.word} style={{ position: "absolute", left: 25, right: 25, top: 100 + index * 130, height: 98, borderRadius: 16, background: `${candidate.color}${candidate.keep ? "16" : "0A"}`, border: `2px solid ${candidate.color}${candidate.keep ? "77" : "44"}`, display: "flex", alignItems: "center", padding: "0 20px", gap: 16, opacity: visible, transform: `translateY(${(1 - rowP) * 30}px)` }}>
              <div style={{ width: 58, color: candidate.keep ? candidate.color : theme.subtext, ...mono, fontSize: 24 }}>#{index + 1}</div>
              <div style={{ flex: 1, color: candidate.keep ? theme.text : theme.subtext, fontFamily: theme.mono, fontSize: 32, fontWeight: 800 }}>{candidate.word}</div>
              <div style={{ ...mono, fontSize: 23, color: candidate.keep ? candidate.color : theme.subtext }}>d={candidate.distance}</div>
            </div>
          );
        })}
      </Panel>
      <div style={{ position: "absolute", left: 735, top: 650, transform: `translateX(-50%) scale(${0.8 + 0.2 * rankP})`, color: theme.accent2, fontFamily: theme.mono, fontSize: 56, fontWeight: 800, opacity: enter * rankP }}>→</div>
      <Panel x={785} y={450} width={240} height={410} color={theme.warning} opacity={enter}>
        <div style={{ ...mono, position: "absolute", left: 0, right: 0, top: 34, textAlign: "center", fontSize: 20, color: theme.warning }}>ЛИМИТ</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 98, textAlign: "center", fontFamily: theme.mono, fontWeight: 800, fontSize: 104, color: theme.warning, textShadow: `0 0 34px ${theme.warning}66` }}>{limitText}</div>
        <div style={{ ...mono, position: "absolute", left: 0, right: 0, bottom: 48, textAlign: "center", fontSize: 18, color: theme.text }}>ЛУЧШИХ</div>
      </Panel>
      <BottomBadge text={`В ИТОГЕ · ТОП-${limitText}`} color={theme.success} opacity={enter * (0.35 + 0.65 * impact)} />
      <PulseRing x={905} y={650} triggerFrame={impactLocal} tone="warning" size={220} />
    </>
  );
};

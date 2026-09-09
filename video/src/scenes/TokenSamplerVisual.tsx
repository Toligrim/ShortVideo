import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1.4 };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export type TokenSamplerPhase =
  | "answers"
  | "tokens"
  | "distribution"
  | "sample"
  | "branch"
  | "temperature";

type AnswerStage = "question" | "ventilate" | "phone";
type TokenStage = "fixed" | "append";
type DistributionFocus = "all" | "ventilate" | "phone" | "weight";
type SampleStage = "setup" | "draw" | "frequency";
type BranchStage = "select" | "context" | "distribution" | "ripple";
type TemperatureStage = "range" | "low" | "high" | "api" | "limit";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: TokenSamplerPhase;
  answer?: AnswerStage;
  tokenStage?: TokenStage;
  focus?: DistributionFocus;
  sampleStage?: SampleStage;
  branchStage?: BranchStage;
  temperatureStage?: TemperatureStage;
}

const phaseTitle: Record<TokenSamplerPhase, string> = {
  answers: "ОДИН ВОПРОС · ДВА ОТВЕТА",
  tokens: "ОТВЕТ СОБИРАЕТСЯ · ТОКЕН ЗА ТОКЕНОМ",
  distribution: "РАСПРЕДЕЛЕНИЕ · ВЕСА КАНДИДАТОВ",
  sample: "СЭМПЛЕР · ВЫБОР ИЗ ЧАШИ",
  branch: "ПЕРВЫЙ ВЫБОР · НОВАЯ РАЗВИЛКА",
  temperature: "ТЕМПЕРАТУРА · РАЗБРОС ВЫБОРА",
};

const phaseIcon: Record<TokenSamplerPhase, string> = {
  answers: "message-circle",
  tokens: "list",
  distribution: "chart-bar",
  sample: "shuffle",
  branch: "git-branch",
  temperature: "thermometer",
};

const phaseTone: Record<TokenSamplerPhase, string> = {
  answers: theme.accent,
  tokens: theme.accent2,
  distribution: theme.accent,
  sample: theme.warning,
  branch: theme.accent2,
  temperature: theme.success,
};

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  tone?: string;
  radius?: string | number;
  children: React.ReactNode;
  opacity?: number;
}> = ({ left, top, width, height, tone = theme.accent, radius = 26, children, opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      borderRadius: radius,
      background: `${theme.panel}F0`,
      border: `3px solid ${tone}66`,
      boxShadow: `0 0 42px ${tone}1F`,
      opacity,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const Header: React.FC<{ phase: TokenSamplerPhase; enter: number }> = ({ phase, enter }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 238,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: theme.subtext,
      fontSize: 23,
      whiteSpace: "nowrap",
      opacity: enter,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={29} color={phaseTone[phase]} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const Caption: React.FC<{ text: string; tone?: string; opacity: number; top?: number }> = ({
  text,
  tone = theme.accent,
  opacity,
  top = 1135,
}) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top,
      transform: "translateX(-50%)",
      padding: "15px 30px",
      borderRadius: 999,
      background: `${tone}18`,
      border: `2px solid ${tone}99`,
      color: tone,
      fontSize: 24,
      whiteSpace: "nowrap",
      opacity,
      boxShadow: `0 0 34px ${tone}25`,
      ...mono,
    }}
  >
    {text}
  </div>
);

const TokenChip: React.FC<{
  text: string;
  left: number;
  top: number;
  tone?: string;
  opacity?: number;
  scale?: number;
  width?: number;
}> = ({ text, left, top, tone = theme.accent, opacity = 1, scale = 1, width = 148 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height: 70,
      transform: `scale(${scale})`,
      transformOrigin: "center",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 15,
      background: `${tone}18`,
      border: `2px solid ${tone}AA`,
      color: theme.text,
      fontFamily: theme.font,
      fontWeight: 800,
      fontSize: 28,
      opacity,
      whiteSpace: "nowrap",
      boxShadow: `0 0 24px ${tone}1C`,
    }}
  >
    {text}
  </div>
);

const AnswerCard: React.FC<{
  text: string;
  top: number;
  tone: string;
  opacity: number;
  active: boolean;
}> = ({ text, top, tone, opacity, active }) => (
  <div
    style={{
      position: "absolute",
      left: 70,
      top,
      width: 940,
      height: 132,
      display: "flex",
      alignItems: "center",
      gap: 18,
      padding: "0 26px",
      borderRadius: 22,
      background: active ? `${tone}18` : theme.panel,
      border: `3px solid ${active ? tone : theme.panelBorder}99`,
      color: active ? theme.text : theme.subtext,
      fontFamily: theme.font,
      fontWeight: 800,
      fontSize: 34,
      opacity,
      transform: `translateY(${(1 - opacity) * 30}px)`,
      boxShadow: active ? `0 0 34px ${tone}38` : "none",
    }}
  >
    <IconGlyph name="bot" size={38} color={active ? tone : theme.subtext} strokeWidth={1.8} />
    <span>{text}</span>
  </div>
);

const AnswersPhase: React.FC<{ local: number; fps: number; answer: AnswerStage; enter: number; impactLocal: number }> = ({
  local,
  fps,
  answer,
  enter,
  impactLocal,
}) => {
  const firstP = answer === "question" ? 0 : spring({ frame: Math.max(0, local - 10), fps, config: { damping: 14, mass: 0.75 } });
  const secondP = answer === "phone" ? spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 13, mass: 0.75 } }) : 0;
  return (
    <>
      <Header phase="answers" enter={enter} />
      <Panel left={70} top={405} width={940} height={160} tone={theme.accent} opacity={enter}>
        <div style={{ position: "absolute", left: 25, top: 22, display: "flex", alignItems: "center", gap: 12, color: theme.subtext, ...mono, fontSize: 20 }}>
          <IconGlyph name="message-circle" size={27} color={theme.accent} strokeWidth={1.8} />
          ТЫ СПРАШИВАЕШЬ
        </div>
        <div style={{ position: "absolute", left: 25, bottom: 22, color: theme.text, fontFamily: theme.font, fontSize: 36, fontWeight: 800 }}>
          Как уснуть?
        </div>
      </Panel>
      {answer !== "question" ? (
        <AnswerCard text="Проветри комнату" top={650} tone={theme.accent} opacity={enter * firstP} active={answer === "ventilate"} />
      ) : null}
      {answer === "phone" ? (
        <AnswerCard text="Убери телефон" top={820} tone={theme.accent2} opacity={enter * secondP} active />
      ) : null}
      <Caption
        text={answer === "phone" ? "ОДИН ВОПРОС · ДВА ВАРИАНТА" : "ВОПРОС ОДИН · ОТВЕТ ЕЩЁ СТРОИТСЯ"}
        tone={answer === "phone" ? theme.accent2 : theme.accent}
        opacity={enter}
        top={1085}
      />
      <PulseRing x={answer === "phone" ? 540 : 500} y={answer === "phone" ? 885 : 485} triggerFrame={impactLocal} tone={answer === "phone" ? "accent2" : "accent"} size={180} />
    </>
  );
};

const TokensPhase: React.FC<{ local: number; fps: number; tokenStage: TokenStage; enter: number; impactLocal: number }> = ({
  local,
  fps,
  tokenStage,
  enter,
  impactLocal,
}) => {
  const appendP = tokenStage === "append" ? smooth((local - 8) / 44) : 0;
  const answerTokens = ["проветри", "комнату", "и", "отдохни"];
  return (
    <>
      <Header phase="tokens" enter={enter} />
      <Panel left={70} top={405} width={940} height={205} tone={theme.accent2} opacity={enter}>
        <div style={{ position: "absolute", left: 26, top: 22, ...mono, color: theme.subtext, fontSize: 20 }}>ЗАПРОС · СЛОВА ОСТАЛИСЬ ТЕМИ ЖЕ</div>
        <div style={{ position: "absolute", left: 26, top: 86, display: "flex", gap: 12 }}>
          <TokenChip text="как" left={0} top={0} tone={theme.accent2} opacity={enter} width={112} />
          <TokenChip text="уснуть" left={125} top={0} tone={theme.accent2} opacity={enter} width={150} />
        </div>
      </Panel>
      <Panel left={70} top={700} width={940} height={245} tone={theme.accent} opacity={enter}>
        <div style={{ position: "absolute", left: 26, top: 22, ...mono, color: theme.accent, fontSize: 20 }}>ОТВЕТ · НЕ ГОТОВЫЙ АБЗАЦ</div>
        <div style={{ position: "absolute", left: 26, top: 84, display: "flex", alignItems: "center", gap: 12 }}>
          {answerTokens.map((token, i) => {
            const tokenP = tokenStage === "append" ? spring({ frame: Math.max(0, local - 10 - i * 8), fps, config: { damping: 14, mass: 0.7 } }) : 0;
            return <TokenChip key={token + i} text={token} left={i * 168} top={0} tone={i === 0 ? theme.accent : theme.accent2} opacity={enter * tokenP} scale={0.9 + tokenP * 0.1} width={i === 2 ? 72 : 148} />;
          })}
          {tokenStage === "fixed" ? <div style={{ ...mono, fontSize: 37, color: theme.panelBorder, letterSpacing: 8 }}>···</div> : null}
        </div>
        <div style={{ position: "absolute", left: 28, bottom: 22, ...mono, color: theme.subtext, fontSize: 18 }}>
          {tokenStage === "append" ? "ШАГ 01 → 02 → 03 · КАЖДЫЙ ТОКЕН ДОБАВЛЯЕТСЯ" : "ПЕРВЫЙ ШАГ · ДАЛЬШЕ БУДЕТ НОВЫЙ ТОКЕН"}
        </div>
      </Panel>
      <Caption text="ПОСЛЕДОВАТЕЛЬНАЯ СБОРКА · ТОКЕН ЗА ТОКЕНОМ" tone={theme.accent2} opacity={enter} top={1090} />
      <PulseRing x={tokenStage === "append" ? 190 : 530} y={tokenStage === "append" ? 830 : 500} triggerFrame={impactLocal} tone="accent2" size={185} />
    </>
  );
};

const candidates = [
  { text: "проветри", pct: 55, tone: theme.accent },
  { text: "убери", pct: 30, tone: theme.accent2 },
  { text: "другие", pct: 15, tone: theme.subtext },
];

const DistributionPhase: React.FC<{ local: number; fps: number; focus: DistributionFocus; enter: number; impactLocal: number }> = ({
  local,
  fps,
  focus,
  enter,
  impactLocal,
}) => {
  const focused = focus === "ventilate" ? 0 : focus === "phone" ? 1 : -1;
  return (
    <>
      <Header phase="distribution" enter={enter} />
      <Panel left={65} top={395} width={950} height={645} tone={theme.accent} radius="32px 32px 250px 250px / 32px 32px 150px 150px" opacity={enter}>
        <div style={{ position: "absolute", left: 30, top: 25, ...mono, color: theme.subtext, fontSize: 20 }}>ЧАША · P(СЛЕДУЮЩИЙ ТОКЕН)</div>
        <div style={{ position: "absolute", left: 30, top: 66, color: theme.text, fontFamily: theme.font, fontSize: 30, fontWeight: 800 }}>Один следующий шаг — три кандидата</div>
        {candidates.map((candidate, i) => {
          const active = (focused === i || focus === "weight") && local >= impactLocal;
          const cardP = spring({ frame: Math.max(0, local - i * 7), fps, config: { damping: 14, mass: 0.75 } });
          const barP = smooth((local - 9 - i * 7) / 35);
          const barHeight = 225 * (candidate.pct / 55) * barP;
          return (
            <div
              key={candidate.text}
              style={{
                position: "absolute",
                left: 35 + i * 300,
                top: 155,
                width: 270,
                height: 410,
                borderRadius: 22,
                background: active ? `${candidate.tone}18` : `${theme.bg}A8`,
                border: `3px solid ${active ? candidate.tone : candidate.tone}66`,
                opacity: enter * cardP,
                transform: `translateY(${(1 - cardP) * 28}px) scale(${0.94 + cardP * 0.06})`,
                boxShadow: active ? `0 0 34px ${candidate.tone}3F` : "none",
              }}
            >
              <div style={{ position: "absolute", left: 18, right: 18, top: 23, textAlign: "center", color: active ? theme.text : theme.subtext, fontFamily: theme.font, fontSize: 30, fontWeight: 800 }}>{candidate.text}</div>
              <div style={{ position: "absolute", left: 37, top: 103, width: 196, height: 225, borderRadius: 16, background: `${candidate.tone}10`, border: `2px solid ${candidate.tone}44`, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                <div style={{ width: 120, height: barHeight, borderRadius: "14px 14px 5px 5px", background: candidate.tone, boxShadow: `0 0 28px ${candidate.tone}66` }} />
              </div>
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 23, textAlign: "center", color: candidate.tone, fontFamily: theme.mono, fontWeight: 800, fontSize: 34 }}>{candidate.pct}%</div>
            </div>
          );
        })}
      </Panel>
      <Caption text={focus === "weight" ? "У КАЖДОГО ВАРИАНТА · СВОЙ ВЕС" : "РАСПРЕДЕЛЕНИЕ · НЕ ОДИН ЗАРАНЕЕ ЗАПИСАННЫЙ ОТВЕТ"} tone={theme.accent} opacity={enter} top={1090} />
      <PulseRing x={focused >= 0 ? 65 + 35 + focused * 300 + 135 : 540} y={710} triggerFrame={impactLocal} tone={focused >= 0 ? candidates[focused].tone === theme.accent2 ? "accent2" : "accent" : "accent"} size={190} />
    </>
  );
};

const Note: React.FC<{ text: string; left: number; top: number; tone: string; opacity: number; transform?: string }> = ({
  text,
  left,
  top,
  tone,
  opacity,
  transform = "none",
}) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width: 146,
      height: 78,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      background: `${tone}1A`,
      border: `2px solid ${tone}AA`,
      color: theme.text,
      fontFamily: theme.font,
      fontSize: 21,
      fontWeight: 800,
      opacity,
      transform,
      boxShadow: `0 6px 20px ${theme.bg}80`,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

const SamplePhase: React.FC<{ local: number; fps: number; sampleStage: SampleStage; enter: number; impactLocal: number }> = ({
  local,
  fps,
  sampleStage,
  enter,
  impactLocal,
}) => {
  const drawP = sampleStage === "setup" ? 0 : spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const notes = [
    ["проветри", 42, 150, theme.accent],
    ["проветри", 207, 150, theme.accent],
    ["убери", 372, 150, theme.accent2],
    ["проветри", 42, 270, theme.accent],
    ["другое", 207, 270, theme.subtext],
    ["проветри", 372, 270, theme.accent],
    ["убери", 207, 390, theme.accent2],
  ] as const;
  const chosen = notes[0];
  const chosenLeft = interpolate(drawP, [0, 1], [70 + chosen[1], 758]);
  const chosenTop = interpolate(drawP, [0, 1], [410 + chosen[2], 740]);
  return (
    <>
      <Header phase="sample" enter={enter} />
      <Panel left={70} top={410} width={625} height={585} tone={theme.warning} radius="30px 30px 230px 230px / 30px 30px 150px 150px" opacity={enter}>
        <div style={{ position: "absolute", left: 28, top: 24, ...mono, color: theme.warning, fontSize: 20 }}>ЧАША · ВАРИАНТЫ ВСТРЕЧАЮТСЯ НЕ РАЗ</div>
        {notes.map(([text, left, top, tone], i) => {
          const noteOpacity = i === 0 && sampleStage !== "setup" ? enter * (1 - drawP * 0.9) : enter;
          return <Note key={`${text}-${i}`} text={text} left={left} top={top} tone={tone} opacity={noteOpacity} />;
        })}
      </Panel>
      <Panel left={735} top={465} width={275} height={205} tone={theme.warning} opacity={enter}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 26, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <IconGlyph name="shuffle" size={54} color={theme.warning} strokeWidth={1.8} />
          <div style={{ ...mono, color: theme.text, fontSize: 22 }}>СЭМПЛЕР</div>
        </div>
      </Panel>
      {sampleStage !== "setup" ? (
        <>
          <div style={{ position: "absolute", left: 690, top: 600, width: 80, borderTop: `3px dashed ${theme.warning}AA`, opacity: enter * drawP }} />
          <div style={{ position: "absolute", left: 730, top: 580, color: theme.warning, fontFamily: theme.mono, fontSize: 28, opacity: enter * drawP }}>→</div>
          <Note text="проветри" left={chosenLeft} top={chosenTop} tone={theme.accent} opacity={enter * drawP} transform={`scale(${0.85 + drawP * 0.15})`} />
        </>
      ) : null}
      {sampleStage === "frequency" ? (
        <Panel left={735} top={735} width={275} height={255} tone={theme.accent} opacity={enter}>
          <div style={{ position: "absolute", left: 20, top: 20, ...mono, color: theme.subtext, fontSize: 17 }}>ЧАСТОТА В ЧАШЕ</div>
          {[{ text: "4× ПРОВЕТРИ", tone: theme.accent }, { text: "2× УБЕРИ", tone: theme.accent2 }, { text: "1× ДРУГОЕ", tone: theme.subtext }].map((row, i) => (
            <div key={row.text} style={{ position: "absolute", left: 20, top: 62 + i * 56, color: row.tone, fontFamily: theme.mono, fontSize: 20, fontWeight: 800 }}>{row.text}</div>
          ))}
        </Panel>
      ) : null}
      <Caption text={sampleStage === "frequency" ? "ЧАЩЕ В ЧАШЕ → ВЫШЕ ШАНС" : "ВЕРОЯТНЫЙ ВАРИАНТ · БОЛЬШЕ ЗАПИСОК"} tone={theme.warning} opacity={enter} top={1095} />
      <PulseRing x={sampleStage === "setup" ? 385 : 835} y={sampleStage === "setup" ? 700 : 790} triggerFrame={impactLocal} tone="warning" size={190} />
    </>
  );
};

const BranchPhase: React.FC<{ local: number; fps: number; branchStage: BranchStage; enter: number; impactLocal: number }> = ({
  local,
  fps,
  branchStage,
  enter,
  impactLocal,
}) => {
  const showPaths = branchStage !== "select";
  const pathP = showPaths ? spring({ frame: Math.max(0, local - 10), fps, config: { damping: 14, mass: 0.75 } }) : 0;
  const showDistribution = branchStage === "distribution" || branchStage === "ripple";
  const showAnswers = branchStage === "ripple";
  const rippleP = showAnswers ? spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } }) : 0;
  return (
    <>
      <Header phase="branch" enter={enter} />
      <Panel left={70} top={405} width={940} height={170} tone={theme.accent2} opacity={enter}>
        <div style={{ position: "absolute", left: 28, top: 22, ...mono, color: theme.subtext, fontSize: 19 }}>ШАГ 1 · КОНТЕКСТ ПОСЛЕ ПЕРВОГО ВЫБОРА</div>
        <div style={{ position: "absolute", left: 28, top: 82, width: 760, height: 70 }}>
          <TokenChip text="как уснуть" left={0} top={0} tone={theme.subtext} width={190} opacity={enter} />
          <div style={{ position: "absolute", left: 205, top: 16, color: theme.subtext, fontSize: 34, opacity: enter }}>→</div>
          <TokenChip text="проветри" left={245} top={0} tone={theme.accent} opacity={enter * (branchStage === "select" ? 0.7 : 1)} scale={branchStage === "select" ? 1.05 : 1} />
          <div style={{ position: "absolute", left: 410, top: 16, color: branchStage === "select" ? theme.accent : theme.subtext, fontSize: 34, opacity: enter }}>→</div>
          <TokenChip text="...?" left={490} top={0} tone={theme.accent2} opacity={enter} />
        </div>
      </Panel>
      {showPaths ? (
        <>
          <Panel left={70} top={650} width={440} height={190} tone={theme.accent} opacity={enter * pathP}>
            <div style={{ position: "absolute", left: 24, top: 22, ...mono, color: theme.accent, fontSize: 18 }}>КОНТЕКСТ A</div>
            <div style={{ position: "absolute", left: 24, top: 76, color: theme.text, fontFamily: theme.font, fontWeight: 800, fontSize: 31 }}>проветри → комнату</div>
            <div style={{ position: "absolute", left: 24, bottom: 20, ...mono, color: theme.subtext, fontSize: 17 }}>ТЕКСТ УЖЕ ДРУГОЙ</div>
          </Panel>
          <Panel left={570} top={650} width={440} height={190} tone={theme.accent2} opacity={enter * pathP}>
            <div style={{ position: "absolute", left: 24, top: 22, ...mono, color: theme.accent2, fontSize: 18 }}>КОНТЕКСТ B</div>
            <div style={{ position: "absolute", left: 24, top: 76, color: theme.text, fontFamily: theme.font, fontWeight: 800, fontSize: 31 }}>убери → телефон</div>
            <div style={{ position: "absolute", left: 24, bottom: 20, ...mono, color: theme.subtext, fontSize: 17 }}>СЛЕДУЮЩАЯ РАЗВИЛКА ИНАЯ</div>
          </Panel>
        </>
      ) : null}
      {showDistribution && !showAnswers ? (
        <Panel left={140} top={900} width={800} height={170} tone={theme.warning} opacity={enter * pathP}>
          <div style={{ position: "absolute", left: 24, top: 22, ...mono, color: theme.warning, fontSize: 18 }}>НОВОЕ РАСПРЕДЕЛЕНИЕ СЛЕДУЮЩЕГО ТОКЕНА</div>
          {[theme.accent, theme.accent2, theme.subtext].map((tone, i) => (
            <div key={tone} style={{ position: "absolute", left: 24 + i * 250, top: 88, width: 190, height: 16, borderRadius: 999, background: `${tone}22`, overflow: "hidden" }}>
              <div style={{ width: `${[68, 22, 10][i]}%`, height: "100%", background: tone }} />
            </div>
          ))}
        </Panel>
      ) : null}
      {showAnswers ? (
        <div style={{ position: "absolute", left: 70, top: 900, width: 940, display: "flex", gap: 20, opacity: enter * rippleP }}>
          <div style={{ flex: 1, height: 170, borderRadius: 22, background: `${theme.accent}18`, border: `3px solid ${theme.accent}99`, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: theme.accent, fontFamily: theme.font, fontWeight: 800, fontSize: 28 }}>ОТВЕТ A<br />проветри комнату</div>
          <div style={{ flex: 1, height: 170, borderRadius: 22, background: `${theme.accent2}18`, border: `3px solid ${theme.accent2}99`, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: theme.accent2, fontFamily: theme.font, fontWeight: 800, fontSize: 28 }}>ОТВЕТ B<br />убери телефон</div>
        </div>
      ) : null}
      <Caption text={showAnswers ? "ОДНА РАЗВИЛКА · ВЕСЬ ОТВЕТ ДРУГОЙ" : showDistribution ? "НОВЫЙ ТЕКСТ → НОВОЕ РАСПРЕДЕЛЕНИЕ" : "ВЫБРАННЫЙ ТОКЕН СДВИГАЕТ ПРОДОЛЖЕНИЕ"} tone={showAnswers ? theme.success : theme.accent2} opacity={enter} top={1105} />
      <PulseRing x={showAnswers ? 540 : 680} y={showAnswers ? 985 : 490} triggerFrame={impactLocal} tone={showAnswers ? "success" : "accent2"} size={190} />
    </>
  );
};

const MiniDistribution: React.FC<{
  left: number;
  top: number;
  width: number;
  title: string;
  weights: number[];
  tone: string;
  opacity: number;
}> = ({ left, top, width, title, weights, tone, opacity }) => {
  const labels = ["проветри", "убери", "другое"];
  const barWidth = Math.floor((width - 100) / 3);
  return (
    <Panel left={left} top={top} width={width} height={405} tone={tone} opacity={opacity}>
      <div style={{ position: "absolute", left: 22, top: 22, ...mono, color: tone, fontSize: 22 }}>{title}</div>
      <div style={{ position: "absolute", left: 26, right: 26, bottom: 64, height: 230, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18 }}>
        {weights.map((weight, i) => {
          const h = 40 + weight * 1.8;
          return (
            <div key={labels[i]} style={{ width: barWidth, height: 230, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
              <div style={{ color: i === 0 ? theme.accent : i === 1 ? theme.accent2 : theme.subtext, fontFamily: theme.mono, fontSize: 20, fontWeight: 800 }}>{weight}%</div>
              <div style={{ width: Math.min(100, barWidth - 30), height: h, borderRadius: "12px 12px 4px 4px", background: i === 0 ? theme.accent : i === 1 ? theme.accent2 : theme.subtext, boxShadow: `0 0 25px ${(i === 0 ? theme.accent : i === 1 ? theme.accent2 : theme.subtext)}44` }} />
              <div style={{ color: theme.text, fontFamily: theme.font, fontSize: 19, fontWeight: 800, whiteSpace: "nowrap" }}>{labels[i]}</div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

const TemperaturePhase: React.FC<{ local: number; fps: number; temperatureStage: TemperatureStage; enter: number; impactLocal: number }> = ({
  local,
  fps,
  temperatureStage,
  enter,
  impactLocal,
}) => {
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  if (temperatureStage === "range") {
    return (
      <>
        <Header phase="temperature" enter={enter} />
        <MiniDistribution left={55} top={420} width={465} title="T ≈ 0 · УЗКО" weights={[84, 12, 4]} tone={theme.accent} opacity={enter} />
        <MiniDistribution left={560} top={420} width={465} title="T ↑ · ШИРОКО" weights={[45, 33, 22]} tone={theme.success} opacity={enter} />
        <Caption text="ТЕМПЕРАТУРА МЕНЯЕТ РАЗБРОС, НЕ САМОТУ ТЕМУ" tone={theme.success} opacity={enter} top={990} />
        <PulseRing x={540} y={710} triggerFrame={impactLocal} tone="success" size={200} />
      </>
    );
  }
  if (temperatureStage === "api") {
    const marker = interpolate(reveal, [0, 1], [0.4, 0.8]);
    return (
      <>
        <Header phase="temperature" enter={enter} />
        <Panel left={70} top={445} width={940} height={370} tone={theme.success} opacity={enter}>
          <div style={{ position: "absolute", left: 30, top: 28, ...mono, color: theme.success, fontSize: 24 }}>API · ДИАПАЗОН ПАРАМЕТРА</div>
          <div style={{ position: "absolute", left: 50, right: 50, top: 150, height: 9, borderRadius: 9, background: `${theme.success}33` }}>
            <div style={{ position: "absolute", left: `${marker * 100}%`, top: -18, width: 44, height: 44, borderRadius: "50%", background: theme.success, boxShadow: `0 0 30px ${theme.success}88`, transform: "translateX(-50%)" }} />
          </div>
          {[{ text: "0", x: 50 }, { text: "1", x: 440 }, { text: "2", x: 830 }].map((item) => <div key={item.text} style={{ position: "absolute", left: item.x, top: 190, color: theme.text, fontFamily: theme.mono, fontSize: 28 }}>{item.text}</div>)}
          <div style={{ position: "absolute", left: 0, right: 0, top: 255, textAlign: "center", color: theme.subtext, fontFamily: theme.font, fontSize: 27 }}>около нуля — стабильнее · выше — случайнее</div>
        </Panel>
        <Caption text="В АПИ ТЕМПЕРАТУРА · ОТ НУЛЯ ДО ДВУХ" tone={theme.success} opacity={enter} top={930} />
        <PulseRing x={70 + 50 + marker * 860} y={600} triggerFrame={impactLocal} tone="success" size={170} />
      </>
    );
  }
  if (temperatureStage === "limit") {
    return (
      <>
        <Header phase="temperature" enter={enter} />
        <Panel left={70} top={430} width={455} height={390} tone={theme.accent} opacity={enter}>
          <div style={{ position: "absolute", left: 25, top: 25, ...mono, color: theme.accent, fontSize: 21 }}>ПОВТОР 1</div>
          <div style={{ position: "absolute", left: 25, top: 110, right: 25, color: theme.text, fontFamily: theme.font, fontWeight: 800, fontSize: 35, lineHeight: 1.2 }}>Проветри комнату.</div>
          <div style={{ position: "absolute", right: 25, bottom: 24 }}>
            <IconGlyph name="check" size={38} color={theme.accent} strokeWidth={2} />
          </div>
        </Panel>
        <Panel left={555} top={430} width={455} height={390} tone={theme.accent2} opacity={enter}>
          <div style={{ position: "absolute", left: 25, top: 25, ...mono, color: theme.accent2, fontSize: 21 }}>ПОВТОР 2</div>
          <div style={{ position: "absolute", left: 25, top: 110, right: 25, color: theme.text, fontFamily: theme.font, fontWeight: 800, fontSize: 35, lineHeight: 1.2 }}>Убери телефон.</div>
          <div style={{ position: "absolute", right: 25, bottom: 24 }}>
            <IconGlyph name="shuffle" size={38} color={theme.accent2} strokeWidth={1.8} />
          </div>
        </Panel>
        <Caption text="ПОЛНОЙ ОДИНАКОВОСТИ СИСТЕМА НЕ ОБЕЩАЕТ" tone={theme.warning} opacity={enter} top={930} />
        <PulseRing x={540} y={625} triggerFrame={impactLocal} tone="warning" size={210} />
      </>
    );
  }
  const isHigh = temperatureStage === "high";
  return (
    <>
      <Header phase="temperature" enter={enter} />
      <MiniDistribution left={90} top={430} width={900} title={isHigh ? "Т ВЫШЕ · СЛУЧАЙНЕЕ" : "Т ОКОЛО НУЛЯ · СТАБИЛЬНЕЕ"} weights={isHigh ? [45, 33, 22] : [84, 12, 4]} tone={isHigh ? theme.success : theme.accent} opacity={enter} />
      <Caption text={isHigh ? "БОЛЬШЕ РАЗБРОС · БОЛЬШЕ ВАРИАНТОВ" : "МЕНЬШЕ РАЗБРОС · ВЫБОР ЧАЩЕ ПОВТОРЯЕТСЯ"} tone={isHigh ? theme.success : theme.accent} opacity={enter} top={900} />
      <PulseRing x={540} y={675} triggerFrame={impactLocal} tone={isHigh ? "success" : "accent"} size={190} />
    </>
  );
};

export const TokenSamplerVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "distribution",
  answer = "question",
  tokenStage = "fixed",
  focus = "all",
  sampleStage = "setup",
  branchStage = "select",
  temperatureStage = "range",
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  if (phase === "answers") return <AnswersPhase local={local} fps={fps} answer={answer} enter={enter} impactLocal={impactLocal} />;
  if (phase === "tokens") return <TokensPhase local={local} fps={fps} tokenStage={tokenStage} enter={enter} impactLocal={impactLocal} />;
  if (phase === "distribution") return <DistributionPhase local={local} fps={fps} focus={focus} enter={enter} impactLocal={impactLocal} />;
  if (phase === "sample") return <SamplePhase local={local} fps={fps} sampleStage={sampleStage} enter={enter} impactLocal={impactLocal} />;
  if (phase === "branch") return <BranchPhase local={local} fps={fps} branchStage={branchStage} enter={enter} impactLocal={impactLocal} />;
  return <TemperaturePhase local={local} fps={fps} temperatureStage={temperatureStage} enter={enter} impactLocal={impactLocal} />;
};

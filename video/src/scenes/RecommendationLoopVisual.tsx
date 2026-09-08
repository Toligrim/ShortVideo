import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";

export type RecommendationLoopPhase = "feed" | "explicit" | "signals" | "analogy" | "score" | "reorder";
export type RecommendationFocus = "watch" | "pause" | "swipe" | "return" | "all";
export type RecommendationLoopView =
  | "watch"
  | "similar"
  | "ranker"
  | "recalculate"
  | "chance"
  | "seller"
  | "pause";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: RecommendationLoopPhase;
  focus?: RecommendationFocus;
  view?: RecommendationLoopView;
}

const W = layout.width;
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

const phaseTitle: Record<RecommendationLoopPhase, string> = {
  feed: "ЛЕНТА ЗАМЕЧАЕТ ДОСМОТР",
  explicit: "ЛАЙК · ГРОМКОЕ «ДА»",
  signals: "НЕЯВНЫЕ СИГНАЛЫ ПОВЕДЕНИЯ",
  analogy: "ЗАДЕРЖАЛСЯ · НО НЕ КУПИЛ",
  score: "ОЦЕНЩИК ПЕРЕСЧИТЫВАЕТ БАЛЛЫ",
  reorder: "БОЛЬШИЙ SCORE · ВЫШЕ В ЛЕНТЕ",
};

const phaseIcon: Record<RecommendationLoopPhase, string> = {
  feed: "list-video",
  explicit: "heart",
  signals: "activity",
  analogy: "store",
  score: "calculator",
  reorder: "arrow-up",
};

const phaseTone: Record<RecommendationLoopPhase, string> = {
  feed: theme.accent,
  explicit: theme.accent,
  signals: theme.accent2,
  analogy: theme.warning,
  score: theme.accent,
  reorder: theme.success,
};

const Header: React.FC<{ phase: RecommendationLoopPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 220,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: phaseTone[phase],
      fontSize: 23,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={31} color={phaseTone[phase]} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  children: React.ReactNode;
}> = ({ left, top, width, height, color, opacity, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 28,
      background: `${theme.panel}F0`,
      border: `3px solid ${color}77`,
      boxShadow: `0 14px 50px ${color}1C`,
      opacity,
    }}
  >
    {children}
  </div>
);

const FooterBadge: React.FC<{ text: string; color: string; opacity: number }> = ({ text, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 1210,
      transform: "translateX(-50%)",
      padding: "14px 28px",
      borderRadius: 999,
      border: `2px solid ${color}`,
      background: `${color}18`,
      color,
      fontSize: 22,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    {text}
  </div>
);

const ImpactRings: React.FC<{ local: number; impactLocal: number; x: number; y: number; color: string }> = ({
  local,
  impactLocal,
  x,
  y,
  color,
}) => {
  const rings = [0, 7]
    .map((delay) => local - impactLocal - delay)
    .filter((dt) => dt >= 0 && dt <= 28);
  return (
    <>
      {rings.map((dt, index) => {
        const progress = dt / 28;
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 110 + progress * 160,
              height: 110 + progress * 160,
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              border: `4px solid ${color}`,
              opacity: 0.65 * (1 - progress),
            }}
          />
        );
      })}
    </>
  );
};

const Thumbnail: React.FC<{ left: number; top: number; width: number; height: number; color: string; title: string; opacity?: number }> = ({
  left,
  top,
  width,
  height,
  color,
  title,
  opacity = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      overflow: "hidden",
      borderRadius: 16,
      background: `linear-gradient(145deg, ${color}77 0%, #101721 78%)`,
      border: `2px solid ${color}88`,
      opacity,
    }}
  >
    <div style={{ position: "absolute", left: 18, top: 16, color: theme.text, fontSize: 18, ...mono }}>{title}</div>
    <div style={{ position: "absolute", right: 20, bottom: 17, color, opacity: 0.85 }}>
      <IconGlyph name="play" size={31} color={color} strokeWidth={1.8} />
    </div>
    <div
      style={{
        position: "absolute",
        left: 18,
        right: 18,
        bottom: 12,
        height: 5,
        borderRadius: 999,
        background: `${theme.text}33`,
      }}
    >
      <div style={{ width: "58%", height: "100%", borderRadius: 999, background: color }} />
    </div>
  </div>
);

const FeedPhase: React.FC<{
  local: number;
  impactLocal: number;
  enter: number;
  view: RecommendationLoopView;
}> = ({ local, impactLocal, enter, view }) => {
  const isSimilar = view === "similar";
  const reveal = smooth(interpolate(local, [0, Math.max(impactLocal, 1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const progress = smooth(interpolate(local, [0, Math.max(impactLocal, 1)], [0.22, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const cards = [
    { title: "РОЛИК ПРО САД", color: theme.accent, score: "0.78" },
    { title: "ЦВЕТЫ · СОВЕТЫ", color: theme.accent2, score: "0.61" },
    { title: "РЕЦЕПТ НА УЖИН", color: theme.warning, score: "0.22" },
  ];
  return (
    <>
      <Header phase="feed" opacity={enter} />
      <Panel left={78} top={385} width={414} height={705} color={theme.accent} opacity={enter}>
        <div style={{ position: "absolute", left: 25, top: 24, display: "flex", alignItems: "center", gap: 10, color: theme.accent, fontSize: 20, ...mono }}>
          <IconGlyph name="smartphone" size={29} color={theme.accent} strokeWidth={1.8} />
          ТЕЛЕФОН · ЛЕНТА
        </div>
        <div
          style={{
            position: "absolute",
            left: 28,
            top: 88,
            width: 358,
            height: 548,
            borderRadius: 25,
            background: "#0F151F",
            border: `3px solid ${theme.panelBorder}`,
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", left: 22, top: 20, color: theme.subtext, fontSize: 16, ...mono }}>FOR YOU</div>
          {isSimilar ? (
            <>
              <Thumbnail left={18} top={58} width={322} height={130} color={theme.accent} title="РОЛИК ПРО САД" opacity={0.96} />
              <div style={{ position: "absolute", left: 20, top: 206, color: theme.success, fontSize: 17, ...mono }}>ПОХОЖЕЕ · №1</div>
              <Thumbnail left={18} top={244} width={322} height={105} color={theme.accent2} title="ЦВЕТЫ · СОВЕТЫ" opacity={0.75 + reveal * 0.2} />
              <Thumbnail left={18} top={367} width={322} height={105} color={theme.warning} title="РЕЦЕПТ НА УЖИН" opacity={0.62 + reveal * 0.1} />
              <div style={{ position: "absolute", left: 20, bottom: 19, color: theme.subtext, fontSize: 15, ...mono }}>ЛЕНТА ПОСЛЕ ДОСМОТРА</div>
            </>
          ) : (
            <>
              <Thumbnail left={18} top={58} width={322} height={208} color={theme.accent} title="РОЛИК ПРО САД" opacity={0.96} />
              <div style={{ position: "absolute", left: 20, top: 291, color: theme.accent, fontSize: 19, ...mono }}>ДОСМОТР · {Math.round(progress * 100)}%</div>
              <div style={{ position: "absolute", left: 20, top: 338, width: 318, height: 13, borderRadius: 999, background: theme.panelBorder }}>
                <div style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 999, background: theme.success, boxShadow: `0 0 16px ${theme.success}66` }} />
              </div>
              <div style={{ position: "absolute", left: 20, top: 390, color: theme.subtext, fontSize: 17, ...mono }}>ЛАЙК — НЕТ</div>
              <div style={{ position: "absolute", left: 20, top: 432, color: theme.subtext, fontSize: 17, ...mono }}>ПОДПИСКА — НЕТ</div>
              <div style={{ position: "absolute", left: 20, bottom: 19, color: theme.warning, fontSize: 16, ...mono }}>ЛЕНТА ЗАПИСАЛА ПРОСМОТР</div>
            </>
          )}
        </div>
      </Panel>

      <Panel left={532} top={385} width={470} height={705} color={isSimilar ? theme.success : theme.accent2} opacity={enter}>
        <div style={{ position: "absolute", left: 28, top: 25, display: "flex", alignItems: "center", gap: 10, color: isSimilar ? theme.success : theme.accent2, fontSize: 20, ...mono }}>
          <IconGlyph name={isSimilar ? "sparkles" : "eye"} size={29} color={isSimilar ? theme.success : theme.accent2} strokeWidth={1.8} />
          {isSimilar ? "СЛЕДУЮЩАЯ ЛЕНТА" : "СЛЕД НА СЕРВЕРЕ"}
        </div>
        {isSimilar ? (
          <>
            <div style={{ position: "absolute", left: 29, top: 105, color: theme.subtext, fontSize: 18, ...mono }}>ПОСЛЕ ОДНОГО ДОСМОТРА</div>
            {cards.map((card, index) => (
              <div key={card.title} style={{ position: "absolute", left: 28, top: 157 + index * 126, width: 412, height: 94, borderRadius: 17, background: `${card.color}14`, border: `2px solid ${card.color}${index === 0 ? "CC" : "55"}`, opacity: 0.35 + reveal * 0.65 }}>
                <div style={{ position: "absolute", left: 17, top: 18, color: card.color, fontSize: 18, ...mono }}>{index + 1}</div>
                <div style={{ position: "absolute", left: 53, top: 17, color: theme.text, fontSize: 18, ...mono }}>{card.title}</div>
                <div style={{ position: "absolute", right: 20, top: 18, color: card.color, fontSize: 18, ...mono }}>SCORE {card.score}</div>
                <div style={{ position: "absolute", left: 53, right: 20, bottom: 19, height: 8, borderRadius: 999, background: theme.panelBorder }}>
                  <div style={{ width: `${Number(card.score) * 100}%`, height: "100%", borderRadius: 999, background: card.color }} />
                </div>
              </div>
            ))}
            <div style={{ position: "absolute", left: 29, bottom: 26, color: theme.success, fontSize: 19, ...mono }}>ПОХОЖИЙ КОНТЕНТ ВОШЁЛ В ЛЕНТУ</div>
          </>
        ) : (
          <>
            <div style={{ position: "absolute", left: 29, top: 111, width: 410, height: 120, borderRadius: 18, background: `${theme.accent2}12`, border: `2px solid ${theme.accent2}66` }}>
              <div style={{ position: "absolute", left: 21, top: 19, color: theme.accent2, fontSize: 19, ...mono }}>СИГНАЛ</div>
              <div style={{ position: "absolute", left: 21, top: 57, color: theme.text, fontSize: 22, ...mono }}>ДОСМОТР → ТЕМА</div>
              <div style={{ position: "absolute", right: 23, top: 44 }}>
                <IconGlyph name="eye" size={33} color={theme.accent2} strokeWidth={1.8} />
              </div>
            </div>
            <div style={{ position: "absolute", left: 29, top: 287, color: theme.subtext, fontSize: 18, ...mono }}>ЛАЙК И ПОДПИСКА</div>
            <div style={{ position: "absolute", left: 29, top: 331, color: theme.danger, fontSize: 20, ...mono }}>НЕ НАЖАТЫ</div>
            <div style={{ position: "absolute", left: 29, top: 420, width: 410, height: 118, borderRadius: 18, background: `${theme.warning}12`, border: `2px solid ${theme.warning}66` }}>
              <div style={{ position: "absolute", left: 21, top: 19, color: theme.warning, fontSize: 18, ...mono }}>ЧТО УВИДЕЛА ЛЕНТА?</div>
              <div style={{ position: "absolute", left: 21, top: 60, color: theme.text, fontSize: 22, ...mono }}>ПОВЕДЕНИЕ</div>
            </div>
            <div style={{ position: "absolute", left: 29, bottom: 27, color: theme.subtext, fontSize: 18, ...mono }}>СЛЕД ЕСТЬ · КНОПКИ НЕТ</div>
          </>
        )}
      </Panel>
      <ImpactRings local={local} impactLocal={impactLocal} x={isSimilar ? 735 : 285} y={isSimilar ? 695 : 730} color={isSimilar ? theme.success : theme.accent} />
      <FooterBadge text={isSimilar ? "ДОСМОТР → ПОХОЖИЕ РОЛИКИ" : "100% ПРОСМОТРА · ЛАЙК НЕ НУЖЕН"} color={isSimilar ? theme.success : theme.accent} opacity={enter} />
    </>
  );
};

interface SignalData {
  key: Exclude<RecommendationFocus, "all">;
  label: string;
  detail: string;
  icon: string;
  color: string;
}

const signalData: SignalData[] = [
  { key: "watch", label: "ДОСМОТР", detail: "100% РОЛИКА", icon: "play", color: theme.accent },
  { key: "pause", label: "ПАУЗА", detail: "03 СЕКУНДЫ", icon: "pause", color: theme.warning },
  { key: "swipe", label: "СВАЙП", detail: "БЫСТРО ВПРАВО", icon: "skip-forward", color: theme.danger },
  { key: "return", label: "ВОЗВРАТ", detail: "СМОТРИМ СНОВА", icon: "rotate-cw", color: theme.success },
];

const SignalLane: React.FC<{
  item: SignalData;
  left: number;
  top: number;
  active: boolean;
  opacity: number;
}> = ({ item, left, top, active, opacity }) => (
  <div style={{ position: "absolute", left, top, width: 420, height: 145, borderRadius: 20, background: `${item.color}${active ? "1E" : "0B"}`, border: `2px solid ${item.color}${active ? "CC" : "44"}`, opacity }}>
    <div style={{ position: "absolute", left: 20, top: 25, width: 55, height: 55, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 16, background: `${item.color}22` }}>
      <IconGlyph name={item.icon} size={31} color={item.color} strokeWidth={1.8} />
    </div>
    <div style={{ position: "absolute", left: 92, top: 22, color: item.color, fontSize: 21, ...mono }}>{item.label}</div>
    <div style={{ position: "absolute", left: 92, top: 61, color: theme.text, fontSize: 17, ...mono }}>{item.detail}</div>
    <div style={{ position: "absolute", left: 92, right: 20, bottom: 17, height: 7, borderRadius: 999, background: theme.panelBorder }}>
      <div style={{ width: active ? "78%" : "38%", height: "100%", borderRadius: 999, background: item.color, opacity: active ? 1 : 0.55 }} />
    </div>
  </div>
);

const SignalRoute: React.FC<{ x1: number; y1: number; x2: number; y2: number; color: string; progress: number; opacity: number }> = ({
  x1,
  y1,
  x2,
  y2,
  color,
  progress,
  opacity,
}) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <div style={{ position: "absolute", left: x1, top: y1, width: length * progress, borderTop: `3px solid ${color}`, transform: `rotate(${angle}deg)`, transformOrigin: "0 50%", opacity }} />
  );
};

const SignalsPhase: React.FC<{
  local: number;
  impactLocal: number;
  enter: number;
  focus: RecommendationFocus;
}> = ({ local, impactLocal, enter, focus }) => {
  const routeProgress = smooth(interpolate(local, [0, Math.max(impactLocal, 1)], [0.15, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const active = (key: SignalData["key"]) => focus === "all" || focus === key;
  const positions = [
    { left: 72, top: 385, x: 282, y: 530 },
    { left: 588, top: 385, x: 798, y: 530 },
    { left: 72, top: 575, x: 282, y: 720 },
    { left: 588, top: 575, x: 798, y: 720 },
  ];
  return (
    <>
      <Header phase="signals" opacity={enter} />
      {signalData.map((item, index) => (
        <SignalLane key={item.key} item={item} left={positions[index].left} top={positions[index].top} active={active(item.key)} opacity={enter * (active(item.key) ? 1 : 0.5)} />
      ))}
      {signalData.map((item, index) => (
        <SignalRoute key={item.key} x1={positions[index].x} y1={positions[index].y + 74} x2={CX} y2={895} color={item.color} progress={routeProgress} opacity={enter * (active(item.key) ? 0.9 : 0.25)} />
      ))}
      <Panel left={290} top={855} width={500} height={205} color={theme.accent2} opacity={enter}>
        <div style={{ position: "absolute", left: 26, top: 24, display: "flex", alignItems: "center", gap: 10, color: theme.accent2, fontSize: 20, ...mono }}>
          <IconGlyph name="activity" size={30} color={theme.accent2} strokeWidth={1.8} />
          ОЦЕНЩИК ПОВЕДЕНИЯ
        </div>
        <div style={{ position: "absolute", left: 26, top: 88, color: theme.text, fontSize: 24, ...mono }}>СОБЫТИЯ → ГИПОТЕЗА</div>
        <div style={{ position: "absolute", left: 26, top: 137, color: theme.accent2, fontSize: 17, ...mono }}>4 ДОРОЖКИ · 1 СИГНАЛ</div>
      </Panel>
      <ImpactRings local={local} impactLocal={impactLocal} x={CX} y={925} color={theme.accent2} />
      <FooterBadge text={focus === "all" ? "4 СЛЕДА → 1 ГИПОТЕЗА" : "СЛЕД ДЕЙСТВИЯ ВАЖНЕЕ КНОПКИ"} color={theme.accent2} opacity={enter} />
    </>
  );
};

const ExplicitPhase: React.FC<{ local: number; fps: number; impactLocal: number; enter: number }> = ({ local, fps, impactLocal, enter }) => {
  const punch = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  return (
    <>
      <Header phase="explicit" opacity={enter} />
      <Panel left={94} top={405} width={892} height={605} color={theme.accent} opacity={enter}>
        <div style={{ position: "absolute", left: 32, top: 27, color: theme.subtext, fontSize: 20, ...mono }}>ЯВНЫЙ СИГНАЛ</div>
        <div style={{ position: "absolute", left: 67, top: 113, width: 345, height: 300, borderRadius: 25, background: `${theme.accent}12`, border: `3px solid ${theme.accent}77`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 19, transform: `scale(${1 + 0.08 * punch})` }}>
          <IconGlyph name="heart" size={100} color={theme.accent} strokeWidth={1.6} />
          <div style={{ color: theme.accent, fontSize: 29, ...mono }}>ЛАЙК · «ДА»</div>
        </div>
        <div style={{ position: "absolute", left: 502, top: 113, width: 345, height: 300, borderRadius: 25, background: `${theme.subtext}09`, border: `3px solid ${theme.subtext}55`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 19 }}>
          <IconGlyph name="list-video" size={84} color={theme.subtext} strokeWidth={1.6} />
          <div style={{ color: theme.subtext, fontSize: 25, ...mono }}>КНОПКА · ГРОМКО</div>
        </div>
        <div style={{ position: "absolute", left: 68, top: 466, color: theme.text, fontSize: 21, ...mono }}>СИСТЕМА ВИДИТ НАЖАТИЕ</div>
        <div style={{ position: "absolute", right: 68, top: 466, color: theme.subtext, fontSize: 20, ...mono }}>НО ЭТО НЕ ЕДИНСТВЕННЫЙ СЛЕД</div>
      </Panel>
      <ImpactRings local={local} impactLocal={impactLocal} x={267} y={650} color={theme.accent} />
      <FooterBadge text="ЛАЙК — ЯВНОЕ «ДА»" color={theme.accent} opacity={enter} />
    </>
  );
};

const AnalogyPhase: React.FC<{
  local: number;
  impactLocal: number;
  enter: number;
  view: RecommendationLoopView;
}> = ({ local, impactLocal, enter, view }) => {
  const paused = view === "pause";
  const observe = smooth(interpolate(local, [0, Math.max(impactLocal, 1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <>
      <Header phase="analogy" opacity={enter} />
      <Panel left={80} top={395} width={920} height={680} color={theme.warning} opacity={enter}>
        <div style={{ position: "absolute", left: 28, top: 25, display: "flex", alignItems: "center", gap: 10, color: theme.warning, fontSize: 20, ...mono }}>
          <IconGlyph name="store" size={30} color={theme.warning} strokeWidth={1.8} />
          МАГАЗИН · ПОВЕДЕНЧЕСКИЙ СЛЕД
        </div>
        <div style={{ position: "absolute", left: 34, top: 104, width: 852, height: 420, borderRadius: 20, background: "#101720", border: `2px solid ${theme.panelBorder}` }}>
          <div style={{ position: "absolute", left: 75, right: 75, top: 130, height: 20, borderRadius: 8, background: `${theme.warning}88` }} />
          <div style={{ position: "absolute", left: 75, right: 75, top: 285, height: 20, borderRadius: 8, background: `${theme.warning}88` }} />
          <div style={{ position: "absolute", left: 76, top: 64, color: theme.warning, fontSize: 18, ...mono }}>ПОЛКА A · ТЕХНИКА</div>
          {[0, 1, 2].map((index) => (
            <div key={index} style={{ position: "absolute", left: 120 + index * 190, top: 166, width: 98, height: 100, borderRadius: 14, background: `${[theme.accent, theme.accent2, theme.success][index]}22`, border: `2px solid ${[theme.accent, theme.accent2, theme.success][index]}66` }}>
              <IconGlyph name="package" size={37} color={[theme.accent, theme.accent2, theme.success][index]} strokeWidth={1.7} />
              <div style={{ position: "absolute", left: 12, bottom: 12, color: theme.subtext, fontSize: 14, ...mono }}>ТОВАР {index + 1}</div>
            </div>
          ))}
          <div style={{ position: "absolute", left: paused ? 344 : 160 + observe * 164, top: 292, transform: "translateX(-50%)", color: theme.text, transition: "none" }}>
            <IconGlyph name="user-round" size={61} color={theme.text} strokeWidth={1.7} />
          </div>
          <div style={{ position: "absolute", left: 100, top: 335, color: theme.text, fontSize: 17, ...mono }}>ПОКУПАТЕЛЬ</div>
          <div style={{ position: "absolute", right: 108, top: 62, color: theme.accent2, fontSize: 17, ...mono }}>ПРОДАВЕЦ</div>
          <div style={{ position: "absolute", right: 98, top: 101, color: theme.accent2 }}><IconGlyph name="eye" size={43} color={theme.accent2} strokeWidth={1.7} /></div>
          <div style={{ position: "absolute", right: 92, top: 166, color: theme.accent2, fontSize: 16, ...mono }}>ЗАПОМНИЛ ПОЛКУ</div>
        </div>
        <div style={{ position: "absolute", left: 34, top: 560, width: 410, height: 78, borderRadius: 15, background: `${theme.warning}14`, border: `2px solid ${theme.warning}66`, display: "flex", alignItems: "center", gap: 14, padding: "0 19px", boxSizing: "border-box" }}>
          <IconGlyph name="clock-3" size={30} color={theme.warning} strokeWidth={1.8} />
          <span style={{ color: theme.warning, fontSize: 18, ...mono }}>{paused ? "ЗАДЕРЖАЛСЯ · 03 СЕК" : "ВРЕМЯ У ПОЛКИ"}</span>
        </div>
        <div style={{ position: "absolute", right: 34, top: 560, width: 410, height: 78, borderRadius: 15, background: `${theme.danger}12`, border: `2px solid ${theme.danger}66`, display: "flex", alignItems: "center", gap: 14, padding: "0 19px", boxSizing: "border-box" }}>
          <IconGlyph name="package" size={30} color={theme.danger} strokeWidth={1.8} />
          <span style={{ color: theme.danger, fontSize: 18, ...mono }}>ПОКУПКИ НЕТ</span>
        </div>
      </Panel>
      <ImpactRings local={local} impactLocal={impactLocal} x={paused ? 424 : 700} y={paused ? 760 : 560} color={theme.warning} />
      <FooterBadge text={paused ? "ПАУЗА ЗАМЕТНА · ПОКУПКА НЕ НУЖНА" : "ПРОДАВЕЦ ЗАПОМНИЛ ПОЛКУ"} color={theme.warning} opacity={enter} />
    </>
  );
};

const ScoreRow: React.FC<{
  index: number;
  title: string;
  color: string;
  value: number;
  oldValue?: number;
  active: boolean;
}> = ({ index, title, color, value, oldValue, active }) => (
  <div style={{ position: "absolute", left: 25, top: 96 + index * 138, width: 420, height: 106, borderRadius: 17, background: `${color}${active ? "1D" : "0A"}`, border: `2px solid ${color}${active ? "CC" : "4D"}`, opacity: active ? 1 : 0.62 }}>
    <div style={{ position: "absolute", left: 16, top: 16, color, fontSize: 20, ...mono }}>#{index + 1}</div>
    <div style={{ position: "absolute", left: 61, top: 17, color: theme.text, fontSize: 17, ...mono }}>{title}</div>
    <div style={{ position: "absolute", right: 17, top: 17, color, fontSize: 17, ...mono }}>SCORE {value.toFixed(2)}</div>
    <div style={{ position: "absolute", left: 61, right: 17, bottom: 20, height: 10, borderRadius: 999, background: theme.panelBorder }}>
      <div style={{ width: `${value * 100}%`, height: "100%", borderRadius: 999, background: color, boxShadow: active ? `0 0 15px ${color}66` : "none" }} />
    </div>
    {oldValue !== undefined ? <div style={{ position: "absolute", left: 61, bottom: 37, color: theme.subtext, fontSize: 13, ...mono }}>БЫЛО {oldValue.toFixed(2)} → СТАЛО {value.toFixed(2)}</div> : null}
  </div>
);

const ScorePhase: React.FC<{
  local: number;
  impactLocal: number;
  enter: number;
  view: RecommendationLoopView;
}> = ({ local, impactLocal, enter, view }) => {
  const recalculating = view === "recalculate";
  const t = recalculating ? smooth(interpolate(local, [0, Math.max(impactLocal, 1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })) : 0;
  const scores = [0.31 + 0.47 * t, 0.24 + 0.13 * t, 0.18 + 0.04 * t];
  const old = [0.31, 0.24, 0.18];
  return (
    <>
      <Header phase="score" opacity={enter} />
      <Panel left={70} top={390} width={475} height={700} color={theme.accent} opacity={enter}>
        <div style={{ position: "absolute", left: 26, top: 25, display: "flex", alignItems: "center", gap: 10, color: theme.accent, fontSize: 20, ...mono }}>
          <IconGlyph name="list-video" size={30} color={theme.accent} strokeWidth={1.8} />
          КАНДИДАТЫ
        </div>
        <ScoreRow index={0} title="РОЛИК ПРО САД" color={theme.success} value={scores[0]} oldValue={recalculating ? old[0] : undefined} active />
        <ScoreRow index={1} title="ЦВЕТЫ · СОВЕТЫ" color={theme.accent2} value={scores[1]} oldValue={recalculating ? old[1] : undefined} active={false} />
        <ScoreRow index={2} title="РЕЦЕПТ НА УЖИН" color={theme.warning} value={scores[2]} oldValue={recalculating ? old[2] : undefined} active={false} />
        <div style={{ position: "absolute", left: 26, bottom: 23, color: recalculating ? theme.success : theme.subtext, fontSize: 17, ...mono }}>{recalculating ? "БАЛЛ ОБНОВЛЁН ПО СИГНАЛАМ" : "У КАЖДОГО РОЛИКА СВОЙ БАЛЛ"}</div>
      </Panel>
      <Panel left={580} top={390} width={430} height={700} color={theme.accent} opacity={enter}>
        <div style={{ position: "absolute", left: 25, top: 25, display: "flex", alignItems: "center", gap: 10, color: theme.accent, fontSize: 20, ...mono }}>
          <IconGlyph name="calculator" size={30} color={theme.accent} strokeWidth={1.8} />
          РАНЖИРОВЩИК
        </div>
        <div style={{ position: "absolute", left: 25, top: 100, color: theme.subtext, fontSize: 17, ...mono }}>ВХОДЫ ОЦЕНЩИКА</div>
        {signalData.map((item, index) => (
          <div key={item.key} style={{ position: "absolute", left: 25, top: 145 + index * 67, width: 380, height: 48, borderRadius: 13, background: `${item.color}15`, border: `2px solid ${item.color}55`, display: "flex", alignItems: "center", gap: 12, padding: "0 13px", boxSizing: "border-box" }}>
            <IconGlyph name={item.icon} size={22} color={item.color} strokeWidth={1.8} />
            <span style={{ color: item.color, fontSize: 16, ...mono }}>{item.label}</span>
            <span style={{ marginLeft: "auto", color: theme.subtext, fontSize: 14, ...mono }}>{index === 0 ? "+" : index === 2 ? "−" : "±"}</span>
          </div>
        ))}
        <div style={{ position: "absolute", left: 25, bottom: 27, color: recalculating ? theme.success : theme.accent, fontSize: 18, ...mono }}>{recalculating ? "ПЕРЕСЧЁТ · SCORE ↑" : "СИГНАЛЫ → SCORE"}</div>
      </Panel>
      <ImpactRings local={local} impactLocal={impactLocal} x={795} y={775} color={recalculating ? theme.success : theme.accent} />
      <FooterBadge text={recalculating ? "SCORE 0.31 → 0.78 · РОЛИК ПОДНЯЛСЯ" : "РАНЖИРОВЩИК СЧИТАЕТ БАЛЛЫ КАНДИДАТОВ"} color={recalculating ? theme.success : theme.accent} opacity={enter} />
    </>
  );
};

const ReorderPhase: React.FC<{
  local: number;
  impactLocal: number;
  enter: number;
  view: RecommendationLoopView;
}> = ({ local, impactLocal, enter, view }) => {
  const after = smooth(interpolate(local, [0, Math.max(impactLocal, 1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const chance = view === "chance";
  const rows = [
    { id: "garden", title: "РОЛИК ПРО САД", color: theme.success, before: 2, after: 0, score: "0.78" },
    { id: "news", title: "НОВОСТИ", color: theme.accent2, before: 0, after: 1, score: "0.46" },
    { id: "recipe", title: "РЕЦЕПТ НА УЖИН", color: theme.warning, before: 1, after: 2, score: "0.22" },
  ];
  return (
    <>
      <Header phase="reorder" opacity={enter} />
      <Panel left={72} top={390} width={540} height={700} color={theme.success} opacity={enter}>
        <div style={{ position: "absolute", left: 26, top: 25, display: "flex", alignItems: "center", gap: 10, color: theme.success, fontSize: 20, ...mono }}>
          <IconGlyph name="list-video" size={30} color={theme.success} strokeWidth={1.8} />
          ПОРЯДОК ПОКАЗА
        </div>
        {rows.map((row) => {
          const rank = interpolate(after, [0, 1], [row.before, row.after]);
          return (
            <div key={row.id} style={{ position: "absolute", left: 26, top: 100 + rank * 158, width: 488, height: 118, borderRadius: 18, background: `${row.color}${row.id === "garden" ? "20" : "0A"}`, border: `3px solid ${row.color}${row.id === "garden" ? "DD" : "4D"}`, transform: `scale(${row.id === "garden" ? 1 + 0.025 * after : 1})`, zIndex: row.id === "garden" ? 2 : 1 }}>
              <div style={{ position: "absolute", left: 18, top: 19, color: row.color, fontSize: 26, ...mono }}>#{Math.round(rank) + 1}</div>
              <div style={{ position: "absolute", left: 76, top: 22, color: theme.text, fontSize: 20, ...mono }}>{row.title}</div>
              <div style={{ position: "absolute", right: 21, top: 22, color: row.color, fontSize: 18, ...mono }}>SCORE {row.score}</div>
              <div style={{ position: "absolute", left: 76, right: 22, bottom: 22, height: 10, borderRadius: 999, background: theme.panelBorder }}>
                <div style={{ width: `${Number(row.score) * 100}%`, height: "100%", borderRadius: 999, background: row.color }} />
              </div>
            </div>
          );
        })}
        <div style={{ position: "absolute", left: 26, bottom: 24, color: theme.success, fontSize: 17, ...mono }}>№1 · ПОХОЖИЙ РОЛИК</div>
      </Panel>
      <Panel left={655} top={390} width={350} height={700} color={chance ? theme.accent2 : theme.success} opacity={enter}>
        <div style={{ position: "absolute", left: 24, top: 25, color: chance ? theme.accent2 : theme.success, fontSize: 20, ...mono }}>{chance ? "СЛЕДУЮЩИЙ ШАНС" : "ИЗМЕНЕНИЕ ПОРЯДКА"}</div>
        {chance ? (
          <>
            <div style={{ position: "absolute", left: 25, top: 130, color: theme.subtext, fontSize: 17, ...mono }}>P(ПОХОЖЕЕ)</div>
            <div style={{ position: "absolute", left: 25, top: 181, color: theme.text, fontSize: 30, ...mono }}>18% → {Math.round(18 + after * 46)}%</div>
            <div style={{ position: "absolute", left: 25, top: 252, width: 300, height: 22, borderRadius: 999, background: theme.panelBorder }}><div style={{ width: `${(18 + after * 46) / 100 * 100}%`, height: "100%", borderRadius: 999, background: theme.accent2 }} /></div>
            <div style={{ position: "absolute", left: 25, top: 336, color: theme.subtext, fontSize: 17, ...mono }}>ОДИН ДОСМОТР</div>
            <div style={{ position: "absolute", left: 25, top: 382, color: theme.accent2, fontSize: 24, ...mono }}>→ НОВАЯ ЛЕНТА</div>
            <div style={{ position: "absolute", left: 25, bottom: 28, color: theme.accent2, fontSize: 17, ...mono }}>ШАНСЫ НЕ ВЫСЕЧЕНЫ</div>
          </>
        ) : (
          <>
            <div style={{ position: "absolute", left: 126, top: 72 }}>
              <IconGlyph name="arrow-up" size={92} color={theme.success} strokeWidth={1.5} />
            </div>
            <div style={{ position: "absolute", left: 25, top: 185, color: theme.success, fontSize: 28, ...mono }}>№3 → №1</div>
            <div style={{ position: "absolute", left: 25, top: 276, color: theme.text, fontSize: 21, ...mono }}>БАЛЛ ВЫШЕ</div>
            <div style={{ position: "absolute", left: 25, top: 327, color: theme.text, fontSize: 21, ...mono }}>КАРТОЧКА ВЫШЕ</div>
            <div style={{ position: "absolute", left: 25, bottom: 28, color: theme.success, fontSize: 17, ...mono }}>ПОРЯДОК ОБНОВЛЁН</div>
          </>
        )}
      </Panel>
      <ImpactRings local={local} impactLocal={impactLocal} x={379} y={565} color={chance ? theme.accent2 : theme.success} />
      <FooterBadge text={chance ? "ДОСМОТР → ШАНС ПОХОЖЕГО РАСТЁТ" : "SCORE ВЫШЕ → КАРТОЧКА ПОДНИМАЕТСЯ"} color={chance ? theme.accent2 : theme.success} opacity={enter} />
    </>
  );
};

/** Буквальная рекомендательная лента: поведение превращается в сигналы, score меняет порядок. */
export const RecommendationLoopVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "feed",
  focus = "all",
  view = "watch",
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  if (phase === "feed") return <div style={{ position: "absolute", inset: 0, opacity: enter }}><FeedPhase local={local} impactLocal={impactLocal} enter={enter} view={view} /></div>;
  if (phase === "explicit") return <div style={{ position: "absolute", inset: 0, opacity: enter }}><ExplicitPhase local={local} fps={fps} impactLocal={impactLocal} enter={enter} /></div>;
  if (phase === "signals") return <div style={{ position: "absolute", inset: 0, opacity: enter }}><SignalsPhase local={local} impactLocal={impactLocal} enter={enter} focus={focus} /></div>;
  if (phase === "analogy") return <div style={{ position: "absolute", inset: 0, opacity: enter }}><AnalogyPhase local={local} impactLocal={impactLocal} enter={enter} view={view} /></div>;
  if (phase === "score") return <div style={{ position: "absolute", inset: 0, opacity: enter }}><ScorePhase local={local} impactLocal={impactLocal} enter={enter} view={view} /></div>;
  return <div style={{ position: "absolute", inset: 0, opacity: enter }}><ReorderPhase local={local} impactLocal={impactLocal} enter={enter} view={view} /></div>;
};

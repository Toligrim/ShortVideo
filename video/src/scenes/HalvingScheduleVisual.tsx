import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type HalvingSchedulePhase = "bakery" | "interval" | "halve" | "tail";

const W = layout.width;
const H = layout.height;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };

const phaseTitle: Record<HalvingSchedulePhase, string> = {
  bakery: "СУБСИДИЯ БЛОКА · ПЕКАРНЯ С ПЕЧАТЬЮ",
  interval: "ХАЛВИНГ · КАЖДЫЕ 210 000 БЛОКОВ",
  halve: "НАГРАДА ДЕЛИТСЯ ПОПОЛАМ",
  tail: "ГРАФИК СХОДИТСЯ К НУЛЮ",
};

const Card: React.FC<{
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
      border: `3px solid ${color}88`,
      background: `${theme.panel}ED`,
      boxShadow: `0 18px 50px ${color}20`,
      opacity: enter,
      transform: `translateY(${(1 - enter) * 30}px) scale(${0.92 + enter * 0.08})`,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const Header: React.FC<{ phase: HalvingSchedulePhase; enter: number }> = ({ phase, enter }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 245,
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
    <IconGlyph name={phase === "bakery" ? "stamp" : phase === "interval" ? "blocks" : "divide"} size={30} color={theme.accent} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const Bread: React.FC<{ index: number; enter: number }> = ({ index, enter }) => (
  <div
    style={{
      width: 48,
      height: 30,
      borderRadius: "50% 50% 42% 42%",
      background: `${theme.warning}${index % 2 === 0 ? "DD" : "AA"}`,
      border: `2px solid ${theme.warning}`,
      opacity: enter,
      transform: `translateY(${(1 - enter) * 12}px) rotate(${index % 2 ? 4 : -4}deg)`,
      boxShadow: `0 0 18px ${theme.warning}44`,
    }}
  />
);

const ValueCard: React.FC<{ value: string; label: string; color: string; enter: number; delay: number }> = ({ value, label, color, enter, delay }) => {
  const local = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: Math.max(0, local - delay), fps, config: { damping: 13, mass: 0.72 } });
  return (
    <div
      style={{
        width: 278,
        height: 340,
        boxSizing: "border-box",
        borderRadius: 24,
        border: `3px solid ${color}99`,
        background: `${theme.panel}F0`,
        boxShadow: `0 18px 42px ${color}22`,
        opacity: enter * p,
        transform: `translateY(${(1 - p) * 34}px) scale(${0.86 + p * 0.14})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
      }}
    >
      <div style={{ ...mono, fontSize: 22, color: theme.subtext }}>{label}</div>
      <div style={{ ...mono, fontSize: value.length > 7 ? 38 : 50, color, whiteSpace: "nowrap" }}>{value}</div>
      <IconGlyph name="bitcoin" size={42} color={theme.warning} strokeWidth={1.8} />
    </div>
  );
};

export const HalvingScheduleVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: HalvingSchedulePhase;
}> = ({ local, fps, impactLocal, phase = "bakery" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });

  if (phase === "bakery") {
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
        <Header phase={phase} enter={enter} />
        <Card left={72} top={420} width={390} height={390} color={theme.accent2} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
            <IconGlyph name="factory" size={70} color={theme.accent2} strokeWidth={1.7} />
            <div style={{ ...mono, fontSize: 28, color: theme.text }}>ПЕКАРНЯ</div>
            <div style={{ ...mono, fontSize: 20, color: theme.accent2 }}>СУБСИДИЯ БЛОКА</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {Array.from({ length: 5 }).map((_, i) => <Bread key={i} index={i} enter={enter} />)}
            </div>
          </div>
        </Card>
        <div style={{ position: "absolute", left: 490, top: 585, color: theme.accent, fontSize: 58, opacity: enter }}>→</div>
        <Card left={570} top={420} width={438} height={390} color={theme.warning} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 17 }}>
            <IconGlyph name="stamp" size={58} color={theme.warning} strokeWidth={1.7} />
            <div style={{ ...mono, fontSize: 21, color: theme.warning }}>ПЕЧАТЬ НА ПАРТИИ</div>
            <div style={{ ...mono, fontSize: 58, color: theme.text, whiteSpace: "nowrap" }}>50 BTC</div>
            <div style={{ ...mono, fontSize: 21, color: theme.subtext }}>ЗА КАЖДЫЙ БЛОК</div>
          </div>
        </Card>
        <div style={{ position: "absolute", left: W / 2, top: 1115, transform: "translateX(-50%)", ...mono, fontSize: 24, color: theme.subtext, opacity: enter, whiteSpace: "nowrap" }}>
          МАЙНЕР получает выпуск за новый блок
        </div>
        <PulseRing x={W / 2} y={615} triggerFrame={impactLocal} tone="warning" size={220} />
      </div>
    );
  }

  if (phase === "interval") {
    const target = Math.max(impactLocal, 48);
    const blocks = Math.round(interpolate(local, [0, target], [0, 210000], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    const shown = blocks.toLocaleString("ru-RU").replace(/\u00a0/g, " ");
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
        <Header phase={phase} enter={enter} />
        <Card left={72} top={440} width={936} height={350} color={theme.accent} enter={enter}>
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "space-evenly", gap: 16 }}>
            <div style={{ width: 250, textAlign: "center" }}>
              <IconGlyph name="blocks" size={62} color={theme.accent} strokeWidth={1.7} />
              <div style={{ ...mono, fontSize: 20, color: theme.subtext, marginTop: 16 }}>СЧЁТЧИК БЛОКОВ</div>
            </div>
            <div style={{ ...mono, fontSize: 52, color: theme.accent, whiteSpace: "nowrap" }}>{shown}</div>
            <div style={{ color: theme.accent2, fontSize: 58 }}>→</div>
            <div style={{ width: 250, textAlign: "center" }}>
              <div style={{ ...mono, fontSize: 56, color: theme.text, whiteSpace: "nowrap" }}>210 000</div>
              <div style={{ ...mono, fontSize: 20, color: theme.subtext, marginTop: 14 }}>ДО СЛЕДУЮЩЕГО</div>
            </div>
          </div>
        </Card>
        <div style={{ position: "absolute", left: W / 2, top: 900, transform: "translateX(-50%)", ...mono, fontSize: 31, color: theme.warning, opacity: enter * (0.5 + reveal * 0.5), whiteSpace: "nowrap" }}>
          ОДИН ИНТЕРВАЛ ХАЛВИНГА
        </div>
        <div style={{ position: "absolute", left: W / 2, top: 1115, transform: "translateX(-50%)", ...mono, fontSize: 24, color: theme.subtext, opacity: enter, whiteSpace: "nowrap" }}>
          выдача меняется только на границе блока
        </div>
        <PulseRing x={W / 2} y={615} triggerFrame={impactLocal} tone="accent" size={220} />
      </div>
    );
  }

  if (phase === "halve") {
    const values = [
      { value: "50 BTC", label: "СТАРТ", color: theme.warning },
      { value: "25 BTC", label: "÷ 2", color: theme.accent },
      { value: "12,5 BTC", label: "ЕЩЁ ÷ 2", color: theme.accent2 },
    ];
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
        <Header phase={phase} enter={enter} />
        <div style={{ position: "absolute", left: 52, top: 470, display: "flex", alignItems: "center", gap: 18 }}>
          {values.map((item, i) => (
            <React.Fragment key={item.value}>
              <ValueCard {...item} enter={enter} delay={i * 7} />
              {i < values.length - 1 ? <div style={{ color: theme.accent, fontSize: 42, opacity: enter }}>→</div> : null}
            </React.Fragment>
          ))}
        </div>
        <div style={{ position: "absolute", left: W / 2, top: 945, transform: "translateX(-50%)", ...mono, fontSize: 34, color: theme.text, opacity: enter * (0.55 + reveal * 0.45), whiteSpace: "nowrap" }}>
          50 → 25 → 12,5 → дальше
        </div>
        <div style={{ position: "absolute", left: W / 2, top: 1115, transform: "translateX(-50%)", ...mono, fontSize: 24, color: theme.subtext, opacity: enter, whiteSpace: "nowrap" }}>
          каждое сокращение — ровно пополам
        </div>
        <PulseRing x={W / 2 + 306} y={640} triggerFrame={impactLocal} tone="accent2" size={210} />
      </div>
    );
  }

  const tailValues = ["50", "25", "12,5", "6,25", "3,125", "0"];
  return (
    <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
      <Header phase={phase} enter={enter} />
      <Card left={54} top={440} width={972} height={330} color={theme.success} enter={enter}>
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          {tailValues.map((value, i) => (
            <React.Fragment key={value}>
              <div style={{ width: 132, textAlign: "center", opacity: enter * (0.55 + reveal * 0.45), transform: `translateY(${(1 - spring({ frame: Math.max(0, local - i * 5), fps, config: { damping: 14, mass: 0.7 } })) * 20}px)` }}>
                <div style={{ height: 110, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  <div style={{ width: Math.max(18, 92 / Math.pow(1.7, i)), height: Math.max(8, 90 / Math.pow(1.65, i)), borderRadius: 12, background: i === tailValues.length - 1 ? `${theme.success}55` : theme.success, boxShadow: `0 0 24px ${theme.success}55` }} />
                </div>
                <div style={{ ...mono, fontSize: i === 5 ? 30 : 25, color: i === 5 ? theme.success : theme.text, marginTop: 16, whiteSpace: "nowrap" }}>{value} BTC</div>
              </div>
              {i < tailValues.length - 1 ? <div style={{ color: theme.subtext, fontSize: 30, opacity: enter }}>→</div> : null}
            </React.Fragment>
          ))}
        </div>
      </Card>
      <div style={{ position: "absolute", left: W / 2, top: 905, transform: "translateX(-50%)", textAlign: "center", opacity: enter * (0.55 + reveal * 0.45) }}>
        <div style={{ ...mono, fontSize: 38, color: theme.success, whiteSpace: "nowrap" }}>20 999 999,97690000 BTC</div>
        <div style={{ ...mono, fontSize: 21, color: theme.subtext, marginTop: 18 }}>целочисленные сатоши округляют вниз</div>
      </div>
      <div style={{ position: "absolute", left: W / 2, top: 1135, transform: "translateX(-50%)", ...mono, fontSize: 25, color: theme.warning, opacity: enter, whiteSpace: "nowrap" }}>
        ПОТОЛОК НЕ ПЕРЕСКОЧИТЬ
      </div>
      <PulseRing x={W / 2} y={945} triggerFrame={impactLocal} tone="success" size={260} />
    </div>
  );
};

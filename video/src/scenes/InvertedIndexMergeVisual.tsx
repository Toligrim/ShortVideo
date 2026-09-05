import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

const W = layout.width;
const CENTER = W / 2;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const ease = (value: number) => value * value * (3 - 2 * value);

export type InvertedIndexPhase = "preindex" | "lookup" | "intersect";
export type InvertedIndexSource = "library" | "web";

const Caption: React.FC<{
  text: string;
  top: number;
  color?: string;
  size?: number;
  mono?: boolean;
}> = ({ text, top, color = theme.subtext, size = 30, mono = false }) => (
  <div
    style={{
      position: "absolute",
      left: CENTER,
      top,
      transform: "translateX(-50%)",
      color,
      fontFamily: mono ? theme.mono : theme.font,
      fontSize: size,
      fontWeight: 800,
      letterSpacing: mono ? 1 : 0.4,
      textAlign: "center",
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color?: string;
  opacity?: number;
  children?: React.ReactNode;
}> = ({ left, top, width, height, color = theme.panelBorder, opacity = 1, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      borderRadius: 24,
      border: `3px solid ${color}99`,
      background: `${theme.panel}EE`,
      boxShadow: `0 0 30px ${color}18`,
      opacity,
    }}
  >
    {children}
  </div>
);

const Arrow: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  opacity?: number;
}> = ({ x1, y1, x2, y2, color, opacity = 1 }) => (
  <svg
    width={W}
    height={layout.height}
    style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", opacity }}
  >
    <defs>
      <marker id={`inverted-index-arrow-${color.replace("#", "")}`} markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
        <path d="M0,0 L0,8 L9,4 z" fill={color} />
      </marker>
    </defs>
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={color}
      strokeWidth={5}
      strokeDasharray="12 9"
      markerEnd={`url(#inverted-index-arrow-${color.replace("#", "")})`}
    />
  </svg>
);

const Chip: React.FC<{
  text: string;
  left: number;
  top: number;
  width?: number;
  color: string;
  opacity?: number;
  scale?: number;
}> = ({ text, left, top, width = 150, color, opacity = 1, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height: 62,
      borderRadius: 16,
      border: `2px solid ${color}AA`,
      background: `${color}18`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: theme.text,
      fontFamily: theme.mono,
      fontSize: 25,
      fontWeight: 800,
      opacity,
      transform: `scale(${scale})`,
      boxShadow: `0 0 20px ${color}22`,
    }}
  >
    {text}
  </div>
);

const Badge: React.FC<{
  text: string;
  top: number;
  color: string;
  opacity: number;
  scale: number;
}> = ({ text, top, color, opacity, scale }) => (
  <div
    style={{
      position: "absolute",
      left: CENTER,
      top,
      transform: `translateX(-50%) scale(${scale})`,
      padding: "13px 28px",
      borderRadius: 999,
      background: `${color}18`,
      border: `2px solid ${color}`,
      color,
      fontFamily: theme.font,
      fontSize: 27,
      fontWeight: 800,
      letterSpacing: 0.5,
      opacity,
      whiteSpace: "nowrap",
      boxShadow: `0 0 34px ${color}33`,
    }}
  >
    {text}
  </div>
);

const PreindexPhase: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  source: InvertedIndexSource;
}> = ({ local, fps, impactLocal, source }) => {
  const docsP = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const wordsP = spring({ frame: Math.max(0, local - 12), fps, config: { damping: 14, mass: 0.75 } });
  const listP = spring({ frame: Math.max(0, local - 28), fps, config: { damping: 14, mass: 0.8 } });
  const done = local >= impactLocal;
  const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  const docName = source === "library" ? "КНИГА" : "СТРАНИЦА";
  const subtitle = source === "library" ? "книги разбираются до запроса" : "веб разбирается до запроса";
  const docs = [12, 27, 44];

  return (
    <>
      <Caption text="ПРЕДВАРИТЕЛЬНАЯ ИНДЕКСАЦИЯ" top={262} color={theme.text} size={35} />
      <Caption text={subtitle} top={328} color={theme.subtext} size={27} mono />
      <Arrow x1={318} y1={612} x2={394} y2={612} color={theme.accent} opacity={docsP * 0.9} />
      <Arrow x1={670} y1={612} x2={725} y2={612} color={theme.accent2} opacity={wordsP * 0.9} />

      <Panel left={52} top={465} width={270} height={292} color={theme.accent} opacity={docsP}>
        <div style={{ position: "absolute", left: 22, top: 18, color: theme.accent, fontFamily: theme.mono, fontSize: 21, fontWeight: 800 }}>
          {source === "library" ? "ИСТОЧНИК" : "ВЕБ"}
        </div>
        {docs.map((id, i) => (
          <div
            key={id}
            style={{
              position: "absolute",
              left: 18,
              top: 60 + i * 70,
              width: 234,
              height: 53,
              borderRadius: 12,
              border: `2px solid ${theme.panelBorder}`,
              background: `${theme.bg}AA`,
              color: theme.text,
              fontFamily: theme.mono,
              fontSize: 21,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: ease(clamp01((local - i * 5) / 14)),
            }}
          >
            {docName} {id} · слова
          </div>
        ))}
      </Panel>

      <Panel left={390} top={465} width={280} height={292} color={theme.accent2} opacity={wordsP}>
        <div style={{ position: "absolute", left: 24, top: 18, color: theme.accent2, fontFamily: theme.mono, fontSize: 21, fontWeight: 800 }}>
          СЛОВА
        </div>
        <Chip text="КОФЕ" left={55} top={70} width={170} color={theme.accent2} opacity={wordsP} scale={wordsP} />
        <Chip text="МОРЕ" left={55} top={140} width={170} color={theme.accent2} opacity={wordsP * 0.9} scale={wordsP} />
        <Chip text="ЧАЙ" left={55} top={210} width={170} color={theme.accent2} opacity={wordsP * 0.8} scale={wordsP} />
      </Panel>

      <Panel left={720} top={465} width={308} height={292} color={theme.success} opacity={listP}>
        <div style={{ position: "absolute", left: 24, top: 18, color: theme.success, fontFamily: theme.mono, fontSize: 21, fontWeight: 800 }}>
          КАРТОЧКА СЛОВА
        </div>
        <div style={{ position: "absolute", left: 24, top: 73, color: theme.text, fontFamily: theme.mono, fontSize: 29, fontWeight: 800 }}>
          КОФЕ
        </div>
        <div style={{ position: "absolute", left: 24, top: 128, color: theme.subtext, fontFamily: theme.mono, fontSize: 20, fontWeight: 800 }}>
          ДОКУМЕНТЫ
        </div>
        <div style={{ position: "absolute", left: 24, top: 175, color: theme.success, fontFamily: theme.mono, fontSize: 30, fontWeight: 800, letterSpacing: 3 }}>
          12 · 27 · 44
        </div>
      </Panel>
      <Badge text="СПИСОК ГОТОВ ДО ЗАПРОСА" top={1160} color={theme.success} opacity={done ? badgeP : listP * 0.7} scale={done ? badgeP : 0.9} />
      {done ? <PulseRing x={874} y={612} triggerFrame={impactLocal} tone="success" size={260} /> : null}
    </>
  );
};

const LookupPhase: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
}> = ({ local, fps, impactLocal }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  const listItems = [12, 27, 44];

  return (
    <>
      <Caption text="СЛОВО → СПИСОК ДОКУМЕНТОВ" top={270} color={theme.text} size={36} />
      <Caption text="направление перевёрнуто заранее" top={338} color={theme.subtext} size={28} mono />
      <Panel left={92} top={492} width={300} height={286} color={theme.accent} opacity={enter}>
        <div style={{ position: "absolute", left: 25, top: 22, color: theme.subtext, fontFamily: theme.mono, fontSize: 21, fontWeight: 800 }}>
          ЗАПРОС
        </div>
        <div style={{ position: "absolute", left: 25, top: 88, color: theme.accent, fontFamily: theme.mono, fontSize: 48, fontWeight: 800, letterSpacing: 2 }}>
          КОФЕ
        </div>
        <div style={{ position: "absolute", left: 25, top: 178, color: theme.subtext, fontFamily: theme.mono, fontSize: 20, fontWeight: 800 }}>
          одно слово
        </div>
      </Panel>
      <Arrow x1={410} y1={635} x2={655} y2={635} color={theme.success} opacity={enter} />
      <Panel left={660} top={492} width={328} height={286} color={theme.success} opacity={enter}>
        <div style={{ position: "absolute", left: 25, top: 22, color: theme.subtext, fontFamily: theme.mono, fontSize: 21, fontWeight: 800 }}>
          ГОТОВЫЙ СПИСОК
        </div>
        {listItems.map((id, i) => (
          <Chip key={id} text={`DOC ${id}`} left={25 + i * 97} top={95} width={86} color={theme.success} opacity={enter} scale={enter} />
        ))}
        <div style={{ position: "absolute", left: 25, top: 195, color: theme.success, fontFamily: theme.mono, fontSize: 22, fontWeight: 800 }}>
          номера, не страницы
        </div>
      </Panel>
      <div
        style={{
          position: "absolute",
          left: CENTER,
          top: 890,
          transform: "translateX(-50%)",
          color: theme.danger,
          fontFamily: theme.mono,
          fontSize: 25,
          fontWeight: 800,
          opacity: enter * 0.85,
          textDecoration: "line-through",
        }}
      >
        документ → все его слова
      </div>
      <Badge text="МИЛЛИАРДЫ СТРАНИЦ НЕ ПЕРЕЧИТЫВАЕМ" top={1135} color={theme.success} opacity={done ? badgeP : enter * 0.65} scale={done ? badgeP : 0.9} />
      {done ? <PulseRing x={820} y={635} triggerFrame={impactLocal} tone="success" size={280} /> : null}
    </>
  );
};

const IntersectPhase: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
}> = ({ local, fps, impactLocal }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const done = local >= impactLocal;
  const badgeP = done ? spring({ frame: local - impactLocal, fps, config: { damping: 11, mass: 0.7 } }) : 0;
  const listA = [12, 19, 31, 44];
  const listB = [7, 19, 31, 52];
  const xs = [155, 350, 545, 740, 935];
  const steps = [
    { a: 0, b: 0, note: "12 > 7 · j двигается" },
    { a: 0, b: 1, note: "12 < 19 · i двигается" },
    { a: 1, b: 1, note: "19 = 19 · оставить" },
    { a: 2, b: 2, note: "31 = 31 · оставить" },
    { a: 3, b: 3, note: "44 < 52 · i двигается" },
    { a: 4, b: 3, note: "списки закончились" },
  ];
  const stepFrames = 20;
  const activeStep = done
    ? steps.length - 1
    : Math.min(steps.length - 1, Math.floor(Math.max(0, local - 12) / stepFrames));
  const step = steps[activeStep];
  const match19 = done || activeStep >= 2;
  const match31 = done || activeStep >= 3;
  const pointerA = xs[Math.min(step.a, xs.length - 1)];
  const pointerB = xs[Math.min(step.b, xs.length - 1)];
  const noteP = interpolate(local, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <>
      <Caption text="ПЕРЕСЕЧЕНИЕ ДВУХ СПИСКОВ" top={260} color={theme.text} size={36} />
      <Caption text="два указателя идут только вперёд" top={328} color={theme.subtext} size={28} mono />
      <div style={{ position: "absolute", left: 62, top: 485, color: theme.accent, fontFamily: theme.mono, fontSize: 25, fontWeight: 800, opacity: enter }}>
        КОФЕ · отсортирован
      </div>
      <div style={{ position: "absolute", left: 62, top: 750, color: theme.accent2, fontFamily: theme.mono, fontSize: 25, fontWeight: 800, opacity: enter }}>
        МОРЕ · отсортирован
      </div>
      {listA.map((value, i) => {
        const active = (i === 1 && match19) || (i === 2 && match31);
        const current = i === step.a;
        return (
          <Chip
            key={`a-${value}`}
            text={String(value)}
            left={xs[i] - 58}
            top={535}
            width={116}
            color={active ? theme.success : current ? theme.accent : theme.accent}
            opacity={enter}
            scale={active ? 1.05 : 1}
          />
        );
      })}
      {listB.map((value, i) => {
        const active = (i === 1 && match19) || (i === 2 && match31);
        const current = i === step.b;
        return (
          <Chip
            key={`b-${value}`}
            text={String(value)}
            left={xs[i] - 58}
            top={800}
            width={116}
            color={active ? theme.success : current ? theme.accent2 : theme.accent2}
            opacity={enter}
            scale={active ? 1.05 : 1}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          left: pointerA - 27,
          top: 470,
          width: 54,
          height: 40,
          borderRadius: 12,
          background: `${theme.accent}22`,
          border: `2px solid ${theme.accent}`,
          color: theme.accent,
          fontFamily: theme.mono,
          fontSize: 22,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: enter,
        }}
      >
        i
      </div>
      <div
        style={{
          position: "absolute",
          left: pointerB - 27,
          top: 738,
          width: 54,
          height: 40,
          borderRadius: 12,
          background: `${theme.accent2}22`,
          border: `2px solid ${theme.accent2}`,
          color: theme.accent2,
          fontFamily: theme.mono,
          fontSize: 22,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: enter,
        }}
      >
        j
      </div>
      <div
        style={{
          position: "absolute",
          left: CENTER,
          top: 1010,
          transform: "translateX(-50%)",
          color: activeStep >= 2 ? theme.success : theme.warning,
          fontFamily: theme.mono,
          fontSize: 27,
          fontWeight: 800,
          opacity: noteP,
        }}
      >
        {step.note}
      </div>
      <div
        style={{
          position: "absolute",
          left: CENTER,
          top: 1060,
          transform: "translateX(-50%)",
          color: theme.danger,
          fontFamily: theme.mono,
          fontSize: 22,
          fontWeight: 800,
          opacity: enter * 0.8,
          textDecoration: "line-through",
          whiteSpace: "nowrap",
        }}
      >
        страницы не открываем
      </div>
      <Badge text="ПЕРЕСЕЧЕНИЕ → 19 · 31" top={1140} color={theme.success} opacity={done ? badgeP : 0.35} scale={done ? badgeP : 0.9} />
      {done ? <PulseRing x={CENTER} y={1140} triggerFrame={impactLocal} tone="success" size={320} /> : null}
    </>
  );
};

export const InvertedIndexVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: InvertedIndexPhase;
  source?: InvertedIndexSource;
}> = ({ local, fps, impactLocal, phase = "preindex", source = "web" }) => {
  if (phase === "lookup") return <LookupPhase local={local} fps={fps} impactLocal={impactLocal} />;
  if (phase === "intersect") return <IntersectPhase local={local} fps={fps} impactLocal={impactLocal} />;
  return <PreindexPhase local={local} fps={fps} impactLocal={impactLocal} source={source} />;
};

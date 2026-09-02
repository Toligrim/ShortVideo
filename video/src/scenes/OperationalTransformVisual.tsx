import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type OperationalTransformPhase =
  | "document"
  | "commands"
  | "revision"
  | "word"
  | "insert"
  | "shift"
  | "result";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: OperationalTransformPhase;
}

const W = layout.width;
const CX = W / 2;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.5,
};

const phaseTitle: Record<OperationalTransformPhase, string> = {
  document: "ОБЩИЙ ДОКУМЕНТ · ДВА КУРСОРА",
  commands: "СЕРВЕР ПРИНИМАЕТ ДВЕ КОМАНДЫ",
  revision: "КОМАНДЫ ПРИВЯЗАНЫ К ВЕРСИИ",
  word: "ПРИМЕР · СЛОВО «ДОМ»",
  insert: "ВСТАВКА · ПОЗИЦИЯ 0",
  shift: "ОПЕРАЦИОННОЕ ПРЕОБРАЗОВАНИЕ",
  result: "СХОДИМСЯ · ОДНА ВЕРСИЯ",
};

const phaseColor: Record<OperationalTransformPhase, string> = {
  document: theme.accent,
  commands: theme.warning,
  revision: theme.accent2,
  word: theme.accent,
  insert: theme.accent,
  shift: theme.warning,
  result: theme.success,
};

const phaseIcon: Record<OperationalTransformPhase, string> = {
  document: "users",
  commands: "server",
  revision: "git-branch",
  word: "file-text",
  insert: "circle-plus",
  shift: "move-right",
  result: "check-check",
};

const Header: React.FC<{ phase: OperationalTransformPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: CX,
      top: 238,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: phaseColor[phase],
      opacity,
      whiteSpace: "nowrap",
      fontSize: 23,
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
  color?: string;
  opacity: number;
  children: React.ReactNode;
}> = ({ left, top, width, height, color = theme.panelBorder, opacity, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      borderRadius: 26,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 42px ${color}20`,
      opacity,
    }}
  >
    {children}
  </div>
);

const Pill: React.FC<{
  text: string;
  x?: number;
  y: number;
  color: string;
  opacity: number;
  scale?: number;
}> = ({ text, x = CX, y, color, opacity, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: `translate(-50%, -50%) scale(${scale})`,
      padding: "14px 26px",
      borderRadius: 999,
      background: `${color}18`,
      border: `3px solid ${color}99`,
      color,
      opacity,
      whiteSpace: "nowrap",
      boxShadow: `0 0 34px ${color}2E`,
      fontSize: 24,
      ...mono,
    }}
  >
    {text}
  </div>
);

const CursorMarker: React.FC<{
  x: number;
  y: number;
  label: string;
  color: string;
  opacity: number;
}> = ({ x, y, label, color, opacity }) => (
  <div style={{ position: "absolute", left: x, top: y, opacity }}>
    <div
      style={{
        position: "absolute",
        left: -4,
        top: 0,
        width: 7,
        height: 112,
        borderRadius: 7,
        background: color,
        boxShadow: `0 0 24px ${color}`,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: -52,
        top: -52,
        padding: "7px 14px",
        borderRadius: 999,
        background: `${color}22`,
        border: `2px solid ${color}99`,
        color,
        fontSize: 17,
        whiteSpace: "nowrap",
        ...mono,
      }}
    >
      {label}
    </div>
  </div>
);

const OperationRow: React.FC<{
  y: number;
  icon: string;
  title: string;
  detail: string;
  color: string;
  opacity: number;
}> = ({ y, icon, title, detail, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: 38,
      right: 38,
      top: y,
      height: 116,
      borderRadius: 18,
      background: `${color}12`,
      border: `2px solid ${color}66`,
      display: "flex",
      alignItems: "center",
      padding: "0 24px",
      gap: 16,
      opacity,
    }}
  >
    <IconGlyph name={icon} size={34} color={color} strokeWidth={1.9} />
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ color, fontSize: 24, ...mono }}>{title}</div>
      <div style={{ color: theme.text, fontSize: 24 }}>{detail}</div>
    </div>
  </div>
);

const Letter: React.FC<{
  text: string;
  x: number;
  y: number;
  color?: string;
  opacity?: number;
  width?: number;
  height?: number;
  fontSize?: number;
}> = ({ text, x, y, color = theme.text, opacity = 1, width = 104, height = 112, fontSize = 60 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height,
      borderRadius: 16,
      background: `${color}12`,
      border: `3px solid ${color}88`,
      color,
      opacity,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize,
      fontWeight: 800,
    }}
  >
    {text}
  </div>
);

const DocumentPhase: React.FC<{ enter: number }> = ({ enter }) => (
  <>
    <Panel left={100} top={382} width={880} height={610} color={theme.accent} opacity={enter}>
      <div style={{ position: "absolute", left: 32, top: 26, display: "flex", alignItems: "center", gap: 12, color: theme.accent, fontSize: 24, ...mono }}>
        <IconGlyph name="file-text" size={32} color={theme.accent} strokeWidth={1.8} />
        ОБЩИЙ ДОКУМЕНТ
      </div>
      <div style={{ position: "absolute", left: 42, right: 42, top: 122, height: 2, background: `${theme.panelBorder}` }} />
      <div style={{ position: "absolute", left: 58, top: 184, color: theme.subtext, fontSize: 23, ...mono }}>ПИШЕМ ВМЕСТЕ · ОДНА КОПИЯ</div>
      <div style={{ position: "absolute", left: 58, top: 230, color: theme.text, fontSize: 48, fontWeight: 800 }}>Твой текст остаётся</div>
      <CursorMarker x={410} y={377} label="ТЫ" color={theme.accent} opacity={enter} />
      <CursorMarker x={704} y={377} label="ДРУГ" color={theme.accent2} opacity={enter} />
      <div style={{ position: "absolute", left: 58, top: 492, color: theme.subtext, fontSize: 23 }}>два курсора · один документ · правки идут одновременно</div>
    </Panel>
    <Pill text="ОДИН ДОКУМЕНТ · ДВА КУРСОРА" y={1190} color={theme.accent} opacity={enter} />
  </>
);

const CommandCard: React.FC<{
  x: number;
  title: string;
  operation: string;
  detail: string;
  color: string;
  enter: number;
}> = ({ x, title, operation, detail, color, enter }) => (
  <Panel left={x} top={410} width={270} height={250} color={color} opacity={enter}>
    <div style={{ position: "absolute", left: 0, right: 0, top: 28, textAlign: "center", color, fontSize: 24, ...mono }}>{title}</div>
    <div style={{ position: "absolute", left: 0, right: 0, top: 86, textAlign: "center", color: theme.text, fontSize: 25, fontWeight: 800 }}>{operation}</div>
    <div style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center", color: theme.subtext, fontSize: 21, ...mono }}>{detail}</div>
  </Panel>
);

const CommandsPhase: React.FC<{ local: number; impactLocal: number; enter: number }> = ({ local, impactLocal, enter }) => {
  const flow = smooth(local / Math.max(impactLocal, 1));
  const serverReveal = spring({ frame: Math.max(0, local - impactLocal), fps: 30, config: { damping: 12, mass: 0.7 } });
  return (
    <>
      <CommandCard x={52} title="ТЫ" operation="ВСТАВКА" detail="+ «мой »" color={theme.accent} enter={enter} />
      <CommandCard x={758} title="ДРУГ" operation="УДАЛЕНИЕ" detail="− первую букву" color={theme.accent2} enter={enter} />
      <div style={{ position: "absolute", left: 320, top: 529, width: 440, height: 3, background: `${theme.panelBorder}99`, opacity: enter }} />
      <div
        style={{
          position: "absolute",
          left: interpolate(flow, [0, 1], [370, 505]),
          top: 520,
          transform: "translate(-50%, -50%)",
          padding: "10px 18px",
          borderRadius: 999,
          background: theme.accent,
          color: "#06121A",
          fontSize: 18,
          ...mono,
          opacity: enter,
        }}
      >
        INSERT
      </div>
      <div
        style={{
          position: "absolute",
          left: interpolate(flow, [0, 1], [790, 575]),
          top: 640,
          transform: "translate(-50%, -50%)",
          padding: "10px 18px",
          borderRadius: 999,
          background: theme.accent2,
          color: "#100C1C",
          fontSize: 18,
          ...mono,
          opacity: enter,
        }}
      >
        DELETE
      </div>
      <Panel left={360} top={760} width={360} height={260} color={serverReveal > 0.3 ? theme.success : theme.warning} opacity={enter}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 28, textAlign: "center" }}>
          <IconGlyph name="server" size={58} color={serverReveal > 0.3 ? theme.success : theme.warning} strokeWidth={1.8} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 104, textAlign: "center", color: theme.text, fontSize: 28, fontWeight: 800 }}>СЕРВЕР</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 168, textAlign: "center", color: serverReveal > 0.3 ? theme.success : theme.warning, fontSize: 21, ...mono }}>ПРИНИМАЕТ КОМАНДЫ</div>
      </Panel>
      <Pill text="ВСТАВКА + УДАЛЕНИЕ → СЕРВЕР" y={1178} color={serverReveal > 0.3 ? theme.success : theme.warning} opacity={enter * Math.max(0.5, serverReveal)} scale={0.96 + 0.04 * serverReveal} />
      <PulseRing x={CX} y={890} triggerFrame={impactLocal} tone="success" size={210} />
    </>
  );
};

const RevisionPhase: React.FC<{ enter: number; impactLocal: number; local: number; fps: number }> = ({ enter, impactLocal, local, fps }) => {
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  return (
    <>
      <Panel left={100} top={390} width={880} height={680} color={theme.accent2} opacity={enter}>
        <div style={{ position: "absolute", left: 38, top: 28, color: theme.accent2, fontSize: 24, ...mono }}>ПУБЛИЧНЫЙ КОНТРАКТ · ЕДИНИЦА РАБОТЫ</div>
        <div style={{ position: "absolute", right: 34, top: 22, padding: "12px 18px", borderRadius: 12, background: `${theme.accent2}20`, border: `2px solid ${theme.accent2}99`, color: theme.accent2, fontSize: 23, ...mono }}>REV 41</div>
        <div style={{ position: "absolute", left: 38, right: 38, top: 100, height: 2, background: theme.panelBorder }} />
        <div style={{ position: "absolute", left: 38, top: 132, color: theme.subtext, fontSize: 22 }}>Не снимок документа, а команда с исходной точкой:</div>
        <OperationRow y={205} icon="circle-plus" title="ВСТАВКА" detail="фрагмент · позиция 0" color={theme.accent} opacity={enter} />
        <OperationRow y={345} icon="circle-minus" title="УДАЛЕНИЕ" detail="символы · позиция 0" color={theme.accent2} opacity={enter} />
        <div style={{ position: "absolute", left: 38, right: 38, bottom: 30, display: "flex", alignItems: "center", justifyContent: "center", gap: 14, color: theme.warning, fontSize: 22, ...mono, opacity: enter * (0.75 + 0.25 * reveal) }}>
          <IconGlyph name="clock-3" size={26} color={theme.warning} strokeWidth={1.8} />
          targetRevisionId = 41
        </div>
      </Panel>
      <Pill text="СЕРВЕР ЗНАЕТ ИСХОДНУЮ ТОЧКУ" y={1190} color={theme.accent2} opacity={enter * Math.max(0.55, reveal)} />
      <PulseRing x={CX} y={730} triggerFrame={impactLocal} tone="accent2" size={250} />
    </>
  );
};

const WordPhase: React.FC<{ enter: number }> = ({ enter }) => (
  <>
    <Panel left={108} top={418} width={864} height={550} color={theme.accent} opacity={enter}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 28, textAlign: "center", color: theme.subtext, fontSize: 24, ...mono }}>ИСХОДНЫЙ ТЕКСТ · REV 41</div>
      <Letter text="д" x={340} y={246} color={theme.accent} opacity={enter} />
      <Letter text="о" x={488} y={246} color={theme.text} opacity={enter} />
      <Letter text="м" x={636} y={246} color={theme.text} opacity={enter} />
      <div style={{ position: "absolute", left: 340, top: 382, width: 400, display: "flex", justifyContent: "space-between", color: theme.subtext, fontSize: 20, ...mono }}>
        <span style={{ width: 104, textAlign: "center" }}>0</span><span style={{ width: 104, textAlign: "center" }}>1</span><span style={{ width: 104, textAlign: "center" }}>2</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 454, textAlign: "center", color: theme.accent, fontSize: 24, ...mono }}>ПОЗИЦИЯ 0 = ИСХОДНАЯ «Д»</div>
    </Panel>
    <Pill text="СЕРВЕР ПОМНИТ: ГДЕ НАЧАЛАСЬ КОМАНДА" y={1190} color={theme.accent} opacity={enter} />
  </>
);

const InsertPhase: React.FC<{ enter: number; impactLocal: number; local: number; fps: number }> = ({ enter, impactLocal, local, fps }) => {
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const insertX = interpolate(reveal, [0, 1], [230, 276]);
  return (
    <>
      <Panel left={90} top={405} width={900} height={590} color={theme.accent} opacity={enter}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 30, textAlign: "center", color: theme.accent, fontSize: 25, ...mono }}>КОМАНДА · INSERT TEXT</div>
        <div style={{ position: "absolute", left: 52, top: 132, color: theme.subtext, fontSize: 22, ...mono }}>ПОЗИЦИЯ 0 · ПЕРЕД «ДОМ»</div>
        <div style={{ position: "absolute", left: insertX, top: 260, transform: "translate(-50%, -50%)", padding: "18px 24px", borderRadius: 16, background: `${theme.accent}24`, border: `3px solid ${theme.accent}`, color: theme.accent, fontSize: 38, fontWeight: 800, opacity: enter * (0.7 + 0.3 * reveal) }}>
          мой␠
        </div>
        <div style={{ position: "absolute", left: 424, top: 260, transform: "translateY(-50%)", color: theme.text, fontSize: 58, fontWeight: 800 }}>дом</div>
        <div style={{ position: "absolute", left: 56, right: 56, top: 350, height: 2, background: theme.panelBorder }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 402, textAlign: "center", color: theme.text, fontSize: 36, fontWeight: 800 }}>мой дом</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 480, textAlign: "center", color: theme.success, fontSize: 23, ...mono, opacity: enter * (0.6 + 0.4 * reveal) }}>ВСТАВКА ПРИНЯТА · + ЧЕТЫРЕ СИМВОЛА</div>
      </Panel>
      <Pill text="ВСТАВКА ДОБАВИЛА «МОЙ » ПЕРЕД СЛОВОМ" y={1190} color={theme.accent} opacity={enter * Math.max(0.55, reveal)} />
      <PulseRing x={insertX} y={665} triggerFrame={impactLocal} tone="accent" size={190} />
    </>
  );
};

const ShiftPhase: React.FC<{ enter: number; impactLocal: number; local: number; fps: number }> = ({ enter, impactLocal, local, fps }) => {
  const shift = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const wordLeft = 430;
  const cell = 76;
  const targetX = wordLeft + cell * 4 + cell / 2;
  const oldX = wordLeft + cell / 2;
  const markerX = interpolate(shift, [0, 1], [oldX, targetX]);
  const arrowWidth = Math.max(0, targetX - oldX - 20) * shift;
  return (
    <>
      <Panel left={54} top={450} width={286} height={332} color={theme.warning} opacity={enter}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 32, textAlign: "center", color: theme.warning, fontSize: 22, ...mono }}>СЕРВЕР</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 102, textAlign: "center" }}><IconGlyph name="server" size={62} color={theme.warning} strokeWidth={1.8} /></div>
        <div style={{ position: "absolute", left: 20, right: 20, top: 204, textAlign: "center", color: theme.success, fontSize: 21, ...mono }}>ВСТАВКА ПРИНЯТА</div>
        <div style={{ position: "absolute", left: 20, right: 20, top: 254, textAlign: "center", color: theme.subtext, fontSize: 19 }}>поздняя команда ждёт</div>
      </Panel>
      <Panel left={370} top={420} width={650} height={520} color={theme.accent2} opacity={enter}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 30, textAlign: "center", color: theme.subtext, fontSize: 22, ...mono }}>ПОСЛЕ ВСТАВКИ · «МОЙ ДОМ»</div>
        {Array.from({ length: 7 }).map((_, i) => (
          <Letter key={i} text={["м", "о", "й", " ", "д", "о", "м"][i]} x={wordLeft - 370 + i * cell} y={172} width={cell - 8} height={96} fontSize={45} color={i === 4 ? theme.success : i === 0 ? theme.warning : theme.text} opacity={enter} />
        ))}
        <div style={{ position: "absolute", left: oldX - 370, top: 296, transform: "translateX(-50%)", color: theme.danger, fontSize: 21, ...mono, opacity: enter }}>0</div>
        <div style={{ position: "absolute", left: targetX - 370, top: 296, transform: "translateX(-50%)", color: theme.success, fontSize: 21, ...mono }}>4</div>
        <div style={{ position: "absolute", left: oldX - 370 + 10, top: 345, width: arrowWidth, height: 5, borderRadius: 5, background: theme.warning, opacity: enter * shift }} />
        <div style={{ position: "absolute", left: markerX - 370, top: 325, transform: "translateX(-50%)", width: 8, height: 70, borderRadius: 8, background: shift > 0.5 ? theme.success : theme.danger, boxShadow: `0 0 22px ${shift > 0.5 ? theme.success : theme.danger}`, opacity: enter }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 408, textAlign: "center", color: theme.success, fontSize: 24, ...mono, opacity: enter * (0.65 + 0.35 * shift) }}>СДВИГ К ИСХОДНОЙ «Д»</div>
      </Panel>
      <Pill text="ПОЗИЦИЯ УДАЛЕНИЯ: 0 → 4 · ВПРАВО" y={1190} color={theme.success} opacity={enter * Math.max(0.55, shift)} scale={0.96 + 0.04 * shift} />
      <PulseRing x={targetX} y={670} triggerFrame={impactLocal} tone="success" size={220} />
    </>
  );
};

const ResultPhase: React.FC<{ enter: number; impactLocal: number; local: number; fps: number }> = ({ enter, impactLocal, local, fps }) => {
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  return (
    <>
      <Panel left={100} top={410} width={880} height={490} color={theme.success} opacity={enter}>
        <div style={{ position: "absolute", left: 34, top: 28, color: theme.success, fontSize: 23, ...mono }}>СОГЛАСОВАННЫЙ ДОКУМЕНТ</div>
        <div style={{ position: "absolute", right: 34, top: 24, color: theme.success, fontSize: 22, ...mono }}>REV 42</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 178, textAlign: "center", color: theme.text, fontSize: 76, fontWeight: 800, opacity: enter * (0.7 + 0.3 * reveal) }}>мой ом</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 330, textAlign: "center", color: theme.subtext, fontSize: 22 }}>вставка сохранилась · исходная «д» удалена</div>
      </Panel>
      <div style={{ position: "absolute", left: 235, top: 1000, display: "flex", alignItems: "center", gap: 14, color: theme.accent, fontSize: 21, ...mono, opacity: enter }}>
        <IconGlyph name="users" size={30} color={theme.accent} strokeWidth={1.8} />
        ТЫ: мой ом
      </div>
      <div style={{ position: "absolute", left: 645, top: 1000, display: "flex", alignItems: "center", gap: 14, color: theme.accent2, fontSize: 21, ...mono, opacity: enter }}>
        <IconGlyph name="users" size={30} color={theme.accent2} strokeWidth={1.8} />
        ДРУГ: мой ом
      </div>
      <Pill text="ВСЕ ПОЛУЧИЛИ ОДНУ ВЕРСИЮ" y={1192} color={theme.success} opacity={enter * Math.max(0.55, reveal)} />
      <PulseRing x={CX} y={655} triggerFrame={impactLocal} tone="success" size={250} />
    </>
  );
};

/** Буквальный визуал OT: две правки, версия документа и сдвиг позиции поздней команды. */
export const OperationalTransformVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "document" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Header phase={phase} opacity={enter} />
      {phase === "document" ? <DocumentPhase enter={enter} /> : null}
      {phase === "commands" ? <CommandsPhase local={local} impactLocal={impactLocal} enter={enter} /> : null}
      {phase === "revision" ? <RevisionPhase enter={enter} impactLocal={impactLocal} local={local} fps={fps} /> : null}
      {phase === "word" ? <WordPhase enter={enter} /> : null}
      {phase === "insert" ? <InsertPhase enter={enter} impactLocal={impactLocal} local={local} fps={fps} /> : null}
      {phase === "shift" ? <ShiftPhase enter={enter} impactLocal={impactLocal} local={local} fps={fps} /> : null}
      {phase === "result" ? <ResultPhase enter={enter} impactLocal={impactLocal} local={local} fps={fps} /> : null}
    </div>
  );
};

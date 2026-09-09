import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type PhotoAccessBoundaryPhase = "symptom" | "sandbox" | "mediator" | "picker" | "grant" | "neighbor";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: PhotoAccessBoundaryPhase;
}

const W = layout.width;
const H = layout.height;
const CX = W / 2;
const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1.2,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const phaseTitle: Record<PhotoAccessBoundaryPhase, string> = {
  symptom: "ФОТОРЕДАКТОР · ДОСТУП НУЖЕН",
  sandbox: "ANDROID SANDBOX · СВОЯ КОМНАТА",
  mediator: "МЕДИАТЕКА · СИСТЕМНЫЙ ПОСРЕДНИК",
  picker: "СИСТЕМНЫЙ ВЫБОРЩИК · 1 ФОТО",
  grant: "URI GRANT · ОДИН АДРЕС",
  neighbor: "URI GRANT · СОСЕДНИЙ ЗАКРЫТ",
};

const phaseIcon: Record<PhotoAccessBoundaryPhase, string> = {
  symptom: "image",
  sandbox: "lock",
  mediator: "shield",
  picker: "images",
  grant: "key-round",
  neighbor: "file-x",
};

const phaseColor: Record<PhotoAccessBoundaryPhase, string> = {
  symptom: theme.warning,
  sandbox: theme.accent2,
  mediator: theme.danger,
  picker: theme.accent,
  grant: theme.success,
  neighbor: theme.danger,
};

const Header: React.FC<{ phase: PhotoAccessBoundaryPhase; enter: number }> = ({ phase, enter }) => {
  const color = phaseColor[phase];
  return (
    <div
      style={{
        position: "absolute",
        left: CX,
        top: 232,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        color,
        fontSize: 23,
        whiteSpace: "nowrap",
        opacity: enter,
        ...mono,
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
  children?: React.ReactNode;
}> = ({ x, y, width, height, color, title, icon, enter, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 26,
      background: `${theme.panel}EC`,
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
        left: 22,
        right: 22,
        top: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        color,
        fontSize: 20,
        whiteSpace: "nowrap",
        ...mono,
      }}
    >
      <IconGlyph name={icon} size={29} color={color} strokeWidth={1.8} />
      <span>{title}</span>
    </div>
    {children}
  </div>
);

const BottomBadge: React.FC<{ text: string; color: string; enter: number }> = ({ text, color, enter }) => (
  <div
    style={{
      position: "absolute",
      left: 70,
      top: 1190,
      width: 940,
      minHeight: 76,
      boxSizing: "border-box",
      padding: "16px 26px",
      borderRadius: 999,
      background: `${color}16`,
      border: `3px solid ${color}99`,
      color,
      textAlign: "center",
      fontSize: 22,
      whiteSpace: "nowrap",
      opacity: enter,
      boxShadow: `0 0 34px ${color}24`,
      ...mono,
    }}
  >
    {text}
  </div>
);

const ArrowLine: React.FC<{
  x1: number;
  x2: number;
  y: number;
  color: string;
  opacity: number;
  dashed?: boolean;
}> = ({ x1, x2, y, color, opacity, dashed = true }) => (
  <svg
    width={W}
    height={H}
    viewBox={`0 0 ${W} ${H}`}
    style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity }}
  >
    <line
      x1={x1}
      y1={y}
      x2={x2 - 18}
      y2={y}
      stroke={color}
      strokeWidth={4}
      strokeDasharray={dashed ? "12 10" : undefined}
    />
    <path
      d={`M ${x2 - 26} ${y - 13} L ${x2} ${y} L ${x2 - 26} ${y + 13}`}
      fill="none"
      stroke={color}
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PhotoThumb: React.FC<{
  x: number;
  y: number;
  index: number;
  selected?: boolean;
  opacity?: number;
}> = ({ x, y, index, selected = false, opacity = 1 }) => {
  const backgrounds = [
    "linear-gradient(145deg, #174A5C 0 43%, #FBBF24 44% 57%, #244D3B 58%)",
    "linear-gradient(145deg, #2E235D 0 45%, #F87171 46% 63%, #1A253A 64%)",
    "linear-gradient(145deg, #123A49 0 44%, #34D399 45% 60%, #162238 61%)",
    "linear-gradient(145deg, #452B3E 0 42%, #A78BFA 43% 61%, #18293E 62%)",
    "linear-gradient(145deg, #1C3F58 0 47%, #FBBF24 48% 58%, #5C3E29 59%)",
    "linear-gradient(145deg, #253951 0 42%, #22D3EE 43% 55%, #3C315E 56%)",
  ];
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 140,
        height: 112,
        borderRadius: 16,
        boxSizing: "border-box",
        background: backgrounds[index % backgrounds.length],
        border: `4px solid ${selected ? theme.success : theme.panelBorder}`,
        boxShadow: selected ? `0 0 26px ${theme.success}88` : `0 0 16px #00000055`,
        opacity,
        transform: `scale(${selected ? 1.05 : 1})`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 11,
          bottom: 9,
          padding: "4px 8px",
          borderRadius: 8,
          background: "#071019CC",
          color: theme.text,
          fontSize: 14,
          ...mono,
        }}
      >
        #{String(index + 1).padStart(2, "0")}
      </div>
      {selected ? (
        <div style={{ position: "absolute", right: 9, top: 8 }}>
          <IconGlyph name="check" size={24} color={theme.success} strokeWidth={2.4} />
        </div>
      ) : null}
    </div>
  );
};

const FolderTile: React.FC<{ x: number; y: number; label: string; opacity: number }> = ({ x, y, label, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: 248,
      height: 94,
      borderRadius: 16,
      boxSizing: "border-box",
      border: `2px solid ${theme.danger}66`,
      background: `${theme.danger}10`,
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "0 17px",
      opacity,
    }}
  >
    <IconGlyph name="folder" size={35} color={theme.danger} strokeWidth={1.8} />
    <span style={{ color: theme.text, fontSize: 20, ...mono }}>{label}</span>
    <IconGlyph name="lock" size={23} color={theme.danger} strokeWidth={1.8} />
  </div>
);

/** Буквальный путь Android-фото: пустое приложение → sandbox → посредник → picker → URI grant. */
export const PhotoAccessBoundaryVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "symptom",
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const impact = local >= impactLocal;
  const reveal = impact ? spring({ frame: local - impactLocal, fps, config: { damping: 12, mass: 0.7 } }) : 0;
  const header = <Header phase={phase} enter={enter} />;

  if (phase === "symptom") {
    const tap = smooth(clamp01((local - impactLocal + 5) / 20));
    return (
      <>
        {header}
        <Panel x={110} y={370} width={860} height={720} color={theme.warning} title="ФОТОРЕДАКТОР" icon="smartphone" enter={enter}>
          <div style={{ position: "absolute", left: 62, top: 112, color: theme.subtext, fontSize: 18, ...mono }}>НОВЫЙ ПРОЕКТ</div>
          <div
            style={{
              position: "absolute",
              left: 62,
              top: 165,
              width: 736,
              height: 92,
              borderRadius: 18,
              boxSizing: "border-box",
              border: `3px solid ${theme.warning}`,
              background: `${theme.warning}18`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              color: theme.warning,
              fontSize: 24,
              transform: `scale(${1 + tap * 0.025})`,
              ...mono,
            }}
          >
            <IconGlyph name="plus" size={29} color={theme.warning} strokeWidth={2} />
            <span>ДОБАВИТЬ ФОТО</span>
          </div>
          <div
            style={{
              position: "absolute",
              left: 62,
              top: 300,
              width: 736,
              height: 224,
              borderRadius: 20,
              boxSizing: "border-box",
              border: `3px dashed ${theme.danger}88`,
              background: `${theme.danger}0A`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              opacity: 0.45 + reveal * 0.55,
            }}
          >
            <IconGlyph name="image-off" size={48} color={theme.danger} strokeWidth={1.8} />
            <span style={{ color: theme.danger, fontSize: 30, ...mono }}>ПУСТО</span>
          </div>
          <div style={{ position: "absolute", left: 62, top: 585, color: theme.subtext, fontSize: 18, ...mono }}>
            МЕДИАТЕКА · ЗАКРЫТА
          </div>
        </Panel>
        <BottomBadge text={impact ? "ДОБАВИТЬ ФОТО · ДОСТУП НУЖЕН" : "ФОТО НЕ ВЫБРАНО"} color={impact ? theme.danger : theme.warning} enter={enter} />
        <PulseRing x={CX} y={580} triggerFrame={impactLocal} tone="warning" size={180} />
      </>
    );
  }

  if (phase === "sandbox") {
    const blocked = impact ? reveal : 0;
    return (
      <>
        {header}
        <Panel x={74} y={385} width={390} height={655} color={theme.accent2} title="ПРОЦЕСС" icon="smartphone" enter={enter}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 122, textAlign: "center", color: theme.text, fontSize: 30, ...mono }}>
            СВОЯ КОМНАТА
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 190, textAlign: "center", color: theme.accent2, fontSize: 18, ...mono }}>
            СВОЙ UID
          </div>
          <div
            style={{
              position: "absolute",
              left: 74,
              top: 270,
              width: 242,
              height: 96,
              borderRadius: 18,
              border: `2px solid ${theme.accent2}99`,
              background: `${theme.accent2}16`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              color: theme.accent2,
              fontSize: 19,
              ...mono,
            }}
          >
            <IconGlyph name="key-round" size={28} color={theme.accent2} strokeWidth={1.8} />
            СВОЙ КЛЮЧ
          </div>
          <div style={{ position: "absolute", left: 174, top: 415 }}>
            <IconGlyph name="lock" size={42} color={theme.accent2} strokeWidth={1.8} />
          </div>
        </Panel>
        <Panel x={616} y={385} width={390} height={655} color={theme.danger} title="ЧУЖИЕ ФАЙЛЫ" icon="folder" enter={enter}>
          <FolderTile x={70} y={135} label="ФОТО" opacity={enter * (0.65 + blocked * 0.35)} />
          <FolderTile x={70} y={255} label="МУЗЫКА" opacity={enter * (0.65 + blocked * 0.35)} />
          <FolderTile x={70} y={375} label="ДРУГОЕ" opacity={enter * (0.65 + blocked * 0.35)} />
        </Panel>
        <ArrowLine x1={466} x2={616} y={700} color={blocked > 0.4 ? theme.danger : theme.panelBorder} opacity={enter} />
        <div
          style={{
            position: "absolute",
            left: CX,
            top: 700,
            transform: `translate(-50%, -50%) scale(${0.75 + blocked * 0.25})`,
            width: 62,
            height: 62,
            borderRadius: "50%",
            background: `${theme.danger}20`,
            border: `3px solid ${theme.danger}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: enter * blocked,
          }}
        >
          <IconGlyph name="x" size={34} color={theme.danger} strokeWidth={2.5} />
        </div>
        <BottomBadge text="СВОЯ КОМНАТА · ЧУЖОЕ ЗАКРЫТО" color={theme.accent2} enter={enter} />
        <PulseRing x={CX} y={700} triggerFrame={impactLocal} tone="danger" size={170} />
      </>
    );
  }

  if (phase === "mediator") {
    const denial = impact ? reveal : 0;
    return (
      <>
        {header}
        <Panel x={54} y={455} width={286} height={380} color={theme.accent} title="ПРОЦЕСС" icon="cpu" enter={enter}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 135, textAlign: "center", color: theme.text, fontSize: 28, ...mono }}>
            READ?
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 205, textAlign: "center", color: theme.subtext, fontSize: 17, ...mono }}>
            СИСТЕМА РЕШИТ
          </div>
        </Panel>
        <Panel x={397} y={405} width={286} height={480} color={theme.warning} title="ПОСРЕДНИК" icon="shield" enter={enter}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 135, textAlign: "center", color: theme.text, fontSize: 25, ...mono }}>
            СИСТЕМНЫЙ
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 180, textAlign: "center", color: theme.warning, fontSize: 25, ...mono }}>
            ФИЛЬТР
          </div>
          <div style={{ position: "absolute", left: 36, right: 36, top: 275, height: 2, background: `${theme.warning}66` }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 305, textAlign: "center", color: denial > 0.4 ? theme.danger : theme.subtext, fontSize: 19, ...mono }}>
            {denial > 0.4 ? "НЕТ ПРАВА" : "ПРОВЕРКА"}
          </div>
        </Panel>
        <Panel x={740} y={455} width={286} height={380} color={theme.accent2} title="МЕДИАТЕКА" icon="database" enter={enter}>
          <div
            style={{
              position: "absolute",
              left: 34,
              top: 130,
              width: 218,
              height: 58,
              borderRadius: 13,
              border: `2px solid ${theme.danger}66`,
              color: theme.danger,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: denial > 0.45 ? "line-through" : "none",
              opacity: enter * (0.65 + denial * 0.35),
              ...mono,
            }}
          >
            СПИСОК
          </div>
          <div
            style={{
              position: "absolute",
              left: 34,
              top: 215,
              width: 218,
              height: 58,
              borderRadius: 13,
              border: `2px solid ${theme.danger}66`,
              color: theme.danger,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: denial > 0.45 ? "line-through" : "none",
              opacity: enter * (0.65 + denial * 0.35),
              ...mono,
            }}
          >
            БАЙТЫ
          </div>
        </Panel>
        <ArrowLine x1={340} x2={397} y={645} color={denial > 0.4 ? theme.danger : theme.panelBorder} opacity={enter} />
        <ArrowLine x1={683} x2={740} y={645} color={denial > 0.4 ? theme.danger : theme.panelBorder} opacity={enter} />
        <BottomBadge text="БЕЗ ПРАВА · ПУТЬ ЗАКРЫТ" color={theme.danger} enter={enter} />
        <PulseRing x={CX} y={645} triggerFrame={impactLocal} tone="danger" size={190} />
      </>
    );
  }

  if (phase === "picker") {
    const selected = impact ? reveal : 0;
    const chooseP = smooth(clamp01((local - impactLocal - 2) / 18));
    return (
      <>
        {header}
        <Panel x={76} y={350} width={928} height={770} color={theme.accent} title="ANDROID · ВЫБРАТЬ ФОТО" icon="images" enter={enter}>
          <div style={{ position: "absolute", left: 54, top: 104, color: theme.subtext, fontSize: 18, ...mono }}>СИСТЕМНЫЙ ЭКРАН</div>
          <div style={{ position: "absolute", right: 54, top: 104, color: theme.subtext, fontSize: 18, ...mono }}>ОТМЕНА</div>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <PhotoThumb
              key={index}
              x={116 + (index % 3) * 235}
              y={166 + Math.floor(index / 3) * 150}
              index={index}
              selected={index === 2 && selected > 0.42}
              opacity={enter * (0.65 + chooseP * 0.35)}
            />
          ))}
          <div
            style={{
              position: "absolute",
              left: 54,
              right: 54,
              top: 500,
              height: 86,
              borderRadius: 17,
              boxSizing: "border-box",
              border: `2px solid ${theme.accent}77`,
              background: `${theme.accent}12`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: selected > 0.42 ? theme.success : theme.accent,
              fontSize: 22,
              opacity: enter,
              ...mono,
            }}
          >
            {selected > 0.42 ? "ВЫБРАНО · 1 ФОТО" : "ОТМЕТЬ ОДИН ОБЪЕКТ"}
          </div>
        </Panel>
        <BottomBadge text="СИСТЕМА ПОКАЗЫВАЕТ · ПОЛЬЗОВАТЕЛЬ ВЫБИРАЕТ" color={theme.accent} enter={enter} />
        <PulseRing x={76 + 116 + 235 * 2 + 70} y={350 + 166 + 112 / 2} triggerFrame={impactLocal} tone="success" size={150} />
      </>
    );
  }

  if (phase === "neighbor") {
    const reject = smooth(clamp01((local - impactLocal + 4) / 22));
    return (
      <>
        {header}
        <Panel x={70} y={420} width={350} height={510} color={theme.warning} title="ДВА АДРЕСА" icon="images" enter={enter}>
          <div style={{ position: "absolute", left: 28, right: 28, top: 118, height: 122, borderRadius: 16, border: `3px solid ${theme.success}99`, background: `${theme.success}13`, padding: "20px 18px", boxSizing: "border-box", ...mono }}>
            <div style={{ color: theme.success, fontSize: 18 }}>✓ ВЫБРАНО</div>
            <div style={{ color: theme.text, fontSize: 17, marginTop: 13, whiteSpace: "nowrap" }}>.../images/42</div>
          </div>
          <div style={{ position: "absolute", left: 28, right: 28, top: 278, height: 122, borderRadius: 16, border: `3px solid ${theme.danger}99`, background: `${theme.danger}13`, padding: "20px 18px", boxSizing: "border-box", opacity: 0.65 + reject * 0.35, ...mono }}>
            <div style={{ color: theme.danger, fontSize: 18 }}>✕ СОСЕДНИЙ</div>
            <div style={{ color: theme.text, fontSize: 17, marginTop: 13, whiteSpace: "nowrap" }}>.../images/43</div>
          </div>
        </Panel>
        <Panel x={700} y={495} width={310} height={360} color={theme.success} title="ПРОЦЕСС" icon="cpu" enter={enter}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 125, textAlign: "center", color: theme.text, fontSize: 25, ...mono }}>
            ЧИТАЕТ /42
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 198, textAlign: "center", color: theme.success, fontSize: 18, ...mono }}>
            /43 · НЕТ ГРАНТА
          </div>
        </Panel>
        <ArrowLine x1={420} x2={700} y={580} color={theme.success} opacity={enter} dashed={false} />
        <ArrowLine x1={420} x2={700} y={740} color={theme.danger} opacity={enter * (0.25 + reject * 0.75)} />
        <div style={{ position: "absolute", left: CX, top: 740, transform: `translate(-50%, -50%) scale(${0.72 + reject * 0.28})`, width: 58, height: 58, borderRadius: "50%", background: `${theme.danger}20`, border: `3px solid ${theme.danger}`, display: "flex", alignItems: "center", justifyContent: "center", opacity: enter * reject }}>
          <IconGlyph name="x" size={31} color={theme.danger} strokeWidth={2.5} />
        </div>
        <BottomBadge text="42 ✓ · 43 ✕ · ГРАНТ АДРЕСНЫЙ" color={theme.danger} enter={enter} />
        <PulseRing x={CX} y={740} triggerFrame={impactLocal} tone="danger" size={170} />
      </>
    );
  }

  const grantP = smooth(clamp01((local - impactLocal + 5) / 22));
  const ticketX = interpolate(grantP, [0, 1], [382, 438]);
  return (
    <>
      {header}
      <Panel x={54} y={440} width={294} height={380} color={theme.accent} title="ВЫБРАННЫЙ ФАЙЛ" icon="image" enter={enter}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 132, textAlign: "center", color: theme.text, fontSize: 29, ...mono }}>
          PHOTO #42
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 205, textAlign: "center", color: theme.success, fontSize: 18, ...mono }}>
          ВЫБРАН
        </div>
      </Panel>
      <div
        style={{
          position: "absolute",
          left: ticketX,
          top: 440,
          width: 294,
          height: 380,
          boxSizing: "border-box",
          borderRadius: 26,
          background: `${theme.panel}F2`,
          border: `3px solid ${theme.success}AA`,
          boxShadow: `0 0 42px ${theme.success}2A`,
          opacity: enter * (0.55 + grantP * 0.45),
          transform: `scale(${0.94 + grantP * 0.06})`,
        }}
      >
        <div style={{ position: "absolute", left: 0, right: 0, top: 30, textAlign: "center", color: theme.success, fontSize: 21, ...mono }}>
          URI GRANT
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 94, textAlign: "center" }}>
          <IconGlyph name="lock-keyhole" size={51} color={theme.success} strokeWidth={1.8} />
        </div>
        <div style={{ position: "absolute", left: 22, right: 22, top: 180, textAlign: "center", color: theme.text, fontSize: 17, whiteSpace: "nowrap", ...mono }}>
          content://media/images/42
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 250, textAlign: "center", color: theme.success, fontSize: 21, ...mono }}>
          READ · OK
        </div>
      </div>
      <Panel x={732} y={440} width={294} height={380} color={theme.success} title="ПРОЦЕСС" icon="cpu" enter={enter}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 136, textAlign: "center", color: theme.text, fontSize: 26, ...mono }}>
          ЧИТАЕТ ПО URI
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 210, textAlign: "center", color: theme.success, fontSize: 18, ...mono }}>
          CONTENT RESOLVER
        </div>
      </Panel>
      <ArrowLine x1={348} x2={732} y={632} color={theme.success} opacity={enter * (0.35 + grantP * 0.65)} dashed={false} />
      <BottomBadge text="ОДИН АДРЕС · ЧТЕНИЕ РАЗРЕШЕНО" color={theme.success} enter={enter} />
      <PulseRing x={CX} y={632} triggerFrame={impactLocal} tone="success" size={210} />
    </>
  );
};

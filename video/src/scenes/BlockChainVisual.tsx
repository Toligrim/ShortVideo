import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type BlockChainPhase = "link" | "tamper" | "confirm";

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };
const BW = 720;
const BH = 150;
const CONFIRM_BH = 110;

const phaseTitle: Record<BlockChainPhase, string> = {
  link: "БЛОКЧЕЙН · ОДНА ТЕТРАДЬ НА ВЕСЬ МИР",
  tamper: "ПРАВКА СТАРОЙ ЗАПИСИ → ХЭШ МЕНЯЕТСЯ",
  confirm: "ПОДТВЕРЖДЕНИЯ · ЧЕМ ГЛУБЖЕ, ТЕМ НАМЁРТВО",
};

const HEX = ["00af3c", "7b21de", "c4f09a", "3e88b1", "a17d05", "5c2f9e", "d6e411"];

const Header: React.FC<{ title: string; enter: number; icon: string }> = ({ title, enter, icon }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 330,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: theme.subtext,
      fontSize: 25,
      whiteSpace: "nowrap",
      opacity: enter,
      ...mono,
    }}
  >
    <IconGlyph name={icon} size={30} color={theme.accent} strokeWidth={1.8} />
    <span>{title}</span>
  </div>
);

interface CardProps {
  y: number;
  idx: number;
  to: string;
  prev: string;
  color: string;
  enter: number;
  locked?: boolean;
  danger?: boolean;
  broken?: boolean;
  changed?: boolean;
  showPrev?: boolean;
  compact?: boolean;
}

const BlockCard: React.FC<CardProps> = ({ y, idx, to, prev, color, enter, locked, danger, broken, changed, showPrev = true, compact = false }) => (
  <>
    <div
      style={{
        position: "absolute",
        left: (W - BW) / 2,
        top: y,
        width: BW,
        height: compact ? CONFIRM_BH : BH,
        borderRadius: compact ? 16 : 22,
        background: `${theme.panel}E8`,
        border: `3px solid ${danger ? theme.danger : color}${broken ? "44" : "99"}`,
        boxShadow: `0 0 42px ${danger ? theme.danger : color}${broken ? "10" : "22"}`,
        opacity: broken ? enter * 0.4 : enter,
        transform: `translateY(${(1 - enter) * 30}px) scale(${0.82 + enter * 0.18})`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: compact ? 4 : 10,
        padding: compact ? "0 22px" : "0 26px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 12 }}>
        <div
          style={{
            ...mono,
            fontSize: compact ? 20 : 22,
            color: danger ? theme.danger : color,
            background: `${danger ? theme.danger : color}1A`,
            borderRadius: 10,
            padding: compact ? "1px 10px" : "2px 12px",
          }}
        >
          #{idx}
        </div>
        <div style={{ ...mono, fontSize: compact ? 21 : 24, color: theme.text }}>БЛОК</div>
        {locked ? <div style={{ marginLeft: "auto" }}><IconGlyph name="lock" size={compact ? 24 : 26} color={theme.success} strokeWidth={2} /></div> : null}
        {broken ? <div style={{ marginLeft: "auto" }}><IconGlyph name="link-2-off" size={compact ? 24 : 26} color={theme.danger} strokeWidth={2} /></div> : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 10, color: theme.text, fontSize: compact ? 22 : 28, fontWeight: 800 }}>
        <IconGlyph name="bitcoin" size={compact ? 22 : 26} color={theme.warning} strokeWidth={2} />
        <span>tx&nbsp; A → {to}&nbsp; 0.5 ₿</span>
      </div>
      {showPrev ? (
        <div style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 10, color: danger ? theme.danger : theme.subtext, fontSize: compact ? 18 : 22, ...mono }}>
          <IconGlyph name="arrow-up" size={compact ? 18 : 20} color={danger ? theme.danger : color} strokeWidth={2.4} />
          <span>prev&nbsp; {prev}</span>
        </div>
      ) : null}
    </div>
    {changed ? (
      <div
        style={{
          position: "absolute",
          left: (W - BW) / 2,
          top: y + BH / 2 - 18,
          width: BW,
          textAlign: "center",
          ...mono,
          fontSize: 26,
          color: theme.danger,
          textShadow: `0 0 18px ${theme.danger}88`,
        }}
      >
        ЗАПИСЬ ИЗМЕНЕНА
      </div>
    ) : null}
  </>
);

export const BlockChainVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: BlockChainPhase;
  tamperIndex?: number;
  confirms?: number;
}> = ({ local, fps, impactLocal, phase = "link", tamperIndex = 2, confirms = 6 }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });

  if (phase === "link") {
    const ys = [360, 560, 760, 960];
    return (
      <>
        <Header title={phaseTitle.link} enter={enter} icon="layers" />
        {ys.map((y, i) => (
          <BlockCard
            key={i}
            y={y}
            idx={i + 1}
            to={i === 0 ? "B" : "B"}
            prev={`${HEX[i]}…${HEX[(i + 3) % HEX.length]}`}
            color={theme.accent}
            enter={spring({ frame: Math.max(0, local - i * 6), fps, config: { damping: 14, mass: 0.75 } })}
            locked
          />
        ))}
        {/* публичность: тысячи узлов держат копию */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1150,
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: theme.subtext,
            ...mono,
            fontSize: 24,
            opacity: enter,
          }}
        >
          <IconGlyph name="users" size={30} color={theme.accent2} strokeWidth={1.8} />
          <span>ВИДЯТ ВСЕ · ПОДТВЕРДИЛИ ТЫСЯЧИ</span>
        </div>
        <PulseRing x={W / 2} y={1035} triggerFrame={impactLocal} tone="accent" size={200} />
      </>
    );
  }

  if (phase === "tamper") {
    const ys = [360, 560, 760, 960];
    const broken = reveal;
    return (
      <>
        <Header title={phaseTitle.tamper} enter={enter} icon="shield-alert" />
        {ys.map((y, i) => {
          const isTampered = i === tamperIndex;
          const isAbove = i > tamperIndex;
          const tEnter = spring({ frame: Math.max(0, local - i * 6), fps, config: { damping: 14, mass: 0.75 } });
          return (
            <BlockCard
              key={i}
              y={y}
              idx={i + 1}
              to={isTampered ? "C" : "B"}
              prev={isTampered ? `${HEX[(i + 5) % HEX.length]}…${HEX[(i + 1) % HEX.length]}` : `${HEX[i]}…${HEX[(i + 3) % HEX.length]}`}
              color={theme.accent}
              enter={tEnter}
              danger={isTampered}
              broken={isAbove && broken > 0.05}
              changed={isTampered && broken > 0.05}
            />
          );
        })}
        {/* разрыв между tampered и блоком выше */}
        <div
          style={{
            position: "absolute",
            left: (W - BW) / 2 - 70,
            top: ys[tamperIndex] - 30,
            transform: `translateY(${-broken * 20}px)`,
            color: theme.danger,
            fontSize: 30,
            opacity: broken,
            ...mono,
            whiteSpace: "nowrap",
          }}
        >
          ✕ ЦЕПОЧКА ВЫШЕ РАССЫПАЕТСЯ
        </div>
        <PulseRing x={W / 2} y={ys[tamperIndex] + BH / 2} triggerFrame={impactLocal} tone="danger" size={190} />
      </>
    );
  }

  // confirm
  const targetY = 1190;
  const targetEnter = spring({ frame: Math.max(0, local - 4), fps, config: { damping: 14, mass: 0.75 } });
  const confirmStep = CONFIRM_BH + 12;
  const confirmYs = Array.from({ length: confirms }, (_, k) => targetY - confirmStep * (k + 1));
  const doneCount = Math.max(0, Math.min(confirms, Math.floor(local / 8)));
  const allDone = doneCount >= confirms;
  const doneP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  return (
    <>
      <Header title={phaseTitle.confirm} enter={enter} icon="layers" />
      {/* цель: блок пользователя */}
      <BlockCard y={targetY} idx={1} to="B" prev={`${HEX[0]}…${HEX[3]}`} color={theme.accent} enter={targetEnter} locked showPrev={false} compact />
      {/* подтверждения сверху */}
      {confirmYs.map((y, k) => {
        const cEnter = spring({ frame: Math.max(0, local - 8 * (k + 1)), fps, config: { damping: 13, mass: 0.7 } });
        const shown = local >= 8 * (k + 1);
        return shown ? (
          <BlockCard
            key={k}
            y={y}
            idx={k + 2}
            to="B"
            prev={`${HEX[(k + 1) % HEX.length]}…${HEX[(k + 4) % HEX.length]}`}
            color={theme.success}
            enter={cEnter}
            compact
          />
        ) : null;
      })}
      {/* счётчик */}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 390,
          transform: "translateX(-50%)",
          padding: "14px 30px",
          borderRadius: 999,
          background: `${theme.success}18`,
          border: `2px solid ${theme.success}AA`,
          color: theme.success,
          ...mono,
          fontSize: 30,
          fontWeight: 800,
          opacity: enter,
        }}
      >
        ПОДТВЕРЖДЕНИЙ: {doneCount} / {confirms}
      </div>
      {/* барьер реорга */}
      {allDone ? (
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 280,
            transform: `translateX(-50%) scale(${0.7 + doneP * 0.3})`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: theme.danger,
            ...mono,
            fontSize: 28,
            fontWeight: 800,
            whiteSpace: "nowrap",
            opacity: enter * doneP,
          }}
        >
          <IconGlyph name="ban" size={30} color={theme.danger} strokeWidth={2} />
          ПЕРЕКОПАТЬ ВЫШЕ БЫСТРЕЕ МИРА — НЕВОЗМОЖНО
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 1340,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 26,
          color: theme.subtext,
          opacity: enter,
          whiteSpace: "nowrap",
        }}
      >
        КАЖДОЕ — НОВЫЙ БЛОК ПОВЕРХ ≈ ЧАС ДО УВЕРЕННОСТИ
      </div>
      <PulseRing x={W / 2} y={targetY - confirmStep * confirms} triggerFrame={impactLocal} tone="success" size={200} />
    </>
  );
};

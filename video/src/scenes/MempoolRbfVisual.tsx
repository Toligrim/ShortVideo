import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type MempoolRbfPhase = "broadcast" | "rbf" | "mined";

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };

const phaseTitle: Record<MempoolRbfPhase, string> = {
  broadcast: "МЕМПУЛ · ПЕРЕВОД ВИСИТ НЕПОДТВЕРЖДЁННЫМ",
  rbf: "REPLACE-BY-FEE · БОЛЬШЕ КОМИССИЯ → ЗАМЕНА",
  mined: "В БЛОКЕ · ХЭШ ЦЕПОЧКИ ЗАПИРАЕТ НАВСЕГДА",
};

const TxCard: React.FC<{
  y: number;
  from: string;
  to: string;
  fee: string;
  color: string;
  enter: number;
  badge: string;
  badgeTone: string;
  ghost?: boolean;
}> = ({ y, from, to, fee, color, enter, badge, badgeTone, ghost }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2 - 280,
      top: y,
      width: 560,
      height: 150,
      borderRadius: 22,
      background: `${theme.panel}E8`,
      border: `3px solid ${color}99`,
      boxShadow: `0 0 38px ${color}22`,
      opacity: ghost ? enter * 0.35 : enter,
      transform: `translateY(${(1 - enter) * 30}px) scale(${0.82 + enter * 0.18})`,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: 12,
      padding: "0 26px",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: theme.text, fontSize: 30, fontWeight: 800 }}>
      <IconGlyph name="bitcoin" size={28} color={theme.warning} strokeWidth={2} />
      <span>tx&nbsp; {from} → {to}&nbsp; 0.5 ₿</span>
      <span style={{ ...mono, fontSize: 20, color: theme.subtext, marginLeft: "auto" }}>{fee}</span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ ...mono, fontSize: 20, color: theme.subtext }}>{fee.includes("sat") ? "комиссия" : ""}</span>
      <span
        style={{
          marginLeft: "auto",
          ...mono,
          fontSize: 22,
          fontWeight: 800,
          color: badgeTone,
          background: `${badgeTone}1A`,
          borderRadius: 10,
          padding: "3px 14px",
        }}
      >
        {badge}
      </span>
    </div>
  </div>
);

export const MempoolRbfVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: MempoolRbfPhase;
}> = ({ local, fps, impactLocal, phase = "broadcast" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });

  const header = (
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
        fontSize: 25,
        whiteSpace: "nowrap",
        opacity: enter,
        ...mono,
      }}
    >
      <IconGlyph name={phase === "mined" ? "lock" : "inbox"} size={30} color={phase === "mined" ? theme.success : theme.accent} strokeWidth={1.8} />
      <span>{phaseTitle[phase]}</span>
    </div>
  );

  if (phase === "broadcast") {
    const txEnter = spring({ frame: Math.max(0, local - 6), fps, config: { damping: 13, mass: 0.75 } });
    return (
      <>
        {header}
        {/* мемпул */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 360,
            top: 400,
            width: 720,
            height: 620,
            borderRadius: 28,
            border: `3px dashed ${theme.accent2}99`,
            background: `${theme.accent2}0C`,
            opacity: enter,
          }}
        >
          <div style={{ position: "absolute", left: 24, top: 18, ...mono, fontSize: 24, color: theme.accent2 }}>MEMPOOL</div>
        </div>
        <TxCard y={560} from="A" to="B" fee="fee 1 sat/vB" color={theme.warning} enter={txEnter} badge="PENDING" badgeTone={theme.warning} />
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1180,
            transform: "translateX(-50%)",
            ...mono,
            fontSize: 26,
            color: theme.subtext,
            opacity: enter,
            whiteSpace: "nowrap",
          }}
        >
          ПОКА ВИСИТ ТУТ — ЕЁ ЕЩЁ МОЖНО ЗАМЕНИТЬ
        </div>
        <PulseRing x={W / 2} y={635} triggerFrame={impactLocal} tone="warning" size={200} />
      </>
    );
  }

  if (phase === "rbf") {
    const oldEnter = spring({ frame: Math.max(0, local - 4), fps, config: { damping: 13, mass: 0.75 } });
    const newEnter = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
    return (
      <>
        {header}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 360,
            top: 400,
            width: 720,
            height: 620,
            borderRadius: 28,
            border: `3px dashed ${theme.accent2}99`,
            background: `${theme.accent2}0C`,
            opacity: enter,
          }}
        >
          <div style={{ position: "absolute", left: 24, top: 18, ...mono, fontSize: 24, color: theme.accent2 }}>MEMPOOL</div>
        </div>
        <TxCard y={440} from="A" to="B" fee="fee 1 sat/vB" color={theme.subtext} enter={oldEnter} badge="ВЫТЕСНЕНА" badgeTone={theme.subtext} ghost />
        <TxCard y={650} from="A" to="C" fee="fee 5 sat/vB" color={theme.accent} enter={newEnter} badge="RBF · ЗАМЕНА" badgeTone={theme.accent} />
        <div style={{ position: "absolute", left: W / 2, top: 850, transform: "translateX(-50%)", color: theme.accent, fontSize: 40, opacity: enter * reveal }}>↓</div>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1180,
            transform: "translateX(-50%)",
            ...mono,
            fontSize: 26,
            color: theme.accent,
            opacity: enter,
            whiteSpace: "nowrap",
          }}
        >
          БОЛЬШЕ КОМИССИЯ — МАЙНЕР ВОЗЬМЁТ НОВУЮ
        </div>
        <PulseRing x={W / 2} y={725} triggerFrame={impactLocal} tone="accent" size={200} />
      </>
    );
  }

  // mined
  const mineP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const blockEnter = spring({ frame: Math.max(0, local - 4), fps, config: { damping: 13, mass: 0.75 } });
  return (
    <>
      {header}
      {/* блок, в который включена транзакция */}
      <div
        style={{
          position: "absolute",
          left: W / 2 - 320,
          top: 470,
          width: 640,
          height: 460,
          borderRadius: 28,
          border: `4px solid ${theme.success}AA`,
          background: `${theme.success}0E`,
          boxShadow: `0 0 60px ${theme.success}33`,
          opacity: blockEnter,
          transform: `translateY(${(1 - blockEnter) * 40}px)`,
        }}
      >
        <div style={{ position: "absolute", left: 26, top: 22, display: "flex", alignItems: "center", gap: 12, ...mono, fontSize: 26, color: theme.success }}>
          <IconGlyph name="box" size={30} color={theme.success} strokeWidth={1.8} />
          БЛОК #N
        </div>
        <div style={{ position: "absolute", left: 26, top: 78, ...mono, fontSize: 22, color: theme.subtext }}>prev&nbsp; 00af…3c</div>
      </div>
      <TxCard y={600} from="A" to="B" fee="fee 1 sat/vB" color={theme.success} enter={blockEnter} badge="В БЛОКЕ" badgeTone={theme.success} />
      <div
        style={{
          position: "absolute",
          left: W / 2 + 150,
          top: 540,
          transform: `scale(${0.7 + mineP * 0.3})`,
          opacity: enter * mineP,
          color: theme.success,
        }}
      >
        <IconGlyph name="lock" size={70} color={theme.success} strokeWidth={2} />
      </div>
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 1180,
          transform: "translateX(-50%)",
          ...mono,
          fontSize: 26,
          color: theme.success,
          opacity: enter,
          whiteSpace: "nowrap",
        }}
      >
        ХЭШ ЦЕПОЧКИ ЗАПИРАЕТ ЕЁ НАВСЕГДА
      </div>
      <PulseRing x={W / 2} y={675} triggerFrame={impactLocal} tone="success" size={210} />
    </>
  );
};

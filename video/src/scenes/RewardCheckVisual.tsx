import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type RewardCheckPhase = "attempt" | "sum" | "coinbase" | "reject" | "rules" | "nodes" | "consensus";

const W = layout.width;
const H = layout.height;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };

const phaseTitle: Record<RewardCheckPhase, string> = {
  attempt: "МАЙНЕР ПРОСИТ БОЛЬШЕ РАЗРЕШЁННОГО",
  sum: "НАГРАДА = СУБСИДИЯ + КОМИССИИ",
  coinbase: "ПЕРВАЯ ТРАНЗАКЦИЯ · COINBASE",
  reject: "COINBASE PAYS TOO MUCH · ОТКАЗ",
  rules: "ИСХОДНЫЕ ПРАВИЛА · ПОТОЛОК В КОДЕ",
  nodes: "КАЖДЫЙ УЗЕЛ ПОВТОРЯЕТ ПРОВЕРКУ",
  consensus: "ИЗМЕНЕНИЕ ФОРМУЛЫ → НУЖНО СОГЛАСИЕ",
};

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

const Header: React.FC<{ phase: RewardCheckPhase; enter: number }> = ({ phase, enter }) => (
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
      fontSize: 21,
      whiteSpace: "nowrap",
      opacity: enter,
      ...mono,
    }}
  >
    <IconGlyph name={phase === "reject" || phase === "attempt" ? "shield-alert" : phase === "rules" ? "file-code" : "server"} size={30} color={phase === "reject" ? theme.danger : theme.accent} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const StatusPill: React.FC<{ label: string; color: string; enter: number; top?: number }> = ({ label, color, enter, top = 1120 }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top,
      transform: `translateX(-50%) scale(${0.9 + enter * 0.1})`,
      borderRadius: 999,
      padding: "14px 28px",
      border: `3px solid ${color}99`,
      background: `${color}18`,
      color,
      ...mono,
      fontSize: 24,
      opacity: enter,
      whiteSpace: "nowrap",
      boxShadow: `0 0 32px ${color}22`,
    }}
  >
    {label}
  </div>
);

const NodeBox: React.FC<{
  left: number;
  top: number;
  width?: number;
  height?: number;
  label: string;
  detail: React.ReactNode;
  color: string;
  icon: string;
  enter: number;
}> = ({ left, top, width = 310, height = 300, label, detail, color, icon, enter }) => (
  <Panel left={left} top={top} width={width} height={height} color={color} enter={enter}>
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center" }}>
      <IconGlyph name={icon} size={62} color={color} strokeWidth={1.7} />
      <div style={{ ...mono, fontSize: 25, color: theme.text }}>{label}</div>
      <div style={{ ...mono, fontSize: 20, color, whiteSpace: "pre-line" }}>{detail}</div>
    </div>
  </Panel>
);

export const RewardCheckVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: RewardCheckPhase;
}> = ({ local, fps, impactLocal, phase = "attempt" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });

  if (phase === "attempt") {
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
        <Header phase={phase} enter={enter} />
        <NodeBox left={62} top={455} width={320} height={360} label="МАЙНЕР" detail={<>новый блок<br />coinbase</>} color={theme.warning} icon="pickaxe" enter={enter} />
        <div style={{ position: "absolute", left: 414, top: 568, width: 260, textAlign: "center", opacity: enter }}>
          <div style={{ ...mono, fontSize: 26, color: reveal > 0.5 ? theme.danger : theme.accent }}>coinbase</div>
          <div style={{ color: theme.accent, fontSize: 58, marginTop: 12 }}>→</div>
          <div style={{ ...mono, fontSize: 28, color: theme.danger, opacity: 0.7 + reveal * 0.3, whiteSpace: "nowrap" }}>51 BTC</div>
        </div>
        <NodeBox left={698} top={455} width={320} height={360} label="УЗЕЛ" detail={<>лимит: 50 BTC<br />проверяет блок</>} color={theme.accent2} icon="server" enter={enter} />
        <StatusPill label="+1 BTC · СЛИШКОМ МНОГО" color={theme.danger} enter={enter * (0.45 + reveal * 0.55)} />
        <PulseRing x={W / 2} y={650} triggerFrame={impactLocal} tone="danger" size={220} />
      </div>
    );
  }

  if (phase === "sum") {
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
        <Header phase={phase} enter={enter} />
        <NodeBox left={62} top={460} width={280} height={330} label="УЗЕЛ" detail="сам считает" color={theme.accent2} icon="calculator" enter={enter} />
        <div style={{ position: "absolute", left: 378, top: 455, width: 640, height: 350, borderRadius: 26, border: `3px solid ${theme.accent}88`, background: `${theme.panel}ED`, opacity: enter, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, boxShadow: `0 18px 50px ${theme.accent}20` }}>
          <div style={{ ...mono, fontSize: 25, color: theme.subtext }}>РАЗРЕШЁННАЯ НАГРАДА</div>
          <div style={{ ...mono, fontSize: 34, color: theme.warning, whiteSpace: "nowrap" }}>50 BTC</div>
          <div style={{ ...mono, fontSize: 33, color: theme.accent2, whiteSpace: "nowrap" }}>+ 0,10 BTC</div>
          <div style={{ width: 430, height: 2, background: `${theme.text}55` }} />
          <div style={{ ...mono, fontSize: 40, color: theme.success, transform: `scale(${0.9 + reveal * 0.1})`, whiteSpace: "nowrap" }}>= 50,10 BTC</div>
        </div>
        <StatusPill label="СУБСИДИЯ + КОМИССИИ" color={theme.success} enter={enter * (0.55 + reveal * 0.45)} />
        <PulseRing x={W / 2 + 70} y={690} triggerFrame={impactLocal} tone="success" size={210} />
      </div>
    );
  }

  if (phase === "coinbase") {
    const firstP = spring({ frame: Math.max(0, local - 10), fps, config: { damping: 13, mass: 0.7 } });
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
        <Header phase={phase} enter={enter} />
        <Panel left={62} top={420} width={610} height={500} color={theme.accent} enter={enter}>
          <div style={{ padding: "28px 32px", ...mono, color: theme.subtext, fontSize: 22 }}>БЛОК #840 000</div>
          <div style={{ margin: "20px 24px 0", padding: "22px 20px", borderRadius: 18, border: `3px solid ${theme.warning}99`, background: `${theme.warning}14`, opacity: firstP, transform: `scale(${0.95 + firstP * 0.05})` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, color: theme.warning, ...mono, fontSize: 24 }}><IconGlyph name="coins" size={30} color={theme.warning} strokeWidth={1.8} /> ПЕРВАЯ ТРАНЗАКЦИЯ</div>
            <div style={{ ...mono, fontSize: 28, color: theme.text, marginTop: 18 }}>coinbase · 50,10 BTC</div>
          </div>
          <div style={{ margin: "18px 24px", opacity: 0.5, ...mono, fontSize: 22, color: theme.subtext, lineHeight: 1.8 }}>tx 001 · перевод<br />tx 002 · перевод<br />tx 003 · перевод</div>
        </Panel>
        <NodeBox left={720} top={480} width={298} height={370} label="УЗЕЛ" detail={<>читает первую<br />и сверяет лимит</>} color={theme.accent2} icon="search-check" enter={enter * firstP} />
        <div style={{ position: "absolute", left: 654, top: 635, color: theme.accent, fontSize: 52, opacity: enter * firstP }}>→</div>
        <StatusPill label="COINBASE = НАГРАДА БЛОКА" color={theme.accent} enter={enter * (0.55 + reveal * 0.45)} />
        <PulseRing x={W / 2 - 170} y={650} triggerFrame={impactLocal} tone="accent" size={220} />
      </div>
    );
  }

  if (phase === "reject") {
    const errorP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 11, mass: 0.7 } });
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
        <Header phase={phase} enter={enter} />
        <Panel left={62} top={455} width={388} height={360} color={theme.danger} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
            <IconGlyph name="box" size={64} color={theme.danger} strokeWidth={1.7} />
            <div style={{ ...mono, fontSize: 24, color: theme.subtext }}>БЛОК #N</div>
            <div style={{ ...mono, fontSize: 34, color: theme.danger, whiteSpace: "nowrap" }}>coinbase 51 BTC</div>
            <div style={{ ...mono, fontSize: 22, color: theme.warning }}>ЛИМИТ 50 BTC</div>
          </div>
        </Panel>
        <div style={{ position: "absolute", left: 490, top: 585, color: theme.danger, fontSize: 60, opacity: enter * (0.55 + errorP * 0.45) }}>≠</div>
        <NodeBox left={600} top={455} width={418} height={360} label="УЗЕЛ ОТКАЗАЛ" detail={<>bad-cb-amount<br />coinbase pays too much</>} color={theme.danger} icon="ban" enter={enter * (0.5 + errorP * 0.5)} />
        <StatusPill label="ВЕСЬ БЛОК ОТВЕРГНУТ" color={theme.danger} enter={enter * (0.45 + errorP * 0.55)} />
        <PulseRing x={W / 2 + 205} y={650} triggerFrame={impactLocal} tone="danger" size={240} />
      </div>
    );
  }

  if (phase === "rules") {
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
        <Header phase={phase} enter={enter} />
        <Panel left={62} top={420} width={610} height={445} color={theme.accent} enter={enter}>
          <div style={{ padding: "28px 32px", ...mono, fontSize: 24, color: theme.accent }}>Bitcoin Core · chain.cpp</div>
          <div style={{ margin: "20px 30px", padding: "20px", borderRadius: 16, background: `${theme.bg}CC`, border: `2px solid ${theme.panelBorder}`, ...mono, fontSize: 23, lineHeight: 1.85, color: theme.text }}>
            <div><span style={{ color: theme.accent2 }}>GetBlockSubsidy</span>(height)</div>
            <div>halvings = height / 210000</div>
            <div>50 BTC &gt;&gt; halvings</div>
            <div style={{ color: theme.success }}>сеть → одно правило</div>
          </div>
        </Panel>
        <Panel left={720} top={420} width={298} height={445} color={theme.warning} enter={enter}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, textAlign: "center" }}>
            <IconGlyph name="user-round" size={62} color={theme.warning} strokeWidth={1.7} />
            <div style={{ ...mono, fontSize: 25, color: theme.text }}>САТОШИ<br />НАКАМОТО</div>
            <div style={{ ...mono, fontSize: 20, color: theme.warning }}>идея в исходных<br />правилах</div>
          </div>
        </Panel>
        <StatusPill label="ПОТОЛОК = ПРАВИЛО ПРОТОКОЛА" color={theme.accent} enter={enter * (0.55 + reveal * 0.45)} />
        <PulseRing x={W / 2 - 90} y={620} triggerFrame={impactLocal} tone="accent" size={220} />
      </div>
    );
  }

  if (phase === "nodes") {
    const nodeColors = [theme.accent, theme.accent2, theme.success];
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
        <Header phase={phase} enter={enter} />
        <Panel left={210} top={410} width={660} height={180} color={theme.warning} enter={enter}>
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <IconGlyph name="file-check" size={48} color={theme.warning} strokeWidth={1.7} />
            <div style={{ ...mono, fontSize: 27, color: theme.text, textAlign: "center" }}>ОДНА ПРОВЕРКА<br /><span style={{ color: theme.warning }}>50 BTC + комиссии</span></div>
          </div>
        </Panel>
        {[74, 385, 696].map((left, i) => (
          <Panel key={left} left={left} top={690} width={294} height={245} color={nodeColors[i]} enter={spring({ frame: Math.max(0, local - i * 8), fps, config: { damping: 14, mass: 0.72 } })}>
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 13 }}>
              <IconGlyph name="server" size={48} color={nodeColors[i]} strokeWidth={1.7} />
              <div style={{ ...mono, fontSize: 22, color: theme.text }}>УЗЕЛ {i + 1}</div>
              <div style={{ ...mono, fontSize: 27, color: theme.success }}>CHECK ✓</div>
            </div>
          </Panel>
        ))}
        <StatusPill label="ТЫСЯЧИ УЗЛОВ · ОДИН РЕЗУЛЬТАТ" color={theme.success} enter={enter * (0.45 + reveal * 0.55)} />
        <PulseRing x={W / 2} y={790} triggerFrame={impactLocal} tone="success" size={260} />
      </div>
    );
  }

  const agreeP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  return (
    <div style={{ position: "absolute", inset: 0, width: W, height: H, overflow: "hidden", fontFamily: theme.font }}>
      <Header phase={phase} enter={enter} />
      <Panel left={62} top={450} width={410} height={330} color={theme.success} enter={enter}>
        <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, textAlign: "center" }}>
          <IconGlyph name="shield-check" size={58} color={theme.success} strokeWidth={1.7} />
          <div style={{ ...mono, fontSize: 23, color: theme.subtext }}>СЕЙЧАС</div>
          <div style={{ ...mono, fontSize: 30, color: theme.success, whiteSpace: "nowrap" }}>50 → 25 → 12,5</div>
          <div style={{ ...mono, fontSize: 19, color: theme.success }}>правило принято</div>
        </div>
      </Panel>
      <div style={{ position: "absolute", left: 474, top: 575, color: theme.warning, fontSize: 48, opacity: enter }}>→</div>
      <Panel left={608} top={450} width={410} height={330} color={theme.danger} enter={enter}>
        <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, textAlign: "center" }}>
          <IconGlyph name="file-pen" size={58} color={theme.danger} strokeWidth={1.7} />
          <div style={{ ...mono, fontSize: 23, color: theme.subtext }}>ХОТИМ ИЗМЕНИТЬ</div>
          <div style={{ ...mono, fontSize: 30, color: theme.danger, whiteSpace: "nowrap", opacity: 0.7 + agreeP * 0.3 }}>50 → 30</div>
          <div style={{ ...mono, fontSize: 19, color: theme.danger }}>нужно согласие</div>
        </div>
      </Panel>
      <StatusPill label="ФОРМУЛА МЕНЯЕТСЯ ТОЛЬКО ПО КОНСЕНСУСУ" color={theme.warning} enter={enter * (0.45 + agreeP * 0.55)} />
      <PulseRing x={W / 2} y={615} triggerFrame={impactLocal} tone="warning" size={250} />
    </div>
  );
};

import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";
import { MotionGroup, useMotion } from "../lib/motion/MotionStage";

export type ProofOfWorkPhase = "farm" | "proposal" | "lottery" | "nonce" | "target" | "verify";

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };

const phaseTitle: Record<ProofOfWorkPhase, string> = {
  farm: "ЭНЕРГИЯ → ПОПЫТКИ",
  proposal: "ПРАВО НА БЛОК",
  lottery: "БАРАБАН ВАРИАНТОВ",
  nonce: "ВХОД → NONCE → HASH",
  target: "РЕДКИЙ ПОРОГ",
  verify: "ПРОВЕРКА ИСТОРИИ",
};

const Header: React.FC<{ phase: ProofOfWorkPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 305,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: theme.subtext,
      fontSize: 25,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    <IconGlyph
      name={phase === "farm" ? "zap" : phase === "proposal" ? "shield-check" : phase === "verify" ? "search-check" : "hash"}
      size={30}
      color={phase === "verify" ? theme.success : theme.accent}
      strokeWidth={1.8}
    />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color?: string;
  opacity?: number;
  children: React.ReactNode;
}> = ({ left, top, width, height, color = theme.accent, opacity = 1, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 24,
      background: `${theme.panel}ED`,
      border: `3px solid ${color}88`,
      boxShadow: `0 18px 48px ${color}1C`,
      opacity,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const Tag: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = theme.subtext }) => (
  <div style={{ ...mono, color, fontSize: 22, whiteSpace: "nowrap" }}>{children}</div>
);

const Arrow: React.FC<{ left: number; top: number; width: number; color?: string }> = ({ left, top, width, color = theme.accent }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height: 4,
      background: color,
      boxShadow: `0 0 14px ${color}88`,
    }}
  >
    <div style={{ position: "absolute", right: -2, top: -10, color, fontSize: 26 }}>›</div>
  </div>
);

const Rack: React.FC<{ left: number; index: number; active: number }> = ({ left, index, active }) => (
  <div
    style={{
      position: "absolute",
      left,
      top: 0,
      width: 150,
      height: 300,
      borderRadius: 18,
      border: `3px solid ${theme.accent}88`,
      background: `${theme.bg}CC`,
      padding: "18px 14px",
      boxSizing: "border-box",
    }}
  >
    <div style={{ ...mono, color: theme.accent, fontSize: 19 }}>ASIC-{index + 1}</div>
    {[0, 1, 2].map((n) => (
      <div key={n} style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 24 }}>
        <div style={{ color: active > 0.4 ? theme.warning : theme.subtext, fontSize: 28, transform: `rotate(${active * 180 + n * 40}deg)` }}>◌</div>
        <div style={{ height: 10, flex: 1, borderRadius: 8, background: `${theme.accent}${active > 0.4 ? "99" : "44"}` }} />
      </div>
    ))}
  </div>
);

const HashRow: React.FC<{ y: number; label: string; color?: string; opacity?: number }> = ({ y, label, color = theme.subtext, opacity = 1 }) => (
  <div style={{ position: "absolute", left: 40, top: y, display: "flex", alignItems: "center", gap: 18, opacity }}>
    <div style={{ ...mono, color: theme.subtext, fontSize: 22, width: 50 }}>H{label[0]}</div>
    <div style={{ width: 250, height: 48, borderRadius: 12, background: `${color}16`, border: `2px solid ${color}77`, color, ...mono, fontSize: 23, display: "flex", alignItems: "center", justifyContent: "center" }}>{label}</div>
  </div>
);

export const ProofOfWorkVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: ProofOfWorkPhase;
  workers?: string;
  nonceStart?: number;
  target?: string;
  blockLabel?: string;
}> = ({ local, fps, impactLocal, phase = "farm", workers = "тысячи ASIC", nonceStart = 41, target = "00ff…", blockLabel = "BLOCK #840" }) => {
  const enter = spring({ frame: Math.max(0, local), fps, config: { damping: 15, mass: 0.8 } });
  const motion = useMotion();
  const consume = motion.action("consume");
  const proof = motion.action("proof");
  const spin = motion.action("spin");
  const rare = motion.action("rare");
  const increment = motion.action("increment");
  const hash = motion.action("hash");
  const check = motion.action("check");
  const rewrite = motion.action("rewrite");
  const nonce = nonceStart + Math.round(increment * 2);

  const shell = (children: React.ReactNode) => (
    <>
      <Header phase={phase} opacity={enter} />
      {children}
    </>
  );

  if (phase === "farm") {
    const meter = Math.round(interpolate(consume, [0, 1], [0, 100]));
    return shell(
      <>
        <MotionGroup id="racks" index={0}>
          <Panel left={55} top={455} width={585} height={485} color={theme.accent} opacity={enter}>
            <Tag color={theme.subtext}>{workers.toUpperCase()} · ШУМ ВЕНТИЛЯТОРОВ</Tag>
            <div style={{ position: "absolute", left: 22, top: 66, width: 520, height: 330 }}>
              <Rack left={0} index={0} active={consume} />
              <Rack left={175} index={1} active={consume} />
              <Rack left={350} index={2} active={consume} />
            </div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="meter" index={1} action={{ preset: "pulse", cue: "consume" }}>
          <Panel left={700} top={505} width={320} height={360} color={theme.warning} opacity={enter}>
            <div style={{ textAlign: "center", paddingTop: 32 }}>
              <IconGlyph name="gauge" size={54} color={theme.warning} strokeWidth={1.8} />
              <Tag color={theme.warning}>ЭЛЕКТРИЧЕСТВО</Tag>
              <div style={{ ...mono, color: theme.text, fontSize: 58, marginTop: 30 }}>{meter} kWh</div>
              <div style={{ width: 240, height: 16, margin: "30px auto 0", borderRadius: 9, background: `${theme.warning}22` }}>
                <div style={{ width: `${meter}%`, height: "100%", borderRadius: 9, background: theme.warning }} />
              </div>
            </div>
          </Panel>
        </MotionGroup>
        <PulseRing x={860} y={690} triggerFrame={impactLocal} tone="warning" size={190} />
      </>,
    );
  }

  if (phase === "proposal") {
    return shell(
      <>
        <MotionGroup id="candidate" index={0} action={{ preset: "transfer", cue: "proof", from: { x: -70, y: 0 }, to: { x: 0, y: 0 } }}>
          <Panel left={55} top={520} width={315} height={250} color={theme.accent2} opacity={enter}>
            <div style={{ textAlign: "center", paddingTop: 30 }}>
              <IconGlyph name="box" size={52} color={theme.accent2} strokeWidth={1.8} />
              <Tag color={theme.accent2}>{blockLabel}</Tag>
              <div style={{ ...mono, color: theme.text, fontSize: 26, marginTop: 28 }}>КАНДИДАТ</div>
            </div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="work-gate" index={1} action={{ preset: "pulse", cue: "proof" }}>
          <Panel left={415} top={475} width={340} height={340} color={theme.success} opacity={enter}>
            <div style={{ textAlign: "center", paddingTop: 48 }}>
              <IconGlyph name="shield-check" size={72} color={theme.success} strokeWidth={1.7} />
              <Tag color={theme.success}>WORK CHECK</Tag>
              <div style={{ ...mono, color: theme.text, fontSize: 24, marginTop: 28 }}>РЕЗУЛЬТАТ</div>
            </div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="ballot" index={2} action={{ preset: "recoil", cue: "votes", to: { x: 55, y: -30 } }}>
          <Panel left={810} top={565} width={210} height={180} color={theme.danger} opacity={enter}>
            <div style={{ textAlign: "center", paddingTop: 35 }}>
              <IconGlyph name="vote" size={46} color={theme.danger} strokeWidth={1.8} />
              <Tag color={theme.danger}>VOTE</Tag>
              <div style={{ color: theme.danger, fontSize: 38, marginTop: 12 }}>×</div>
            </div>
          </Panel>
        </MotionGroup>
        <Arrow left={370} top={643} width={42} color={theme.accent2} />
        <PulseRing x={585} y={645} triggerFrame={impactLocal} tone="success" size={200} />
      </>,
    );
  }

  if (phase === "lottery") {
    return shell(
      <>
        <MotionGroup id="tickets" index={0} action={{ preset: "pulse", cue: "spin" }}>
          <Panel left={55} top={470} width={335} height={410} color={theme.warning} opacity={enter}>
            <div style={{ textAlign: "center", paddingTop: 28 }}>
              <div style={{ transform: `rotate(${spin * 9}deg)` }}><IconGlyph name="drum" size={76} color={theme.warning} strokeWidth={1.7} /></div>
              <Tag color={theme.warning}>БАРАБАН</Tag>
              {["A", "B", "C"].map((ticket, i) => (
                <div key={ticket} style={{ display: "inline-flex", margin: "35px 5px 0", width: 70, height: 55, borderRadius: 10, border: `2px solid ${theme.warning}99`, color: theme.text, alignItems: "center", justifyContent: "center", ...mono, transform: `translateY(${Math.sin(spin * Math.PI + i) * 7}px)` }}>{ticket}</div>
              ))}
            </div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="hashes" index={1} action={{ preset: "transfer", cue: "hashes", from: { x: -45, y: 0 }, to: { x: 0, y: 0 } }}>
          <Panel left={430} top={470} width={590} height={410} color={theme.accent2} opacity={enter}>
            <Tag color={theme.accent2}>КАЖДЫЙ БИЛЕТ → HASH</Tag>
            <HashRow y={92} label="a4c…" />
            <HashRow y={165} label="8d1…" />
            <HashRow y={238} label="00e…" color={theme.success} opacity={0.7 + rare * 0.3} />
          </Panel>
        </MotionGroup>
        <MotionGroup id="winner" index={2} action={{ preset: "pulse", cue: "rare" }}>
          <div style={{ position: "absolute", left: 425, top: 930, ...mono, color: theme.success, fontSize: 29, opacity: enter * (0.35 + rare * 0.65) }}>РЕДКИЙ БИЛЕТ · 00e…</div>
        </MotionGroup>
        <PulseRing x={850} y={765} triggerFrame={impactLocal} tone="success" size={180} />
      </>,
    );
  }

  if (phase === "nonce") {
    return shell(
      <>
        <MotionGroup id="input-block" index={0} action={{ preset: "pulse", cue: "increment" }}>
          <Panel left={45} top={510} width={290} height={260} color={theme.accent} opacity={enter}>
            <div style={{ textAlign: "center", paddingTop: 35 }}>
              <IconGlyph name="file-stack" size={52} color={theme.accent} strokeWidth={1.8} />
              <Tag color={theme.accent}>{blockLabel}</Tag>
              <div style={{ ...mono, color: theme.text, fontSize: 24, marginTop: 28 }}>ВХОД</div>
            </div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="nonce-chip" index={1} action={{ preset: "pulse", cue: "increment" }}>
          <Panel left={385} top={555} width={260} height={170} color={theme.warning} opacity={enter}>
            <div style={{ textAlign: "center", paddingTop: 22 }}>
              <Tag color={theme.warning}>NONCE</Tag>
              <div style={{ ...mono, color: theme.text, fontSize: 50, marginTop: 22 }}>{nonce}</div>
            </div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="hash-result" index={2} action={{ preset: "transfer", cue: "hash", from: { x: -50, y: 0 }, to: { x: 0, y: 0 } }}>
          <Panel left={695} top={510} width={325} height={260} color={theme.accent2} opacity={enter}>
            <div style={{ textAlign: "center", paddingTop: 35 }}>
              <IconGlyph name="hash" size={52} color={theme.accent2} strokeWidth={1.8} />
              <Tag color={theme.accent2}>HASH</Tag>
              <div style={{ ...mono, color: theme.text, fontSize: 34, marginTop: 28 }}>{hash > 0.5 ? "c20…" : "8f1…"}</div>
            </div>
          </Panel>
        </MotionGroup>
        <Arrow left={335} top={643} width={50} />
        <Arrow left={645} top={643} width={50} color={theme.accent2} />
        <PulseRing x={855} y={640} triggerFrame={impactLocal} tone="accent2" size={170} />
      </>,
    );
  }

  if (phase === "target") {
    const winnerOpacity = 0.3 + check * 0.7;
    return shell(
      <>
        <MotionGroup id="attempts" index={0} action={{ preset: "transfer", cue: "check", from: { x: -25, y: 0 }, to: { x: 0, y: 0 } }}>
          <Panel left={55} top={475} width={530} height={470} color={theme.accent2} opacity={enter}>
            <Tag color={theme.accent2}>ПОПЫТКИ</Tag>
            <HashRow y={82} label="8a4…" />
            <HashRow y={165} label="12d…" />
            <HashRow y={248} label="00e…" color={theme.success} opacity={winnerOpacity} />
          </Panel>
        </MotionGroup>
        <MotionGroup id="target-line" index={1} action={{ preset: "pulse", cue: "check" }}>
          <div style={{ position: "absolute", left: 625, top: 685, width: 370, height: 4, background: theme.warning, boxShadow: `0 0 18px ${theme.warning}99`, opacity: enter }}>
            <div style={{ position: "absolute", left: 0, top: -42, ...mono, color: theme.warning, fontSize: 25 }}>TARGET {target}</div>
          </div>
        </MotionGroup>
        <MotionGroup id="winner" index={2} action={{ preset: "transfer", cue: "check", from: { x: 0, y: 45 }, to: { x: 0, y: 0 } }}>
          <div style={{ position: "absolute", left: 660, top: 760, width: 300, opacity: enter * winnerOpacity }}>
            <div style={{ ...mono, color: theme.success, fontSize: 33 }}>00e… &lt; {target}</div>
            <Tag color={theme.success}>ПРОШЁЛ ПОРОГ</Tag>
          </div>
        </MotionGroup>
        <PulseRing x={790} y={765} triggerFrame={impactLocal} tone="success" size={185} />
      </>,
    );
  }

  return shell(
    <>
      <MotionGroup id="found-hash" index={0} action={{ preset: "transfer", cue: "check", from: { x: -55, y: 0 }, to: { x: 0, y: 0 } }}>
        <Panel left={45} top={500} width={290} height={250} color={theme.success} opacity={enter}>
          <div style={{ textAlign: "center", paddingTop: 31 }}>
            <IconGlyph name="badge-check" size={54} color={theme.success} strokeWidth={1.8} />
            <Tag color={theme.success}>FOUND HASH</Tag>
            <div style={{ ...mono, color: theme.text, fontSize: 34, marginTop: 28 }}>00e…</div>
          </div>
        </Panel>
      </MotionGroup>
      <MotionGroup id="verify-node" index={1} action={{ preset: "pulse", cue: "check" }}>
        <Panel left={385} top={475} width={300} height={300} color={theme.accent} opacity={enter}>
          <div style={{ textAlign: "center", paddingTop: 35 }}>
            <IconGlyph name="server" size={58} color={theme.accent} strokeWidth={1.8} />
            <Tag color={theme.accent}>УЗЕЛ</Tag>
            <div style={{ ...mono, color: theme.text, fontSize: 25, marginTop: 26 }}>1× SHA-256</div>
            <div style={{ ...mono, color: theme.success, fontSize: 25, marginTop: 20, opacity: 0.5 + check * 0.5 }}>HASH ≤ TARGET ✓</div>
          </div>
        </Panel>
      </MotionGroup>
      <MotionGroup id="chain-stack" index={2} action={{ preset: "pulse", cue: "rewrite" }}>
        <Panel left={745} top={435} width={285} height={390} color={rewrite > 0.3 ? theme.danger : theme.accent2} opacity={enter}>
          <div style={{ textAlign: "center", paddingTop: 24 }}>
            <Tag color={rewrite > 0.3 ? theme.danger : theme.accent2}>ЦЕПОЧКА</Tag>
            {[0, 1, 2].map((n) => (
              <div key={n} style={{ margin: "24px auto 0", width: 205, height: 54, borderRadius: 12, border: `2px solid ${rewrite > 0.3 ? theme.danger : theme.accent2}88`, color: theme.text, ...mono, fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", transform: `translateX(${rewrite * 18}px)` }}>BLOCK {3 - n}</div>
            ))}
            <div style={{ ...mono, color: theme.danger, fontSize: 20, marginTop: 22, opacity: rewrite }}>REPEAT WORK</div>
          </div>
        </Panel>
      </MotionGroup>
      <Arrow left={335} top={625} width={50} />
      <PulseRing x={535} y={625} triggerFrame={impactLocal} tone="success" size={180} />
    </>,
  );
};

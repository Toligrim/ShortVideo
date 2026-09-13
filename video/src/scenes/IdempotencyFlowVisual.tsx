import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";
import { MotionGroup, useMotion } from "../lib/motion/MotionStage";

export type IdempotencyFlowPhase = "symptom" | "key" | "process" | "store" | "replay" | "new";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: IdempotencyFlowPhase;
  keyLabel?: string;
  amount?: string;
}

const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1,
};

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  children: React.ReactNode;
}> = ({ left, top, width, height, color, children }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 26,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 38px ${color}1A`,
    }}
  >
    {children}
  </div>
);

const PhaseHeader: React.FC<{ text: string; color?: string }> = ({ text, color = theme.accent2 }) => (
  <div style={{ position: "absolute", top: 320, width: layout.width, textAlign: "center", color, fontSize: 23, ...mono }}>
    {text}
  </div>
);

const Caption: React.FC<{ text: string; color?: string }> = ({ text, color = theme.success }) => (
  <div
    style={{
      position: "absolute",
      left: layout.width / 2,
      top: 1195,
      transform: "translateX(-50%)",
      padding: "13px 28px",
      borderRadius: 999,
      background: `${color}18`,
      border: `2px solid ${color}88`,
      color,
      fontSize: 22,
      whiteSpace: "nowrap",
      boxShadow: `0 0 28px ${color}1A`,
      ...mono,
    }}
  >
    {text}
  </div>
);

const Arrow: React.FC<{ x1: number; y1: number; x2: number; y2: number; color: string; opacity?: number }> = ({ x1, y1, x2, y2, color, opacity = 1 }) => (
  <svg width={layout.width} height={layout.height} style={{ position: "absolute", inset: 0, overflow: "visible", opacity, pointerEvents: "none" }}>
    <path d={`M ${x1} ${y1} L ${x2 - 18} ${y2}`} fill="none" stroke={`${color}99`} strokeWidth={4} strokeDasharray="12 16" />
    <path d={`M ${x2 - 18} ${y2 - 11} L ${x2} ${y2} L ${x2 - 18} ${y2 + 11}`} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RequestCard: React.FC<{
  left: number;
  top: number;
  label: string;
  keyLabel?: string;
  amount?: string;
  color?: string;
}> = ({ left, top, label, keyLabel, amount, color = theme.accent }) => (
  <div
    data-motion-shape
    style={{
      position: "absolute",
      left,
      top,
      width: 350,
      height: 184,
      boxSizing: "border-box",
      padding: "22px 24px",
      borderRadius: 22,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 0 28px ${color}18`,
    }}
  >
    <div style={{ color, fontSize: 20, ...mono, display: "flex", alignItems: "center", gap: 10 }}>
      <IconGlyph name="send" size={27} color={color} strokeWidth={1.8} />
      {label}
    </div>
    <div style={{ position: "absolute", left: 24, top: 82, color: theme.text, fontSize: 28, ...mono }}>
      {keyLabel ? `КЛЮЧ ${keyLabel}` : "ОПЛАТА"}
    </div>
    {amount ? <div style={{ position: "absolute", left: 24, bottom: 22, color: theme.subtext, fontSize: 19, ...mono }}>{amount}</div> : null}
  </div>
);

const PaymentCard: React.FC<{ left: number; top: number; number: string; amount: string; color?: string; status?: string; width?: number }> = ({ left, top, number, amount, color = theme.success, status = "ПРОВЕДЕНО", width = 360 }) => (
  <Panel left={left} top={top} width={width} height={282} color={color}>
    <div style={{ position: "absolute", left: 24, top: 22, color, fontSize: 20, ...mono, display: "flex", gap: 10, alignItems: "center" }}>
      <IconGlyph name="credit-card" size={29} color={color} strokeWidth={1.8} />
      СПИСАНИЕ {number}
    </div>
    <div style={{ position: "absolute", left: 25, top: 104, color: theme.text, fontSize: 36, ...mono }}>{amount}</div>
    <div style={{ position: "absolute", left: 25, bottom: 25, color, fontSize: 19, ...mono }}>{status}</div>
  </Panel>
);

const KeyToken: React.FC<{ left: number; top: number; label: string; color?: string }> = ({ left, top, label, color = theme.warning }) => (
  <div
    data-motion-shape
    style={{
      position: "absolute",
      left,
      top,
      transform: "translate(-50%, -50%)",
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "14px 22px",
      borderRadius: 999,
      background: `${color}22`,
      border: `3px solid ${color}`,
      color,
      fontSize: 25,
      whiteSpace: "nowrap",
      boxShadow: `0 0 30px ${color}33`,
      ...mono,
    }}
  >
    <IconGlyph name="key-round" size={29} color={color} strokeWidth={1.8} />
    {label}
  </div>
);

const RecordCard: React.FC<{ left: number; top: number; keyLabel: string; color?: string; mismatch?: boolean; width?: number }> = ({ left, top, keyLabel, color = theme.accent2, mismatch = false, width = 390 }) => (
  <Panel left={left} top={top} width={width} height={354} color={color}>
    <div style={{ position: "absolute", left: 25, top: 22, color, fontSize: 20, ...mono, display: "flex", gap: 10, alignItems: "center" }}>
      <IconGlyph name="database" size={29} color={color} strokeWidth={1.8} />
      {mismatch ? "ПЕРВАЯ ОПЕРАЦИЯ" : "СОХРАНЁННЫЙ ОТВЕТ"}
    </div>
    <div style={{ position: "absolute", left: 25, top: 104, color: theme.text, fontSize: 24, ...mono }}>{keyLabel} → 200 OK</div>
    <div style={{ position: "absolute", left: 25, top: 164, color: theme.subtext, fontSize: 20, ...mono }}>order=314</div>
    {mismatch ? (
      <div style={{ position: "absolute", left: 25, bottom: 28, color: theme.danger, fontSize: 18, ...mono, display: "flex", gap: 8, alignItems: "center" }}>
        <IconGlyph name="circle-x" size={25} color={theme.danger} strokeWidth={1.8} />
        {keyLabel} ≠ СУММА
      </div>
    ) : (
      <div style={{ position: "absolute", left: 25, bottom: 28, color, fontSize: 18, ...mono }}>КОД + ТЕЛО ОТВЕТА</div>
    )}
  </Panel>
);

const ResponseCard: React.FC<{ left: number; top: number; color?: string }> = ({ left, top, color = theme.success }) => (
  <div
    data-motion-shape
    style={{
      position: "absolute",
      left,
      top,
      width: 260,
      height: 152,
      boxSizing: "border-box",
      padding: "21px 22px",
      borderRadius: 22,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      color,
      ...mono,
    }}
  >
    <div style={{ fontSize: 18 }}>ОТВЕТ ПОВТОРУ</div>
    <div style={{ marginTop: 26, color: theme.text, fontSize: 31 }}>200 OK</div>
  </div>
);

/** Параметрическая цепочка idempotency key: повтор связывается с первой операцией. */
export const IdempotencyFlowVisual: React.FC<Props> = ({
  local,
  fps,
  impactLocal,
  phase = "symptom",
  keyLabel = "K-7",
  amount = "1 290 ₽",
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const motion = useMotion();

  if (phase === "symptom") {
    const duplicate = motion.action("duplicate");
    return (
      <>
        <PhaseHeader text="СИМПТОМ" color={theme.danger} />
        <MotionGroup id="button" index={0} action={{ preset: "pulse", cue: "tap" }}>
          <Panel left={70} top={500} width={300} height={250} color={theme.danger}>
            <IconGlyph name="mouse-pointer-2" size={46} color={theme.danger} />
            <div style={{ position: "absolute", left: 25, bottom: 30, color: theme.text, fontSize: 29, ...mono }}>ОПЛАТИТЬ ×2</div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="request-a" index={1} action={{ preset: "transfer", cue: "duplicate", from: { x: -80, y: 24 }, to: { x: 0, y: 0 } }}>
          <RequestCard left={470} top={470} label="ЗАЯВКА A" amount="ждёт ответ" />
        </MotionGroup>
        <MotionGroup id="request-b" index={2} action={{ preset: "transfer", cue: "duplicate", from: { x: -80, y: -24 }, to: { x: 0, y: 0 } }}>
          <RequestCard left={470} top={720} label="ЗАЯВКА B" amount="ждёт ответ" color={theme.accent2} />
        </MotionGroup>
        <Arrow x1={370} y1={600} x2={470} y2={560} color={theme.danger} opacity={enter * duplicate} />
        <Arrow x1={370} y1={650} x2={470} y2={810} color={theme.danger} opacity={enter * duplicate} />
        <Caption text="ДВЕ ЗАЯВКИ" color={theme.danger} />
        <PulseRing x={220} y={625} triggerFrame={impactLocal} tone="danger" size={180} />
      </>
    );
  }

  if (phase === "key") {
    const attached = motion.action("attach");
    const repeated = motion.action("repeat");
    return (
      <>
        <PhaseHeader text="ОДИН КЛЮЧ" />
        <MotionGroup id="request-a" index={0} action={{ preset: "transfer", cue: "attach", from: { x: -120, y: 0 }, to: { x: 0, y: 0 } }}>
          <RequestCard left={70} top={450} label="ПЕРВАЯ ЗАЯВКА" keyLabel={keyLabel} amount={amount} />
        </MotionGroup>
        <MotionGroup id="request-b" index={1} action={{ preset: "transfer", cue: "repeat", from: { x: 120, y: 0 }, to: { x: 0, y: 0 } }}>
          <RequestCard left={70} top={735} label="ПОВТОР" keyLabel={keyLabel} amount={amount} color={theme.accent2} />
        </MotionGroup>
        <MotionGroup id="shared-key" index={2} action={{ preset: "pulse", cue: "attach" }}>
          <KeyToken left={760} top={650} label={`ОДИН НОМЕР · ${keyLabel}`} />
        </MotionGroup>
        <Arrow x1={420} y1={545} x2={700} y2={620} color={theme.warning} opacity={enter * attached} />
        <Arrow x1={420} y1={830} x2={700} y2={680} color={theme.warning} opacity={enter * repeated} />
        <Caption text={`ОДИН КЛЮЧ · ${keyLabel}`} color={theme.warning} />
        <PulseRing x={760} y={650} triggerFrame={impactLocal} tone="warning" size={190} />
      </>
    );
  }

  if (phase === "process") {
    return (
      <>
        <PhaseHeader text="ОДНА ОПЕРАЦИЯ" color={theme.success} />
        <MotionGroup id="request-a" index={0} action={{ preset: "depart", cue: "charge", to: { x: 250, y: 90 } }}>
          <RequestCard left={55} top={430} label="ЗАЯВКА A" keyLabel={keyLabel} amount={amount} />
        </MotionGroup>
        <MotionGroup id="request-b" index={1} action={{ preset: "depart", cue: "charge", to: { x: 250, y: -90 } }}>
          <RequestCard left={55} top={745} label="ЗАЯВКА B" keyLabel={keyLabel} amount={amount} color={theme.accent2} />
        </MotionGroup>
        <Arrow x1={405} y1={520} x2={650} y2={610} color={theme.accent} opacity={enter} />
        <Arrow x1={405} y1={835} x2={650} y2={690} color={theme.accent2} opacity={enter} />
        <MotionGroup id="charge" index={2} action={{ preset: "pulse", cue: "charge" }}>
          <PaymentCard left={650} top={555} number="#1" amount={amount} />
        </MotionGroup>
        <Caption text="ОДНО СПИСАНИЕ" color={theme.success} />
        <PulseRing x={830} y={695} triggerFrame={impactLocal} tone="success" size={220} />
      </>
    );
  }

  if (phase === "store") {
    const saved = motion.action("save");
    return (
      <>
        <PhaseHeader text="КЛЮЧ + ОТВЕТ" />
        <MotionGroup id="charge" index={0} action={{ preset: "pulse", cue: "save" }}>
          <PaymentCard left={45} top={510} number="#1" amount={amount} />
        </MotionGroup>
        <MotionGroup id="key" index={1} action={{ preset: "transfer", cue: "save", from: { x: -220, y: 0 }, to: { x: 90, y: 0 } }}>
          <KeyToken left={440} top={655} label={keyLabel} />
        </MotionGroup>
        <MotionGroup id="record" index={2} action={{ preset: "pulse", cue: "save" }}>
          <RecordCard left={650} top={475} keyLabel={keyLabel} />
        </MotionGroup>
        <Arrow x1={405} y1={655} x2={650} y2={655} color={theme.warning} opacity={enter * saved} />
        <Caption text="КЛЮЧ → ОТВЕТ" color={theme.accent2} />
        <PulseRing x={845} y={650} triggerFrame={impactLocal} tone="accent2" size={220} />
      </>
    );
  }

  if (phase === "replay") {
    const lookup = motion.action("lookup");
    const returned = motion.action("return");
    return (
        <>
          <PhaseHeader text="ПОВТОР" color={theme.success} />
          <MotionGroup id="request-b" index={0} entrance="materialize" action={{ preset: "transfer", cue: "lookup", from: { x: -30, y: 0 }, to: { x: 0, y: 0 } }}>
            <RequestCard left={35} top={575} label="ПОВТОР B" keyLabel={keyLabel} amount={amount} color={theme.accent2} />
          </MotionGroup>
          <MotionGroup id="record" index={1} action={{ preset: "pulse", cue: "return" }}>
            <RecordCard left={365} top={440} keyLabel={keyLabel} />
          </MotionGroup>
          <MotionGroup id="response" index={2} action={{ preset: "transfer", cue: "return", from: { x: -30, y: 0 }, to: { x: 0, y: 0 } }}>
            <ResponseCard left={785} top={585} />
          </MotionGroup>
          <Arrow x1={385} y1={665} x2={470} y2={665} color={theme.accent2} opacity={enter * lookup} />
          <Arrow x1={755} y1={665} x2={785} y2={665} color={theme.success} opacity={enter * returned} />
          <Caption text="НОВОГО СПИСАНИЯ НЕТ" color={theme.success} />
          <PulseRing x={575} y={665} triggerFrame={impactLocal} tone="success" size={210} />
        </>
    );
  }

  const fresh = motion.action("new");
  return (
    <>
      <PhaseHeader text="НОВАЯ ОПЕРАЦИЯ" color={theme.accent} />
      <MotionGroup id="old-record" index={0}>
        <RecordCard left={20} top={470} width={340} keyLabel={keyLabel} color={theme.danger} mismatch />
      </MotionGroup>
      <MotionGroup id="new-request" index={1} action={{ preset: "transfer", cue: "new", from: { x: -100, y: 35 }, to: { x: 0, y: 0 } }}>
        <RequestCard left={390} top={530} label="НОВАЯ ПОКУПКА" keyLabel="K-8" amount={amount} color={theme.accent} />
      </MotionGroup>
      <Arrow x1={740} y1={622} x2={760} y2={622} color={theme.accent} opacity={enter * fresh} />
      <MotionGroup id="new-charge" index={2} action={{ preset: "pulse", cue: "new" }}>
        <PaymentCard left={760} top={470} width={300} number="#2" amount={amount} color={theme.accent} status="ОТДЕЛЬНАЯ" />
      </MotionGroup>
      <Caption text="НОВЫЙ КЛЮЧ → #2" color={theme.accent} />
      <PulseRing x={910} y={610} triggerFrame={impactLocal} tone="accent" size={190} />
    </>
  );
};

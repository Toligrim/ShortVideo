import React from "react";
import { interpolate, spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type MnemonicSeedDerivationPhase =
  | "restore"
  | "bits"
  | "kdf"
  | "seed"
  | "addresses"
  | "balance";

const W = layout.width;
const H = layout.height;
const mono: React.CSSProperties = {
  fontFamily: theme.mono,
  fontWeight: 800,
  letterSpacing: 1,
};

const DEFAULT_WORDS = [
  "river",
  "candle",
  "orbit",
  "paper",
  "meadow",
  "silver",
  "harbor",
  "lantern",
  "walnut",
  "velvet",
  "rocket",
  "pioneer",
];

const DEFAULT_INDICES = [
  "1421",
  "272",
  "1263",
  "1150",
  "1091",
  "1649",
  "782",
  "1232",
  "2007",
  "1954",
  "1502",
  "1304",
];

const DEFAULT_BIT_GROUPS = [
  "10110001101",
  "00100010000",
  "10011101111",
  "10001111110",
  "10001000011",
  "11001110001",
  "01100001110",
  "10011010000",
  "11111010111",
  "11110100010",
  "10111011110",
  "10100011000",
];

// 8 rows × 16 nibbles = 128 nibbles = 512 bits.
const DEFAULT_SEED_ROWS = [
  "8f3a1c07d2e9b54a",
  "6c10e7b349a2d81f",
  "0b7c5e29f4a816d3",
  "91c0e5aa72bd4306",
  "f18b2d7c0a9e5364",
  "3d84a6f09b17c2e8",
  "5a6f0d13e7b9428c",
  "c4e2913a6b0f78d5",
];

const DEFAULT_ADDRESSES = ["bc1q7x…p4k", "bc1q7x…p4k"];
const DEFAULT_UTXOS = ["#a3f1 · 0,5 ₿", "#d8c2 · 0,3 ₿"];

const clamp = (value: number) => Math.min(1, Math.max(0, value));

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
      borderRadius: 26,
      background: `${theme.panel}EE`,
      border: `3px solid ${color}66`,
      boxShadow: `0 18px 54px ${color}1F`,
      opacity,
      transform: `translateY(${(1 - opacity) * 26}px) scale(${0.96 + opacity * 0.04})`,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const VisualHeader: React.FC<{
  text: string;
  icon: string;
  color: string;
  opacity: number;
}> = ({ text, icon, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: 44,
      right: 44,
      top: 224,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      color: theme.subtext,
      fontSize: 25,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    <IconGlyph name={icon} size={30} color={color} strokeWidth={1.8} />
    <span>{text}</span>
  </div>
);

const FlowArrow: React.FC<{
  left: number;
  top: number;
  opacity: number;
  color?: string;
}> = ({ left, top, opacity, color = theme.accent }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      color,
      fontFamily: theme.font,
      fontSize: 58,
      fontWeight: 800,
      lineHeight: 1,
      opacity,
      textShadow: `0 0 26px ${color}55`,
    }}
  >
    →
  </div>
);

const WordGrid: React.FC<{
  words: string[];
  indices?: string[];
  showIndices: boolean;
  opacity: number;
  compact?: boolean;
}> = ({ words, indices, showIndices, opacity, compact = false }) => (
  <div
    style={{
      position: "absolute",
      inset: compact ? 20 : 24,
      opacity,
    }}
  >
    <div style={{ ...mono, color: theme.accent2, fontSize: compact ? 18 : 20 }}>
      {showIndices ? "WORDLIST · 2048" : "MNEMONIC · 12 WORDS"}
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: compact ? 8 : 10,
        marginTop: compact ? 16 : 24,
      }}
    >
      {words.slice(0, 12).map((word, i) => (
        <div
          key={`${word}-${i}`}
          style={{
            minHeight: compact ? 54 : 68,
            boxSizing: "border-box",
            padding: compact ? "8px 8px" : "9px 10px",
            borderRadius: 14,
            border: `2px solid ${showIndices ? theme.accent2 : theme.accent}55`,
            background: `${showIndices ? theme.accent2 : theme.accent}0D`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: compact ? 2 : 4,
          }}
        >
          <div style={{ color: theme.subtext, ...mono, fontSize: compact ? 14 : 15 }}>{String(i + 1).padStart(2, "0")}</div>
          <div style={{ color: theme.text, fontFamily: theme.font, fontSize: compact ? 20 : 22, fontWeight: 800 }}>{word}</div>
          {showIndices ? (
            <div style={{ color: theme.accent2, ...mono, fontSize: compact ? 13 : 14 }}>#{indices?.[i] ?? "—"}</div>
          ) : null}
        </div>
      ))}
    </div>
  </div>
);

const PhoneCard: React.FC<{
  left: number;
  label: string;
  color: string;
  opacity: number;
  broken?: boolean;
}> = ({ left, label, color, opacity, broken = false }) => (
  <div
    style={{
      position: "absolute",
      left,
      top: 500,
      width: 240,
      height: 390,
      boxSizing: "border-box",
      borderRadius: 32,
      background: `${theme.panel}F2`,
      border: `3px solid ${color}88`,
      boxShadow: `0 16px 48px ${color}20`,
      opacity,
      transform: `translateY(${(1 - opacity) * 30}px)`,
      padding: 18,
      textAlign: "center",
    }}
  >
    <div style={{ ...mono, color, fontSize: 17 }}>{label}</div>
    <div
      style={{
        position: "absolute",
        left: 42,
        top: 78,
        width: 156,
        height: 245,
        borderRadius: 22,
        border: `2px solid ${color}66`,
        background: `${color}0C`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <IconGlyph name="wallet-minimal" size={48} color={color} strokeWidth={1.8} />
      <div style={{ ...mono, color: theme.text, fontSize: 17 }}>КОШЕЛЁК 7C</div>
      <div style={{ color: theme.subtext, fontFamily: theme.font, fontSize: 18 }}>{broken ? "приложение нет" : "доступ открыт"}</div>
    </div>
    {broken ? (
      <div
        style={{
          position: "absolute",
          left: 40,
          top: 74,
          width: 162,
          height: 253,
          borderRadius: 20,
          border: `5px solid ${theme.danger}AA`,
          transform: "rotate(-8deg)",
          opacity: 0.82,
        }}
      />
    ) : null}
  </div>
);

const BitGrid: React.FC<{
  indices: string[];
  bitGroups: string[];
  opacity: number;
}> = ({ indices, bitGroups, opacity }) => (
  <div style={{ position: "absolute", inset: 24, opacity }}>
    <div style={{ ...mono, color: theme.accent, fontSize: 20 }}>11-БИТНЫЕ ГРУППЫ</div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 8,
        marginTop: 24,
      }}
    >
      {bitGroups.slice(0, 12).map((bits, i) => (
        <div
          key={`${bits}-${i}`}
          style={{
            minHeight: 92,
            minWidth: 0,
            padding: "10px 6px",
            boxSizing: "border-box",
            borderRadius: 14,
            border: `2px solid ${theme.accent}66`,
            background: `${theme.accent}0D`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: 7,
          }}
        >
          <div style={{ ...mono, color: theme.subtext, fontSize: 14 }}>#{String(i + 1).padStart(2, "0")} · {indices[i] ?? "—"}</div>
          <div style={{ ...mono, color: theme.text, fontSize: 15, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{bits.slice(0, 11)}</div>
        </div>
      ))}
    </div>
  </div>
);

const SeedMatrix: React.FC<{ rows: string[]; seed: string; opacity: number }> = ({ rows, seed, opacity }) => (
  <Panel left={50} top={420} width={980} height={650} color={theme.accent2} opacity={opacity}>
    <div style={{ position: "absolute", left: 28, right: 28, top: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ ...mono, color: theme.accent2, fontSize: 20 }}>SEED[0…511]</div>
      <div style={{ ...mono, color: theme.text, fontSize: 22 }}>{seed}</div>
    </div>
    <div style={{ position: "absolute", left: 28, right: 28, top: 86, display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.slice(0, 8).map((row, rowIndex) => (
        <div key={rowIndex} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ ...mono, color: theme.subtext, fontSize: 14, width: 64, flexShrink: 0 }}>{rowIndex * 64}–{rowIndex * 64 + 63}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(16, 1fr)", gap: 6, flex: 1 }}>
            {row.slice(0, 16).split("").map((nibble, i) => (
              <div
                key={`${rowIndex}-${i}`}
                style={{
                  height: 42,
                  borderRadius: 9,
                  border: `2px solid ${theme.accent2}66`,
                  background: `${i % 2 === rowIndex % 2 ? theme.accent2 : theme.accent}18`,
                  color: theme.text,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  ...mono,
                  fontSize: 21,
                }}
              >
                {nibble}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </Panel>
);

export const MnemonicSeedDerivationVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: MnemonicSeedDerivationPhase;
  words?: string[];
  indices?: string[];
  bitGroups?: string[];
  entropyBits?: string;
  checksumBits?: string;
  iterations?: number;
  seed?: string;
  seedBits?: string[];
  addresses?: string[];
  derivationPath?: string;
  passphrase?: string;
  balance?: string;
  utxos?: string[];
}> = ({
  local,
  fps,
  impactLocal,
  phase = "restore",
  words = DEFAULT_WORDS,
  indices = DEFAULT_INDICES,
  bitGroups = DEFAULT_BIT_GROUPS,
  entropyBits = "128",
  checksumBits = "4",
  iterations = 2048,
  seed = "8f3a…91c0",
  seedBits = DEFAULT_SEED_ROWS,
  addresses = DEFAULT_ADDRESSES,
  derivationPath = "m/84'/0'/0'/0/0",
  passphrase = "ПАРОЛЬНАЯ ФРАЗА",
  balance = "0,8 ₿",
  utxos = DEFAULT_UTXOS,
}) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const impact = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  const flow = interpolate(local, [0, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const afterImpact = interpolate(local, [impactLocal, impactLocal + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const visibleWords = words.slice(0, 12);
  const visibleIndices = indices.slice(0, 12);
  const visibleGroups = bitGroups.slice(0, 12);
  const visibleRows = seedBits.length >= 8 ? seedBits : [...seedBits, ...DEFAULT_SEED_ROWS].slice(0, 8);
  const phaseTitle: Record<MnemonicSeedDerivationPhase, string> = {
    restore: "ФРАЗА ВОССТАНАВЛИВАЕТ ДОСТУП",
    bits: "BIP-39 · СЛОВА → ИНДЕКСЫ",
    kdf: "ДЕТЕРМИНИРОВАННЫЙ РАСЧЁТ",
    seed: "РЕЗУЛЬТАТ · SEED · 512 БИТ",
    addresses: "HD-ДЕРЕВО · ОДИН ПУТЬ",
    balance: "БАЛАНС · ЗАПИСИ UTXO",
  };
  const phaseIcon: Record<MnemonicSeedDerivationPhase, string> = {
    restore: "refresh-cw",
    bits: "binary",
    kdf: "repeat-2",
    seed: "database",
    addresses: "git-branch",
    balance: "database",
  };
  const phaseColor: Record<MnemonicSeedDerivationPhase, string> = {
    restore: theme.success,
    bits: theme.accent,
    kdf: theme.warning,
    seed: theme.accent2,
    addresses: theme.success,
    balance: theme.warning,
  };

  if (phase === "restore") {
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: H, fontFamily: theme.font }}>
        <VisualHeader text={phaseTitle[phase]} icon={phaseIcon[phase]} color={phaseColor[phase]} opacity={enter} />
        <PhoneCard left={50} label="СТАРЫЙ ТЕЛЕФОН" color={theme.danger} opacity={enter} broken />
        <Panel left={315} top={420} width={450} height={560} color={theme.accent} opacity={enter}>
          <WordGrid words={visibleWords} showIndices={false} opacity={enter} />
        </Panel>
        <PhoneCard left={790} label="НОВЫЙ ТЕЛЕФОН" color={theme.success} opacity={enter * (0.55 + 0.45 * afterImpact)} />
        <FlowArrow left={278} top={680} opacity={enter * flow} />
        <FlowArrow left={758} top={680} opacity={enter * flow} />
        <PulseRing x={W / 2} y={760} triggerFrame={impactLocal} tone="success" size={220} />
      </div>
    );
  }

  if (phase === "bits") {
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: H, fontFamily: theme.font }}>
        <VisualHeader text={phaseTitle[phase]} icon={phaseIcon[phase]} color={phaseColor[phase]} opacity={enter} />
        <Panel left={45} top={425} width={450} height={680} color={theme.accent2} opacity={enter}>
          <WordGrid words={visibleWords} indices={visibleIndices} showIndices opacity={enter * (0.35 + 0.65 * afterImpact)} />
        </Panel>
        <Panel left={585} top={425} width={450} height={680} color={theme.accent} opacity={enter}>
          <BitGrid indices={visibleIndices} bitGroups={visibleGroups} opacity={enter * (0.35 + 0.65 * afterImpact)} />
        </Panel>
        <FlowArrow left={512} top={695} opacity={enter * afterImpact} />
        <div style={{ position: "absolute", left: 70, right: 70, top: 1150, textAlign: "center", ...mono, color: theme.text, fontSize: 25, opacity: enter * (0.4 + 0.6 * afterImpact) }}>
          ENT {entropyBits} · CHECK {checksumBits}
        </div>
        <PulseRing x={810} y={770} triggerFrame={impactLocal} tone="accent" size={210} />
      </div>
    );
  }

  if (phase === "kdf") {
    const loopAngle = local * 4.5;
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: H, fontFamily: theme.font }}>
        <VisualHeader text={phaseTitle[phase]} icon={phaseIcon[phase]} color={phaseColor[phase]} opacity={enter} />
        <Panel left={55} top={470} width={270} height={370} color={theme.accent2} opacity={enter}>
          <div style={{ ...mono, position: "absolute", left: 22, right: 22, top: 24, textAlign: "center", color: theme.accent2, fontSize: 20 }}>MNEMONIC</div>
          <div style={{ position: "absolute", left: 24, right: 24, top: 100, display: "flex", flexDirection: "column", gap: 12 }}>
            {visibleWords.slice(0, 4).map((word, i) => (
              <div key={word} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: theme.text, fontFamily: theme.font, fontSize: 22, fontWeight: 800, opacity: enter * (0.65 + 0.35 * clamp(flow + i * 0.04)) }}>
                <span>{String(i + 1).padStart(2, "0")}</span><span>{word}</span>
              </div>
            ))}
            <div style={{ ...mono, color: theme.subtext, textAlign: "right", fontSize: 16 }}>… ×12</div>
          </div>
        </Panel>
        <FlowArrow left={342} top={625} opacity={enter * flow} />
        <Panel left={395} top={430} width={350} height={450} color={theme.warning} opacity={enter}>
          <div style={{ ...mono, position: "absolute", left: 20, right: 20, top: 26, textAlign: "center", color: theme.warning, fontSize: 22 }}>PBKDF2</div>
          <div style={{ position: "absolute", left: 34, right: 34, top: 78, textAlign: "center", ...mono, color: theme.text, fontSize: 19 }}>HMAC-SHA512</div>
          <div
            style={{
              position: "absolute",
              left: 92,
              top: 154,
              width: 166,
              height: 166,
              borderRadius: "50%",
              border: `8px dashed ${theme.warning}AA`,
              transform: `rotate(${loopAngle}deg) scale(${0.9 + 0.1 * impact})`,
              boxShadow: `0 0 ${26 + impact * 28}px ${theme.warning}38`,
            }}
          />
          <div style={{ position: "absolute", left: 0, right: 0, top: 212, textAlign: "center", color: theme.text, fontFamily: theme.font, fontSize: 48, fontWeight: 800 }}>{iterations}</div>
        </Panel>
        <FlowArrow left={770} top={625} opacity={enter * afterImpact} color={theme.warning} />
        <Panel left={825} top={470} width={200} height={370} color={theme.accent} opacity={enter * (0.45 + 0.55 * afterImpact)}>
          <div style={{ ...mono, position: "absolute", left: 14, right: 14, top: 26, textAlign: "center", color: theme.accent, fontSize: 17 }}>OUTPUT</div>
          <div style={{ position: "absolute", left: 30, right: 30, top: 106, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {Array.from({ length: 16 }).map((_, i) => <div key={i} style={{ height: 22, borderRadius: 6, background: `${theme.accent}${i % 3 === 0 ? "AA" : "35"}`, opacity: 0.6 + 0.4 * afterImpact }} />)}
          </div>
          <div style={{ position: "absolute", left: 12, right: 12, bottom: 34, textAlign: "center", ...mono, color: theme.text, fontSize: 17 }}>512 БИТ</div>
        </Panel>
        <div style={{ position: "absolute", left: 80, right: 80, top: 1130, textAlign: "center", ...mono, color: theme.warning, fontSize: 26, opacity: enter * (0.45 + 0.55 * impact) }}>
          ИТЕРАЦИЙ · {iterations}
        </div>
        <PulseRing x={570} y={690} triggerFrame={impactLocal} tone="warning" size={220} />
      </div>
    );
  }

  if (phase === "seed") {
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: H, fontFamily: theme.font }}>
        <VisualHeader text={phaseTitle[phase]} icon={phaseIcon[phase]} color={phaseColor[phase]} opacity={enter} />
        <SeedMatrix rows={visibleRows} seed={seed} opacity={enter * (0.45 + 0.55 * afterImpact)} />
        <div style={{ position: "absolute", left: 80, right: 80, top: 1130, textAlign: "center", ...mono, color: theme.accent2, fontSize: 26, opacity: enter * (0.45 + 0.55 * afterImpact) }}>
          KDF → 512 БИТ
        </div>
        <PulseRing x={W / 2} y={790} triggerFrame={impactLocal} tone="accent2" size={250} />
      </div>
    );
  }

  if (phase === "addresses") {
    return (
      <div style={{ position: "absolute", inset: 0, width: W, height: H, fontFamily: theme.font }}>
        <VisualHeader text={phaseTitle[phase]} icon={phaseIcon[phase]} color={phaseColor[phase]} opacity={enter} />
        <Panel left={45} top={440} width={325} height={500} color={theme.accent} opacity={enter}>
          <div style={{ ...mono, position: "absolute", left: 22, right: 22, top: 24, textAlign: "center", color: theme.accent, fontSize: 19 }}>ОДИН ИСТОЧНИК</div>
          {["A", "B"].map((id, i) => (
            <div key={id} style={{ position: "absolute", left: 24, right: 24, top: 115 + i * 158, height: 112, borderRadius: 18, border: `2px solid ${theme.accent}55`, background: `${theme.accent}0D`, padding: 16, boxSizing: "border-box", opacity: enter * (0.65 + 0.35 * afterImpact) }}>
              <div style={{ ...mono, color: theme.subtext, fontSize: 15 }}>ТЕЛЕФОН {id}</div>
              <div style={{ marginTop: 10, color: theme.text, fontFamily: theme.font, fontSize: 19, fontWeight: 800 }}>{visibleWords[0]} … ×12</div>
              <div style={{ marginTop: 5, ...mono, color: theme.accent, fontSize: 14 }}>+ {passphrase}</div>
            </div>
          ))}
        </Panel>
        <FlowArrow left={382} top={655} opacity={enter * afterImpact} />
        <Panel left={420} top={520} width={285} height={250} color={theme.accent2} opacity={enter * (0.5 + 0.5 * afterImpact)}>
          <div style={{ ...mono, position: "absolute", left: 20, right: 20, top: 26, textAlign: "center", color: theme.accent2, fontSize: 19 }}>ТОТ ЖЕ SEED</div>
          <div style={{ position: "absolute", left: 20, right: 20, top: 98, textAlign: "center", fontFamily: theme.mono, fontWeight: 800, fontSize: 29, color: theme.text }}>{seed}</div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 28, textAlign: "center", color: theme.success, fontSize: 30, fontWeight: 800 }}>A = B</div>
        </Panel>
        <div style={{ position: "absolute", left: 420, top: 815, width: 285, height: 126, borderRadius: 20, border: `3px solid ${theme.success}66`, background: `${theme.success}0D`, opacity: enter * (0.5 + 0.5 * afterImpact), textAlign: "center", paddingTop: 25, boxSizing: "border-box" }}>
          <div style={{ ...mono, color: theme.success, fontSize: 18 }}>DERIVATION PATH</div>
          <div style={{ marginTop: 12, color: theme.text, fontFamily: theme.mono, fontSize: 22, fontWeight: 800 }}>{derivationPath}</div>
        </div>
        <FlowArrow left={728} top={655} opacity={enter * afterImpact} color={theme.success} />
        <Panel left={765} top={440} width={270} height={500} color={theme.success} opacity={enter * (0.45 + 0.55 * afterImpact)}>
          <div style={{ ...mono, position: "absolute", left: 18, right: 18, top: 24, textAlign: "center", color: theme.success, fontSize: 19 }}>ТЕ ЖЕ АДРЕСА</div>
          {addresses.slice(0, 2).map((address, i) => (
            <div key={`${address}-${i}`} style={{ position: "absolute", left: 20, right: 20, top: 120 + i * 158, height: 112, borderRadius: 18, border: `2px solid ${theme.success}66`, background: `${theme.success}0D`, padding: 16, boxSizing: "border-box" }}>
              <div style={{ ...mono, color: theme.subtext, fontSize: 15 }}>ТЕЛЕФОН {i === 0 ? "A" : "B"}</div>
              <div style={{ marginTop: 16, color: theme.text, fontFamily: theme.mono, fontSize: 22, fontWeight: 800, whiteSpace: "nowrap" }}>{address}</div>
            </div>
          ))}
        </Panel>
        <PulseRing x={900} y={700} triggerFrame={impactLocal} tone="success" size={220} />
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, width: W, height: H, fontFamily: theme.font }}>
      <VisualHeader text={phaseTitle[phase]} icon={phaseIcon[phase]} color={phaseColor[phase]} opacity={enter} />
      <Panel left={55} top={510} width={340} height={300} color={theme.accent} opacity={enter}>
        <div style={{ position: "absolute", inset: 22, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <IconGlyph name="map-pin" size={50} color={theme.accent} strokeWidth={1.8} />
          <div style={{ ...mono, color: theme.accent, fontSize: 19 }}>АДРЕС</div>
          <div style={{ color: theme.text, fontFamily: theme.mono, fontSize: 25, fontWeight: 800 }}>{addresses[0] ?? DEFAULT_ADDRESSES[0]}</div>
        </div>
      </Panel>
      <FlowArrow left={425} top={625} opacity={enter * flow} />
      <Panel left={515} top={430} width={510} height={570} color={theme.warning} opacity={enter * (0.5 + 0.5 * afterImpact)}>
        <div style={{ position: "absolute", left: 26, right: 26, top: 24, display: "flex", alignItems: "center", gap: 12 }}>
          <IconGlyph name="database" size={34} color={theme.warning} strokeWidth={1.8} />
          <div style={{ ...mono, color: theme.warning, fontSize: 20 }}>BLOCKCHAIN · UTXO</div>
        </div>
        <div style={{ position: "absolute", left: 28, right: 28, top: 112, display: "flex", flexDirection: "column", gap: 16 }}>
          {utxos.slice(0, 3).map((utxo, i) => (
            <div key={`${utxo}-${i}`} style={{ height: 74, borderRadius: 16, border: `2px solid ${theme.warning}55`, background: `${theme.warning}0D`, display: "flex", alignItems: "center", padding: "0 18px", boxSizing: "border-box", color: theme.text, ...mono, fontSize: 20 }}>
              {utxo}
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", left: 28, right: 28, bottom: 36, height: 104, borderRadius: 18, background: `${theme.success}14`, border: `3px solid ${theme.success}88`, display: "flex", alignItems: "center", justifyContent: "center", gap: 14, transform: `scale(${0.9 + 0.1 * impact})`, boxShadow: `0 0 42px ${theme.success}22` }}>
          <span style={{ ...mono, color: theme.subtext, fontSize: 22 }}>Σ UTXO</span>
          <span style={{ color: theme.success, fontFamily: theme.mono, fontSize: 37, fontWeight: 800 }}>{balance}</span>
        </div>
      </Panel>
      <div style={{ position: "absolute", left: 90, right: 90, top: 1080, textAlign: "center", ...mono, color: theme.warning, fontSize: 25, opacity: enter * (0.45 + 0.55 * afterImpact) }}>
        АДРЕС → UTXO → Σ
      </div>
      <PulseRing x={770} y={770} triggerFrame={impactLocal} tone="warning" size={250} />
    </div>
  );
};

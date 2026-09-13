import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { MotionGroup, useMotion } from "../lib/motion/MotionStage";
import { IconGlyph } from "../primitives/IconGlyph";

export type PageFaultFlowPhase = "symptom" | "desk" | "evict" | "fault" | "monitor";

interface Props {
  local: number;
  fps: number;
  impactLocal: number;
  phase?: PageFaultFlowPhase;
}

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };

const phaseTitle: Record<PageFaultFlowPhase, string> = {
  symptom: "СТАРАЯ ВКЛАДКА · ОТВЕТ РЫВКАМИ",
  desk: "РАБОЧИЙ СТОЛ · ОПЕРАТИВНАЯ ПАМЯТЬ",
  evict: "СТРАНИЦА · RAM → PAGEFILE",
  fault: "PAGE FAULT · СТРАНИЦА ВОЗВРАЩАЕТСЯ",
  monitor: "МОНИТОР РЕСУРСОВ · ДВА СИГНАЛА",
};

const phaseIcon: Record<PageFaultFlowPhase, string> = {
  symptom: "laptop",
  desk: "table",
  evict: "arrow-down-up",
  fault: "triangle-alert",
  monitor: "activity",
};

const Panel: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  children: React.ReactNode;
  opacity?: number;
}> = ({ left, top, width, height, color, children, opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height,
      boxSizing: "border-box",
      borderRadius: 24,
      background: `${theme.panel}F4`,
      border: `3px solid ${color}88`,
      boxShadow: `0 16px 42px ${color}1C`,
      opacity,
    }}
  >
    {children}
  </div>
);

const Header: React.FC<{ phase: PageFaultFlowPhase; opacity: number }> = ({ phase, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 305,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: phase === "fault" ? theme.danger : theme.subtext,
      fontSize: 24,
      whiteSpace: "nowrap",
      opacity,
      ...mono,
    }}
  >
    <IconGlyph name={phaseIcon[phase]} size={30} color={phase === "fault" ? theme.danger : theme.accent} strokeWidth={1.8} />
    <span>{phaseTitle[phase]}</span>
  </div>
);

const Badge: React.FC<{ text: string; color: string; opacity: number }> = ({ text, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: W / 2,
      top: 1200,
      transform: "translateX(-50%)",
      padding: "13px 28px",
      borderRadius: 999,
      background: `${color}18`,
      border: `2px solid ${color}99`,
      color,
      fontSize: 23,
      whiteSpace: "nowrap",
      opacity,
      boxShadow: `0 0 32px ${color}24`,
      ...mono,
    }}
  >
    {text}
  </div>
);

const TabStrip: React.FC<{ left: number; top: number; width: number; opacity: number; active?: number }> = ({
  left,
  top,
  width,
  opacity,
  active = 2,
}) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height: 94,
      borderRadius: 16,
      background: `${theme.bg}F0`,
      border: `2px solid ${theme.accent}77`,
      opacity,
      display: "flex",
      alignItems: "stretch",
      gap: 8,
      padding: 10,
      boxSizing: "border-box",
    }}
  >
    {[0, 1, 2, 3, 4].map((tab) => (
      <div
        key={tab}
        style={{
          flex: 1,
          borderRadius: 10,
          border: `2px solid ${tab === active ? theme.accent : theme.subtext}55`,
          background: `${tab === active ? theme.accent : theme.subtext}${tab === active ? "20" : "0C"}`,
          color: tab === active ? theme.accent : theme.subtext,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          ...mono,
        }}
      >
        ВКЛ {tab + 1}
      </div>
    ))}
  </div>
);

const PageChip: React.FC<{ left: number; top: number; color: string; label: string; detail: string; opacity?: number }> = ({
  left,
  top,
  color,
  label,
  detail,
  opacity = 1,
}) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width: 172,
      height: 112,
      borderRadius: 14,
      border: `3px solid ${color}`,
      background: `${theme.bg}F4`,
      color: theme.text,
      opacity,
      boxShadow: `0 0 24px ${color}24`,
      padding: "16px 14px",
      boxSizing: "border-box",
      ...mono,
    }}
  >
    <div style={{ color, fontSize: 21 }}>{label}</div>
    <div style={{ marginTop: 16, color: theme.subtext, fontSize: 16 }}>{detail}</div>
  </div>
);

const Arrow: React.FC<{ left: number; top: number; width: number; color: string; opacity: number; label?: string }> = ({
  left,
  top,
  width,
  color,
  opacity,
  label,
}) => (
  <div style={{ position: "absolute", left, top, width, opacity }}>
    <div style={{ borderTop: `4px dashed ${color}` }} />
    <div style={{ position: "absolute", right: -2, top: -13, color, fontSize: 34 }}>›</div>
    {label ? <div style={{ marginTop: 12, color, fontSize: 17, textAlign: "center", ...mono }}>{label}</div> : null}
  </div>
);

const LaptopFrame: React.FC<{ left: number; top: number; opacity: number; children: React.ReactNode }> = ({ left, top, opacity, children }) => (
  <div style={{ position: "absolute", left, top, width: 940, height: 530, opacity }}>
    <div
      style={{
        position: "absolute",
        left: 52,
        top: 0,
        width: 836,
        height: 420,
        borderRadius: 24,
        background: "#080C14",
        border: `6px solid ${theme.subtext}99`,
        boxShadow: `0 0 42px ${theme.accent}1C`,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
    <div style={{ position: "absolute", left: 0, top: 420, width: 940, height: 34, borderRadius: "0 0 28px 28px", background: `${theme.subtext}55` }} />
    <div style={{ position: "absolute", left: 330, top: 454, width: 280, height: 18, borderRadius: "0 0 16px 16px", background: `${theme.subtext}66` }} />
  </div>
);

export const PageFaultFlowVisual: React.FC<Props> = ({ local, fps, impactLocal, phase = "symptom" }) => {
  const motion = useMotion();
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });

  if (phase === "symptom") {
    const waiting = motion.action("wait");
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <MotionGroup id="laptop" index={0} action={{ preset: "pulse", cue: "open" }}>
          <LaptopFrame left={70} top={410} opacity={enter}>
            <TabStrip left={28} top={54} width={780} opacity={1} />
            <div style={{ position: "absolute", left: 72, top: 186, color: theme.subtext, fontSize: 21, ...mono }}>СТАРАЯ ВКЛАДКА · ДОКУМЕНТ</div>
            <div style={{ position: "absolute", left: 72, top: 244, width: 620, height: 12, borderRadius: 8, background: `${theme.accent}55` }} />
            <div style={{ position: "absolute", left: 72, top: 280, width: 470, height: 12, borderRadius: 8, background: `${theme.subtext}44` }} />
            <div style={{ position: "absolute", left: 72, top: 340, color: theme.warning, fontSize: 28, opacity: 0.45 + waiting * 0.55, ...mono }}>ОТВЕТ…</div>
            <div style={{ position: "absolute", left: 715, top: 330 }}>
              <IconGlyph name="loader-circle" size={42} color={theme.warning} strokeWidth={2} />
            </div>
          </LaptopFrame>
        </MotionGroup>
        <MotionGroup id="cpu" index={1} action={{ preset: "pulse", cue: "wait" }}>
          <Panel left={700} top={970} width={300} height={142} color={theme.success} opacity={enter}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "24px 22px", color: theme.success, ...mono, fontSize: 22 }}>
              <IconGlyph name="cpu" size={38} color={theme.success} />
              CPU · 8%
            </div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="stall" index={2} action={{ preset: "pulse", cue: "wait" }}>
          <div style={{ position: "absolute", left: 88, top: 1010, color: theme.warning, fontSize: 23, ...mono, opacity: enter * (0.55 + waiting * 0.45) }}>
            КЛИК → ПАУЗА
          </div>
        </MotionGroup>
        <Badge text="CPU НЕ ЗАНЯТ" color={theme.success} opacity={enter} />
        <PulseRing x={780} y={700} triggerFrame={impactLocal} tone="warning" size={190} />
      </>
    );
  }

  if (phase === "desk") {
    const spread = motion.action("spread");
    const tight = motion.action("tighten");
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <MotionGroup id="desk" index={0}>
          <Panel left={70} top={440} width={940} height={510} color={theme.accent} opacity={enter}>
            <div style={{ position: "absolute", left: 30, top: 25, color: theme.accent, fontSize: 23, ...mono }}>МЕСТО ПЕРЕД РУКАМИ</div>
            <div style={{ position: "absolute", left: 30, right: 30, top: 102, height: 6, background: `${theme.accent}44` }} />
            <div style={{ position: "absolute", left: 30, right: 30, bottom: 30, height: 16, borderRadius: 8, background: `${theme.subtext}26`, overflow: "hidden" }}>
              <div style={{ width: `${56 - 22 * tight}%`, height: "100%", background: theme.accent }} />
            </div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="pages" index={1} action={{ preset: "transfer", cue: "spread", from: { x: -150, y: -40 }, to: { x: 0, y: 0 } }}>
          <PageChip left={126} top={610} color={theme.accent} label="ЛИСТ · ВКЛ 1" detail="страница A" />
          <PageChip left={454} top={610} color={theme.accent2} label="ЛИСТ · ВКЛ 2" detail="страница B" />
          <PageChip left={782} top={610} color={theme.warning} label="ЛИСТ · ВКЛ 3" detail="страница C" />
        </MotionGroup>
        <MotionGroup id="space" index={2} action={{ preset: "pulse", cue: "tighten" }}>
          <div style={{ position: "absolute", left: 100, top: 1000, color: theme.warning, fontSize: 23, ...mono, opacity: enter * (0.6 + tight * 0.4) }}>
            СВОБОДНОЕ МЕСТО
          </div>
        </MotionGroup>
        <Badge text="ВКЛАДКА ≠ СТРАНИЦА" color={theme.accent2} opacity={enter} />
        <PulseRing x={W / 2} y={740} triggerFrame={impactLocal} tone="accent" size={190} />
      </>
    );
  }

  if (phase === "evict") {
    const swap = motion.action("swap");
    const dirty = motion.action("dirty");
    const keep = motion.action("keep");
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <MotionGroup id="tab" index={0} action={{ preset: "pulse", cue: "keep" }}>
          <TabStrip left={70} top={410} width={940} opacity={enter} active={2} />
          <div style={{ position: "absolute", left: 102, top: 526, color: theme.success, fontSize: 20, ...mono, opacity: enter * (0.6 + keep * 0.4) }}>ВКЛ 3 · ОСТАЁТСЯ ОТКРЫТОЙ</div>
        </MotionGroup>
        <MotionGroup id="ram" index={1} action={{ preset: "pulse", cue: "dirty" }}>
          <Panel left={70} top={590} width={430} height={350} color={theme.accent} opacity={enter}>
            <div style={{ position: "absolute", left: 26, top: 24, color: theme.accent, fontSize: 22, ...mono }}>RAM · ЛИСТЫ</div>
            <PageChip left={44} top={104} color={theme.subtext} label="PAGE 1" detail="чистая" />
            <div style={{ position: "absolute", left: 238, top: 104, width: 150, height: 112, border: `2px dashed ${theme.warning}`, borderRadius: 14, opacity: 0.7 + dirty * 0.3 }} />
            <div style={{ position: "absolute", left: 250, top: 242, color: theme.warning, fontSize: 17, ...mono }}>ИЗМЕНЕНА</div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="disk" index={2} action={{ preset: "pulse", cue: "swap" }}>
          <Panel left={580} top={590} width={430} height={350} color={theme.accent2} opacity={enter}>
            <div style={{ position: "absolute", left: 26, top: 24, color: theme.accent2, fontSize: 22, ...mono }}>PAGEFILE · ДИСК</div>
            <div style={{ position: "absolute", left: 28, top: 108, right: 28, height: 120, border: `2px dashed ${theme.accent2}88`, borderRadius: 14 }} />
            <div style={{ position: "absolute", left: 180, top: 135 }}>
              <IconGlyph name="hard-drive" size={56} color={theme.accent2} strokeWidth={1.7} />
            </div>
            <div style={{ position: "absolute", left: 26, bottom: 28, color: theme.subtext, fontSize: 17, ...mono }}>ХРАНИТСЯ НЕ ВКЛАДКА</div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="page" index={3} action={{ preset: "transfer", cue: "swap", to: { x: 304, y: 0 } }}>
          <PageChip left={304} top={694} color={theme.warning} label="PAGE 2" detail={swap > 0.55 ? "В PAGEFILE" : "ИЗМЕНЕНА"} />
        </MotionGroup>
        <Badge text="PAGE 2 → PAGEFILE" color={theme.warning} opacity={enter} />
        <PulseRing x={790} y={765} triggerFrame={impactLocal} tone="warning" size={190} />
      </>
    );
  }

  if (phase === "fault") {
    const ask = motion.action("ask");
    const read = motion.action("read");
    const returned = motion.action("returned");
    return (
      <>
        <Header phase={phase} opacity={enter} />
        <MotionGroup id="cpu" index={0} action={{ preset: "pulse", cue: "ask" }}>
          <Panel left={55} top={570} width={270} height={270} color={theme.success} opacity={enter}>
            <div style={{ position: "absolute", left: 104, top: 24 }}>
              <IconGlyph name="cpu" size={62} color={theme.success} strokeWidth={1.7} />
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 104, textAlign: "center", color: theme.success, fontSize: 23, ...mono }}>CPU</div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 38, textAlign: "center", color: theme.text, fontSize: 20, ...mono, opacity: 0.6 + ask * 0.4 }}>ПРОСИТ PAGE 2</div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="memory" index={1} action={{ preset: "pulse", cue: "fault" }}>
          <Panel left={385} top={520} width={300} height={370} color={theme.danger} opacity={enter}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 28, textAlign: "center", color: theme.danger, fontSize: 22, ...mono }}>RAM · СТОЛ</div>
            <div style={{ position: "absolute", left: 50, top: 108, width: 200, height: 112, border: `3px dashed ${theme.danger}`, borderRadius: 14 }} />
            <div style={{ position: "absolute", left: 0, right: 0, top: 250, textAlign: "center", color: returned > 0.55 ? theme.success : theme.danger, fontSize: 23, ...mono }}>
              {returned > 0.55 ? "PAGE 2 · ВЕРНУЛАСЬ" : "PAGE 2 · НЕТ"}
            </div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="disk" index={2} action={{ preset: "pulse", cue: "read" }}>
          <Panel left={760} top={520} width={270} height={370} color={theme.accent2} opacity={enter}>
            <div style={{ position: "absolute", left: 104, top: 20 }}>
              <IconGlyph name="hard-drive" size={62} color={theme.accent2} strokeWidth={1.7} />
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 104, textAlign: "center", color: theme.accent2, fontSize: 22, ...mono }}>PAGEFILE</div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 38, textAlign: "center", color: theme.text, fontSize: 19, ...mono, opacity: 0.6 + read * 0.4 }}>ЧИТАЕТ PAGE 2</div>
          </Panel>
        </MotionGroup>
        <MotionGroup id="page" index={3} action={{ preset: "transfer", cue: "read", to: { x: -360, y: 0 } }}>
          <PageChip left={795} top={660} color={theme.warning} label="PAGE 2" detail={read > 0.55 ? "→ RAM" : "на диске"} />
        </MotionGroup>
        <Arrow left={690} top={724} width={74} color={theme.warning} opacity={0.45 + read * 0.55} label="DISK I/O" />
        <Badge text="HARD FAULT → ДИСК" color={theme.danger} opacity={enter} />
        <PulseRing x={535} y={705} triggerFrame={impactLocal} tone="danger" size={210} />
      </>
    );
  }

  const select = motion.action("select");
  const faults = motion.action("faults");
  const disk = motion.action("disk");
  return (
    <>
      <Header phase={phase} opacity={enter} />
      <MotionGroup id="tab" index={0} action={{ preset: "pulse", cue: "select" }}>
        <Panel left={60} top={455} width={270} height={330} color={theme.accent} opacity={enter}>
          <div style={{ position: "absolute", left: 108, top: 30 }}>
            <IconGlyph name="mouse-pointer-click" size={52} color={theme.accent} strokeWidth={1.7} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 102, textAlign: "center", color: theme.accent, fontSize: 21, ...mono }}>СТАРАЯ ВКЛАДКА</div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 54, textAlign: "center", color: theme.warning, fontSize: 24, ...mono, opacity: 0.55 + select * 0.45 }}>ВЕРНУТЬСЯ</div>
        </Panel>
      </MotionGroup>
      <MotionGroup id="hard-faults" index={1} action={{ preset: "pulse", cue: "faults" }}>
        <Panel left={360} top={455} width={310} height={330} color={theme.danger} opacity={enter}>
          <div style={{ position: "absolute", left: 24, top: 25, color: theme.danger, fontSize: 20, ...mono }}>browser.exe</div>
          <div style={{ position: "absolute", left: 24, top: 104, color: theme.subtext, fontSize: 17, ...mono }}>ЖЁСТКИЕ ОШИБКИ</div>
          <div style={{ position: "absolute", left: 24, top: 140, color: theme.danger, fontSize: 29, ...mono, opacity: 0.55 + faults * 0.45 }}>128 / СЕК</div>
          <div style={{ position: "absolute", left: 24, right: 24, bottom: 42, height: 12, borderRadius: 8, background: `${theme.danger}22` }}>
            <div style={{ width: `${25 + 67 * faults}%`, height: "100%", borderRadius: 8, background: theme.danger }} />
          </div>
        </Panel>
      </MotionGroup>
      <MotionGroup id="disk" index={2} action={{ preset: "pulse", cue: "disk" }}>
        <Panel left={715} top={455} width={305} height={330} color={theme.accent2} opacity={enter}>
          <div style={{ position: "absolute", left: 124, top: 24 }}>
            <IconGlyph name="hard-drive" size={48} color={theme.accent2} strokeWidth={1.7} />
          </div>
          <div style={{ position: "absolute", left: 24, top: 96, color: theme.subtext, fontSize: 17, ...mono }}>АКТИВНОСТЬ ДИСКА</div>
          {[0, 1, 2, 3, 4].map((bar) => (
            <div key={bar} style={{ position: "absolute", left: 24 + bar * 48, bottom: 50, width: 30, height: 48 + bar * 28 * (0.35 + disk * 0.65), borderRadius: 5, background: bar > 1 ? theme.accent2 : `${theme.accent2}55` }} />
          ))}
          <div style={{ position: "absolute", left: 24, bottom: 20, color: theme.accent2, fontSize: 18, ...mono }}>C: · ЧТЕНИЕ</div>
        </Panel>
      </MotionGroup>
      <Badge text="HARD FAULTS + DISK" color={theme.accent2} opacity={enter} />
      <PulseRing x={850} y={625} triggerFrame={impactLocal} tone="accent2" size={200} />
    </>
  );
};

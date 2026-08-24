import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";

export type MtRecoveryPhase = "outputs" | "untemper" | "state" | "predict";

const W = layout.width;

const titleStyle: React.CSSProperties = {
  position: "absolute",
  left: W / 2,
  top: 205,
  transform: "translateX(-50%)",
  fontFamily: theme.mono,
  fontSize: 36,
  fontWeight: 800,
  letterSpacing: 3,
  color: theme.text,
  whiteSpace: "nowrap",
};

const panelStyle: React.CSSProperties = {
  position: "absolute",
  left: 120,
  top: 390,
  width: 840,
  height: 480,
  borderRadius: 28,
  background: theme.panel,
  border: `3px solid ${theme.accent}55`,
  boxShadow: `0 0 70px ${theme.accent}18`,
  overflow: "hidden",
};

const chipStyle: React.CSSProperties = {
  position: "absolute",
  left: W / 2,
  top: 980,
  transform: "translateX(-50%)",
  padding: "16px 30px",
  borderRadius: 999,
  fontFamily: theme.mono,
  fontSize: 25,
  fontWeight: 800,
  letterSpacing: 1,
  whiteSpace: "nowrap",
};

const PanelHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      position: "absolute",
      left: 34,
      right: 34,
      top: 28,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontFamily: theme.mono,
      fontSize: 26,
      fontWeight: 800,
      color: theme.accent,
    }}
  >
    {children}
  </div>
);

const BitGrid: React.FC<{ count: number; color: string; local: number; fps: number }> = ({ count, color, local, fps }) => (
  <div
    style={{
      position: "absolute",
      left: 48,
      right: 48,
      top: 116,
      display: "grid",
      gridTemplateColumns: "repeat(16, 1fr)",
      gap: 9,
    }}
  >
    {Array.from({ length: count }, (_, i) => {
      const appear = spring({ frame: Math.max(0, local - i * 1.4), fps, config: { damping: 16, mass: 0.6 } });
      return (
        <div
          key={i}
          style={{
            height: 28,
            borderRadius: 7,
            background: `${color}${i % 5 === 0 ? "DD" : "55"}`,
            border: `2px solid ${color}`,
            opacity: appear,
            transform: `scale(${0.82 + appear * 0.18})`,
          }}
        />
      );
    })}
  </div>
);

const BitRow: React.FC<{ label: string; color: string; top: number; local: number; fps: number }> = ({ label, color, top, local, fps }) => (
  <div
    style={{
      position: "absolute",
      left: 52,
      right: 52,
      top,
      display: "flex",
      alignItems: "center",
      gap: 22,
      opacity: spring({ frame: Math.max(0, local - top / 30), fps, config: { damping: 16 } }),
    }}
  >
    <div style={{ width: 92, fontFamily: theme.mono, fontSize: 25, color: theme.subtext }}>{label}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(16, 1fr)", gap: 7, flex: 1 }}>
      {Array.from({ length: 16 }, (_, i) => (
        <div
          key={i}
          style={{
            height: 38,
            borderRadius: 7,
            background: i % 3 === 0 ? `${color}DD` : `${color}44`,
            border: `2px solid ${color}`,
          }}
        />
      ))}
    </div>
  </div>
);

export const MtRecoveryVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: MtRecoveryPhase;
}> = ({ local, fps, impactLocal, phase = "outputs" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const hitFrame = Math.max(0, impactLocal);
  const hit = local >= hitFrame;
  const pop = hit ? spring({ frame: local - hitFrame, fps, config: { damping: 11, mass: 0.7 } }) : 0;

  if (phase === "outputs") {
    return (
      <>
        <div style={{ ...titleStyle, opacity: enter }}>MT19937 · ВЫХОДЫ</div>
        <div style={{ ...panelStyle, opacity: enter, transform: `scale(${0.94 + 0.06 * enter})` }}>
          <PanelHeader><span>полные слова</span><span style={{ color: theme.accent2 }}>624 × 32 бита</span></PanelHeader>
          <BitGrid count={64} color={theme.accent} local={local} fps={fps} />
          <div style={{ position: "absolute", left: 52, right: 52, bottom: 48, textAlign: "center", fontFamily: theme.mono, fontSize: 25, color: theme.subtext }}>
            каждый выход — целое слово
          </div>
        </div>
        <div style={{ ...chipStyle, color: theme.accent, border: `2px solid ${theme.accent}`, background: `${theme.accent}18`, opacity: enter }}>
          все выходы полные
        </div>
      </>
    );
  }

  if (phase === "untemper") {
    return (
      <>
        <div style={{ ...titleStyle, opacity: enter }}>ОБРАТНЫЙ ТЕМПЕРИНГ</div>
        <div style={{ ...panelStyle, opacity: enter, height: 410 }}>
          <PanelHeader><span>выход</span><span style={{ color: theme.warning }}>⇄</span><span style={{ color: theme.success }}>состояние</span></PanelHeader>
          <BitRow label="было" color={theme.warning} top={128} local={local} fps={fps} />
          <BitRow label="стало" color={theme.success} top={238} local={local} fps={fps} />
          <div style={{ position: "absolute", left: 52, right: 52, bottom: 34, textAlign: "center", fontFamily: theme.mono, fontSize: 24, color: theme.subtext }}>
            обратимые сдвиги + исключающее ИЛИ
          </div>
        </div>
        <div style={{ ...chipStyle, color: theme.warning, border: `2px solid ${theme.warning}`, background: `${theme.warning}18`, opacity: hit ? pop : enter * 0.45 }}>
          биты возвращаются на места
        </div>
        {hit ? <PulseRing x={W / 2} y={590} triggerFrame={hitFrame} tone="warning" size={520} /> : null}
      </>
    );
  }

  if (phase === "state") {
    return (
      <>
        <div style={{ ...titleStyle, opacity: enter }}>СОСТОЯНИЕ ВОССТАНОВЛЕНО</div>
        <div style={{ ...panelStyle, opacity: enter }}>
          <PanelHeader><span>внутри генератора</span><span style={{ color: theme.success }}>готово</span></PanelHeader>
          <BitGrid count={24} color={theme.accent2} local={local} fps={fps} />
          <div style={{ position: "absolute", left: 52, right: 52, top: 315, display: "flex", justifyContent: "space-between", fontFamily: theme.mono, fontSize: 27, color: theme.text }}>
            <span>массив: 624 слова</span><span style={{ color: theme.accent }}>индекс: 0</span>
          </div>
          <div style={{ position: "absolute", left: 52, right: 52, bottom: 48, textAlign: "center", fontFamily: theme.mono, fontSize: 25, color: theme.subtext }}>
            состояние больше не секрет
          </div>
        </div>
        <div style={{ ...chipStyle, color: theme.success, border: `2px solid ${theme.success}`, background: `${theme.success}18`, opacity: enter }}>
          генератор готов к следующему числу
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ ...titleStyle, opacity: enter }}>БУДУЩЕЕ ИЗВЕСТНО</div>
      <div style={{ ...panelStyle, opacity: enter, height: 390 }}>
        <PanelHeader><span>состояние</span><span style={{ color: theme.success }}>→</span></PanelHeader>
        <div style={{ position: "absolute", left: 54, top: 145, width: 250, height: 120, borderRadius: 18, background: `${theme.accent2}20`, border: `3px solid ${theme.accent2}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: theme.mono, fontSize: 26, color: theme.accent2, textAlign: "center" }}>
          624 слова
        </div>
        <div style={{ position: "absolute", left: 370, top: 178, fontFamily: theme.font, fontSize: 58, color: theme.success, opacity: enter }}>→</div>
        <div style={{ position: "absolute", right: 54, top: 145, width: 300, height: 120, borderRadius: 18, background: `${theme.success}20`, border: `3px solid ${theme.success}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: theme.mono, fontSize: 28, fontWeight: 800, color: theme.success, textAlign: "center", transform: `scale(${0.92 + 0.08 * (hit ? pop : enter)})` }}>
          0x9c5c3d1e
        </div>
        <div style={{ position: "absolute", left: 52, right: 52, bottom: 42, textAlign: "center", fontFamily: theme.mono, fontSize: 25, color: theme.subtext }}>
          следующее число до вызова
        </div>
      </div>
      <div style={{ ...chipStyle, color: theme.success, border: `2px solid ${theme.success}`, background: `${theme.success}18`, opacity: hit ? pop : enter * 0.45 }}>
        случайность разоблачена
      </div>
      {hit ? <PulseRing x={W / 2} y={590} triggerFrame={hitFrame} tone="success" size={520} /> : null}
    </>
  );
};

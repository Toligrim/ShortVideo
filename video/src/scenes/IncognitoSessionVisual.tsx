import React from "react";
import { spring } from "remotion";
import { layout, theme } from "../lib/theme";
import { PulseRing } from "../lib/Motion";
import { IconGlyph } from "../primitives/IconGlyph";

const W = layout.width;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export type IncognitoSessionPhase =
  | "request"
  | "separate"
  | "storage"
  | "erase"
  | "no-signal";

const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };

const phaseTitle: Record<IncognitoSessionPhase, string> = {
  request: "ИНКОГНИТО · ЗАПРОС",
  separate: "ОТДЕЛЬНАЯ СЕССИЯ · ИЗОЛЯЦИЯ",
  storage: "ЛОКАЛЬНОЕ ХРАНИЛИЩЕ",
  erase: "СТИРАНИЕ · УДАЛЕНИЕ ДАННЫХ",
  "no-signal": "БЕЗ СПЕЦИАЛЬНОЙ МЕТКИ",
};

const mono2: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 1 };

const IncognitoSessionVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: IncognitoSessionPhase;
}> = ({ local, fps, impactLocal, phase = "request" }) => {
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const reveal = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });

  const renderSiteIcon = (left = 720, top = 420) => (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: 160,
        height: 120,
        borderRadius: 12,
        background: `${theme.success}14`,
        border: `2px solid ${theme.success}88`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.8,
      }}
    >
      <IconGlyph name="globe" size={28} color={theme.success} strokeWidth={1.8} />
      <div style={{ fontSize: 14, color: theme.success, whiteSpace: "nowrap" }}>САЙТ</div>
    </div>
  );

  const renderBrowserIcon = (left = 120, top = 340) => (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: 280,
        height: 340,
        borderRadius: 16,
        background: `${theme.panel}E8`,
        border: `3px solid ${theme.accent}66`,
        boxShadow: `0 0 36px ${theme.accent}20`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.9,
      }}
    >
      <IconGlyph name="globe" size={40} color={theme.accent} strokeWidth={1.8} />
      <div style={{ fontSize: 24, fontWeight: 800, color: theme.text, marginTop: 8, whiteSpace: "nowrap" }}>БРАУЗЕР</div>
      <div style={{ fontSize: 16, color: theme.subtext, marginTop: 4 }}>отдельная сессия</div>
    </div>
  );

  const renderStorageIcon = (left = 720, top = 500) => (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: 160,
        height: 120,
        borderRadius: 12,
        background: `${theme.warning}14`,
        border: `2px solid ${theme.warning}88`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.8,
      }}
    >
      <IconGlyph name="database" size={28} color={theme.warning} strokeWidth={1.8} />
      <div style={{ fontSize: 14, color: theme.warning, whiteSpace: "nowrap" }}>ХРАНИЛИЩЕ</div>
    </div>
  );

  const renderEraseIcon = (left = 720, top = 500) => (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: 160,
        height: 120,
        borderRadius: 12,
        background: `${theme.danger}14`,
        border: `2px solid ${theme.danger}88`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.8,
      }}
    >
      <IconGlyph name="trash" size={28} color={theme.danger} strokeWidth={1.8} />
      <div style={{ fontSize: 14, color: theme.danger, whiteSpace: "nowrap" }}>СТИРАТЬ</div>
    </div>
  );

  const renderNoSignalIcon = (left = 120, top = 500) => (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: 160,
        height: 120,
        borderRadius: 12,
        background: `${theme.accent2}14`,
        border: `2px solid ${theme.accent2}88`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.8,
      }}
    >
      <IconGlyph name="tag" size={28} color={theme.accent2} strokeWidth={1.8} />
      <div style={{ fontSize: 14, color: theme.accent2, whiteSpace: "nowrap" }}>НЕТ МЕТКИ</div>
    </div>
  );

  return (
    <div
      style={{
        position: "relative",
        width: W,
        height: 1200,
        overflow: "hidden",
      }}
    >
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
        <IconGlyph name="lock" size={30} color={theme.accent2} strokeWidth={1.8} />
        <span>{phaseTitle[phase]}</span>
      </div>

      {phase === "request" && (
        <>
          {renderSiteIcon(720, 440)}
          {renderBrowserIcon(120, 390)}
        </>
      )}

      {phase === "separate" && (
        <>
          {renderBrowserIcon(120, 350)}
          {renderStorageIcon(720, 500)}
        </>
      )}

      {phase === "storage" && (
        <>
          {renderBrowserIcon(120, 350)}
          {renderStorageIcon(720, 500)}
        </>
      )}

      {phase === "erase" && (
        <>
          {renderStorageIcon(120, 500)}
          {renderEraseIcon(720, 500)}
          <div
            style={{
              position: "absolute",
              left: W / 2,
              top: 720,
              transform: "translateX(-50%)",
              padding: "16px 32px",
              borderRadius: 999,
              background: `${theme.danger}18`,
              border: `2px solid ${theme.danger}99`,
              color: theme.danger,
              ...mono,
              fontSize: 24,
              whiteSpace: "nowrap",
              opacity: enter,
            }}
          >
            На устройстве чисто · сайт может сохранить данные
          </div>
        </>
      )}

      {phase === "no-signal" && (
        <>
          {renderNoSignalIcon(120, 500)}
          {renderBrowserIcon(720, 350)}
          <div
            style={{
              position: "absolute",
              left: W / 2,
              top: 720,
              transform: "translateX(-50%)",
              padding: "16px 32px",
              borderRadius: 999,
              background: `${theme.success}18`,
              border: `2px solid ${theme.success}99`,
              color: theme.success,
              ...mono,
              fontSize: 24,
              whiteSpace: "nowrap",
              opacity: enter,
            }}
          >
            Обычный запрос · нет метки инкогнито
          </div>
        </>
      )}

      <PulseRing x={W / 2} y={560} triggerFrame={impactLocal} tone="accent" size={140} />
    </div>
  );
};

export { IncognitoSessionVisual };

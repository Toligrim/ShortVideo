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
  request: "INCOGNITO-SESSION · ЗАПРОС",
  separate: "ОТДЕЛЬНАЯ SESSION · Изоляция",
  storage: "LOKAL'NOE ХРАНИЛISCO · Локальное хранилище",
  erase: "СТИРАНIE · Удаление данных",
  "no-signal": "BEZ SIGNALA · Нет следов сети",
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

  const renderSiteIcon = () => (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
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

  const renderBrowserIcon = () => (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
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

  const renderStorageIcon = () => (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
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

  const renderEraseIcon = () => (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
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

  const renderNoSignalIcon = () => (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
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
      <IconGlyph name="wifi-off" size={28} color={theme.accent2} strokeWidth={1.8} />
      <div style={{ fontSize: 14, color: theme.accent2, whiteSpace: "nowrap" }}>НЕТ SIGNALA</div>
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
        <IconGlyph name="lock-closed" size={30} color={theme.accent2} strokeWidth={1.8} />
        <span>{phaseTitle[phase]}</span>
      </div>

      {phase === "request" && (
        <>
          {renderSiteIcon()}
          {renderBrowserIcon()}
        </>
      )}

      {phase === "separate" && (
        <>
          {renderBrowserIcon()}
          {renderStorageIcon()}
        </>
      )}

      {phase === "storage" && (
        <>
          {renderBrowserIcon()}
          {renderStorageIcon()}
        </>
      )}

      {phase === "erase" && (
        <>
          {renderStorageIcon()}
          {renderEraseIcon()}
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
            Данные на устройстве удалены, но на сервере сохраняются
          </div>
        </>
      )}

      {phase === "no-signal" && (
        <>
          {renderNoSignalIcon()}
          {renderBrowserIcon()}
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
            Нет сетевых следов — только локальный след
          </div>
        </>
      )}

      <PulseRing x={W / 2} y={560} triggerFrame={impactLocal} tone="accent" size={140} />
    </div>
  );
};

export { IncognitoSessionVisual };
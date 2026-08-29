import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, theme } from "../lib/theme";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";

export type FileDeleteRecoveryPhase = "unlink" | "overwrite" | "trim" | "cloud" | "recovered";

const W = layout.width;
const mono: React.CSSProperties = { fontFamily: theme.mono, fontWeight: 800, letterSpacing: 2 };

const phaseTitle: Record<FileDeleteRecoveryPhase, string> = {
  unlink: "UNLINK · ИМЯ УДАЛЕНО · БАЙТЫ НА МЕСТЕ",
  overwrite: "ПЕРЕЗАПИСЬ · ДАННЫЕ УНИЧТОЖЕНЫ",
  trim: "TRIM · КОНТРОЛЛЕР СТИРАЕТ ФИЗИЧЕСКИ",
  cloud: "ОБЛАЧНАЯ КОРЗИНА · 30–60 ДНЕЙ",
  recovered: "ВОССТАНОВЛЕНИЕ · ФАЙЛ ОБНАРУЖЕН",
};

export const FileDeleteRecoveryVisual: React.FC<{
  local: number;
  fps: number;
  impactLocal: number;
  phase?: FileDeleteRecoveryPhase;
}> = ({ local, fps, impactLocal, phase = "unlink" }) => {
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
      <IconGlyph name="file-x" size={30} color={theme.accent} strokeWidth={1.8} />
      <span>{phaseTitle[phase]}</span>
    </div>
  );

  if (phase === "unlink") {
    const nameP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 10, mass: 0.6 } });
    return (
      <>
        {header}
        {/* Hard drive label */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 380,
            transform: `translateX(-50%) scale(${0.82 + enter * 0.18})`,
            ...mono,
            fontSize: 44,
            color: theme.text,
            textAlign: "center",
            opacity: enter,
          }}
        >
          <IconGlyph name="hard-drive" size={52} color={theme.accent2} strokeWidth={1.8} />
          {" "}ДИСК
        </div>

        {/* Inode block */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 160,
            top: 510,
            width: 320,
            height: 120,
            borderRadius: 24,
            background: `${theme.panel}E8`,
            border: `3px solid ${theme.accent2}88`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            opacity: enter,
            boxShadow: `0 0 32px ${theme.accent2}22`,
          }}
        >
          <div style={{ ...mono, fontSize: 24, color: theme.accent2 }}>INODE 7843</div>
          <div style={{ ...mono, fontSize: 20, color: theme.subtext, marginTop: 6 }}>мета: размер, права, блоки</div>
        </div>

        {/* Arrow from inode to data */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 645,
            transform: "translateX(-50%)",
            color: theme.accent,
            fontSize: 48,
            opacity: enter,
          }}
        >
          ↓
        </div>

        {/* Data blocks */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 280,
            top: 710,
            width: 560,
            height: 100,
            display: "flex",
            gap: 8,
            justifyContent: "center",
            alignItems: "center",
            opacity: enter,
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => {
            const cellP = spring({ frame: Math.max(0, local - 4 - i * 3), fps, config: { damping: 14, mass: 0.7 } });
            return (
              <div
                key={i}
                style={{
                  width: 58,
                  height: 72,
                  borderRadius: 14,
                  border: `3px solid ${theme.success}${cellP > 0.5 ? "CC" : "44"}`,
                  background: `${theme.success}${cellP > 0.5 ? "22" : "0A"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: theme.mono,
                  fontSize: 16,
                  color: cellP > 0.5 ? theme.success : theme.subtext,
                  opacity: 0.4 + cellP * 0.6,
                  transform: `scale(${0.82 + cellP * 0.18})`,
                }}
              >
                {`0x${(i * 37 + 12).toString(16).toUpperCase()}`}
              </div>
            );
          })}
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 835,
            transform: "translateX(-50%)",
            ...mono,
            fontSize: 22,
            color: theme.success,
            opacity: enter,
            whiteSpace: "nowrap",
          }}
        >
          БАЙТЫ ДАННЫХ · НА МЕСТЕ
        </div>

        {/* Directory entry - crossed out */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 155,
            top: 920,
            width: 310,
            height: 88,
            borderRadius: 22,
            background: `${theme.danger}14`,
            border: `3px solid ${theme.danger}66`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            opacity: enter,
            transform: `scale(${1 - nameP * 0.15})`,
          }}
        >
          <span
            style={{
              ...mono,
              fontSize: 28,
              color: theme.danger,
              textDecoration: "line-through",
              opacity: 0.4 + nameP * 0.6,
            }}
          >
            photo.jpg → inode 7843
          </span>
          <IconGlyph name="x" size={28} color={theme.danger} strokeWidth={2.5} />
        </div>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 1030,
            transform: "translateX(-50%)",
            ...mono,
            fontSize: 22,
            color: theme.danger,
            opacity: enter,
          }}
        >
          КАТАЛОГ · ИМЯ СНЯТО
        </div>
        <PulseRing x={W / 2} y={560} triggerFrame={impactLocal} tone="success" size={160} />
      </>
    );
  }

  if (phase === "overwrite") {
    const writeP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 11, mass: 0.7 } });
    return (
      <>
        {header}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 390,
            transform: "translateX(-50%)",
            ...mono,
            fontSize: 32,
            color: theme.danger,
            opacity: enter,
            textAlign: "center",
          }}
        >
          <IconGlyph name="hard-drive" size={48} color={theme.danger} strokeWidth={1.8} />
          {" "}ДИСК · ПЕРЕЗАПИСАН
        </div>

        {/* Data blocks being overwritten */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 280,
            top: 510,
            width: 560,
            height: 100,
            display: "flex",
            gap: 8,
            justifyContent: "center",
            opacity: enter,
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => {
            const overwritten = writeP > i * 0.1;
            return (
              <div
                key={i}
                style={{
                  width: 58,
                  height: 72,
                  borderRadius: 14,
                  border: `3px solid ${overwritten ? theme.danger : theme.success}${overwritten ? "CC" : "44"}`,
                  background: `${overwritten ? theme.danger : theme.success}${overwritten ? "33" : "0A"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: theme.mono,
                  fontSize: 16,
                  color: overwritten ? theme.danger : theme.subtext,
                  transform: `scale(${0.82 + (overwritten ? 1 : 0.2) * 0.18})`,
                }}
              >
                {overwritten ? "××" : `0x${(i * 37 + 12).toString(16).toUpperCase()}`}
              </div>
            );
          })}
        </div>

        {/* New data indicator */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 650,
            transform: `translateX(-50%) scale(${0.7 + writeP * 0.3})`,
            padding: "18px 38px",
            borderRadius: 22,
            background: `${theme.warning}18`,
            border: `3px solid ${theme.warning}AA`,
            color: theme.warning,
            fontFamily: theme.mono,
            fontSize: 32,
            fontWeight: 800,
            whiteSpace: "nowrap",
            opacity: enter * writeP,
            boxShadow: `0 0 36px ${theme.warning}22`,
          }}
        >
          НОВЫЕ ДАННЫЕ ЗАПИСАНЫ ПОВЕРХ
        </div>

        {/* Recovery badge */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 810,
            transform: "translateX(-50%)",
            ...mono,
            fontSize: 30,
            color: theme.danger,
            opacity: enter * writeP,
          }}
        >
          ВОССТАНОВЛЕНИЕ НЕВОЗМОЖНО
        </div>
        <PulseRing x={W / 2} y={560} triggerFrame={impactLocal} tone="danger" size={170} />
      </>
    );
  }

  if (phase === "trim") {
    const trimP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 10, mass: 0.65 } });
    return (
      <>
        {header}
        {/* SSD controller */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 175,
            top: 370,
            width: 350,
            height: 110,
            borderRadius: 24,
            background: `${theme.panel}E8`,
            border: `3px solid ${theme.accent2}88`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            opacity: enter,
            boxShadow: `0 0 32px ${theme.accent2}22`,
          }}
        >
          <IconGlyph name="cpu" size={42} color={theme.accent2} strokeWidth={1.8} />
          <div>
            <div style={{ ...mono, fontSize: 28, color: theme.accent2 }}>SSD КОНТРОЛЛЕР</div>
            <div style={{ ...mono, fontSize: 18, color: theme.subtext }}>FTL · wear leveling</div>
          </div>
        </div>

        {/* Flash blocks */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 280,
            top: 530,
            width: 560,
            height: 100,
            display: "flex",
            gap: 8,
            justifyContent: "center",
            opacity: enter,
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => {
            const erased = trimP > i * 0.1;
            return (
              <div
                key={i}
                style={{
                  width: 58,
                  height: 72,
                  borderRadius: 14,
                  border: `3px solid ${erased ? theme.danger : theme.success}${erased ? "CC" : "44"}`,
                  background: `${erased ? theme.danger : theme.success}${erased ? "33" : "0A"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: theme.mono,
                  fontSize: 16,
                  color: erased ? theme.danger : theme.subtext,
                }}
              >
                {erased ? "∅" : `0x${(i * 37 + 12).toString(16).toUpperCase()}`}
              </div>
            );
          })}
        </div>

        {/* TRIM command */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 670,
            transform: `translateX(-50%) scale(${0.7 + trimP * 0.3})`,
            padding: "18px 38px",
            borderRadius: 22,
            background: `${theme.danger}18`,
            border: `3px solid ${theme.danger}AA`,
            color: theme.danger,
            fontFamily: theme.mono,
            fontSize: 32,
            fontWeight: 800,
            whiteSpace: "nowrap",
            opacity: enter * trimP,
            boxShadow: `0 0 36px ${theme.danger}22`,
          }}
        >
          DISCARD · БЛОКИ СТИРАЮТСЯ
        </div>

        {/* Badge */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 830,
            transform: "translateX(-50%)",
            ...mono,
            fontSize: 30,
            color: theme.danger,
            opacity: enter * trimP,
          }}
        >
          ФИЗИЧЕСКОЕ СТИРАНИЕ · ОКНО ЗАКРЫТО
        </div>
        <PulseRing x={W / 2} y={580} triggerFrame={impactLocal} tone="danger" size={170} />
      </>
    );
  }

  if (phase === "cloud") {
    const cloudP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
    return (
      <>
        {header}
        {/* Cloud bucket */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 400,
            transform: `translateX(-50%) scale(${0.7 + cloudP * 0.3})`,
            opacity: enter * cloudP,
            textAlign: "center",
          }}
        >
          <IconGlyph name="cloud" size={82} color={theme.success} strokeWidth={1.6} />
          <div style={{ ...mono, fontSize: 32, color: theme.success, marginTop: 16 }}>КОРЗИНА</div>
        </div>

        {/* Retention badge */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 620,
            transform: `translateX(-50%) scale(${0.7 + cloudP * 0.3})`,
            padding: "18px 38px",
            borderRadius: 22,
            background: `${theme.success}18`,
            border: `3px solid ${theme.success}AA`,
            color: theme.success,
            fontFamily: theme.mono,
            fontSize: 32,
            fontWeight: 800,
            whiteSpace: "nowrap",
            opacity: enter * cloudP,
            boxShadow: `0 0 36px ${theme.success}22`,
          }}
        >
          30–60 ДНЕЙ
        </div>

        {/* Status */}
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: 800,
            transform: "translateX(-50%)",
            ...mono,
            fontSize: 28,
            color: theme.success,
            opacity: enter * cloudP,
          }}
        >
          ВОССТАНОВЛЕНИЕ ВОЗМОЖНО
        </div>
        <PulseRing x={W / 2} y={510} triggerFrame={impactLocal} tone="success" size={180} />
      </>
    );
  }

  // recovered
  const recP = spring({ frame: Math.max(0, local - impactLocal), fps, config: { damping: 12, mass: 0.7 } });
  return (
    <>
      {header}
      {/* File icon recovered */}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 420,
          transform: `translateX(-50%) scale(${0.7 + recP * 0.3})`,
          opacity: enter * recP,
          textAlign: "center",
        }}
      >
        <IconGlyph name="file-check" size={82} color={theme.success} strokeWidth={1.6} />
        <div style={{ ...mono, fontSize: 32, color: theme.success, marginTop: 16 }}>photo.jpg</div>
      </div>

      {/* Data blocks restored */}
      <div
        style={{
          position: "absolute",
          left: W / 2 - 280,
          top: 620,
          width: 560,
          height: 100,
          display: "flex",
          gap: 8,
          justifyContent: "center",
          opacity: enter * recP,
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 58,
              height: 72,
              borderRadius: 14,
              border: `3px solid ${theme.success}CC`,
              background: `${theme.success}22`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: theme.mono,
              fontSize: 16,
              color: theme.success,
            }}
          >
            {`0x${(i * 37 + 12).toString(16).toUpperCase()}`}
          </div>
        ))}
      </div>

      {/* Success badge */}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: 780,
          transform: `translateX(-50%) scale(${0.7 + recP * 0.3})`,
          padding: "18px 38px",
          borderRadius: 22,
          background: `${theme.success}18`,
          border: `3px solid ${theme.success}AA`,
          color: theme.success,
          fontFamily: theme.mono,
          fontSize: 32,
          fontWeight: 800,
          whiteSpace: "nowrap",
          opacity: enter * recP,
          boxShadow: `0 0 36px ${theme.success}22`,
        }}
      >
        ФАЙЛ ВОССТАНОВЛЕН
      </div>
      <PulseRing x={W / 2} y={510} triggerFrame={impactLocal} tone="success" size={180} />
    </>
  );
};

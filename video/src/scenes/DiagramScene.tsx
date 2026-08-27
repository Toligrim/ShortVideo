import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, theme } from "../lib/theme";
import { wordFrame } from "../lib/timeline";
import type { DiagramScene as DiagramProps, Word } from "../lib/types";
import { NodeBox } from "../primitives/NodeBox";
import { PacketDot } from "../primitives/PacketDot";
import { Badge } from "../primitives/Badge";
import { IconGlyph } from "../primitives/IconGlyph";
import { PulseRing } from "../lib/Motion";
import { SceneHeading } from "./SceneHeading";

/** Канал между узлами: open — дырявый красный провод (перехват), encrypted — светящийся туннель с замком. */
const TunnelChannel: React.FC<{ top: number; bottom: number; kind: "open" | "encrypted" }> = ({
  top,
  bottom,
  kind,
}) => {
  const frame = useCurrentFrame();
  const color = kind === "encrypted" ? theme.success : theme.danger;
  const midY = (top + bottom) / 2;
  const pulse = 0.5 + 0.5 * Math.sin(frame / 14);
  return (
    <>
      {kind === "encrypted" ? (
        <div
          style={{
            position: "absolute",
            left: layout.width / 2 - 17,
            top,
            width: 34,
            height: bottom - top,
            borderRadius: 17,
            background: `linear-gradient(180deg, ${color}00, ${color}33, ${color}00)`,
            border: `2px solid ${color}99`,
            boxShadow: `0 0 ${28 + 18 * pulse}px ${color}55`,
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            left: layout.width / 2 - 3,
            top,
            width: 6,
            height: bottom - top,
            background: `repeating-linear-gradient(180deg, ${color}AA 0 16px, transparent 16px 30px)`,
            borderRadius: 3,
            opacity: 0.55 + 0.25 * pulse,
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: layout.width / 2,
          top: midY,
          transform: `translate(-50%, -50%) scale(${kind === "encrypted" ? 1 + 0.07 * pulse : 1})`,
          background: theme.panel,
          borderRadius: "50%",
          padding: 14,
          border: `3px solid ${color}`,
          boxShadow: `0 0 ${24 + 20 * pulse}px ${color}66`,
        }}
      >
        <IconGlyph name={kind === "encrypted" ? "lock-keyhole" : "lock-open"} size={42} color={color} strokeWidth={1.8} />
      </div>
    </>
  );
};

/** Бейдж тайного числа/ключа рядом с узлом: не летит, дышит на месте. */
const SecretBadge: React.FC<{ label: string; x: number; y: number; side: number; enterFrame: number }> = ({
  label,
  x,
  y,
  side,
  enterFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - enterFrame, fps, config: { damping: 14 } });
  const breathe = 1 + 0.045 * Math.sin(frame / 15);
  const bx = x + side * 300;
  return (
    <div
      style={{
        position: "absolute",
        left: bx,
        top: y,
        transform: `translate(-50%, -50%) scale(${enter * breathe})`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: `${theme.warning}1A`,
        border: `2px solid ${theme.warning}`,
        borderRadius: 999,
        padding: "12px 22px",
        boxShadow: `0 0 30px ${theme.warning}33`,
        opacity: enter,
        whiteSpace: "nowrap",
      }}
    >
      <IconGlyph name="lock-keyhole" size={30} color={theme.warning} strokeWidth={2} />
      <span style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 26, color: theme.text }}>{label}</span>
    </div>
  );
};

const PACKET_FLIGHT = 26; // кадров на перелёт

const geometry = (scene: DiagramProps) => {
  const top = layout.safeTop + (scene.heading ? 180 : 60);
  // при бейдже state низ поднимается, чтобы бейдж не наезжал на караоке
  const bottom = layout.safeBottom - (scene.state ? 260 : 140);
  const n = scene.nodes.length;
  const positions = new Map(
    scene.nodes.map((node, i) => [
      node.id,
      { x: layout.width / 2, y: n === 1 ? (top + bottom) / 2 : top + ((bottom - top) * i) / (n - 1) },
    ])
  );
  return { top, bottom, positions };
};

const schedule = (scene: DiagramProps, words: Word[], frames: number) => {
  const usable = frames - 40;
  return (scene.packets ?? []).map((p, i, arr) => {
    const anchored = p.onWord ? wordFrame(words, p.onWord) : null;
    const start = anchored ?? Math.round(20 + (usable * i) / Math.max(arr.length, 1));
    return { ...p, start, end: start + PACKET_FLIGHT };
  });
};

/** Звуковые события сцены: вуш на вылет пакета, поп на прилёт, дзынь на бейдж. */
export const diagramSfx = (
  scene: DiagramProps,
  words: Word[],
  frames: number
): { frame: number; sound: string }[] => {
  const events = schedule(scene, words, frames).flatMap((p) => [
    { frame: p.start, sound: "whoosh" },
    { frame: p.end, sound: "pop" },
  ]);
  if (scene.state) {
    const anchored = scene.state.onWord ? wordFrame(words, scene.state.onWord) : null;
    events.push({ frame: anchored ?? Math.round(frames * 0.72), sound: "ding" });
  }
  return events;
};

/** Кадры-импакты сцены (прилёты пакетов + появление бейджа) — для тряски камеры. */
export const diagramImpacts = (scene: DiagramProps, words: Word[], frames: number): number[] => {
  const impacts = schedule(scene, words, frames).map((p) => p.end);
  if (scene.state) {
    const anchored = scene.state.onWord ? wordFrame(words, scene.state.onWord) : null;
    impacts.push(anchored ?? Math.round(frames * 0.72));
  }
  return impacts;
};

/** Диаграмма: узлы по вертикали, пакеты летят между ними, импакты пульсируют. */
export const DiagramScene: React.FC<{
  scene: DiagramProps;
  words: Word[];
  frames: number;
}> = ({ scene, words, frames }) => {
  const { top, bottom, positions } = geometry(scene);
  const packets = schedule(scene, words, frames);
  const n = scene.nodes.length;

  const stateAnchor = scene.state?.onWord ? wordFrame(words, scene.state.onWord) : null;
  const stateFrame = stateAnchor ?? Math.round(frames * 0.72);

  // прилёты по узлам → пульс узла и кольцо
  const arrivals = packets.map((p) => ({ node: p.to, frame: p.end, tone: p.tone }));

  return (
    <>
      {scene.heading ? <SceneHeading text={scene.heading} /> : null}
      {n >= 2 ? (
        scene.channel ? (
          <TunnelChannel top={top} bottom={bottom} kind={scene.channel} />
        ) : (
          <div
            style={{
              position: "absolute",
              left: layout.width / 2 - 3,
              top,
              width: 6,
              height: bottom - top,
              background:
                "repeating-linear-gradient(180deg, #2A3550 0 22px, transparent 22px 44px)",
              borderRadius: 3,
            }}
          />
        )
      ) : null}
      {arrivals.map((a, i) => {
        const pos = positions.get(a.node);
        if (!pos) return null;
        return (
          <PulseRing key={`ring${i}`} x={pos.x} y={pos.y} triggerFrame={a.frame} tone={a.tone} />
        );
      })}
      {scene.nodes.map((node, i) => {
        const pos = positions.get(node.id)!;
        return (
          <NodeBox
            key={node.id}
            label={node.label}
            icon={node.icon}
            tone={node.tone}
            x={pos.x}
            y={pos.y}
            enterFrame={4 + i * 6}
            floatSeed={i + 1}
            pulses={arrivals.filter((a) => a.node === node.id).map((a) => a.frame)}
          />
        );
      })}
      {scene.nodes.map((node, i) =>
        node.secret ? (
          <SecretBadge
            key={`secret-${node.id}`}
            label={node.secret}
            x={positions.get(node.id)!.x}
            y={positions.get(node.id)!.y}
            side={i % 2 === 0 ? -1 : 1}
            enterFrame={10 + i * 6}
          />
        ) : null
      )}
      {packets.map((p, i) => {
        const a = positions.get(p.from);
        const b = positions.get(p.to);
        if (!a || !b) return null;
        const dir = Math.sign(b.y - a.y) || 1;
        return (
          <PacketDot
            key={i}
            label={p.label}
            fromX={a.x}
            fromY={a.y + dir * 120}
            toX={b.x}
            toY={b.y - dir * 130}
            startFrame={p.start}
            endFrame={p.end}
            tone={p.tone}
            arc={(i % 2 === 0 ? 1 : -1) * 150}
          />
        );
      })}
      {scene.state ? (
        <>
          <PulseRing
            x={layout.width / 2}
            y={bottom - 80}
            triggerFrame={stateFrame}
            tone={scene.state.tone ?? "success"}
            size={320}
          />
          <Badge
            label={scene.state.label}
            tone={scene.state.tone ?? "success"}
            x={layout.width / 2}
            y={bottom - 80}
            enterFrame={stateFrame}
          />
        </>
      ) : null}
    </>
  );
};

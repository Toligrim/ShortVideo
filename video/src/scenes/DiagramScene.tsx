import React from "react";
import { layout } from "../lib/theme";
import { wordFrame } from "../lib/timeline";
import type { DiagramScene as DiagramProps, Word } from "../lib/types";
import { NodeBox } from "../primitives/NodeBox";
import { PacketDot } from "../primitives/PacketDot";
import { Badge } from "../primitives/Badge";
import { PulseRing } from "../lib/Motion";
import { SceneHeading } from "./SceneHeading";

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
          />
        );
      })}
      {scene.state ? (
        <>
          <PulseRing
            x={layout.width / 2}
            y={bottom + 130}
            triggerFrame={stateFrame}
            tone={scene.state.tone ?? "success"}
            size={320}
          />
          <Badge
            label={scene.state.label}
            tone={scene.state.tone ?? "success"}
            x={layout.width / 2}
            y={bottom + 130}
            enterFrame={stateFrame}
          />
        </>
      ) : null}
    </>
  );
};

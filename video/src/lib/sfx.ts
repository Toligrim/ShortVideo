import type { Scene, SceneMeta } from "./types";
import { diagramSfx } from "../scenes/DiagramScene";
import { storySfx } from "../scenes/StoryScene";

export interface SfxEvent {
  frame: number;
  sound: string; // имя файла в public/sfx без расширения
}

export const SFX_VOLUME = 0.38;

/** Звуковые события сцены — движок вешает их сам, сценарию думать не нужно. */
export const sceneSfx = (scene: Scene, meta: SceneMeta, frames: number): SfxEvent[] => {
  switch (scene.type) {
    case "diagram":
      return diagramSfx(scene, meta.words, frames);
    case "story":
      return storySfx(scene, meta.words, frames);
    case "outro":
      // дзынь на появлении CTA (синхронно с OutroScene.ctaFrom)
      return scene.cta ? [{ frame: Math.min(Math.round(frames * 0.55), frames - 30), sound: "ding" }] : [];
    default:
      return [];
  }
};

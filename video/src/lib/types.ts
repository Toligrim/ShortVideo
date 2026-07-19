import type { Tone } from "./theme";

export type Narration = string | Record<string, string>;

export interface HookScene {
  type: "hook";
  narration: Narration;
  title: string;
  subtitle?: string;
}

export interface DiagramNode {
  id: string;
  label: string;
  icon?: string; // имя иконки lucide в kebab-case: "smartphone", "server", "skull"
  tone?: Tone;
}

export interface DiagramPacket {
  label: string;
  from: string; // node id
  to: string;
  tone?: Tone;
  onWord?: string; // якорь: пакет стартует на этом слове реплики
}

export interface DiagramScene {
  type: "diagram";
  narration: Narration;
  heading?: string;
  nodes: DiagramNode[];
  packets?: DiagramPacket[];
  state?: { label: string; tone?: Tone; onWord?: string }; // бейдж итога
}

export interface TerminalCommand {
  cmd: string;
  output?: string[];
}

export interface TerminalScene {
  type: "terminal";
  narration: Narration;
  heading?: string;
  commands: TerminalCommand[];
}

export interface CodeScene {
  type: "code";
  narration: Narration;
  heading?: string;
  code: string;
  highlight?: number[]; // номера строк с 1
}

export interface OutroScene {
  type: "outro";
  narration: Narration;
  title: string;
  bullets?: string[];
  cta?: string;
}

export interface StoryBeat {
  visual: "browser-click" | "devices-meet" | "handshake" | "title-slam" | "password-leak";
  onWord?: string; // бит начинается на этом слове реплики
  params?: Record<string, unknown>;
}

export interface StoryScene {
  type: "story";
  narration: Narration;
  heading?: string;
  beats: StoryBeat[];
}

export type Scene = HookScene | DiagramScene | TerminalScene | CodeScene | OutroScene | StoryScene;

export interface Episode {
  id: string;
  title: string;
  scenes: Scene[];
}

export interface Word {
  text: string;
  start: number; // сек от начала аудио сцены
  end: number;
}

export interface SceneMeta {
  index: number;
  duration: number; // сек, длительность mp3
  words: Word[];
}

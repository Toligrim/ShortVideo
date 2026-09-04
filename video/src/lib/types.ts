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
  secret?: string; // тайное число/ключ, который узел держит при себе (не летит пакетом)
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
  channel?: "open" | "encrypted"; // канал между узлами: дырявый провод / светящийся туннель
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
  language?: string; // bash | python | json | yaml | c | typescript (по умолчанию bash)
}

export interface OutroScene {
  type: "outro";
  narration: Narration;
  title: string;
  bullets?: string[];
  cta?: string;
}

export interface StoryBeat {
  visual:
    | "browser-click"
    | "devices-meet"
    | "handshake"
    | "title-slam"
    | "spell-distance"
    | "password-leak"
    | "hash-table"
    | "minimal-perfect-hash"
    | "collision-compare"
    | "heap-graph"
    | "gc-sweep"
    | "recursion-call"
    | "stack-grow"
    | "stack-compare"
    | "medal-mint"
    | "ancient-code"
    | "verdict-scan"
    | "paradox-box"
    | "proof-sequence"
    | "fft-wave"
    | "orbit-fft-groups"
    | "qr-repair"
    | "qr-phone-scan"
    | "redundancy-note"
    | "hll-estimate"
    | "bloom-bitarray"
    | "bloom-probe"
    | "xor-filter"
    | "coin-pair"
    | "bit-extractor"
    | "rule-110"
    | "glider-collision"
    | "debruijn-cycle"
    | "hamming-word"
    | "hamming-syndrome"
    | "gps-relativity"
    | "gps-pseudorange"
    | "cuckoo-table"
    | "cuckoo-cycle"
    | "cuckoo-stash"
    | "secret-sharing"
    | "mt-recovery"
    | "reservoir-sampling"
    | "inverse-sqrt-bits"
    | "merkle-tree"
    | "stable-matching"
    | "busy-beaver"
    | "union-find"
      | "shuffle-deck"
      | "skip-list"
    | "timsort-runs"
    | "counter"
    | "mincut-contract"
    | "backtrack-tree"
    | "thompson-parallel"
    | "implication-graph"
    | "scc-verdict"
    | "power-of-two-choices"
    | "pollard-rho"
      | "count-min-sketch"
      | "sudoku-exact-cover"
      | "amdahl-speedup"
      | "bbp-digit"
      | "bbp-extract"
      | "median-of-medians"
      | "gray-code"
      | "utf8-boundary"
      | "consistent-hash-ring"
      | "trie-growth"
      | "suffix-automaton"
      | "bwt-matrix"
      | "bwt-invert"
      | "quic-migration"
    | "hilbert-curve"
    | "elias-fano"
    | "raft-quorum"
    | "ariane-overflow"
    | "ai-hallucination"
    | "password-hash"
    | "capacitive-touch"
    | "proximity-sensor"
    | "digital-signature"
    | "bgp-reroute"
    | "usb-pd-negotiation"
    | "convolution-stencil"
  | "wifi-airtime"
  | "wifi-signal-vs-airtime"
  | "bluetooth-hopping"
  | "file-delete-recovery"
  | "tls-handshake"
| "block-chain"
    | "mempool-rbf"
    | "face-id-depth"
    | "diffusion-denoise"
    | "battery-sei-growth"
    | "battery-charge-limit"
    | "cold-battery-voltage-drop"
   | "incognito-session"
  | "context-window"
  | "attention-cost"
  | "wallet-copy"
  | "multi-frame-stack"
  | "mail-queue"
  | "mail-server-handoff"
  | "totp-window"
  | "rolling-shutter"
  | "operational-transform"
  | "microwave-dielectric"
  | "magnetron-cavity"
  | "hotword-spotting"
  | "halving-schedule"
  | "traffic-segment"
  | "reward-check";
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

import React from "react";
import {
  AbsoluteFill,
  Audio,
  Composition,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { FPS, layout, theme } from "./lib/theme";
import { buildTimeline, sceneFrames, totalFrames } from "./lib/timeline";
import { fakeMeta } from "./lib/fakeWords";
import { sceneSfx, SFX_VOLUME } from "./lib/sfx";
import type { Episode, Scene, SceneMeta } from "./lib/types";
import { Karaoke } from "./lib/Karaoke";
import { Particles, SceneContainer } from "./lib/Motion";
import { HookScene } from "./scenes/HookScene";
import { DiagramScene, diagramImpacts } from "./scenes/DiagramScene";
import { StoryScene, storyImpacts } from "./scenes/StoryScene";
import { TerminalScene } from "./scenes/TerminalScene";
import { CodeScene } from "./scenes/CodeScene";
import { OutroScene } from "./scenes/OutroScene";

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {/* дрейфующая сетка */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(#16202F55 1px, transparent 1px), linear-gradient(90deg, #16202F55 1px, transparent 1px)",
          backgroundSize: "108px 108px",
          backgroundPosition: `${-frame * 0.25}px ${-frame * 0.45}px`,
        }}
      />
      {/* медленно дышащее пятно света */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% 42% at ${50 + 8 * Math.sin(frame / 90)}% ${38 + 5 * Math.cos(frame / 70)}%, ${theme.accent}0E 0%, transparent 70%)`,
        }}
      />
      <Particles count={22} />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 90% 60% at 50% 40%, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

const SceneRenderer: React.FC<{ scene: Scene; meta: SceneMeta; frames: number }> = ({
  scene,
  meta,
  frames,
}) => {
  switch (scene.type) {
    case "hook":
      return <HookScene scene={scene} />;
    case "diagram":
      return <DiagramScene scene={scene} words={meta.words} frames={frames} />;
    case "story":
      return <StoryScene scene={scene} words={meta.words} frames={frames} />;
    case "terminal":
      return <TerminalScene scene={scene} />;
    case "code":
      return <CodeScene scene={scene} />;
    case "outro":
      return <OutroScene scene={scene} frames={frames} />;
    default:
      return null;
  }
};

const sceneImpacts = (scene: Scene, meta: SceneMeta, frames: number): number[] =>
  scene.type === "diagram"
    ? diagramImpacts(scene, meta.words, frames)
    : scene.type === "story"
      ? storyImpacts(scene, meta.words, frames)
      : [];

interface EpisodeProps extends Record<string, unknown> {
  episodeId: string;
  episode: Episode | null;
  metas: SceneMeta[];
}

const EpisodeComp: React.FC<EpisodeProps> = ({ episodeId, episode, metas }) => {
  if (!episode) return <Background />;
  const slots = buildTimeline(metas);
  return (
    <AbsoluteFill style={{ width: layout.width, height: layout.height }}>
      <Background />
      {episode.scenes.map((scene, i) => {
        const impacts = sceneImpacts(scene, metas[i], slots[i].frames);
        return (
          <Sequence
            key={i}
            from={slots[i].from}
            durationInFrames={slots[i].frames}
            name={`scene-${i}-${scene.type}`}
          >
            <Sequence from={slots[i].audioDelay} name={`audio-${i}`}>
              <Audio src={staticFile(`episodes/${episodeId}/audio/scene-${i}.mp3`)} />
            </Sequence>
            {sceneSfx(scene, metas[i], slots[i].frames).map((e, k) => (
              <Sequence key={`sfx-${k}`} from={Math.max(0, e.frame)} name={`sfx-${e.sound}`}>
                <Audio src={staticFile(`sfx/${e.sound}.wav`)} volume={SFX_VOLUME} />
              </Sequence>
            ))}
            <SceneContainer frames={slots[i].frames} impacts={impacts}>
              <SceneRenderer scene={scene} meta={metas[i]} frames={slots[i].frames} />
            </SceneContainer>
            {scene.type !== "hook" ? <Karaoke words={metas[i].words} /> : null}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

interface PreviewProps extends Record<string, unknown> {
  scene: Scene | null;
}

/** Кузница: рендер одной сцены с синтетическими таймингами — проверка визуала без TTS. */
const PreviewComp: React.FC<PreviewProps> = ({ scene }) => {
  if (!scene) return <Background />;
  const meta = fakeMeta(scene.narration);
  const frames = sceneFrames(meta);
  return (
    <AbsoluteFill style={{ width: layout.width, height: layout.height }}>
      <Background />
      <SceneContainer frames={frames} impacts={sceneImpacts(scene, meta, frames)}>
        <SceneRenderer scene={scene} meta={meta} frames={frames} />
      </SceneContainer>
      {scene.type !== "hook" ? <Karaoke words={meta.words} /> : null}
    </AbsoluteFill>
  );
};

export const Root: React.FC = () => (
  <>
  <Composition
    id="Preview"
    component={PreviewComp}
    width={layout.width}
    height={layout.height}
    fps={FPS}
    durationInFrames={300}
    defaultProps={{ scene: null } as PreviewProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: props.scene ? sceneFrames(fakeMeta(props.scene.narration)) : 300,
    })}
  />
  <Composition
    id="Episode"
    component={EpisodeComp}
    width={layout.width}
    height={layout.height}
    fps={FPS}
    durationInFrames={300}
    defaultProps={{ episodeId: "tcp-handshake", episode: null, metas: [] } as EpisodeProps}
    calculateMetadata={async ({ props }) => {
      const [episode, metas] = await Promise.all([
        fetch(staticFile(`episodes/${props.episodeId}/script.json`)).then((r) => r.json()),
        fetch(staticFile(`episodes/${props.episodeId}/meta.json`)).then((r) => r.json()),
      ]);
      return {
        durationInFrames: totalFrames(metas),
        props: { ...props, episode, metas },
      };
    }}
  />
  </>
);

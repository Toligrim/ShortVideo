import React from "react";
import { layout } from "../lib/theme";
import type { CodeScene as CodeProps } from "../lib/types";
import { CodePanel } from "../primitives/CodePanel";
import { Floaty } from "../lib/Motion";
import { SceneHeading } from "./SceneHeading";

export const CodeScene: React.FC<{ scene: CodeProps }> = ({ scene }) => (
  <>
    {scene.heading ? <SceneHeading text={scene.heading} /> : null}
    <Floaty seed={11} amp={6}>
      <CodePanel
        code={scene.code}
        highlight={scene.highlight}
        language={scene.language}
        x={layout.width / 2}
        y={layout.safeTop + (scene.heading ? 300 : 180)}
        startFrame={12}
      />
    </Floaty>
  </>
);

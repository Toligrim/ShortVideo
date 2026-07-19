import React from "react";
import { layout } from "../lib/theme";
import type { TerminalScene as TerminalProps } from "../lib/types";
import { TerminalWindow } from "../primitives/TerminalWindow";
import { Floaty } from "../lib/Motion";
import { SceneHeading } from "./SceneHeading";

export const TerminalScene: React.FC<{ scene: TerminalProps }> = ({ scene }) => (
  <>
    {scene.heading ? <SceneHeading text={scene.heading} /> : null}
    <Floaty seed={7} amp={6}>
      <TerminalWindow
        commands={scene.commands}
        x={layout.width / 2}
        y={layout.safeTop + (scene.heading ? 300 : 180)}
        startFrame={12}
      />
    </Floaty>
  </>
);

import type { SirenProject } from '@sirenpm/core';
import type { CliContext, DeepReadonly } from './context';

export interface ProjectBuildArtifact {
  ir: SirenProject;
}

export function runProjectBuild(ctx: DeepReadonly<CliContext>): ProjectBuildArtifact {
  if (!ctx.builder) {
    throw new Error('Invariant: runProjectBuild called without a builder on context');
  }

  return {
    // FIXME: Something wrong with types
    // Debugger shows `ctx.builder` is of shape `{builder: _SirenBuilder, changes: Array}`
    // but TypeScript is saying that `ctx.builder` ought to be the `SirenBuilder` itself.
    ir: ctx.builder.build(),
  };
}

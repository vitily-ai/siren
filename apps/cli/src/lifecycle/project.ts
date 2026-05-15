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
    ir: ctx.builder.build(),
  };
}

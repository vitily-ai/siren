import { SirenBuilder } from '@sirenpm/core';
import type { CliContext, DeepReadonly } from './context';

export interface BuildingArtifact {
  builder: SirenBuilder;
}

export function runBuilderConstruction(ctx: DeepReadonly<CliContext>): BuildingArtifact {
  return {
    builder: SirenBuilder.fromDocuments(ctx.sirenDocuments),
  };
}

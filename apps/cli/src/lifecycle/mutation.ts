import type { PatchResult, SirenBuilder } from '@sirenpm/core';
import type { CliContext, DeepReadonly } from './context';

/**
 * Pure builder transform. Returns the core PatchResult (builder + entry delta)
 * so the lifecycle can route changes back to source documents.
 */
export type BuilderMutate = (builder: SirenBuilder) => PatchResult;

export interface MutationArtifact {
  patchResult?: PatchResult;
}

export function runBuilderMutation(
  ctx: DeepReadonly<CliContext>,
  mutate?: BuilderMutate,
): MutationArtifact {
  if (mutate && ctx.builder) {
    return { patchResult: mutate(ctx.builder as SirenBuilder) };
  }

  return {};
}

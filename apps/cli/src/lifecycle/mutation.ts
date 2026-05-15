import type { SirenBuilder } from '@sirenpm/core';
import type { CliContext, DeepReadonly } from './context';

/**
 * Pure builder transform. Receives the current builder, returns the next builder.
 *
 * Implementations should use `SirenBuilder.patch` (or its convenience layers like
 * `withResource` / `patchResource`) to compose copy-on-write changes. The lifecycle
 * assigns the returned builder back onto the context before the project-build phase.
 */
export type BuilderMutate = (builder: SirenBuilder) => SirenBuilder;

export interface MutationArtifact {
  builder?: SirenBuilder;
}

export function runBuilderMutation(
  ctx: DeepReadonly<CliContext>,
  mutate?: BuilderMutate,
): MutationArtifact {
  if (mutate && ctx.builder) {
    return { builder: mutate(ctx.builder as SirenBuilder) };
  }

  return {};
}

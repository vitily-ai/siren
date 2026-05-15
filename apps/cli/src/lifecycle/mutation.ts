import type { SirenBuilder } from '@sirenpm/core';
import type { CliContext } from './context';

/**
 * Pure builder transform. Receives the current builder, returns the next builder.
 *
 * Implementations should use `SirenBuilder.patch` (or its convenience layers like
 * `withResource` / `patchResource`) to compose copy-on-write changes. The lifecycle
 * assigns the returned builder back onto the context before the project-build phase.
 */
export type BuilderMutate = (builder: SirenBuilder) => SirenBuilder;

export function runBuilderMutation(ctx: CliContext, mutate?: BuilderMutate): void {
  if (mutate && ctx.builder) {
    ctx.builder = mutate(ctx.builder);
  }

  ctx.phasesRun.add('builder-mutation');
}

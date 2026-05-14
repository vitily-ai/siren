import type { CliContext } from './context';

export type BuilderMutation = (ctx: CliContext) => void | Promise<void>;

export async function runBuilderMutation(ctx: CliContext, mutate?: BuilderMutation): Promise<void> {
  if (mutate) {
    await mutate(ctx);
  }

  ctx.phasesRun.add('builder-mutation');
}

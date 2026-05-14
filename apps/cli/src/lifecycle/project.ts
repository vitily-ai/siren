import type { CliContext } from './context';

export function runProjectBuild(ctx: CliContext): void {
  if (ctx.builder) {
    const ir = ctx.builder.build();
    ctx.ir = ir;
  }

  ctx.phasesRun.add('project-build');
}

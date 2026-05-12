import type { CliContext } from './context';

export function runProjectBuild(ctx: CliContext): void {
  if (ctx.builder) {
    const ir = ctx.builder.build();
    ctx.ir = ir;
    ctx.resources = [...ir.resources];
    ctx.milestones = ir.getMilestoneIds();
  }

  ctx.phasesRun.add('project-build');
}

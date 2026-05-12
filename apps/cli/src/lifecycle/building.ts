import { SirenBuilder } from '@sirenpm/core';
import type { CliContext } from './context';

export function runBuilderConstruction(ctx: CliContext): void {
  if (ctx.parseResult?.tree) {
    ctx.builder = SirenBuilder.fromDocuments(ctx.sirenDocuments);
  }

  ctx.phasesRun.add('builder-construction');
}

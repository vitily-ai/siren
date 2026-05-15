import type { SirenProject } from '@sirenpm/core';
import type { CliContext, QueryArtifact } from './context';

/**
 * Pure read-only command operation. Receives the post-mutation `SirenProject`
 * (or pre-mutation when no mutate hook was supplied) and returns an artifact
 * describing what to emit. The lifecycle owns stdout / stderr / exit-code
 * presentation; the query function MUST NOT call `console.*` itself.
 */
export type QueryFn = (project: SirenProject) => QueryArtifact | Promise<QueryArtifact>;

export async function runQuery(ctx: CliContext, query: QueryFn): Promise<void> {
  if (!ctx.ir) {
    // FIXME - these conditions should prevent lifecycle from even calling this function
    ctx.phasesRun.add('query');
    return;
  }

  try {
    ctx.query = await query(ctx.ir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.errors.push(message);
    ctx.aborted = true;
  }

  ctx.phasesRun.add('query');
}

import type { SirenProject } from '@sirenpm/core';
import type { CliContext, DeepReadonly, QueryArtifact } from './context';

export type QueryFn = (project: SirenProject) => QueryArtifact | Promise<QueryArtifact>;

export interface QueryPhaseArtifact {
  query?: QueryArtifact;
  errors: string[];
  aborted?: boolean;
}

export async function runQuery(
  ctx: DeepReadonly<CliContext>,
  query: QueryFn,
): Promise<QueryPhaseArtifact> {
  const errors: string[] = [];

  let queryResult: QueryArtifact | undefined;
  let aborted = false;

  if (!ctx.ir) {
    throw new Error('Invariant: runQuery called without an IR on context');
  }

  try {
    queryResult = await query(ctx.ir as SirenProject);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    aborted = true;
  }

  return { query: queryResult, errors, aborted };
}

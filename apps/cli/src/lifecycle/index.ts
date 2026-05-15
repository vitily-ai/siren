import { runBuilderConstruction } from './building';
import { type CliContext, createCliContext } from './context';
import { runDecoding } from './decoding';
import { runDiagnosticsAccumulation } from './diagnostics';
import { runDiscovery } from './discovery';
import { type BuilderMutate, runBuilderMutation } from './mutation';
import { runParsing } from './parsing';
import { presentDiagnostics, presentQuery } from './presentation';
import { runProjectBuild } from './project';
import { type QueryFn, runQuery } from './query';
import { runWrite } from './write';

export interface LifecycleHooks {
  /**
   * Pure builder transform. Triggers the write-back phase after the project
   * rebuilds successfully and diagnostics clear.
   */
  mutate?: BuilderMutate;
  /**
   * Pure read-only query against the (post-mutation) `SirenProject`. Returns a
   * `QueryArtifact` describing what to emit; the lifecycle owns presentation.
   */
  query?: QueryFn;
}

/**
 * Execute the full CLI lifecycle as a single linear pipeline:
 *
 *   discover -> parse -> decode -> build-builder -> [mutate?] -> build-project ->
 *   diagnostics -> present-diagnostics (stderr) -> [errors abort below] ->
 *   query -> write -> present-query (stdout)
 *
 * Commands never own discovery, IO, or presentation — they pass pure hooks
 * describing the data operation they want performed.
 */
export async function runLifecycle(cwd: string, hooks: LifecycleHooks = {}): Promise<CliContext> {
  const ctx = createCliContext(cwd);

  runDiscovery(ctx);
  await runParsing(ctx);
  runDecoding(ctx);
  runBuilderConstruction(ctx);
  runBuilderMutation(ctx, hooks.mutate);
  runProjectBuild(ctx);
  runDiagnosticsAccumulation(ctx);
  presentDiagnostics(ctx);

  if (hooks.query) {
    await runQuery(ctx, hooks.query);
  }

  if (hooks.mutate && !ctx.aborted && ctx.errors.length === 0 && ctx.builder) {
    runWrite(ctx);
  }

  presentQuery(ctx);

  return ctx;
}

export type { CliContext, QueryArtifact } from './context';
export type { BuilderMutate } from './mutation';
export type { QueryFn } from './query';

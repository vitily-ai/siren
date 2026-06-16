import * as path from 'node:path';
import type { ParsedDocument } from '@sirenpm/language';
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
import { runSourceBridge } from './source-bridge';
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
  /** Whether lifecycle was invoked in format mode. */
  format?: boolean;
  /** Whether to skip disk writes. */
  dryRun?: boolean;
  /** Whether to list changed files. */
  verbose?: boolean;
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
 *
 * It is the responsibility of this `runLifecycle` function to make modifications to the `CliContext`.
 * The phase functions it calls do not modify the context directly, but instead return artifacts
 * which `runLifecycle` applies to the context.
 * Phases use the `DeepReadonly<CliContext>` type to enforce this via the type system.
 */
export async function runLifecycle(cwd: string, hooks: LifecycleHooks = {}): Promise<CliContext> {
  const ctx = createCliContext(cwd);

  const discoveryArt = runDiscovery(ctx);
  ctx.files = discoveryArt.files;
  ctx.phasesRun.add('discovery');

  const parsingArt = await runParsing(ctx);
  ctx.sourceDocuments = parsingArt.sourceDocuments;
  ctx.parsedDocuments = parsingArt.parsedDocuments;
  ctx.format = hooks.format;
  ctx.dryRun = hooks.dryRun;
  ctx.verbose = hooks.verbose;
  ctx.phasesRun.add('parsing');

  const decodingArt = runDecoding(ctx.parsedDocuments);
  ctx.entries = decodingArt.entries;
  ctx.languageDiagnostics = decodingArt.languageDiagnostics;
  ctx.phasesRun.add('decoding');

  const buildingArt = runBuilderConstruction(ctx);
  ctx.builder = buildingArt.builder;
  ctx.phasesRun.add('builder-construction');

  const mutationArt = runBuilderMutation(ctx, hooks.mutate);
  if (mutationArt.patchResult) {
    ctx.builder = mutationArt.patchResult.builder;
    // Wire the bridge: route patch delta back to parsed documents
    const bridgeArt = runSourceBridge(ctx, mutationArt.patchResult.changes);
    ctx.errors.push(...bridgeArt.errors);
  }
  ctx.phasesRun.add('builder-mutation');

  const projectArt = runProjectBuild(ctx);
  ctx.ir = projectArt.ir;
  ctx.phasesRun.add('project-build');

  const diagnosticsArt = runDiagnosticsAccumulation(ctx);
  // Add to warnings, do not replace since earlier phases might have added to them (though currently none do)
  ctx.warnings.push(...diagnosticsArt.warnings);
  ctx.errors.push(...diagnosticsArt.errors);
  ctx.phasesRun.add('diagnostics');

  const presDiagArt = presentDiagnostics(ctx);
  if (presDiagArt.warningsFlushed !== undefined) ctx.warningsFlushed = presDiagArt.warningsFlushed;
  if (presDiagArt.errorsFlushed !== undefined) ctx.errorsFlushed = presDiagArt.errorsFlushed;
  ctx.phasesRun.add('diagnostics-presented');

  // Format phase: canonicalize every parsed document's source content and
  // signal all files for rewrite. Runs after diagnostics presentation (so
  // original-content diagnostics reach the user) and before the write gate
  // (so the rewrite signal is populated in time).
  if (ctx.format) {
    for (const parsed of ctx.parsedDocuments as ParsedDocument[]) {
      if (parsed.diagnostics.some((d) => d.severity === 'error')) continue;
      const before = parsed.source.content;
      const after = parsed.format();
      // TODO ugly string comparison
      // needs something less jank - like a hash or something
      if (after !== before) {
        const absPath = path.join(ctx.rootDir, parsed.source.name);
        (ctx.rewriteSignal as Set<string>).add(absPath);
      }
    }
    ctx.phasesRun.add('format');
  }

  if (hooks.query) {
    const queryArt = await runQuery(ctx, hooks.query);
    if (queryArt.query) ctx.query = queryArt.query;
    ctx.errors.push(...queryArt.errors);
    if (queryArt.aborted) ctx.aborted = queryArt.aborted;
    ctx.phasesRun.add('query');
  }

  if (ctx.rewriteSignal.size > 0 && !ctx.aborted && ctx.errors.length === 0) {
    runWrite(ctx);
    ctx.phasesRun.add('write');
  }

  const presQueryArt = presentQuery(ctx);
  if (presQueryArt.warningsFlushed !== undefined)
    ctx.warningsFlushed = presQueryArt.warningsFlushed;
  if (presQueryArt.errorsFlushed !== undefined) ctx.errorsFlushed = presQueryArt.errorsFlushed;
  ctx.phasesRun.add('query-presented');

  return ctx;
}

export type { CliContext, QueryArtifact } from './context';
export type { BuilderMutate } from './mutation';
export type { QueryFn } from './query';

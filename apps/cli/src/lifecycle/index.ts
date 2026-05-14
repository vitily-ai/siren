import { runBuilderConstruction } from './building';
import { type CliContext, createCliContext } from './context';
import { runDecoding } from './decoding';
import { runDiagnosticsAccumulation } from './diagnostics';
import { runDiscovery } from './discovery';
import { type BuilderMutation, runBuilderMutation } from './mutation';
import { runParsing } from './parsing';
import { runProjectBuild } from './project';

export async function runPrepareLifecycle(cwd: string): Promise<CliContext> {
  const ctx = createCliContext(cwd);

  runDiscovery(ctx);
  await runParsing(ctx);
  runDecoding(ctx);
  runBuilderConstruction(ctx);

  return ctx;
}

export async function runFinalizeLifecycle(
  ctx: CliContext,
  mutate?: BuilderMutation,
): Promise<CliContext> {
  await runBuilderMutation(ctx, mutate);
  runProjectBuild(ctx);
  runDiagnosticsAccumulation(ctx);

  return ctx;
}

export async function runLifecycle(cwd: string, mutate?: BuilderMutation): Promise<CliContext> {
  const ctx = await runPrepareLifecycle(cwd);
  await runFinalizeLifecycle(ctx, mutate);
  return ctx;
}

export type { CliContext } from './context';
export type { BuilderMutation } from './mutation';

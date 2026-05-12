import { runBuilderConstruction } from './building';
import { type CliContext, createCliContext } from './context';
import { runDecoding } from './decoding';
import { runDiagnosticsAccumulation } from './diagnostics';
import { runDiscovery } from './discovery';
import { runParsing } from './parsing';
import { runProjectBuild } from './project';

export async function runLifecycle(cwd: string): Promise<CliContext> {
  const ctx = createCliContext(cwd);

  runDiscovery(ctx);
  await runParsing(ctx);
  runDecoding(ctx);
  runBuilderConstruction(ctx);
  runProjectBuild(ctx);
  runDiagnosticsAccumulation(ctx);

  return ctx;
}

export type { CliContext } from './context';

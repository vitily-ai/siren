import { getCurrentContext, setCurrentContext } from './context-store';
import {
  type BuilderMutation,
  type CliContext,
  runFinalizeLifecycle,
  runPrepareLifecycle,
} from './lifecycle';

export type ProjectContext = CliContext;
export type ProjectMutation = BuilderMutation;

export function getLoadedContext(): ProjectContext | null {
  return getCurrentContext();
}

export async function loadProject(cwd: string): Promise<ProjectContext> {
  const ctx = await runPrepareLifecycle(cwd);
  setCurrentContext(ctx);
  return ctx;
}

export async function finalizeProject(mutate?: ProjectMutation): Promise<ProjectContext> {
  const ctx = getCurrentContext();
  if (!ctx) {
    throw new Error('Project context not loaded');
  }

  const alreadyFinalized = ctx.phasesRun.has('project-build') && ctx.phasesRun.has('diagnostics');
  if (alreadyFinalized) {
    if (mutate) {
      throw new Error('Project context already finalized; cannot apply a new mutation');
    }

    return ctx;
  }

  await runFinalizeLifecycle(ctx, mutate);
  return ctx;
}

import { getCurrentContext, setCurrentContext } from './context-store';
import { type CliContext, runLifecycle } from './lifecycle';

export type ProjectContext = CliContext;

export function getLoadedContext(): ProjectContext | null {
  return getCurrentContext();
}

export async function loadProject(cwd: string): Promise<ProjectContext> {
  const ctx = await runLifecycle(cwd);
  setCurrentContext(ctx);
  return ctx;
}

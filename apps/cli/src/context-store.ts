import type { CliContext } from './lifecycle/context';

let currentContext: CliContext | null = null;

export function setCurrentContext(ctx: CliContext): void {
  currentContext = ctx;
}

export function getCurrentContext(): CliContext | null {
  return currentContext;
}

export function resetCurrentContext(): void {
  currentContext = null;
}

import { describe, expect, it } from 'vitest';
import * as coreEntry from './index';
import { IRAssembly, IRContext } from './index';

describe('@sirenpm/core public surface (post-IRAssembly refactor)', () => {
  it('does not expose the legacy IRContext.fromResources construction path', () => {
    expect((IRContext as unknown as { fromResources?: unknown }).fromResources).toBeUndefined();
  });

  it('does not re-export the internal IR_CONTEXT_FACTORY symbol from the package entry', () => {
    expect(
      (coreEntry as unknown as { IR_CONTEXT_FACTORY?: unknown }).IR_CONTEXT_FACTORY,
    ).toBeUndefined();
  });

  it('exposes IRAssembly as the only documented IRContext construction path', () => {
    const assembly = IRAssembly.fromResources([]);
    expect(assembly.build()).toBeInstanceOf(IRContext);
  });

  it('removes legacy runtime surfaces per docs/adr/0002-core-irassembly-breaking-cleanup.md', () => {
    const entry = coreEntry as unknown as Record<string, unknown>;

    expect(entry.IRAssembly).toBeDefined();
    expect(entry.IRContext).toBeDefined();
    expect(entry.IR_CONTEXT_FACTORY).toBeUndefined();
    expect(entry.Document).toBeUndefined();
    expect(entry.Cycle).toBeUndefined();
    expect(entry.DependencyCycle).toBeUndefined();
  });

  it('does not expose mutable construction surface on IRContext instances', () => {
    const context = IRAssembly.fromResources([]).build();
    expect(Object.isFrozen(context)).toBe(true);
    expect('source' in (context as Record<string, unknown>)).toBe(false);
    expect('cycles' in (context as Record<string, unknown>)).toBe(false);
    expect('danglingDiagnostics' in (context as Record<string, unknown>)).toBe(false);
    expect('duplicateDiagnostics' in (context as Record<string, unknown>)).toBe(false);
  });
});

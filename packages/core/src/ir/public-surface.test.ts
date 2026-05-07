import { describe, expect, it } from 'vitest';
import * as coreEntry from './index';
import { SirenBuilder, SirenProject } from './index';

describe('@sirenpm/core public surface (post-SirenBuilder refactor)', () => {
  it('does not expose the legacy SirenProject.fromResources construction path', () => {
    expect((SirenProject as unknown as { fromResources?: unknown }).fromResources).toBeUndefined();
  });

  it('does not re-export the internal IR_CONTEXT_FACTORY symbol from the package entry', () => {
    expect(
      (coreEntry as unknown as { IR_CONTEXT_FACTORY?: unknown }).IR_CONTEXT_FACTORY,
    ).toBeUndefined();
  });

  it('exposes SirenBuilder as the only documented SirenProject construction path', () => {
    const assembly = SirenBuilder.fromResources([]);
    expect(assembly.build()).toBeInstanceOf(SirenProject);
  });

  it('removes legacy runtime surfaces per docs/adr/0002-core-irassembly-breaking-cleanup.md', () => {
    const entry = coreEntry as unknown as Record<string, unknown>;

    expect(entry.SirenBuilder).toBeDefined();
    expect(entry.SirenProject).toBeDefined();
    expect(entry.IRAssembly).toBeUndefined();
    expect(entry.IRContext).toBeUndefined();
    expect(entry.IR_CONTEXT_FACTORY).toBeUndefined();
    expect(entry.Document).toBeUndefined();
    expect(entry.Cycle).toBeUndefined();
    expect(entry.DependencyCycle).toBeUndefined();
  });

  it('does not expose mutable construction surface on SirenProject instances', () => {
    const context = SirenBuilder.fromResources([]).build();
    expect(Object.isFrozen(context)).toBe(true);
    expect('source' in (context as Record<string, unknown>)).toBe(false);
    expect('cycles' in (context as Record<string, unknown>)).toBe(false);
    expect('danglingDiagnostics' in (context as Record<string, unknown>)).toBe(false);
    expect('duplicateDiagnostics' in (context as Record<string, unknown>)).toBe(false);
  });
});

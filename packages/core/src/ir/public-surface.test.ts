import { describe, expect, it } from 'vitest';
import * as coreEntry from './index';
import { SirenBuilder, type SirenEntry, SirenProject } from './index';

function rangeOriginEntry(id: string, document: string): SirenEntry {
  return {
    type: 'task',
    id,
    attributes: [],
    origin: {
      kind: 'range',
      startByte: 0,
      endByte: 9,
      startRow: 0,
      endRow: 0,
      document,
    },
  };
}

function syntheticOriginMilestone(id: string, document: string): SirenEntry {
  return {
    type: 'milestone',
    id,
    attributes: [],
    origin: { kind: 'synthetic', document },
  };
}

function originView(entry: SirenEntry): Record<string, unknown> | undefined {
  return entry.origin as unknown as Record<string, unknown> | undefined;
}

describe('@sirenpm/core public surface (post-SirenBuilder refactor)', () => {
  it('does not expose the legacy SirenProject.fromEntries construction path', () => {
    expect((SirenProject as unknown as { fromEntries?: unknown }).fromEntries).toBeUndefined();
  });

  it('does not re-export the internal IR_CONTEXT_FACTORY symbol from the package entry', () => {
    expect(
      (coreEntry as unknown as { IR_CONTEXT_FACTORY?: unknown }).IR_CONTEXT_FACTORY,
    ).toBeUndefined();
  });

  it('exposes SirenBuilder as the only documented SirenProject construction path', () => {
    const assembly = SirenBuilder.fromEntries([], 'adhoc');
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
    const context = SirenBuilder.fromEntries([], 'adhoc').build();
    expect(Object.isFrozen(context)).toBe(true);
    expect('source' in (context as Record<string, unknown>)).toBe(false);
    expect('cycles' in (context as Record<string, unknown>)).toBe(false);
    expect('danglingDiagnostics' in (context as Record<string, unknown>)).toBe(false);
    expect('duplicateDiagnostics' in (context as Record<string, unknown>)).toBe(false);
  });

  it('uses origin.kind = range for explicit entries', () => {
    const context = SirenBuilder.fromEntries([rangeOriginEntry('login', 'auth')], 'adhoc').build();
    const login = context.findEntryById('login');
    const origin = originView(login);

    expect(origin).toBeDefined();
    if (!origin) throw new Error('expected origin');
    expect(origin.kind).toBe('range');
    expect(origin.document).toBe('auth');
  });

  it('uses origin.kind = synthetic with document id for synthetic milestones', () => {
    const context = SirenBuilder.fromEntries(
      [syntheticOriginMilestone('auth', 'auth')],
      'adhoc',
    ).build();
    const milestone = context.findEntryById('auth');
    const origin = originView(milestone);

    expect(origin).toBeDefined();
    if (!origin) throw new Error('expected origin');
    expect(origin.kind).toBe('synthetic');
    expect(origin.document).toBe('auth');
  });

  it('fromEntries path does not synthesize milestones from explicit-entry origin.document', () => {
    const context = SirenBuilder.fromEntries([rangeOriginEntry('login', 'auth')], 'adhoc').build();

    expect(context.entries.some((entry) => entry.type === 'milestone' && entry.id === 'auth')).toBe(
      false,
    );

    const login = context.findEntryById('login');
    const origin = originView(login);
    expect(origin).toBeDefined();
    if (!origin) throw new Error('expected origin');
    expect(origin.kind).toBe('range');
    expect(origin.document).toBe('auth');
  });
});

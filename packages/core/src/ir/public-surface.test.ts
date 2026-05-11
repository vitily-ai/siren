import { describe, expect, it } from 'vitest';
import * as coreEntry from './index';
import { type Resource, SirenBuilder, SirenProject } from './index';

function rangeOriginResource(id: string, document: string): Resource {
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

function syntheticOriginMilestone(id: string, document: string): Resource {
  return {
    type: 'milestone',
    id,
    attributes: [],
    origin: { kind: 'synthetic', document },
  };
}

function originView(resource: Resource): Record<string, unknown> | undefined {
  return resource.origin as unknown as Record<string, unknown> | undefined;
}

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
    const assembly = SirenBuilder.fromResources([], 'adhoc');
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
    const context = SirenBuilder.fromResources([], 'adhoc').build();
    expect(Object.isFrozen(context)).toBe(true);
    expect('source' in (context as Record<string, unknown>)).toBe(false);
    expect('cycles' in (context as Record<string, unknown>)).toBe(false);
    expect('danglingDiagnostics' in (context as Record<string, unknown>)).toBe(false);
    expect('duplicateDiagnostics' in (context as Record<string, unknown>)).toBe(false);
  });

  it('uses origin.kind = range for explicit resources', () => {
    const context = SirenBuilder.fromResources(
      [rangeOriginResource('login', 'auth')],
      'adhoc',
    ).build();
    const login = context.findResourceById('login');
    const origin = originView(login);

    expect(origin).toBeDefined();
    if (!origin) throw new Error('expected origin');
    expect(origin.kind).toBe('range');
    expect(origin.document).toBe('auth');
  });

  it('uses origin.kind = synthetic with document id for synthetic milestones', () => {
    const context = SirenBuilder.fromResources(
      [syntheticOriginMilestone('auth', 'auth')],
      'adhoc',
    ).build();
    const milestone = context.findResourceById('auth');
    const origin = originView(milestone);

    expect(origin).toBeDefined();
    if (!origin) throw new Error('expected origin');
    expect(origin.kind).toBe('synthetic');
    expect(origin.document).toBe('auth');
  });

  it('fromResources path does not synthesize milestones from explicit-resource origin.document', () => {
    const context = SirenBuilder.fromResources(
      [rangeOriginResource('login', 'auth')],
      'adhoc',
    ).build();

    expect(
      context.resources.some((resource) => resource.type === 'milestone' && resource.id === 'auth'),
    ).toBe(false);

    const login = context.findResourceById('login');
    const origin = originView(login);
    expect(origin).toBeDefined();
    if (!origin) throw new Error('expected origin');
    expect(origin.kind).toBe('range');
    expect(origin.document).toBe('auth');
  });
});

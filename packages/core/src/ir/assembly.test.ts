import { describe, expect, it } from 'vitest';
import { IRAssembly } from './assembly';
import { IRContext } from './context';
import { isArray, isReference, type Origin, type Resource } from './types';

function origin(document: string, startRow: number): Origin {
  return {
    startByte: startRow * 10,
    endByte: startRow * 10 + 9,
    startRow,
    endRow: startRow,
    document,
  };
}

describe('IRAssembly', () => {
  it('preserves caller resource order in raw resources and first-occurrence order in the built context', () => {
    const resources: Resource[] = [
      { type: 'task', id: 'second', complete: false, attributes: [] },
      { type: 'task', id: 'first', complete: false, attributes: [] },
      { type: 'task', id: 'second', complete: true, attributes: [] },
    ];

    const assembly = IRAssembly.fromResources(resources);
    const context = assembly.build();

    expect(assembly.rawResources.map((resource) => resource.id)).toEqual([
      'second',
      'first',
      'second',
    ]);
    expect(context.resources.map((resource) => resource.id)).toEqual(['second', 'first']);
  });

  it('clones and recursively freezes raw resources', () => {
    const sourceResource = {
      type: 'task' as const,
      id: 'task-a',
      complete: false,
      attributes: [
        {
          key: 'depends_on',
          value: {
            kind: 'array' as const,
            elements: [{ kind: 'reference' as const, id: 'task-b' }],
          },
          origin: {
            startByte: 0,
            endByte: 20,
            startRow: 0,
            endRow: 0,
            document: 'project.siren',
          },
        },
      ],
      origin: {
        startByte: 0,
        endByte: 20,
        startRow: 0,
        endRow: 0,
        document: 'project.siren',
      },
    };
    const assembly = IRAssembly.fromResources([sourceResource]);
    const rawResource = assembly.rawResources[0];

    expect(rawResource).toBeDefined();
    if (!rawResource) throw new Error('expected raw resource');
    const rawAttribute = rawResource.attributes[0];
    expect(rawAttribute).toBeDefined();
    if (!rawAttribute) throw new Error('expected raw attribute');

    expect(rawResource).not.toBe(sourceResource);
    expect(rawResource.attributes).not.toBe(sourceResource.attributes);
    expect(rawAttribute).not.toBe(sourceResource.attributes[0]);
    expect(Object.isFrozen(assembly)).toBe(true);
    expect(Object.isFrozen(assembly.rawResources)).toBe(true);
    expect(Object.isFrozen(rawResource)).toBe(true);
    expect(Object.isFrozen(rawResource.attributes)).toBe(true);
    expect(Object.isFrozen(rawAttribute)).toBe(true);
    expect(Object.isFrozen(rawAttribute.origin)).toBe(true);
    expect(Object.isFrozen(rawResource.origin)).toBe(true);

    const rawValue = rawAttribute.value;
    expect(rawValue).toBeDefined();
    if (rawValue === undefined || !isArray(rawValue)) throw new Error('expected array value');

    expect(rawValue).not.toBe(sourceResource.attributes[0]!.value);
    expect(Object.isFrozen(rawValue)).toBe(true);
    expect(Object.isFrozen(rawValue.elements)).toBe(true);

    const rawElement = rawValue.elements[0];
    expect(rawElement).toBeDefined();
    if (rawElement === undefined || !isReference(rawElement)) {
      throw new Error('expected reference value');
    }
    expect(rawElement).not.toBe(sourceResource.attributes[0]!.value.elements[0]);
    expect(Object.isFrozen(rawElement)).toBe(true);

    sourceResource.id = 'mutated-task';
    sourceResource.attributes[0]!.value.elements[0]!.id = 'mutated-dependency';

    expect(rawResource.id).toBe('task-a');
    expect(rawElement.id).toBe('task-b');
  });

  it('builds repeatable non-consuming IRContext instances', () => {
    const assembly = IRAssembly.fromResources([
      { type: 'task', id: 'task-a', complete: false, attributes: [] },
      { type: 'task', id: 'task-b', complete: false, attributes: [] },
    ]);

    const firstContext = assembly.build();
    const secondContext = assembly.build();

    expect(firstContext).toBeInstanceOf(IRContext);
    expect(secondContext).toBeInstanceOf(IRContext);
    expect(firstContext).not.toBe(secondContext);
    expect(firstContext.resources.map((resource) => resource.id)).toEqual(['task-a', 'task-b']);
    expect(secondContext.resources.map((resource) => resource.id)).toEqual(['task-a', 'task-b']);
    expect(assembly.rawResources.map((resource) => resource.id)).toEqual(['task-a', 'task-b']);
  });

  it('keeps raw duplicates available while the built context uses first occurrence wins', () => {
    const resources: Resource[] = [
      { type: 'task', id: 'duplicate', complete: false, attributes: [] },
      { type: 'task', id: 'duplicate', complete: true, attributes: [] },
    ];

    const assembly = IRAssembly.fromResources(resources);
    const context = assembly.build();

    expect(assembly.rawResources.map((resource) => resource.complete)).toEqual([false, true]);
    expect(context.resources).toHaveLength(1);
    expect(context.resources[0]?.complete).toBe(false);
    expect(context.duplicateDiagnostics).toHaveLength(1);
  });

  it('builds the expected immutable context output with ordered diagnostics and source attribution', () => {
    const assembly = IRAssembly.fromResources([
      {
        type: 'task',
        id: 'cycle-a',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'cycle-b' } }],
        origin: origin('cycle-a.siren', 0),
      },
      {
        type: 'task',
        id: 'cycle-b',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'cycle-a' } }],
        origin: origin('cycle-b.siren', 1),
      },
      {
        type: 'task',
        id: 'has-dangling',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'missing' } }],
        origin: origin('dangling.siren', 4),
      },
      {
        type: 'task',
        id: 'finished-task',
        complete: true,
        attributes: [],
        origin: origin('complete-first.siren', 6),
      },
      {
        type: 'task',
        id: 'finished-task',
        complete: false,
        attributes: [],
        origin: origin('complete-second.siren', 8),
      },
      {
        type: 'milestone',
        id: 'release',
        complete: false,
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'finished-task' } }],
        origin: origin('release.siren', 10),
      },
    ]);

    const context = assembly.build();

    expect(context.resources.map((resource) => [resource.id, resource.complete])).toEqual([
      ['cycle-a', false],
      ['cycle-b', false],
      ['has-dangling', false],
      ['finished-task', true],
      ['release', true],
    ]);
    expect(context.cycles).toEqual([{ nodes: ['cycle-a', 'cycle-b', 'cycle-a'] }]);
    expect(context.diagnostics).toEqual([
      {
        code: 'W001',
        severity: 'warning',
        nodes: ['cycle-a', 'cycle-b', 'cycle-a'],
        file: 'cycle-a.siren, cycle-b.siren',
        line: 1,
        column: 0,
      },
      {
        code: 'W002',
        severity: 'warning',
        resourceId: 'has-dangling',
        resourceType: 'task',
        dependencyId: 'missing',
        file: 'dangling.siren',
        line: 5,
        column: 0,
      },
      {
        code: 'W003',
        severity: 'warning',
        resourceId: 'finished-task',
        resourceType: 'task',
        file: 'complete-second.siren',
        firstFile: 'complete-first.siren',
        firstLine: 7,
        firstColumn: 0,
        secondLine: 9,
        secondColumn: 0,
      },
    ]);
    expect(context.danglingDiagnostics).toEqual([context.diagnostics[1]]);
    expect(context.duplicateDiagnostics).toEqual([context.diagnostics[2]]);
    expect(Object.isFrozen(context.resources)).toBe(true);
    expect(Object.isFrozen(context.diagnostics)).toBe(true);
    expect(Object.isFrozen(context.cycles)).toBe(true);
  });
});

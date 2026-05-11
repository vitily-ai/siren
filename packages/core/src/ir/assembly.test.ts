import { describe, expect, it } from 'vitest';
import { SirenBuilder } from './assembly';
import { SirenProject } from './context';
import { isArray, isReference, type Origin, type Resource } from './types';

function origin(document: string, startRow: number): Origin {
  return {
    kind: 'range',
    startByte: startRow * 10,
    endByte: startRow * 10 + 9,
    startRow,
    endRow: startRow,
    document,
  };
}

type BuilderDocument = {
  id: string;
  resources: readonly Resource[];
  directive?: {
    implicitMilestone?: boolean;
  };
};

type DocumentsBuilderSurface = {
  readonly documents: readonly BuilderDocument[];
  build(): SirenProject;
};

type SirenBuilderDocumentsApi = {
  fromDocuments?: (documents: readonly BuilderDocument[]) => DocumentsBuilderSurface;
  fromResources?: (
    resources: readonly Resource[],
    ephemeralDocumentId: string,
  ) => DocumentsBuilderSurface;
};

describe('SirenBuilder', () => {
  it('preserves caller resource order in assembly documents and first-occurrence order in the built context', () => {
    const resources: Resource[] = [
      { type: 'task', id: 'second', attributes: [] },
      { type: 'task', id: 'first', attributes: [] },
      { type: 'task', id: 'second', status: 'complete', attributes: [] },
    ];

    const assembly = SirenBuilder.fromResources(resources, 'adhoc');
    const context = assembly.build();

    expect(assembly.documents[0]?.resources.map((resource) => resource.id)).toEqual([
      'second',
      'first',
      'second',
    ]);
    expect(context.resources.map((resource) => resource.id)).toEqual(['second', 'first']);
  });

  it('clones and recursively freezes assembly resources', () => {
    const sourceResource = {
      type: 'task' as const,
      id: 'task-a',
      attributes: [
        {
          key: 'depends_on',
          value: {
            kind: 'array' as const,
            elements: [{ kind: 'reference' as const, id: 'task-b' }],
          },
          origin: {
            kind: 'range' as const,
            startByte: 0,
            endByte: 20,
            startRow: 0,
            endRow: 0,
            document: 'project.siren',
          },
        },
      ],
      origin: {
        kind: 'range' as const,
        startByte: 0,
        endByte: 20,
        startRow: 0,
        endRow: 0,
        document: 'project.siren',
      },
    };
    const assembly = SirenBuilder.fromResources([sourceResource], 'adhoc');
    const rawDocument = assembly.documents[0];
    const rawResource = rawDocument?.resources[0];

    expect(rawDocument).toBeDefined();
    if (!rawDocument) throw new Error('expected raw document');
    expect(rawResource).toBeDefined();
    if (!rawResource) throw new Error('expected raw resource');
    const rawAttribute = rawResource.attributes[0];
    expect(rawAttribute).toBeDefined();
    if (!rawAttribute) throw new Error('expected raw attribute');

    expect(rawResource).not.toBe(sourceResource);
    expect(rawResource.attributes).not.toBe(sourceResource.attributes);
    expect(rawAttribute).not.toBe(sourceResource.attributes[0]);
    expect(Object.isFrozen(assembly)).toBe(true);
    expect(Object.isFrozen(assembly.documents)).toBe(true);
    expect(Object.isFrozen(rawDocument)).toBe(true);
    expect(Object.isFrozen(rawDocument.resources)).toBe(true);
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

  it('builds repeatable non-consuming SirenProject instances', () => {
    const assembly = SirenBuilder.fromResources(
      [
        { type: 'task', id: 'task-a', attributes: [] },
        { type: 'task', id: 'task-b', attributes: [] },
      ],
      'adhoc',
    );

    const firstContext = assembly.build();
    const secondContext = assembly.build();

    expect(firstContext).toBeInstanceOf(SirenProject);
    expect(secondContext).toBeInstanceOf(SirenProject);
    expect(firstContext).not.toBe(secondContext);
    expect(firstContext.resources.map((resource) => resource.id)).toEqual(['task-a', 'task-b']);
    expect(secondContext.resources.map((resource) => resource.id)).toEqual(['task-a', 'task-b']);
    expect(assembly.documents[0]?.resources.map((resource) => resource.id)).toEqual([
      'task-a',
      'task-b',
    ]);
  });

  it('keeps raw duplicates available while the built context uses first occurrence wins', () => {
    const resources: Resource[] = [
      { type: 'task', id: 'duplicate', attributes: [] },
      { type: 'task', id: 'duplicate', status: 'complete', attributes: [] },
    ];

    const assembly = SirenBuilder.fromResources(resources, 'adhoc');
    const context = assembly.build();

    expect(assembly.documents[0]?.resources.map((resource) => resource.status)).toEqual([
      undefined,
      'complete',
    ]);
    expect(context.resources).toHaveLength(1);
    expect(context.resources[0]?.status).toBeUndefined();
    expect(context.diagnostics.filter((diagnostic) => diagnostic.code === 'W003')).toHaveLength(1);
  });

  it('builds the expected immutable context output with ordered diagnostics and source attribution', () => {
    const assembly = SirenBuilder.fromResources(
      [
        {
          type: 'task',
          id: 'cycle-a',
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'cycle-b' } }],
          origin: origin('cycle-a.siren', 0),
        },
        {
          type: 'task',
          id: 'cycle-b',
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'cycle-a' } }],
          origin: origin('cycle-b.siren', 1),
        },
        {
          type: 'task',
          id: 'has-dangling',
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'missing' } }],
          origin: origin('dangling.siren', 4),
        },
        {
          type: 'task',
          id: 'finished-task',
          status: 'complete',
          attributes: [],
          origin: origin('complete-first.siren', 6),
        },
        {
          type: 'task',
          id: 'finished-task',
          attributes: [],
          origin: origin('complete-second.siren', 8),
        },
        {
          type: 'milestone',
          id: 'release',
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'finished-task' } }],
          origin: origin('release.siren', 10),
        },
      ],
      'adhoc',
    );

    const context = assembly.build();

    expect(context.resources.map((resource) => [resource.id, resource.status])).toEqual([
      ['cycle-a', undefined],
      ['cycle-b', undefined],
      ['has-dangling', undefined],
      ['finished-task', 'complete'],
      ['release', 'complete'],
    ]);
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
    expect(Object.isFrozen(context.resources)).toBe(false);
    expect(Object.isFrozen(context.diagnostics)).toBe(true);
    expect(Object.isFrozen(context.diagnostics[0])).toBe(true);
    expect('cycles' in (context as unknown as Record<string, unknown>)).toBe(false);
    expect('danglingDiagnostics' in (context as unknown as Record<string, unknown>)).toBe(false);
    expect('duplicateDiagnostics' in (context as unknown as Record<string, unknown>)).toBe(false);
  });

  it('exposes fromDocuments as the primary constructor entrypoint', () => {
    const api = SirenBuilder as unknown as SirenBuilderDocumentsApi;
    expect(typeof api.fromDocuments).toBe('function');

    const documents: BuilderDocument[] = [
      {
        id: 'auth',
        resources: [{ type: 'task', id: 'login', attributes: [] }],
      },
    ];

    const builder = api.fromDocuments?.(documents);
    expect(builder).toBeDefined();
    expect(builder?.documents).toEqual(documents);
  });

  it('exposes fromResources(resources, documentId) as wrapper over fromDocuments with directive opt-out', () => {
    const api = SirenBuilder as unknown as SirenBuilderDocumentsApi;
    expect(typeof api.fromResources).toBe('function');
    expect(api.fromResources?.length).toBe(2);

    const resources: Resource[] = [
      { type: 'task', id: 'duplicate', attributes: [] },
      { type: 'task', id: 'duplicate', status: 'complete', attributes: [] },
    ];

    const builder = api.fromResources?.(resources, 'adhoc');
    expect(builder).toBeDefined();
    expect(builder?.documents).toEqual([
      {
        id: 'adhoc',
        resources,
        directive: { implicitMilestone: false },
      },
    ]);
    expect(builder?.documents[0]?.resources.map((resource) => resource.id)).toEqual([
      'duplicate',
      'duplicate',
    ]);
  });

  it('exposes pre-build documents and not pre-build resources', () => {
    const api = SirenBuilder as unknown as SirenBuilderDocumentsApi;
    const builder = api.fromResources?.([{ type: 'task', id: 'task-a', attributes: [] }], 'adhoc');
    expect(builder).toBeDefined();

    const preBuildSurface = builder as unknown as Record<string, unknown>;
    expect('documents' in preBuildSurface).toBe(true);
    expect('resources' in preBuildSurface).toBe(false);
  });
});

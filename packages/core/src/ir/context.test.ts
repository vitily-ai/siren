import { describe, expect, it } from 'vitest';
import { IRAssembly } from './assembly';
import type { Resource } from './types';

function buildContext(resources: readonly Resource[]) {
  return IRAssembly.fromResources(resources).build();
}

describe('IRContext (assembly-built semantic snapshot)', () => {
  describe('diagnostics without source attribution', () => {
    it('generates W002 diagnostics without file info when origins are missing', () => {
      const context = buildContext([
        {
          type: 'milestone',
          id: 'has-dangling',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'missing-dep' } }],
        },
      ]);

      expect(context.diagnostics).toEqual([
        {
          code: 'W002',
          severity: 'warning',
          resourceId: 'has-dangling',
          resourceType: 'milestone',
          dependencyId: 'missing-dep',
        },
      ]);
    });

    it('generates W001 diagnostics without file info when origins are missing', () => {
      const context = buildContext([
        {
          type: 'task',
          id: 'a',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'b' } }],
        },
        {
          type: 'task',
          id: 'b',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'a' } }],
        },
      ]);

      expect(context.diagnostics).toEqual([
        {
          code: 'W001',
          severity: 'warning',
          nodes: ['a', 'b', 'a'],
        },
      ]);
    });
  });

  describe('diagnostics with source attribution', () => {
    it('includes file and position for dangling diagnostics from origin.document', () => {
      const context = buildContext([
        {
          type: 'task',
          id: 'has-dangling',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'missing' } }],
          origin: {
            startByte: 0,
            endByte: 10,
            startRow: 0,
            endRow: 0,
            document: 'project/tasks.siren',
          },
        },
      ]);

      expect(context.diagnostics).toEqual([
        {
          code: 'W002',
          severity: 'warning',
          resourceId: 'has-dangling',
          resourceType: 'task',
          dependencyId: 'missing',
          file: 'project/tasks.siren',
          line: 1,
          column: 0,
        },
      ]);
    });

    it('includes file attribution for cycles spanning multiple files', () => {
      const context = buildContext([
        {
          type: 'task',
          id: 'a',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'b' } }],
          origin: {
            startByte: 0,
            endByte: 10,
            startRow: 0,
            endRow: 0,
            document: 'project/file1.siren',
          },
        },
        {
          type: 'task',
          id: 'b',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'a' } }],
          origin: {
            startByte: 0,
            endByte: 10,
            startRow: 0,
            endRow: 0,
            document: 'project/file2.siren',
          },
        },
      ]);

      expect(context.diagnostics).toEqual([
        {
          code: 'W001',
          severity: 'warning',
          nodes: ['a', 'b', 'a'],
          file: 'project/file1.siren, project/file2.siren',
          line: 1,
          column: 0,
        },
      ]);
    });
  });

  describe('normalization and semantic snapshot', () => {
    it('deduplicates first, then resolves implicit milestone completion', () => {
      const context = buildContext([
        {
          type: 'task',
          id: 'shared-task',
          complete: false,
          attributes: [],
          origin: {
            startByte: 0,
            endByte: 20,
            startRow: 4,
            endRow: 4,
            document: 'first.siren',
          },
        },
        {
          type: 'task',
          id: 'shared-task',
          complete: true,
          attributes: [],
          origin: {
            startByte: 21,
            endByte: 40,
            startRow: 11,
            endRow: 11,
            document: 'second.siren',
          },
        },
        {
          type: 'milestone',
          id: 'release',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'shared-task' } }],
        },
      ]);

      expect(context.resources.map((resource) => [resource.id, resource.complete])).toEqual([
        ['shared-task', false],
        ['release', false],
      ]);
      expect(context.diagnostics).toEqual([
        {
          code: 'W003',
          severity: 'warning',
          resourceId: 'shared-task',
          resourceType: 'task',
          file: 'second.siren',
          firstFile: 'first.siren',
          firstLine: 5,
          firstColumn: 0,
          secondLine: 12,
          secondColumn: 0,
        },
      ]);
    });

    it('orders diagnostics as W001, W002, then W003', () => {
      const context = buildContext([
        {
          type: 'task',
          id: 'cycle-a',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'cycle-b' } }],
        },
        {
          type: 'task',
          id: 'cycle-b',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'cycle-a' } }],
        },
        {
          type: 'task',
          id: 'has-dangling',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'missing' } }],
        },
        { type: 'task', id: 'duplicate', complete: false, attributes: [] },
        { type: 'task', id: 'duplicate', complete: false, attributes: [] },
      ]);

      expect(context.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
        'W001',
        'W002',
        'W003',
      ]);
    });

    it('does not expose removed legacy snapshot surfaces', () => {
      const context = buildContext([]);

      expect('source' in (context as Record<string, unknown>)).toBe(false);
      expect('cycles' in (context as Record<string, unknown>)).toBe(false);
      expect('danglingDiagnostics' in (context as Record<string, unknown>)).toBe(false);
      expect('duplicateDiagnostics' in (context as Record<string, unknown>)).toBe(false);
    });

    it('freezes context snapshot data', () => {
      const context = buildContext([
        {
          type: 'task',
          id: 'a',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'b' } }],
        },
        {
          type: 'task',
          id: 'b',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'a' } }],
        },
      ]);

      const resource = context.resources[0];
      const diagnostic = context.diagnostics[0];

      expect(resource).toBeDefined();
      expect(diagnostic).toBeDefined();
      if (!resource || !diagnostic) throw new Error('expected IR snapshot data');

      expect(Object.isFrozen(context)).toBe(true);
      expect(Object.isFrozen(context.resources)).toBe(true);
      expect(Object.isFrozen(resource)).toBe(true);
      expect(Object.isFrozen(resource.attributes)).toBe(true);
      expect(Object.isFrozen(resource.attributes[0])).toBe(true);
      expect(Object.isFrozen(context.diagnostics)).toBe(true);
      expect(Object.isFrozen(diagnostic)).toBe(true);
    });
  });
});

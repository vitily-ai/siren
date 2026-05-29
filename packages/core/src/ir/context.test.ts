import { describe, expect, it } from 'vitest';
import { SirenBuilder } from './assembly';
import type { SirenEntry } from './types';

function buildContext(entries: readonly SirenEntry[]) {
  return SirenBuilder.fromEntries(entries, 'adhoc').build();
}

describe('SirenProject (builder-built semantic snapshot)', () => {
  describe('diagnostics without source attribution', () => {
    it('generates W002 diagnostics without file info when origins are missing', () => {
      const context = buildContext([
        {
          type: 'milestone',
          id: 'has-dangling',
          attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'missing-dep' }] }],
        },
      ]);

      expect(context.diagnostics).toEqual([
        {
          code: 'W002',
          severity: 'warning',
          entryId: 'has-dangling',
          entryType: 'milestone',
          dependencyId: 'missing-dep',
        },
      ]);
    });

    it('generates W001 diagnostics without file info when origins are missing', () => {
      const context = buildContext([
        {
          type: 'task',
          id: 'a',
          attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'b' }] }],
        },
        {
          type: 'task',
          id: 'b',
          attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'a' }] }],
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
          attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'missing' }] }],
          origin: {
            kind: 'range',
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
          entryId: 'has-dangling',
          entryType: 'task',
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
          attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'b' }] }],
          origin: {
            kind: 'range',
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
          attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'a' }] }],
          origin: {
            kind: 'range',
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
          attributes: [],
          origin: {
            kind: 'range',
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
          status: 'complete',
          attributes: [],
          origin: {
            kind: 'range',
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
          attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'shared-task' }] }],
        },
      ]);

      expect(context.entries.map((entry) => [entry.id, entry.status])).toEqual([
        ['shared-task', undefined],
        ['release', undefined],
      ]);
      expect(context.diagnostics).toEqual([
        {
          code: 'W003',
          severity: 'warning',
          entryId: 'shared-task',
          entryType: 'task',
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
          attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'cycle-b' }] }],
        },
        {
          type: 'task',
          id: 'cycle-b',
          attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'cycle-a' }] }],
        },
        {
          type: 'task',
          id: 'has-dangling',
          attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'missing' }] }],
        },
        { type: 'task', id: 'duplicate', attributes: [] },
        { type: 'task', id: 'duplicate', attributes: [] },
      ]);

      expect(context.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
        'W001',
        'W002',
        'W003',
      ]);
    });

    it('does not expose removed legacy snapshot surfaces', () => {
      const context = buildContext([]);

      expect('source' in (context as unknown as Record<string, unknown>)).toBe(false);
      expect('cycles' in (context as unknown as Record<string, unknown>)).toBe(false);
      expect('danglingDiagnostics' in (context as unknown as Record<string, unknown>)).toBe(false);
      expect('duplicateDiagnostics' in (context as unknown as Record<string, unknown>)).toBe(false);
    });

    it('freezes context snapshot data', () => {
      const context = buildContext([
        {
          type: 'task',
          id: 'a',
          attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'b' }] }],
        },
        {
          type: 'task',
          id: 'b',
          attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'a' }] }],
        },
      ]);

      const entry = context.entries[0];
      const diagnostic = context.diagnostics[0];

      expect(entry).toBeDefined();
      expect(diagnostic).toBeDefined();
      if (!entry || !diagnostic) throw new Error('expected IR snapshot data');

      expect(Object.isFrozen(context)).toBe(true);
      expect(Object.isFrozen(context.entries)).toBe(false);
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.attributes)).toBe(true);
      expect(Object.isFrozen(entry.attributes[0])).toBe(true);
      expect(Object.isFrozen(context.diagnostics)).toBe(true);
      expect(Object.isFrozen(diagnostic)).toBe(true);
    });
  });

  describe('dependency tree default traversal', () => {
    it('filters complete status and keeps draft/undefined status visible', () => {
      const context = buildContext([
        {
          type: 'task',
          id: 'root',
          attributes: [
            {
              key: 'depends_on',
              value: [
                { kind: 'reference', id: 'done-task' },
                { kind: 'reference', id: 'draft-task' },
                { kind: 'reference', id: 'draft-milestone' },
                { kind: 'reference', id: 'todo-task' },
              ],
            },
          ],
        },
        { type: 'task', id: 'done-task', status: 'complete', attributes: [] },
        {
          type: 'task',
          id: 'draft-task',
          status: 'draft',
          attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'draft-child' }] }],
        },
        {
          type: 'milestone',
          id: 'draft-milestone',
          status: 'draft',
          attributes: [
            { key: 'depends_on', value: [{ kind: 'reference', id: 'milestone-child' }] },
          ],
        },
        { type: 'task', id: 'todo-task', attributes: [] },
        { type: 'task', id: 'draft-child', attributes: [] },
        { type: 'task', id: 'milestone-child', attributes: [] },
      ]);

      const tree = context.getDependencyTree('root');
      expect(tree.dependencies.map((dependency) => dependency.entry.id).sort()).toEqual([
        'draft-milestone',
        'draft-task',
        'todo-task',
      ]);

      const draftTask = tree.dependencies.find(
        (dependency) => dependency.entry.id === 'draft-task',
      );
      expect(draftTask?.dependencies.map((dependency) => dependency.entry.id)).toEqual([
        'draft-child',
      ]);

      const draftMilestone = tree.dependencies.find(
        (dependency) => dependency.entry.id === 'draft-milestone',
      );
      expect(draftMilestone?.dependencies).toHaveLength(0);
    });
  });
});

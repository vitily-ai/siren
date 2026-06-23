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

  describe('normalization and semantic snapshot', () => {
    it('deduplicates first, then resolves implicit milestone completion', () => {
      const context = buildContext([
        {
          type: 'task',
          id: 'shared-task',
          attributes: [],
        },
        {
          type: 'task',
          id: 'shared-task',
          status: 'complete',
          attributes: [],
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

  describe('getEntryStats', () => {
    it('returns zero total and closed for entry without depends_on', () => {
      const context = buildContext([{ type: 'milestone', id: 'm1', attributes: [] }]);

      const stats = context.getEntryStats('m1');
      expect(stats).toEqual({ deps: { total: 0, closed: 0 } });
    });

    it('returns zero total and closed for entry with empty depends_on', () => {
      const context = buildContext([
        {
          type: 'milestone',
          id: 'm1',
          attributes: [{ key: 'depends_on', value: [] }],
        },
      ]);

      const stats = context.getEntryStats('m1');
      expect(stats).toEqual({ deps: { total: 0, closed: 0 } });
    });

    it('returns total=N, closed=0 when all deps are incomplete', () => {
      const context = buildContext([
        {
          type: 'milestone',
          id: 'm1',
          attributes: [
            {
              key: 'depends_on',
              value: [
                { kind: 'reference', id: 't1' },
                { kind: 'reference', id: 't2' },
              ],
            },
          ],
        },
        { type: 'task', id: 't1', attributes: [] },
        { type: 'task', id: 't2', attributes: [] },
      ]);

      const stats = context.getEntryStats('m1');
      expect(stats).toEqual({ deps: { total: 2, closed: 0 } });
    });

    it('returns total=N, closed=M when some deps are complete', () => {
      const context = buildContext([
        {
          type: 'milestone',
          id: 'm1',
          attributes: [
            {
              key: 'depends_on',
              value: [
                { kind: 'reference', id: 'done-task' },
                { kind: 'reference', id: 'open-task' },
              ],
            },
          ],
        },
        { type: 'task', id: 'done-task', status: 'complete', attributes: [] },
        { type: 'task', id: 'open-task', attributes: [] },
      ]);

      const stats = context.getEntryStats('m1');
      expect(stats).toEqual({ deps: { total: 2, closed: 1 } });
    });

    it('returns total=N, closed=N when all deps are complete', () => {
      const context = buildContext([
        {
          type: 'milestone',
          id: 'm1',
          attributes: [
            {
              key: 'depends_on',
              value: [
                { kind: 'reference', id: 'done-a' },
                { kind: 'reference', id: 'done-b' },
              ],
            },
          ],
        },
        { type: 'task', id: 'done-a', status: 'complete', attributes: [] },
        { type: 'task', id: 'done-b', status: 'complete', attributes: [] },
      ]);

      const stats = context.getEntryStats('m1');
      expect(stats).toEqual({ deps: { total: 2, closed: 2 } });
    });

    it('lookup by string ID yields same result as lookup by entry object', () => {
      const context = buildContext([
        {
          type: 'milestone',
          id: 'm1',
          attributes: [
            {
              key: 'depends_on',
              value: [{ kind: 'reference', id: 'done-task' }],
            },
          ],
        },
        { type: 'task', id: 'done-task', status: 'complete', attributes: [] },
      ]);

      const entry = context.findEntryById('m1');
      const statsById = context.getEntryStats('m1');
      const statsByEntry = context.getEntryStats(entry);

      expect(statsById).toEqual(statsByEntry);
    });

    it('counts total as all atoms (not just references); closed only counts references to complete entries', () => {
      const context = buildContext([
        {
          type: 'milestone',
          id: 'm1',
          attributes: [
            {
              key: 'depends_on',
              value: ['string-value', 42, true, { kind: 'reference', id: 'done-task' }],
            },
          ],
        },
        { type: 'task', id: 'done-task', status: 'complete', attributes: [] },
      ]);

      const stats = context.getEntryStats('m1');
      // total = length of the entire value array (4 atoms), not just references
      // closed = only the reference whose target is complete (1)
      expect(stats).toEqual({ deps: { total: 4, closed: 1 } });
    });

    it('gracefully handles dangling dependencies (references to missing entries)', () => {
      const context = buildContext([
        {
          type: 'milestone',
          id: 'm1',
          attributes: [
            {
              key: 'depends_on',
              value: [
                { kind: 'reference', id: 'missing-dep' },
                { kind: 'reference', id: 'done-task' },
              ],
            },
          ],
        },
        { type: 'task', id: 'done-task', status: 'complete', attributes: [] },
      ]);

      const stats = context.getEntryStats('m1');
      // total counts all atoms in depends_on (including the dangling reference)
      // closed only counts references whose target entry exists and is complete
      expect(stats).toEqual({ deps: { total: 2, closed: 1 } });
    });

    it('gracefully handles entry with only dangling dependencies (all deps missing)', () => {
      const context = buildContext([
        {
          type: 'milestone',
          id: 'm1',
          attributes: [
            {
              key: 'depends_on',
              value: [
                { kind: 'reference', id: 'missing-a' },
                { kind: 'reference', id: 'missing-b' },
              ],
            },
          ],
        },
      ]);

      const stats = context.getEntryStats('m1');
      // Both deps are dangling (missing), so total=2 and closed=0
      expect(stats).toEqual({ deps: { total: 2, closed: 0 } });
    });

    it('gracefully handles task entry with dangling dependency', () => {
      const context = buildContext([
        {
          type: 'task',
          id: 't1',
          attributes: [
            {
              key: 'depends_on',
              value: [{ kind: 'reference', id: 'never-defined' }],
            },
          ],
        },
      ]);

      const stats = context.getEntryStats('t1');
      expect(stats).toEqual({ deps: { total: 1, closed: 0 } });
    });
  });

  describe('getStatus', () => {
    it('partitions milestones into open, closed, and draft with correct stats', () => {
      const context = buildContext([
        {
          type: 'milestone',
          id: 'open-m',
          attributes: [
            {
              key: 'depends_on',
              value: [
                { kind: 'reference', id: 'open-task' },
                { kind: 'reference', id: 'done-task' },
              ],
            },
          ],
        },
        {
          type: 'milestone',
          id: 'done-m',
          status: 'complete',
          attributes: [
            {
              key: 'depends_on',
              value: [{ kind: 'reference', id: 'done-task' }],
            },
          ],
        },
        {
          type: 'milestone',
          id: 'draft-m',
          status: 'draft',
          attributes: [
            {
              key: 'depends_on',
              value: [
                { kind: 'reference', id: 'open-task' },
                { kind: 'reference', id: 'done-task' },
              ],
            },
          ],
        },
        { type: 'task', id: 'open-task', attributes: [] },
        { type: 'task', id: 'done-task', status: 'complete', attributes: [] },
      ]);

      const status = context.getStatus();

      expect(status.open).toHaveLength(1);
      expect(status.closed).toHaveLength(1);
      expect(status.draft).toHaveLength(1);

      expect(status.open[0].id).toBe('open-m');
      expect(status.open[0].stats).toEqual({ deps: { total: 2, closed: 1 } });

      expect(status.closed[0].id).toBe('done-m');
      expect(status.closed[0].stats).toEqual({ deps: { total: 1, closed: 1 } });

      expect(status.draft[0].id).toBe('draft-m');
      expect(status.draft[0].stats).toEqual({ deps: { total: 2, closed: 1 } });
    });

    it('returns empty arrays when there are no milestones', () => {
      const context = buildContext([{ type: 'task', id: 't1', attributes: [] }]);

      const status = context.getStatus();
      expect(status.open).toHaveLength(0);
      expect(status.closed).toHaveLength(0);
      expect(status.draft).toHaveLength(0);
    });

    it('excludes tasks from the status result', () => {
      const context = buildContext([
        {
          type: 'milestone',
          id: 'm1',
          attributes: [
            {
              key: 'depends_on',
              value: [{ kind: 'reference', id: 'open-task' }],
            },
          ],
        },
        { type: 'task', id: 't1', status: 'complete', attributes: [] },
        { type: 'task', id: 'open-task', attributes: [] },
      ]);

      const status = context.getStatus();
      expect(status.closed).toHaveLength(0);
      expect(status.open).toHaveLength(1);
      expect(status.open[0].id).toBe('m1');
      // Task 't1' is complete but is not a milestone, so it should not appear
      expect(status.open[0].stats).toEqual({ deps: { total: 1, closed: 0 } });
    });

    it('considers milestones implicitly completed by the pipeline as closed', () => {
      const context = buildContext([
        {
          type: 'milestone',
          id: 'implicitly-done',
          attributes: [
            {
              key: 'depends_on',
              value: [{ kind: 'reference', id: 'done-task' }],
            },
          ],
        },
        { type: 'task', id: 'done-task', status: 'complete', attributes: [] },
      ]);

      // The pipeline should mark implicitly-done as complete since
      // all deps are complete
      const status = context.getStatus();
      expect(status.closed).toHaveLength(1);
      expect(status.closed[0].id).toBe('implicitly-done');
      expect(status.closed[0].stats).toEqual({ deps: { total: 1, closed: 1 } });
    });
  });
});

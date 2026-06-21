import { describe, expect, it } from 'vitest';
import { isReference, SirenBuilder, type SirenEntry, SirenProject, version } from './index';

function buildContext(entries: readonly SirenEntry[]) {
  return SirenBuilder.fromEntries(entries).build();
}

function dependsOnIds(entry: SirenEntry): string[] {
  const dependsOn = entry.attributes.find((attribute) => attribute.key === 'depends_on');
  if (!dependsOn) return [];
  return dependsOn.value.flatMap((atom) => (isReference(atom) ? [atom.id] : []));
}

function duplicateIdDiagnosticsFor(context: SirenProject, entryId: string) {
  return context.diagnostics.filter(
    (diagnostic) =>
      diagnostic.code === 'W003' && 'entryId' in diagnostic && diagnostic.entryId === entryId,
  );
}

describe('@sirenpm/core', () => {
  it('exports version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exports SirenBuilder', () => {
    expect(SirenBuilder.fromEntries([]).entries).toEqual([]);
  });

  it('exports SirenProject and builds it through SirenBuilder', () => {
    const context = buildContext([]);
    expect(context).toBeInstanceOf(SirenProject);
  });

  describe('getMilestoneIds', () => {
    it('returns empty array for no entries', () => {
      const ir = buildContext([]);
      expect(ir.getMilestoneIds()).toEqual([]);
    });

    it('returns empty array for only tasks', () => {
      const entries: SirenEntry[] = [
        { type: 'task', id: 'task1', attributes: [] },
        { type: 'task', id: 'task2', status: 'complete', attributes: [] },
      ];
      const ir = buildContext(entries);
      expect(ir.getMilestoneIds()).toEqual([]);
    });

    it('returns milestone IDs', () => {
      const entries: SirenEntry[] = [
        { type: 'task', id: 'task1', attributes: [] },
        { type: 'milestone', id: 'milestone1', attributes: [] },
        { type: 'task', id: 'task2', status: 'complete', attributes: [] },
        { type: 'milestone', id: 'milestone2', status: 'complete', attributes: [] },
      ];
      const ir = buildContext(entries);
      expect(ir.getMilestoneIds()).toEqual(['milestone1', 'milestone2']);
    });
  });
  it('returns empty map for no entries', () => {
    const ir = buildContext([]);
    expect(ir.getTasksByMilestone()).toEqual(new Map());
  });

  it('returns empty arrays for milestones with no tasks', () => {
    const entries: SirenEntry[] = [{ type: 'milestone', id: 'milestone1', attributes: [] }];
    const ir = buildContext(entries);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([]);
  });

  it('ignores complete tasks', () => {
    const entries: SirenEntry[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'task1' }] }],
      },
      {
        type: 'task',
        id: 'task1',
        status: 'complete',
        attributes: [],
      },
    ];
    const ir = buildContext(entries);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([]);
  });

  it('includes incomplete tasks that the milestone depends on', () => {
    const task: SirenEntry = {
      type: 'task',
      id: 'task1',
      attributes: [],
    };
    const entries: SirenEntry[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'task1' }] }],
      },
      task,
    ];
    const ir = buildContext(entries);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([task]);
  });

  it('handles array depends_on', () => {
    const task: SirenEntry = {
      type: 'task',
      id: 'task1',
      attributes: [],
    };
    const entries: SirenEntry[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [
          {
            key: 'depends_on',
            value: [
              { kind: 'reference', id: 'task1' },
              { kind: 'reference', id: 'other' },
            ],
          },
        ],
      },
      task,
    ];
    const ir = buildContext(entries);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([task]);
  });

  it('ignores dependencies that are not tasks', () => {
    const entries: SirenEntry[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'other_milestone' }] }],
      },
      {
        type: 'task',
        id: 'task1',
        attributes: [],
      },
    ];
    const ir = buildContext(entries);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([]);
  });

  describe('flat entry fixture projects', () => {
    it('document-milestone-roots preserves dependencies without synthesizing a milestone', () => {
      const entries: SirenEntry[] = [
        { type: 'task', id: 'hash-password', attributes: [] },
        { type: 'task', id: 'validate-token', attributes: [] },
        {
          type: 'task',
          id: 'login',
          attributes: [
            {
              key: 'depends_on',
              value: [
                { kind: 'reference', id: 'hash-password' },
                { kind: 'reference', id: 'validate-token' },
              ],
            },
          ],
        },
      ];
      const context = buildContext(entries);

      expect(context.entries.map((entry) => entry.id)).toEqual([
        'hash-password',
        'validate-token',
        'login',
      ]);

      const login = context.findEntryById('login');
      expect(login.type).toBe('task');
      expect(dependsOnIds(login)).toEqual(['hash-password', 'validate-token']);
      expect(
        context.entries.some((entry) => entry.type === 'milestone' && entry.id === 'auth'),
      ).toBe(false);
    });

    it('document-milestone-empty-doc yields no entries', () => {
      const context = buildContext([]);

      expect(context.entries).toEqual([]);
      expect(context.diagnostics).toEqual([]);
    });

    it('document-milestone-explicit-takeover preserves the explicit auth milestone', () => {
      const entries: SirenEntry[] = [
        { type: 'task', id: 'login', attributes: [] },
        {
          type: 'milestone',
          id: 'auth',
          attributes: [
            {
              key: 'depends_on',
              value: [{ kind: 'reference', id: 'login' }],
            },
          ],
        },
      ];
      const context = buildContext(entries);
      const authMilestones = context.entries.filter(
        (entry) => entry.type === 'milestone' && entry.id === 'auth',
      );

      expect(authMilestones).toHaveLength(1);
      expect(context.findEntryById('auth').type).toBe('milestone');
      expect(dependsOnIds(context.findEntryById('auth'))).toEqual(['login']);
      expect(duplicateIdDiagnosticsFor(context, 'auth')).toHaveLength(0);
    });

    it('document-milestone-cross-doc-duplicate preserves the explicit auth milestone without synthesizing a duplicate', () => {
      const entries: SirenEntry[] = [
        { type: 'task', id: 'login', attributes: [] },
        { type: 'milestone', id: 'auth', attributes: [] },
      ];
      const context = buildContext(entries);
      const authMilestones = context.entries.filter(
        (entry) => entry.type === 'milestone' && entry.id === 'auth',
      );

      expect(authMilestones).toHaveLength(1);
      expect(dependsOnIds(authMilestones[0]!)).toEqual([]);
      expect(duplicateIdDiagnosticsFor(context, 'auth')).toHaveLength(0);
    });
  });
});

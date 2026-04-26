import { describe, expect, it } from 'vitest';
import { IRContext } from '../src/ir/context';
import type { Resource, ResourceStatus, ResourceType } from '../src/ir/types';
import { withDerivedCompletionFlags } from '../src/utilities/entry';
import {
  buildDependencyGraph,
  isImplicitlyComplete,
  resolveStatus,
} from '../src/utilities/milestone';

/** Build a minimal Resource for testing */
function resource(
  type: ResourceType,
  id: string,
  opts?: { status?: ResourceStatus; dependsOn?: string[] },
): Resource {
  const attributes = opts?.dependsOn
    ? [
        {
          key: 'depends_on',
          value:
            opts.dependsOn.length === 1
              ? { kind: 'reference' as const, id: opts.dependsOn[0]! }
              : {
                  kind: 'array' as const,
                  elements: opts.dependsOn.map((d) => ({ kind: 'reference' as const, id: d })),
                },
        },
      ]
    : [];
  return withDerivedCompletionFlags({ type, id, status: opts?.status ?? 'active', attributes });
}

/** Build a Map<string, Resource> and DirectedGraph from resources */
function context(...resources: Resource[]) {
  return {
    map: new Map(resources.map((r) => [r.id, r])) as ReadonlyMap<string, Resource>,
    graph: buildDependencyGraph(resources),
  };
}

describe('isImplicitlyComplete', () => {
  it('returns false for a task even if all deps are complete', () => {
    const t1 = resource('task', 't1', { status: 'complete' });
    const t2 = resource('task', 't2', { dependsOn: ['t1'] });
    const { map, graph } = context(t1, t2);
    expect(isImplicitlyComplete(t2, map, graph)).toBe(false);
  });

  it('returns false for an orphan milestone (no depends_on)', () => {
    const m = resource('milestone', 'm');
    const { map, graph } = context(m);
    expect(isImplicitlyComplete(m, map, graph)).toBe(false);
  });

  it('returns false when a dependency is incomplete', () => {
    const a = resource('task', 'a');
    const m = resource('milestone', 'm', { dependsOn: ['a'] });
    const { map, graph } = context(a, m);
    expect(isImplicitlyComplete(m, map, graph)).toBe(false);
  });

  it('returns false when only some deps are complete', () => {
    const a = resource('task', 'a', { status: 'complete' });
    const b = resource('task', 'b');
    const m = resource('milestone', 'm', { dependsOn: ['a', 'b'] });
    const { map, graph } = context(a, b, m);
    expect(isImplicitlyComplete(m, map, graph)).toBe(false);
  });

  it('returns true when the single dep is complete', () => {
    const a = resource('task', 'a', { status: 'complete' });
    const m = resource('milestone', 'm', { dependsOn: ['a'] });
    const { map, graph } = context(a, m);
    expect(isImplicitlyComplete(m, map, graph)).toBe(true);
  });

  it('returns true when all multiple deps are complete', () => {
    const a = resource('task', 'a', { status: 'complete' });
    const b = resource('task', 'b', { status: 'complete' });
    const m = resource('milestone', 'm', { dependsOn: ['a', 'b'] });
    const { map, graph } = context(a, b, m);
    expect(isImplicitlyComplete(m, map, graph)).toBe(true);
  });

  it('returns true transitively through milestone chains', () => {
    const a = resource('task', 'a', { status: 'complete' });
    const m1 = resource('milestone', 'm1', { dependsOn: ['a'] });
    const m2 = resource('milestone', 'm2', { dependsOn: ['m1'] });
    const { map, graph } = context(a, m1, m2);
    expect(isImplicitlyComplete(m1, map, graph)).toBe(true);
    expect(isImplicitlyComplete(m2, map, graph)).toBe(true);
  });

  it('stops propagation when a dep in the chain is incomplete', () => {
    const a = resource('task', 'a', { status: 'complete' });
    const b = resource('task', 'b');
    const m1 = resource('milestone', 'm1', { dependsOn: ['a'] });
    const m2 = resource('milestone', 'm2', { dependsOn: ['m1', 'b'] });
    const { map, graph } = context(a, b, m1, m2);
    expect(isImplicitlyComplete(m1, map, graph)).toBe(true);
    expect(isImplicitlyComplete(m2, map, graph)).toBe(false);
  });

  it('returns true for an already explicitly-complete milestone when deps pass', () => {
    const a = resource('task', 'a', { status: 'complete' });
    const m = resource('milestone', 'm', { status: 'complete', dependsOn: ['a'] });
    const { map, graph } = context(a, m);
    expect(isImplicitlyComplete(m, map, graph)).toBe(true);
  });

  it('returns false when a dep is dangling (not in resource map)', () => {
    const m = resource('milestone', 'm', { dependsOn: ['missing'] });
    const { map, graph } = context(m);
    expect(isImplicitlyComplete(m, map, graph)).toBe(false);
  });

  it('returns false for a cycle (prevents infinite recursion)', () => {
    const m1 = resource('milestone', 'm1', { dependsOn: ['m2'] });
    const m2 = resource('milestone', 'm2', { dependsOn: ['m1'] });
    const { map, graph } = context(m1, m2);
    expect(isImplicitlyComplete(m1, map, graph)).toBe(false);
    expect(isImplicitlyComplete(m2, map, graph)).toBe(false);
  });
});

describe('resolveStatus', () => {
  it('passes task status through', () => {
    const task = resource('task', 'task', { status: 'draft' });
    const { map, graph } = context(task);
    expect(resolveStatus(task, map, graph)).toBe('draft');
  });

  it('resolves an orphan active milestone to draft', () => {
    const milestone = resource('milestone', 'milestone');
    const { map, graph } = context(milestone);
    expect(resolveStatus(milestone, map, graph)).toBe('draft');
  });

  it('resolves an active milestone with an empty depends_on array to draft', () => {
    const milestone = resource('milestone', 'milestone', { dependsOn: [] });
    const { map, graph } = context(milestone);
    expect(resolveStatus(milestone, map, graph)).toBe('draft');
  });

  it('passes explicit draft milestones through', () => {
    const dep = resource('task', 'dep', { status: 'complete' });
    const milestone = resource('milestone', 'milestone', {
      status: 'draft',
      dependsOn: ['dep'],
    });
    const { map, graph } = context(dep, milestone);
    expect(resolveStatus(milestone, map, graph)).toBe('draft');
  });

  it('resolves a milestone with all complete dependencies to complete', () => {
    const dep = resource('task', 'dep', { status: 'complete' });
    const milestone = resource('milestone', 'milestone', { dependsOn: ['dep'] });
    const { map, graph } = context(dep, milestone);
    expect(resolveStatus(milestone, map, graph)).toBe('complete');
  });

  it('resolves a milestone with mixed dependencies to active', () => {
    const completeDep = resource('task', 'complete-dep', { status: 'complete' });
    const activeDep = resource('task', 'active-dep');
    const milestone = resource('milestone', 'milestone', {
      dependsOn: ['complete-dep', 'active-dep'],
    });
    const { map, graph } = context(completeDep, activeDep, milestone);
    expect(resolveStatus(milestone, map, graph)).toBe('active');
  });

  it('resolves cyclic milestones to active', () => {
    const m1 = resource('milestone', 'm1', { dependsOn: ['m2'] });
    const m2 = resource('milestone', 'm2', { dependsOn: ['m1'] });
    const { map, graph } = context(m1, m2);
    expect(resolveStatus(m1, map, graph)).toBe('active');
    expect(resolveStatus(m2, map, graph)).toBe('active');
  });

  it('resolves a context milestone with an empty depends_on array to draft', () => {
    const milestone = resource('milestone', 'milestone', { dependsOn: [] });
    const context = IRContext.fromResources([milestone]);
    expect(context.findResourceById('milestone')).toMatchObject({
      status: 'draft',
      complete: false,
      draft: true,
    });
  });

  it('derives compatibility flags from resolved status', () => {
    const dep = resource('task', 'dep', { status: 'complete' });
    const milestone = {
      ...resource('milestone', 'milestone', { dependsOn: ['dep'] }),
      draft: true,
    };
    const context = IRContext.fromResources([dep, milestone]);
    expect(context.findResourceById('milestone')).toMatchObject({
      status: 'complete',
      complete: true,
      draft: false,
    });
  });
});

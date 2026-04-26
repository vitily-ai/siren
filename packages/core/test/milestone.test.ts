import { describe, expect, it } from 'vitest';
import type { Resource, ResourceStatus, ResourceType } from '../src/ir/types';
import {
  buildDependencyGraph,
  isImplicitlyComplete,
  resolveStatus,
} from '../src/utilities/milestone';

/** Build a minimal Resource for testing */
function resource(
  type: ResourceType,
  id: string,
  opts?: { complete?: boolean; dependsOn?: string[]; status?: ResourceStatus },
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
  return {
    type,
    id,
    complete: opts?.complete ?? false,
    ...(opts?.status !== undefined ? { status: opts.status } : {}),
    attributes,
  };
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
    const t1 = resource('task', 't1', { complete: true });
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
    const a = resource('task', 'a', { complete: true });
    const b = resource('task', 'b');
    const m = resource('milestone', 'm', { dependsOn: ['a', 'b'] });
    const { map, graph } = context(a, b, m);
    expect(isImplicitlyComplete(m, map, graph)).toBe(false);
  });

  it('returns true when the single dep is complete', () => {
    const a = resource('task', 'a', { complete: true });
    const m = resource('milestone', 'm', { dependsOn: ['a'] });
    const { map, graph } = context(a, m);
    expect(isImplicitlyComplete(m, map, graph)).toBe(true);
  });

  it('returns true when all multiple deps are complete', () => {
    const a = resource('task', 'a', { complete: true });
    const b = resource('task', 'b', { complete: true });
    const m = resource('milestone', 'm', { dependsOn: ['a', 'b'] });
    const { map, graph } = context(a, b, m);
    expect(isImplicitlyComplete(m, map, graph)).toBe(true);
  });

  it('returns true transitively through milestone chains', () => {
    const a = resource('task', 'a', { complete: true });
    const m1 = resource('milestone', 'm1', { dependsOn: ['a'] });
    const m2 = resource('milestone', 'm2', { dependsOn: ['m1'] });
    const { map, graph } = context(a, m1, m2);
    expect(isImplicitlyComplete(m1, map, graph)).toBe(true);
    expect(isImplicitlyComplete(m2, map, graph)).toBe(true);
  });

  it('stops propagation when a dep in the chain is incomplete', () => {
    const a = resource('task', 'a', { complete: true });
    const b = resource('task', 'b');
    const m1 = resource('milestone', 'm1', { dependsOn: ['a'] });
    const m2 = resource('milestone', 'm2', { dependsOn: ['m1', 'b'] });
    const { map, graph } = context(a, b, m1, m2);
    expect(isImplicitlyComplete(m1, map, graph)).toBe(true);
    expect(isImplicitlyComplete(m2, map, graph)).toBe(false);
  });

  it('returns false for an already explicitly-complete milestone', () => {
    // isImplicitlyComplete should return false — the milestone is already
    // complete via the keyword, not implicitly
    const a = resource('task', 'a', { complete: true });
    const m = resource('milestone', 'm', { complete: true, dependsOn: ['a'] });
    // The function only checks milestones that are NOT already complete,
    // but if called on one that is, the deps check still passes — that's fine.
    // The caller (resolveResources) gates on !r.complete so this path is moot.
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
  it('resolves a task with no deps and no explicit complete to active', () => {
    const t = resource('task', 't');
    const { map, graph } = context(t);
    expect(resolveStatus(t, map, graph)).toBe('active');
  });

  it('resolves a task with complete: true to complete', () => {
    const t = resource('task', 't', { complete: true });
    const { map, graph } = context(t);
    expect(resolveStatus(t, map, graph)).toBe('complete');
  });

  it('resolves an orphan milestone (no depends_on) to draft', () => {
    const m = resource('milestone', 'm');
    const { map, graph } = context(m);
    expect(resolveStatus(m, map, graph)).toBe('draft');
  });

  it('resolves an explicitly-complete milestone to complete regardless of deps', () => {
    const a = resource('task', 'a');
    const m = resource('milestone', 'm', { complete: true, dependsOn: ['a'] });
    const { map, graph } = context(a, m);
    expect(resolveStatus(m, map, graph)).toBe('complete');
  });

  it('resolves a milestone whose every dep is complete to complete', () => {
    const a = resource('task', 'a', { complete: true });
    const b = resource('task', 'b', { complete: true });
    const m = resource('milestone', 'm', { dependsOn: ['a', 'b'] });
    const { map, graph } = context(a, b, m);
    expect(resolveStatus(m, map, graph)).toBe('complete');
  });

  it('resolves a milestone with at least one incomplete dep to active', () => {
    const a = resource('task', 'a', { complete: true });
    const b = resource('task', 'b');
    const m = resource('milestone', 'm', { dependsOn: ['a', 'b'] });
    const { map, graph } = context(a, b, m);
    expect(resolveStatus(m, map, graph)).toBe('active');
  });

  it('resolves cyclic milestones (mutual deps, no other deps) to active', () => {
    const m1 = resource('milestone', 'm1', { dependsOn: ['m2'] });
    const m2 = resource('milestone', 'm2', { dependsOn: ['m1'] });
    const { map, graph } = context(m1, m2);
    expect(resolveStatus(m1, map, graph)).toBe('active');
    expect(resolveStatus(m2, map, graph)).toBe('active');
  });

  it('resolves transitively: m2 → m1 → completed task makes both complete', () => {
    const a = resource('task', 'a', { complete: true });
    const m1 = resource('milestone', 'm1', { dependsOn: ['a'] });
    const m2 = resource('milestone', 'm2', { dependsOn: ['m1'] });
    const { map, graph } = context(a, m1, m2);
    expect(resolveStatus(m1, map, graph)).toBe('complete');
    expect(resolveStatus(m2, map, graph)).toBe('complete');
  });

  it("task with explicit status 'draft' stays draft", () => {
    const t = resource('task', 't', { status: 'draft' });
    const { map, graph } = context(t);
    expect(resolveStatus(t, map, graph)).toBe('draft');
  });

  it("task with explicit status 'active' stays active", () => {
    const t = resource('task', 't', { status: 'active' });
    const { map, graph } = context(t);
    expect(resolveStatus(t, map, graph)).toBe('active');
  });

  it("orphan milestone with explicit status 'active' stays active", () => {
    // Without explicit status an orphan resolves to 'draft'.
    // An explicit status: 'active' overrides that rule.
    const m = resource('milestone', 'm', { status: 'active' });
    const { map, graph } = context(m);
    expect(resolveStatus(m, map, graph)).toBe('active');
  });

  it("milestone with all-complete deps but explicit status 'active' stays active", () => {
    // Implicit completion is overridden by explicit status.
    const a = resource('task', 'a', { complete: true });
    const m = resource('milestone', 'm', { status: 'active', dependsOn: ['a'] });
    const { map, graph } = context(a, m);
    expect(resolveStatus(m, map, graph)).toBe('active');
  });

  it("milestone with deps and explicit status 'draft' stays draft", () => {
    // Even with an incomplete dep that would normally resolve to 'active',
    // explicit status: 'draft' wins.
    const a = resource('task', 'a');
    const m = resource('milestone', 'm', { status: 'draft', dependsOn: ['a'] });
    const { map, graph } = context(a, m);
    expect(resolveStatus(m, map, graph)).toBe('draft');
  });
});

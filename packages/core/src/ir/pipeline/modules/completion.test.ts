import { describe, expect, it } from 'vitest';
import { ResourceGraph } from '../../../../src/ir/resource-graph';
import type { Resource, ResourceStatus, ResourceType } from '../../../../src/ir/types';
import { ImplicitCompletionModule } from './completion';

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
  return {
    type,
    id,
    ...(opts?.status !== undefined ? { status: opts.status } : {}),
    attributes,
  };
}

type ImplicitCompletionInput = Parameters<typeof ImplicitCompletionModule.run>[0];
type ImplicitCompletionResult = ReturnType<typeof ImplicitCompletionModule.run>;

function resolveCompletion(...resources: Resource[]): ImplicitCompletionResult {
  const seed: ImplicitCompletionInput = {
    graph: ResourceGraph.fromResources(resources),
  };

  return ImplicitCompletionModule.run(seed);
}

function statusOf(result: ImplicitCompletionResult, id: string): ResourceStatus | undefined {
  return result.graph.getResource(id)?.status;
}

describe('ImplicitCompletionModule', () => {
  it('does not mark a task complete even if all deps are complete', () => {
    const t1 = resource('task', 't1', { status: 'complete' });
    const t2 = resource('task', 't2', { dependsOn: ['t1'] });
    const result = resolveCompletion(t1, t2);
    expect(statusOf(result, 't2')).toBeUndefined();
  });

  it('does not mark an orphan milestone complete (no depends_on)', () => {
    const m = resource('milestone', 'm');
    const result = resolveCompletion(m);
    expect(statusOf(result, 'm')).toBeUndefined();
  });

  it('does not mark complete when a dependency is incomplete', () => {
    const a = resource('task', 'a');
    const m = resource('milestone', 'm', { dependsOn: ['a'] });
    const result = resolveCompletion(a, m);
    expect(statusOf(result, 'm')).toBeUndefined();
  });

  it('does not mark complete when only some deps are complete', () => {
    const a = resource('task', 'a', { status: 'complete' });
    const b = resource('task', 'b');
    const m = resource('milestone', 'm', { dependsOn: ['a', 'b'] });
    const result = resolveCompletion(a, b, m);
    expect(statusOf(result, 'm')).toBeUndefined();
  });

  it('writes status complete when the single dep is complete', () => {
    const a = resource('task', 'a', { status: 'complete' });
    const m = resource('milestone', 'm', { dependsOn: ['a'] });
    const result = resolveCompletion(a, m);
    expect(statusOf(result, 'm')).toBe('complete');
  });

  it('writes status complete when all multiple deps are complete', () => {
    const a = resource('task', 'a', { status: 'complete' });
    const b = resource('task', 'b', { status: 'complete' });
    const m = resource('milestone', 'm', { dependsOn: ['a', 'b'] });
    const result = resolveCompletion(a, b, m);
    expect(statusOf(result, 'm')).toBe('complete');
  });

  it('resolves completion transitively through milestone chains', () => {
    const a = resource('task', 'a', { status: 'complete' });
    const m1 = resource('milestone', 'm1', { dependsOn: ['a'] });
    const m2 = resource('milestone', 'm2', { dependsOn: ['m1'] });
    const result = resolveCompletion(a, m1, m2);
    expect(statusOf(result, 'm1')).toBe('complete');
    expect(statusOf(result, 'm2')).toBe('complete');
  });

  it('stops propagation when a dep in the chain is incomplete', () => {
    const a = resource('task', 'a', { status: 'complete' });
    const b = resource('task', 'b');
    const m1 = resource('milestone', 'm1', { dependsOn: ['a'] });
    const m2 = resource('milestone', 'm2', { dependsOn: ['m1', 'b'] });
    const result = resolveCompletion(a, b, m1, m2);
    expect(statusOf(result, 'm1')).toBe('complete');
    expect(statusOf(result, 'm2')).toBeUndefined();
  });

  it('keeps an explicitly complete milestone complete', () => {
    const a = resource('task', 'a', { status: 'complete' });
    const m = resource('milestone', 'm', { status: 'complete', dependsOn: ['a'] });
    const result = resolveCompletion(a, m);
    expect(statusOf(result, 'm')).toBe('complete');
  });

  it('keeps an explicitly draft milestone draft even when deps are complete', () => {
    const a = resource('task', 'a', { status: 'complete' });
    const m = resource('milestone', 'm', { status: 'draft', dependsOn: ['a'] });
    const result = resolveCompletion(a, m);
    expect(statusOf(result, 'm')).toBe('draft');
  });

  it('keeps an explicitly draft task draft', () => {
    const a = resource('task', 'a', { status: 'complete' });
    const t = resource('task', 't', { status: 'draft', dependsOn: ['a'] });
    const result = resolveCompletion(a, t);
    expect(statusOf(result, 't')).toBe('draft');
  });

  it('does not treat an explicitly draft milestone dependency as complete', () => {
    const a = resource('task', 'a', { status: 'complete' });
    const m1 = resource('milestone', 'm1', { status: 'draft', dependsOn: ['a'] });
    const m2 = resource('milestone', 'm2', { dependsOn: ['m1'] });
    const result = resolveCompletion(a, m1, m2);
    expect(statusOf(result, 'm1')).toBe('draft');
    expect(statusOf(result, 'm2')).toBeUndefined();
  });

  it('does not mark complete when a dep is dangling (not in resource map)', () => {
    const m = resource('milestone', 'm', { dependsOn: ['missing'] });
    const result = resolveCompletion(m);
    expect(statusOf(result, 'm')).toBeUndefined();
  });

  it('does not mark complete for a cycle (prevents infinite recursion)', () => {
    const m1 = resource('milestone', 'm1', { dependsOn: ['m2'] });
    const m2 = resource('milestone', 'm2', { dependsOn: ['m1'] });
    const result = resolveCompletion(m1, m2);
    expect(statusOf(result, 'm1')).toBeUndefined();
    expect(statusOf(result, 'm2')).toBeUndefined();
  });
});

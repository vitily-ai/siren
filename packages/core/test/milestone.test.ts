import { describe, expect, it } from 'vitest';
import { ImplicitCompletionModule } from '../src/ir/pipeline/modules/completion';
import { ResourceGraph } from '../src/ir/resource-graph';
import type { Resource, ResourceType } from '../src/ir/types';

/** Build a minimal Resource for testing */
function resource(
  type: ResourceType,
  id: string,
  opts?: { complete?: boolean; dependsOn?: string[] },
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
  return { type, id, complete: opts?.complete ?? false, attributes };
}

type ImplicitCompletionInput = Parameters<typeof ImplicitCompletionModule.run>[0];
type ImplicitCompletionResult = ReturnType<typeof ImplicitCompletionModule.run>;

function resolveCompletion(...resources: Resource[]): ImplicitCompletionResult {
  const seed: ImplicitCompletionInput = {
    graph: ResourceGraph.fromResources(resources),
  };

  return ImplicitCompletionModule.run(seed);
}

function completionOf(result: ImplicitCompletionResult, id: string): boolean | undefined {
  return result.graph.getResource(id)?.complete;
}

describe('ImplicitCompletionModule', () => {
  it('returns false for a task even if all deps are complete', () => {
    const t1 = resource('task', 't1', { complete: true });
    const t2 = resource('task', 't2', { dependsOn: ['t1'] });
    const result = resolveCompletion(t1, t2);
    expect(completionOf(result, 't2')).toBe(false);
  });

  it('returns false for an orphan milestone (no depends_on)', () => {
    const m = resource('milestone', 'm');
    const result = resolveCompletion(m);
    expect(completionOf(result, 'm')).toBe(false);
  });

  it('returns false when a dependency is incomplete', () => {
    const a = resource('task', 'a');
    const m = resource('milestone', 'm', { dependsOn: ['a'] });
    const result = resolveCompletion(a, m);
    expect(completionOf(result, 'm')).toBe(false);
  });

  it('returns false when only some deps are complete', () => {
    const a = resource('task', 'a', { complete: true });
    const b = resource('task', 'b');
    const m = resource('milestone', 'm', { dependsOn: ['a', 'b'] });
    const result = resolveCompletion(a, b, m);
    expect(completionOf(result, 'm')).toBe(false);
  });

  it('returns true when the single dep is complete', () => {
    const a = resource('task', 'a', { complete: true });
    const m = resource('milestone', 'm', { dependsOn: ['a'] });
    const result = resolveCompletion(a, m);
    expect(completionOf(result, 'm')).toBe(true);
  });

  it('returns true when all multiple deps are complete', () => {
    const a = resource('task', 'a', { complete: true });
    const b = resource('task', 'b', { complete: true });
    const m = resource('milestone', 'm', { dependsOn: ['a', 'b'] });
    const result = resolveCompletion(a, b, m);
    expect(completionOf(result, 'm')).toBe(true);
  });

  it('returns true transitively through milestone chains', () => {
    const a = resource('task', 'a', { complete: true });
    const m1 = resource('milestone', 'm1', { dependsOn: ['a'] });
    const m2 = resource('milestone', 'm2', { dependsOn: ['m1'] });
    const result = resolveCompletion(a, m1, m2);
    expect(completionOf(result, 'm1')).toBe(true);
    expect(completionOf(result, 'm2')).toBe(true);
  });

  it('stops propagation when a dep in the chain is incomplete', () => {
    const a = resource('task', 'a', { complete: true });
    const b = resource('task', 'b');
    const m1 = resource('milestone', 'm1', { dependsOn: ['a'] });
    const m2 = resource('milestone', 'm2', { dependsOn: ['m1', 'b'] });
    const result = resolveCompletion(a, b, m1, m2);
    expect(completionOf(result, 'm1')).toBe(true);
    expect(completionOf(result, 'm2')).toBe(false);
  });

  it('keeps an explicitly complete milestone complete', () => {
    const a = resource('task', 'a', { complete: true });
    const m = resource('milestone', 'm', { complete: true, dependsOn: ['a'] });
    const result = resolveCompletion(a, m);
    expect(completionOf(result, 'm')).toBe(true);
  });

  it('returns false when a dep is dangling (not in resource map)', () => {
    const m = resource('milestone', 'm', { dependsOn: ['missing'] });
    const result = resolveCompletion(m);
    expect(completionOf(result, 'm')).toBe(false);
  });

  it('returns false for a cycle (prevents infinite recursion)', () => {
    const m1 = resource('milestone', 'm1', { dependsOn: ['m2'] });
    const m2 = resource('milestone', 'm2', { dependsOn: ['m1'] });
    const result = resolveCompletion(m1, m2);
    expect(completionOf(result, 'm1')).toBe(false);
    expect(completionOf(result, 'm2')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { ResourceGraph } from '../../../../src/ir/resource-graph';
import type { Resource, ResourceStatus, ResourceType } from '../../../../src/ir/types';
import { ImplicitCompletionModule } from './completion';
import { ImplicitDraftMilestoneModule } from './implicit-draft-milestone';

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

type ImplicitDraftInput = Parameters<typeof ImplicitDraftMilestoneModule.run>[0];
type ImplicitDraftResult = ReturnType<typeof ImplicitDraftMilestoneModule.run>;

function resolveDraft(...resources: Resource[]): ImplicitDraftResult {
  const seed: ImplicitDraftInput = {
    graph: ResourceGraph.fromResources(resources),
  };
  return ImplicitDraftMilestoneModule.run(seed);
}

function statusOf(
  result: ImplicitDraftResult | ReturnType<typeof ImplicitCompletionModule.run>,
  id: string,
): ResourceStatus | undefined {
  return result.graph.getResource(id)?.status;
}

describe('ImplicitDraftMilestoneModule', () => {
  it('promotes an orphan milestone (no deps, no status) to draft', () => {
    const m = resource('milestone', 'orphan');
    const result = resolveDraft(m);
    expect(statusOf(result, 'orphan')).toBe('draft');
  });

  it('does not promote an orphan task to draft', () => {
    const t = resource('task', 'orphan-task');
    const result = resolveDraft(t);
    expect(statusOf(result, 'orphan-task')).not.toBe('draft');
    expect(statusOf(result, 'orphan-task')).toBeUndefined();
  });

  it('does not draft a milestone that has dependencies (depends_on non-empty)', () => {
    const dep = resource('task', 'dep');
    const m = resource('milestone', 'has-deps', { dependsOn: ['dep'] });
    const result = resolveDraft(dep, m);
    expect(statusOf(result, 'has-deps')).not.toBe('draft');
  });

  it('does not overwrite an explicitly complete orphan milestone', () => {
    const m = resource('milestone', 'explicit-complete', { status: 'complete' });
    const result = resolveDraft(m);
    expect(statusOf(result, 'explicit-complete')).toBe('complete');
  });

  it('does not overwrite an explicitly draft orphan milestone', () => {
    const m = resource('milestone', 'explicit-draft', { status: 'draft' });
    const result = resolveDraft(m);
    expect(statusOf(result, 'explicit-draft')).toBe('draft');
  });

  it('drafts multiple orphan milestones in one pass', () => {
    const m1 = resource('milestone', 'orphan-1');
    const m2 = resource('milestone', 'orphan-2');
    const result = resolveDraft(m1, m2);
    expect(statusOf(result, 'orphan-1')).toBe('draft');
    expect(statusOf(result, 'orphan-2')).toBe('draft');
  });

  it('does not draft a non-orphan milestone that has multiple dependencies', () => {
    const a = resource('task', 'a');
    const b = resource('task', 'b');
    const m = resource('milestone', 'multi-dep', { dependsOn: ['a', 'b'] });
    const result = resolveDraft(a, b, m);
    expect(statusOf(result, 'multi-dep')).not.toBe('draft');
  });
});

describe('ImplicitDraftMilestoneModule × ImplicitCompletionModule ordering', () => {
  it('drafts orphan milestone before completion, preventing parent from completing', () => {
    // Pipeline contract: ImplicitDraftMilestoneModule runs before ImplicitCompletionModule.
    // When composed in the correct order, the parent milestone is NOT implicitly
    // completed because the orphan is seen as explicitly drafted.
    const resources = [
      resource('milestone', 'orphan'),
      resource('milestone', 'parent', { dependsOn: ['orphan'] }),
    ];

    const draftResult = resolveDraft(...resources);
    // Draft module must have assigned draft to the orphan before completion sees it.
    expect(statusOf(draftResult, 'orphan')).toBe('draft');

    const completionResult = ImplicitCompletionModule.run({ graph: draftResult.graph });
    // Completion must not promote parent to complete while its dep is draft.
    expect(statusOf(completionResult, 'orphan')).toBe('draft');
    expect(statusOf(completionResult, 'parent')).not.toBe('complete');
  });

  it('allows parent to complete when orphan dep is explicitly marked complete instead', () => {
    // Confirms the interaction is draft-specific, not an artifact of the milestone having no deps.
    const resources = [
      resource('milestone', 'inner', { status: 'complete' }),
      resource('milestone', 'parent', { dependsOn: ['inner'] }),
    ];

    const draftResult = resolveDraft(...resources);
    // Explicitly complete inner must not be overwritten.
    expect(statusOf(draftResult, 'inner')).toBe('complete');

    const completionResult = ImplicitCompletionModule.run({ graph: draftResult.graph });
    // Parent's dep is complete → parent should be implicitly completed.
    expect(statusOf(completionResult, 'parent')).toBe('complete');
  });
});

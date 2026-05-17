import { SirenBuilder, type SirenProject } from '@sirenpm/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { getAdapter, parseAndDecodeAll } from './helper';

describe('project:implicit-draft-milestone', () => {
  let project: SirenProject;

  beforeAll(async () => {
    const adapter = await getAdapter();
    const decoded = await parseAndDecodeAll(adapter, 'implicit-draft-milestone');
    project = SirenBuilder.fromResources(decoded.resources, '').build();
  });

  it.skip('promotes an orphan milestone (no deps, no status) to draft', () => {
    const orphan = project.findResourceById('orphan-milestone');
    expect(orphan.status).toBe('draft');
  });

  it('does not promote an orphan task to draft', () => {
    const task = project.findResourceById('orphan-task');
    expect(task.status).not.toBe('draft');
  });

  it('does not draft a milestone that has dependencies', () => {
    const hasDeps = project.findResourceById('has-deps');
    expect(hasDeps.status).not.toBe('draft');
  });

  it('does not overwrite an explicitly complete orphan milestone', () => {
    const completeOrphan = project.findResourceById('complete-orphan');
    expect(completeOrphan.status).toBe('complete');
  });

  it('does not implicitly complete a milestone whose only dep is a drafted orphan', () => {
    const parent = project.findResourceById('parent-of-orphan');
    expect(parent.status).not.toBe('complete');
  });
});

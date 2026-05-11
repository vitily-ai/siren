import type { SirenDocument } from '@sirenpm/core';
import { describe, expect, it } from 'vitest';
import { renderSirenDocument } from '../../src/export/render-document';

// Helper to build a minimal SirenDocument
function makeDoc(resources: SirenDocument['resources']): SirenDocument {
  return { id: 'test-doc', resources };
}

describe('renderSirenDocument', () => {
  it('renders a single task with no attributes', () => {
    const doc = makeDoc([{ type: 'task', id: 'my-task', attributes: [] }]);
    expect(renderSirenDocument(doc)).toBe('task my-task {}\n');
  });

  it('renders a task with complete status', () => {
    const doc = makeDoc([{ type: 'task', id: 'my-task', status: 'complete', attributes: [] }]);
    expect(renderSirenDocument(doc)).toBe('task my-task complete {}\n');
  });

  it('renders a task with draft status', () => {
    const doc = makeDoc([{ type: 'task', id: 'my-task', status: 'draft', attributes: [] }]);
    expect(renderSirenDocument(doc)).toBe('task my-task draft {}\n');
  });

  it('renders a task with a description attribute', () => {
    const doc = makeDoc([
      {
        type: 'task',
        id: 'my-task',
        attributes: [{ key: 'description', value: 'do the thing' }],
      },
    ]);
    expect(renderSirenDocument(doc)).toBe(
      `task my-task {
  description = "do the thing"
}
`,
    );
  });

  it('renders a milestone with array depends_on', () => {
    const doc = makeDoc([
      {
        type: 'milestone',
        id: 'release-1',
        attributes: [
          {
            key: 'depends_on',
            value: {
              kind: 'array',
              elements: [
                { kind: 'reference', id: 'task-a' },
                { kind: 'reference', id: 'task-b' },
              ],
            },
          },
        ],
      },
    ]);
    expect(renderSirenDocument(doc)).toBe(
      `milestone release-1 {
  depends_on = [task-a, task-b]
}
`,
    );
  });

  it('renders a task with a single-reference depends_on', () => {
    const doc = makeDoc([
      {
        type: 'task',
        id: 'downstream',
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'upstream' } }],
      },
    ]);
    expect(renderSirenDocument(doc)).toBe(
      `task downstream {
  depends_on = upstream
}
`,
    );
  });

  it('quotes identifiers that contain spaces', () => {
    const doc = makeDoc([{ type: 'task', id: 'my task', attributes: [] }]);
    expect(renderSirenDocument(doc)).toBe('task "my task" {}\n');
  });

  it('renders multiple resources separated by a blank line', () => {
    const doc = makeDoc([
      { type: 'task', id: 'task-a', attributes: [] },
      { type: 'milestone', id: 'release-1', attributes: [] },
    ]);
    expect(renderSirenDocument(doc)).toBe(
      `task task-a {}

milestone release-1 {}
`,
    );
  });

  it('returns an empty string for a document with no resources', () => {
    const doc = makeDoc([]);
    expect(renderSirenDocument(doc)).toBe('');
  });
});

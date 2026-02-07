import { describe, expect, it } from 'vitest';
import { exportToSiren, IRContext, type Resource } from './index.js';

describe('exportToSiren', () => {
  it('formats primitives and complete flag', () => {
    const resources: Resource[] = [
      {
        type: 'task',
        id: 'task1',
        complete: false,
        attributes: [
          { key: 'title', value: 'Do the thing' },
          { key: 'count', value: 5 },
          { key: 'enabled', value: true },
          { key: 'maybe', value: null },
        ],
      },
      {
        type: 'milestone',
        id: 'm1',
        complete: true,
        attributes: [],
      },
    ];
    const ir = IRContext.fromResources(resources);
    const out = exportToSiren(ir);
    const expected =
      'task task1 {\n' +
      '  title = "Do the thing"\n' +
      '  count = 5\n' +
      '  enabled = true\n' +
      '  maybe = null\n' +
      '}\n\n' +
      'milestone m1 complete {}\n';
    expect(out).toBe(expected);
  });

  it('formats arrays and references', () => {
    const resources: Resource[] = [
      {
        type: 'task',
        id: 'task1',
        complete: false,
        attributes: [],
      },
      {
        type: 'milestone',
        id: 'm2',
        complete: false,
        attributes: [
          {
            key: 'depends_on',
            value: { kind: 'array', elements: [{ kind: 'reference', id: 'task1' }] },
          },
          { key: 'labels', value: { kind: 'array', elements: ['a', 'b'] } },
        ],
      },
    ];
    const ir = IRContext.fromResources(resources);
    const out = exportToSiren(ir);
    const expected =
      'task task1 {}\n\n' +
      'milestone m2 {\n' +
      '  depends_on = [task1]\n' +
      '  labels = ["a", "b"]\n' +
      '}\n';
    expect(out).toBe(expected);
  });

  it('formats an empty milestone as single-line block', () => {
    const resources: Resource[] = [
      {
        type: 'milestone',
        id: 'empty',
        complete: false,
        attributes: [],
      },
    ];
    const ir = IRContext.fromResources(resources);
    const out = exportToSiren(ir);
    const expected = 'milestone empty {}\n';
    expect(out).toBe(expected);
  });

  it('formats an empty task as single-line block', () => {
    const resources: Resource[] = [
      {
        type: 'task',
        id: 'empty',
        complete: false,
        attributes: [],
      },
    ];
    const ir = IRContext.fromResources(resources);
    const out = exportToSiren(ir);
    const expected = 'task empty {}\n';
    expect(out).toBe(expected);
  });
});

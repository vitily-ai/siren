import type { Attribute, EntryReference, SirenEntry } from '@sirenpm/core';
import { describe, expect, it } from 'vitest';
// Import from the module that doesn't exist yet — this will fail (red phase)
import { renderEntry } from './render-entry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an EntryReference atom */
const ref = (id: string): EntryReference => ({ kind: 'reference', id });

/** Create an Attribute with a single-atom tuple */
const attr = (key: string, value: unknown): Attribute => {
  if (Array.isArray(value)) {
    return { key, value: value as Attribute['value'] };
  }
  return { key, value: [value as string | number | boolean | EntryReference] };
};

/** Create an Attribute with an empty tuple (for testing skip behavior) */
const emptyAttr = (key: string): Attribute => ({ key, value: [] });

// ---------------------------------------------------------------------------
// renderEntry tests
// ---------------------------------------------------------------------------

describe('renderEntry', () => {
  // ---- basic entry shapes ----

  it('renders an empty task with no status and no attributes', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [],
    };
    expect(renderEntry(entry)).toBe('task foo {}\n');
  });

  it('renders a task with explicit complete status', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      status: 'complete',
      attributes: [],
    };
    expect(renderEntry(entry)).toBe('task foo complete {}\n');
  });

  it('renders a task with explicit draft status', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      status: 'draft',
      attributes: [],
    };
    expect(renderEntry(entry)).toBe('task foo draft {}\n');
  });

  it('renders a milestone type', () => {
    const entry: SirenEntry = {
      type: 'milestone',
      id: 'm1',
      attributes: [attr('depends_on', ref('t1'))],
    };
    expect(renderEntry(entry)).toBe('milestone m1 {\n  depends_on = t1\n}\n');
  });

  // ---- single-attribute rendering ----

  it('renders a task with a single string attribute', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [attr('description', 'hello')],
    };
    expect(renderEntry(entry)).toBe('task foo {\n  description = "hello"\n}\n');
  });

  it('renders a task with a single number attribute', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [attr('priority', 1)],
    };
    expect(renderEntry(entry)).toBe('task foo {\n  priority = 1\n}\n');
  });

  it('renders a task with a single boolean attribute (true)', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [attr('blocked', true)],
    };
    expect(renderEntry(entry)).toBe('task foo {\n  blocked = true\n}\n');
  });

  it('renders a task with a single boolean attribute (false)', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [attr('blocked', false)],
    };
    expect(renderEntry(entry)).toBe('task foo {\n  blocked = false\n}\n');
  });

  it('renders a task with a single reference attribute (bare identifier)', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [attr('depends_on', ref('bar'))],
    };
    expect(renderEntry(entry)).toBe('task foo {\n  depends_on = bar\n}\n');
  });

  // ---- multi-atom tuple (comma-separated, no brackets) ----

  it('renders a multi-atom tuple as comma-separated values (no brackets)', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [attr('depends_on', [ref('bar'), ref('baz')])],
    };
    expect(renderEntry(entry)).toBe('task foo {\n  depends_on = bar, baz\n}\n');
  });

  // ---- multiple attributes ----

  it('renders a task with multiple attributes (each on its own line)', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [attr('description', 'a'), attr('depends_on', ref('b'))],
    };
    expect(renderEntry(entry)).toBe('task foo {\n  description = "a"\n  depends_on = b\n}\n');
  });

  // ---- empty tuple: attribute skipped ----

  it('skips attributes with an empty tuple value', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [emptyAttr('description'), attr('depends_on', ref('bar'))],
    };
    // description should be skipped entirely; only depends_on renders
    expect(renderEntry(entry)).toBe('task foo {\n  depends_on = bar\n}\n');
  });

  it('renders empty body when all attributes are empty tuples', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [emptyAttr('description'), emptyAttr('depends_on')],
    };
    // All attributes skipped → empty body
    expect(renderEntry(entry)).toBe('task foo {}\n');
  });

  // ---- identifier quoting rules ----

  it('renders a valid bare identifier as-is (no quoting)', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 't',
      attributes: [attr('depends_on', ref('foo_bar'))],
    };
    // foo_bar matches [a-zA-Z_][a-zA-Z0-9_-]* → stays bare
    expect(renderEntry(entry)).toBe('task t {\n  depends_on = foo_bar\n}\n');
  });

  it('quotes an identifier containing spaces', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 't',
      attributes: [attr('depends_on', ref('has spaces'))],
    };
    // spaces are invalid ident chars → quoted
    expect(renderEntry(entry)).toBe('task t {\n  depends_on = "has spaces"\n}\n');
  });

  it('quotes an identifier starting with a digit', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 't',
      attributes: [attr('depends_on', ref('123foo'))],
    };
    // starts with digit → not a valid bare ident → quoted
    expect(renderEntry(entry)).toBe('task t {\n  depends_on = "123foo"\n}\n');
  });

  it('quotes an identifier with special characters (hyphens, dots, etc.)', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 't',
      attributes: [attr('depends_on', ref('my-task.v2'))],
    };
    // hyphen allowed in bare idents per regex, but dot is not → quoted
    expect(renderEntry(entry)).toBe('task t {\n  depends_on = "my-task.v2"\n}\n');
  });

  // ---- string atom rendering ----

  it('renders a string atom with special characters (spaces preserved)', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [attr('description', 'hello world')],
    };
    // string atom with spaces → double-quoted, content preserved
    expect(renderEntry(entry)).toBe('task foo {\n  description = "hello world"\n}\n');
  });

  it('renders a string atom containing double-quote via escaping', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [attr('description', 'say "hi"')],
    };
    // The renderer should escape internal double quotes with backslash
    expect(renderEntry(entry)).toBe('task foo {\n  description = "say \\"hi\\""\n}\n');
  });

  // ---- number atom rendering ----

  it('renders negative numbers', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [attr('priority', -5)],
    };
    expect(renderEntry(entry)).toBe('task foo {\n  priority = -5\n}\n');
  });

  it('renders floating-point numbers', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [attr('weight', 3.14)],
    };
    expect(renderEntry(entry)).toBe('task foo {\n  weight = 3.14\n}\n');
  });

  // ---- mixed tuple types ----

  it('renders a mixed tuple of references and strings as comma-separated atoms', () => {
    const entry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [attr('tags', [ref('urgent'), 'label', ref('backend')])],
    };
    expect(renderEntry(entry)).toBe('task foo {\n  tags = urgent, "label", backend\n}\n');
  });

  // ---- edge: entry with only status, no attributes ----

  it('renders a milestone with draft status', () => {
    const entry: SirenEntry = {
      type: 'milestone',
      id: 'release-1',
      status: 'draft',
      attributes: [],
    };
    expect(renderEntry(entry)).toBe('milestone release-1 draft {}\n');
  });
});

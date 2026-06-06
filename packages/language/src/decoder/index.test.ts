import { isReference, type SirenEntry } from '@sirenpm/core';
import { describe, expect, it } from 'vitest';
import type { SourcedEntry } from '../origin';
import { createParser } from '../parser/factory';
import type { ParsedDocument, SourceDocument } from '../parser/types';

async function parseDoc(name: string, content: string): Promise<ParsedDocument> {
  const parser = await createParser();
  const source: SourceDocument = { name, content };
  return parser.parse(source);
}

async function decode(name: string, content: string): Promise<readonly SourcedEntry[]> {
  const parsed = await parseDoc(name, content);
  return parsed.toEntries();
}

describe('decodeAstToEntries', () => {
  describe('empty document', () => {
    it('decodes an empty document into zero entries', async () => {
      const entries = await decode('doc.siren', '');
      expect(entries).toEqual([]);
    });
  });

  describe('entry shape', () => {
    it('decodes a single empty task with no status and no attributes', async () => {
      const entries = await decode('doc.siren', 'task foo {}');
      expect(entries).toHaveLength(1);
      const r = entries[0];
      expect(r.type).toBe('task');
      expect(r.id).toBe('foo');
      expect(r.status).toBeUndefined();
      expect(r.attributes).toEqual([]);
    });

    it('passes through `complete` status from the AST', async () => {
      const entries = await decode('doc.siren', 'task foo complete {}');
      expect(entries[0].status).toBe('complete');
    });

    it('passes through `draft` status from the AST', async () => {
      const entries = await decode('doc.siren', 'task foo draft {}');
      expect(entries[0].status).toBe('draft');
    });

    it('decodes a milestone and a task in the same document in source order', async () => {
      const entries = await decode('doc.siren', 'task t {}\nmilestone m {}');
      expect(entries.map((r) => [r.type, r.id])).toEqual([
        ['task', 't'],
        ['milestone', 'm'],
      ]);
    });

    it('omits entries that the AST builder dropped via EL001', async () => {
      // Stray token between entries → tree-sitter parses `task broken @` as a
      // top-level ERROR node, which the AST builder reports as EL001 and drops.
      // The well-formed `task ok {}` must survive.
      const parsed = await parseDoc('doc.siren', 'task broken @\ntask ok {}');
      const entries = parsed.toEntries();
      const ids = entries.map((r) => r.id);
      expect(ids).not.toContain('broken');
      expect(ids).toContain('ok');
      // The well-formed entry is salvaged precisely because the malformed
      // one was reported via EL001 and dropped; assert the diagnostic is there
      // so a regression that silently drops entries without reporting will
      // fail loudly.
      expect(parsed.diagnostics.some((d) => d.code === 'EL001')).toBe(true);
    });
  });

  describe('attribute values', () => {
    it('decodes a string scalar as a one-element tuple of string', async () => {
      const entries = await decode('doc.siren', 'task t { description = "hi" }');
      const attr = entries[0].attributes[0];
      expect(attr.key).toBe('description');
      expect(attr.value).toEqual(['hi']);
    });

    it('decodes a number scalar as a one-element tuple', async () => {
      const entries = await decode('doc.siren', 'task t { count = 42 }');
      expect(entries[0].attributes[0].value).toEqual([42]);
    });

    it('decodes a boolean scalar as a one-element tuple', async () => {
      const entries = await decode('doc.siren', 'task t { active = true }');
      expect(entries[0].attributes[0].value).toEqual([true]);
    });

    it('decodes a bare identifier as a ResourceReference atom', async () => {
      const entries = await decode('doc.siren', 'task t { owner = alice }');
      const tuple = entries[0].attributes[0].value;
      expect(tuple).toEqual([{ kind: 'reference', id: 'alice' }]);
    });

    it('decodes a list of bare identifiers in depends_on as references', async () => {
      const entries = await decode('doc.siren', 'milestone m { depends_on = [a, b] }');
      expect(entries[0].attributes[0].value).toEqual([
        { kind: 'reference', id: 'a' },
        { kind: 'reference', id: 'b' },
      ]);
    });

    it('decodes a quoted string inside depends_on as a ResourceReference', async () => {
      const entries = await decode('doc.siren', 'milestone m { depends_on = ["x"] }');
      expect(entries[0].attributes[0].value).toEqual([{ kind: 'reference', id: 'x' }]);
    });

    it('decodes a quoted string outside depends_on as a plain string atom', async () => {
      const entries = await decode('doc.siren', 'task t { note = "hi" }');
      expect(entries[0].attributes[0].value).toEqual(['hi']);
    });

    it('only rewrites quoted strings to references inside depends_on (mixed non-depends_on)', async () => {
      const entries = await decode('doc.siren', 'task t { mixed = [a, "b"] }');
      expect(entries[0].attributes[0].value).toEqual([{ kind: 'reference', id: 'a' }, 'b']);
    });

    it('rewrites quoted strings to references inside a mixed depends_on list', async () => {
      const entries = await decode('doc.siren', 'milestone m { depends_on = [a, "b"] }');
      expect(entries[0].attributes[0].value).toEqual([
        { kind: 'reference', id: 'a' },
        { kind: 'reference', id: 'b' },
      ]);
    });
  });

  describe('origin metadata', () => {
    it('attaches a RangeOrigin to an entry pinned to the entry CST span', async () => {
      // `'task t {}'` is a single line, 9 ASCII chars. The `resource` CST node
      // spans the full content.
      const content = 'task t {}';
      const entries = await decode('doc.siren', content);
      const r = entries[0];
      expect(r.origin).toEqual({
        kind: 'range',
        document: 'doc.siren',
        startByte: 0,
        endByte: content.length, // 9
        startRow: 0,
        endRow: 0,
      });
    });

    it('attaches a RangeOrigin to an attribute pinned to the attribute CST span', async () => {
      // Layout (bytes):
      //   row 0: 'task t {\n'      bytes 0..8  (incl. newline at 8)
      //   row 1: '  description = "hi"\n'  bytes 9..29 (incl. newline at 29)
      //   row 2: '}\n'              bytes 30..31
      // The `attribute` node spans from `description` (col 2, byte 11)
      // through the closing quote of `"hi"` (byte 29 exclusive).
      const entries = await decode('doc.siren', 'task t {\n  description = "hi"\n}\n');
      const a = entries[0].attributes[0];
      expect(a.origin).toEqual({
        kind: 'range',
        document: 'doc.siren',
        startByte: 11,
        endByte: 29,
        startRow: 1,
        endRow: 1,
      });
    });

    it('gives each entry in a multi-entry document its own distinct range', async () => {
      // Layout (bytes):
      //   row 0: 'task a {}\n'  bytes 0..9 (newline at 9)
      //   row 1: 'task b {}'    bytes 10..18
      const entries = await decode('doc.siren', 'task a {}\ntask b {}');
      const [a, b] = entries;
      expect(a.origin).toEqual({
        kind: 'range',
        document: 'doc.siren',
        startByte: 0,
        endByte: 9,
        startRow: 0,
        endRow: 0,
      });
      expect(b.origin).toEqual({
        kind: 'range',
        document: 'doc.siren',
        startByte: 10,
        endByte: 19,
        startRow: 1,
        endRow: 1,
      });
    });

    it('each SourcedEntry has an origin field', async () => {
      const entries = await decode('doc.siren', 'task foo {}');
      expect(entries[0].origin).toBeDefined();
      expect(entries[0].origin.kind).toBe('range');
    });

    it('each SourcedAttribute has an origin field', async () => {
      const entries = await decode('doc.siren', 'task foo { desc = "bar" }');
      const attrOrigin = entries[0].attributes[0].origin;
      expect(attrOrigin).toBeDefined();
      expect(attrOrigin.kind).toBe('range');
    });

    it('SourcedEntry structural shape matches SourcedEntry interface', async () => {
      const entries = await decode('doc.siren', 'task foo {}');
      const e: SourcedEntry = entries[0];
      // Verify structural fields
      expect(e.type).toBe('task');
      expect(e.id).toBe('foo');
      expect(e.origin).toBeDefined();
      expect(e.attributes).toBeDefined();
    });
  });

  describe('core integration', () => {
    it('produces atoms recognized by core `isReference`', async () => {
      const entries = await decode('doc.siren', 'milestone m { depends_on = [a, "b"] }');
      const tuple = entries[0].attributes[0].value;
      expect(tuple.every((atom) => isReference(atom))).toBe(true);
    });

    it('returns entries assignable to readonly SirenEntry[]', async () => {
      // Type-only assertion: this line must compile.
      const entries: readonly SirenEntry[] = await decode('doc.siren', 'task t {}');
      expect(entries[0].id).toBe('t');
    });
  });
});

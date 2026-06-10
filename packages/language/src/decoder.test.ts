import { isReference, type SirenEntry } from '@sirenpm/core';
import { describe, expect, it } from 'vitest';
import { Language, Parser as TsParser } from 'web-tree-sitter';
import { buildAst } from './ast/builder';
import type { SirenAst } from './ast/types';
import { type DecodeDirectives, decodeAstToEntries } from './decoder';
import type { LanguageDiagnostic } from './diagnostics';
import { getWasmUrl } from './grammar/loadHandle';
import type { SourcedEntry } from './origin';
import type { SourceDocument } from './parser/types';

// ---------------------------------------------------------------------------
// Module-level cached tree-sitter initialisation (shared by all tests)
// ---------------------------------------------------------------------------
let initPromise: Promise<void> | undefined;
async function ensureRuntimeInit(): Promise<void> {
  if (!initPromise) {
    initPromise = TsParser.init();
  }
  await initPromise;
}

let langPromise: Promise<Language> | undefined;
async function getSirenLanguage(): Promise<Language> {
  if (!langPromise) {
    langPromise = (async () => {
      await ensureRuntimeInit();
      return Language.load(getWasmUrl().pathname);
    })();
  }
  return langPromise;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BuildAndDecodeResult {
  readonly entries: readonly SourcedEntry[];
  readonly ast: SirenAst;
  readonly diagnostics: readonly LanguageDiagnostic[];
}

/**
 * Parse, build AST, and decode in one shot — bypasses the stateful
 * `ParsedDocument` class and calls `decodeAstToEntries` directly.
 */
async function buildAndDecode(
  name: string,
  content: string,
  options?: DecodeDirectives,
): Promise<BuildAndDecodeResult> {
  const lang = await getSirenLanguage();
  const tsParser = new TsParser();
  tsParser.setLanguage(lang);
  const tree = tsParser.parse(content);
  if (!tree) throw new Error('Parse failed');
  const source: SourceDocument = { name, content };
  const built = buildAst(tree, source);
  const entries = decodeAstToEntries(built.ast, source, built.origins, options);
  return {
    entries,
    ast: built.ast,
    diagnostics: built.diagnostics ?? [],
  };
}

/** Decode with default options (no synthesis). */
async function decode(name: string, content: string): Promise<readonly SourcedEntry[]> {
  const { entries } = await buildAndDecode(name, content);
  return entries;
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
      const { entries, diagnostics } = await buildAndDecode(
        'doc.siren',
        'task broken @\ntask ok {}',
      );
      const ids = entries.map((r) => r.id);
      expect(ids).not.toContain('broken');
      expect(ids).toContain('ok');
      // The well-formed entry is salvaged precisely because the malformed
      // one was reported via EL001 and dropped; assert the diagnostic is there
      // so a regression that silently drops entries without reporting will
      // fail loudly.
      expect(diagnostics.some((d) => d.code === 'EL001')).toBe(true);
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

  describe('synthesis', () => {
    it('does NOT synthesize a milestone by default (synthesizeMilestones omitted)', async () => {
      const entries = await decode('doc.siren', 'task t {}');
      expect(entries.some((e) => e.origin.kind === 'synthetic')).toBe(false);
      expect(entries.length).toBe(1);
    });

    it('does NOT synthesize when synthesizeMilestones is false', async () => {
      const { entries } = await buildAndDecode('doc.siren', 'task t {}', {
        synthesizeMilestones: false,
      });
      expect(entries.length).toBe(1);
      expect(entries[0].id).toBe('t');
    });

    it('synthesizes a milestone when synthesizeMilestones is true', async () => {
      const { entries } = await buildAndDecode('doc.siren', 'task t {}', {
        synthesizeMilestones: true,
      });
      expect(entries.length).toBe(2); // task + synthetic milestone
      const milestone = entries[1];
      expect(milestone.type).toBe('milestone');
      expect(milestone.id).toBe('doc');
    });

    it('synthetic milestone id strips .siren suffix from source name', async () => {
      const { entries } = await buildAndDecode('my-project.siren', 'task t {}', {
        synthesizeMilestones: true,
      });
      expect(entries[1].id).toBe('my-project');
    });

    it('synthetic milestone id uses source name verbatim when no .siren suffix', async () => {
      const { entries } = await buildAndDecode('myfile', 'task t {}', {
        synthesizeMilestones: true,
      });
      expect(entries[1].id).toBe('myfile');
    });

    it('synthetic milestone has SyntheticOrigin with document = source name', async () => {
      const { entries } = await buildAndDecode('proj.siren', 'task t {}', {
        synthesizeMilestones: true,
      });
      const milestone = entries[1];
      expect(milestone.origin).toEqual({
        kind: 'synthetic',
        document: 'proj.siren',
      });
    });

    it('synthetic milestone depends_on references all decoded entries in order', async () => {
      const { entries } = await buildAndDecode('doc.siren', 'task a {}\ntask b {}\ntask c {}', {
        synthesizeMilestones: true,
      });
      const milestone = entries[3]; // last entry
      expect(milestone.attributes[0].key).toBe('depends_on');
      expect(milestone.attributes[0].value).toEqual([
        { kind: 'reference', id: 'a' },
        { kind: 'reference', id: 'b' },
        { kind: 'reference', id: 'c' },
      ]);
    });

    it('synthetic milestone depends_on attribute has SyntheticOrigin with document = source name', async () => {
      const { entries } = await buildAndDecode('doc.siren', 'task t {}', {
        synthesizeMilestones: true,
      });
      const milestone = entries[1];
      expect(milestone.attributes[0].origin).toEqual({
        kind: 'synthetic',
        document: 'doc.siren',
      });
    });

    it('empty document synthesizes a milestone with empty attributes', async () => {
      const { entries } = await buildAndDecode('doc.siren', '', {
        synthesizeMilestones: true,
      });
      expect(entries.length).toBe(1);
      const milestone = entries[0];
      expect(milestone.type).toBe('milestone');
      expect(milestone.id).toBe('doc');
      expect(milestone.attributes).toEqual([]);
    });

    it('explicit milestone with same id suppresses synthesis', async () => {
      const { entries } = await buildAndDecode('doc.siren', 'milestone doc {}', {
        synthesizeMilestones: true,
      });
      expect(entries.length).toBe(1);
      expect(entries[0].type).toBe('milestone');
      expect(entries[0].id).toBe('doc');
      // The origin should be a range origin (from the AST), not synthetic.
      expect(entries[0].origin.kind).toBe('range');
    });

    it('explicit milestone with different id does NOT suppress synthesis', async () => {
      const { entries } = await buildAndDecode('doc.siren', 'milestone other {}', {
        synthesizeMilestones: true,
      });
      expect(entries.length).toBe(2);
      expect(entries[0].id).toBe('other');
      expect(entries[1].id).toBe('doc');
    });

    it('synthetic milestone is appended after all decoded entries', async () => {
      const { entries } = await buildAndDecode('doc.siren', 'task a {}\ntask b {}', {
        synthesizeMilestones: true,
      });
      expect(entries.map((e) => e.id)).toEqual(['a', 'b', 'doc']);
    });

    it('synthesis works with multiple entry types (tasks and milestones)', async () => {
      const { entries } = await buildAndDecode('doc.siren', 'task t {}\nmilestone m {}', {
        synthesizeMilestones: true,
      });
      expect(entries.length).toBe(3);
      expect(entries[2].id).toBe('doc');
      expect(entries[2].attributes[0].value).toEqual([
        { kind: 'reference', id: 't' },
        { kind: 'reference', id: 'm' },
      ]);
    });

    it('produces zero additional entries when only an explicit matching milestone exists', async () => {
      // Document contains only a milestone whose id matches the document name.
      // Synthesis must not create a duplicate — the explicit milestone already
      // covers the document.
      const withoutSynthesis = await buildAndDecode('doc.siren', 'milestone doc {}');
      const withSynthesis = await buildAndDecode('doc.siren', 'milestone doc {}', {
        synthesizeMilestones: true,
      });

      // Synthesis adds nothing: both calls return the same single entry.
      expect(withSynthesis.entries).toHaveLength(1);
      expect(withSynthesis.entries).toEqual(withoutSynthesis.entries);
      expect(withSynthesis.entries[0].origin.kind).toBe('range');

      // No synthetic-origin entry should appear anywhere.
      expect(withSynthesis.entries.some((e) => e.origin.kind === 'synthetic')).toBe(false);
    });

    it('synthesizes a milestone when all entries are dropped by parse errors', async () => {
      // 'task broken @' is entirely malformed — the AST builder drops every
      // resource via EL001, leaving zero surviving entries.
      const { entries, ast, diagnostics } = await buildAndDecode('doc.siren', 'task broken @', {
        synthesizeMilestones: true,
      });

      // Verify the AST has zero resources (all dropped by EL001).
      expect(ast.resources).toHaveLength(0);
      expect(diagnostics.some((d) => d.code === 'EL001')).toBe(true);

      // Synthesis should still produce a milestone anchored to the document.
      expect(entries).toHaveLength(1);

      const milestone = entries[0];
      expect(milestone.type).toBe('milestone');
      expect(milestone.id).toBe('doc');
      // No surviving entries → empty attributes (no depends_on).
      expect(milestone.attributes).toEqual([]);
      expect(milestone.origin).toEqual({ kind: 'synthetic', document: 'doc.siren' });
    });
  });
});

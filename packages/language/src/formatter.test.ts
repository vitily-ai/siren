import { describe, expect, it } from 'vitest';
import { createParser } from './parser/factory';

describe('Siren Formatter (CST-backed)', () => {
  it('throws on parse errors (refusal)', async () => {
    const parser = await createParser();
    const doc = await parser.parse({
      name: 'error.siren',
      content: 'task  { depends_on = }', // Syntactically invalid
    });
    expect(() => doc.format()).toThrow(/Cannot format/);
  });

  it('does NOT throw on warning-only diagnostics (no tree ERROR nodes)', async () => {
    const parser = await createParser();
    // Unrecognized modifier 'foo' is syntactically valid (no ERROR nodes in tree)
    // but produces a WL001 warning from the AST builder.
    const doc = await parser.parse({
      name: 'warning.siren',
      content: 'task my-task foo { }',
    });
    expect(doc.diagnostics.some((d) => d.severity === 'error')).toBe(false);
    expect(doc.diagnostics.length).toBeGreaterThan(0);
    expect(() => doc.format()).not.toThrow();
    expect(doc.format()).toBe('task my-task foo {}\n');
  });

  it('re-formats dirty spacing to canonical spacing', async () => {
    const parser = await createParser();
    const input = 'task  a  {   depends_on  =  b   }';
    const parsed = await parser.parse({ name: 'spacing.siren', content: input });

    // Canonical representation of task a with attribute:
    // task a {
    //   depends_on = b
    // }
    const expected = 'task a {\n  depends_on = b\n}\n';
    expect(parsed.format()).toBe(expected);
  });

  it('formats multiple attributes to key = value with canonical indentation', async () => {
    const parser = await createParser();
    const input = `
task my-task {
description="A task description"
depends_on=[other-task]
}
`;
    const parsed = await parser.parse({ name: 'attributes.siren', content: input });
    const expected =
      'task my-task {\n  description = "A task description"\n  depends_on = [other-task]\n}\n';
    expect(parsed.format()).toBe(expected);
  });

  it('emits all metadata, status modifiers and blocks cleanly', async () => {
    const parser = await createParser();
    const input = 'milestone release-1 draft complete { description = "Groups tasks" }';
    const parsed = await parser.parse({ name: 'milestone.siren', content: input });
    const expected = 'milestone release-1 draft complete {\n  description = "Groups tasks"\n}\n';
    expect(parsed.format()).toBe(expected);
  });

  it('converts comments to canonical standalone lines with proper indentation, in lexical order', async () => {
    const parser = await createParser();
    const input = `
# Top-level comment
task a {
  # Nested comment
  depends_on = b // Inline trailing comment
} // Another trailing comment
`;
    // Trailing/inline comments and standalone comments are all reformatted
    // as standalone lines under their logical hierarchical block indentation.
    // They are emitted in their exact lexical order of appearance.
    const parsed = await parser.parse({ name: 'comments.siren', content: input });
    const expected = [
      '# Top-level comment',
      'task a {',
      '  # Nested comment',
      '  # Inline trailing comment',
      '  depends_on = b',
      '}',
      '# Another trailing comment',
      '',
    ].join('\n');
    expect(parsed.format()).toBe(expected);
  });

  it('does NOT preserve blank-line counts', async () => {
    const parser = await createParser();
    const input = `
task a {


  depends_on = b


}


task b {}
`;
    const parsed = await parser.parse({ name: 'blank-lines.siren', content: input });
    const expected = 'task a {\n  depends_on = b\n}\n\ntask b {}\n';
    expect(parsed.format()).toBe(expected);
  });

  describe('format() mutation (lang-format-mutate)', () => {
    it('format() updates .source.content to canonical text', async () => {
      const parser = await createParser();
      const input = 'task  a  {   depends_on  =  b   }';
      const parsed = await parser.parse({ name: 'messy.siren', content: input });

      const formatted = parsed.format();
      const expected = 'task a {\n  depends_on = b\n}\n';
      expect(formatted).toBe(expected);

      expect(parsed.source.content).toBe(expected);
    });

    it('format() preserves toEntries() decoding after mutation', async () => {
      const parser = await createParser();
      const input = 'task  a  {   depends_on  =  b   }';
      const parsed = await parser.parse({ name: 'messy.siren', content: input });

      const entriesBefore = parsed.toEntries();
      expect(entriesBefore).toHaveLength(2);
      expect(entriesBefore[0]!.type).toBe('task');
      expect(entriesBefore[0]!.id).toBe('a');

      parsed.format();

      // Entries should still decode correctly after format() mutates state.
      // This is a regression guard — may already pass, but must not regress.
      const entriesAfter = parsed.toEntries();
      expect(entriesAfter).toHaveLength(2);
      expect(entriesAfter[0]!.type).toBe('task');
      expect(entriesAfter[0]!.id).toBe('a');
      // Semantic content is preserved; origins naturally shift after reformat.
      expect(entriesAfter[0]!.attributes.map((a) => ({ key: a.key, value: a.value }))).toEqual(
        entriesBefore[0]!.attributes.map((a) => ({ key: a.key, value: a.value })),
      );
    });

    it('format() is idempotent in output and source', async () => {
      const parser = await createParser();
      const input = 'task  a  {   depends_on  =  b   }';
      const parsed = await parser.parse({ name: 'messy.siren', content: input });

      const first = parsed.format();
      const second = parsed.format();

      // Idempotent output: both calls return the same canonical string.
      expect(second).toBe(first);

      expect(parsed.source.content).toBe(first);
    });

    it('format() then .source reflects canonical state (extra spaces)', async () => {
      const parser = await createParser();
      // Extra spaces inside header and body.
      const input = 'task  foo  { }';
      const parsed = await parser.parse({ name: 'extra-spaces.siren', content: input });

      const formatted = parsed.format();
      const expected = 'task foo {}\n';
      expect(formatted).toBe(expected);

      expect(parsed.source.content).toBe(expected);
    });

    it('format() on already-canonical doc is no-op for source', async () => {
      const parser = await createParser();
      const canonical = 'task foo {}\n';
      const parsed = await parser.parse({ name: 'canonical.siren', content: canonical });

      const formatted = parsed.format();
      expect(formatted).toBe(canonical);

      expect(parsed.source.content).toBe(canonical);
    });

    it('formats document header', async () => {
      const parser = await createParser();
      const input = 'document { noMilestone = true }';
      const parsed = await parser.parse({ name: 'doc-header.siren', content: input });

      const formatted = parsed.format();
      const expected = 'document {\n  noMilestone = true\n}\n';
      expect(formatted).toBe(expected);

      expect(parsed.source.content).toBe(expected);
    });
  });
});

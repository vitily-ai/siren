import { describe, expect, it } from 'vitest';
import { createParser } from '../parser/factory';

describe('Siren Formatter (CST-backed)', () => {
  it('throws on parse errors (refusal)', async () => {
    const parser = await createParser();
    const doc = await parser.parse({
      name: 'error.siren',
      content: 'task  { depends_on = }', // Syntactically invalid
    });
    expect(() => doc.format()).toThrow(/Cannot format/);
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
});

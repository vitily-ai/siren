import { createParser } from '@sirenpm/language';
import { describe, expect, it } from 'vitest';

describe('Language Package Smoke Test', () => {
  it.fails('should load the parser and convert to IR from bundled output', async () => {
    const parser = await createParser();
    const source = {
      name: 'smoke.siren',
      content: 'task my-task { description = "smoke test" }',
    };

    const doc = await parser.parse(source);

    // Check AST
    expect(doc.ast).toBeDefined();
    expect(doc.ast.resources).toHaveLength(1);
    expect(doc.ast.resources[0].id).toBe('my-task');

    // Check IR conversion
    const ir = doc.toSirenDocument();
    expect(ir).toBeDefined();
    expect(ir.resources).toHaveLength(1);
    expect(ir.resources[0].id).toBe('my-task');
    expect(ir.resources[0].attributes).toHaveLength(1);
    expect(ir.resources[0].attributes[0].key).toBe('description');

    throw new Error('Assertions not important, parser loaded and ran successfully');
  });
});

import { describe, expect, it } from 'vitest';
import { createParser as createParserFromIndex } from '../index';
import { createParser as createParserFromFactory } from './factory';
import type { ParsedDocument, Parser, SourceDocument } from './types';

describe('createParser public API surface', () => {
  it('is re-exported from the package root and from parser/factory', () => {
    expect(createParserFromFactory).toBe(createParserFromIndex);
    expect(typeof createParserFromFactory).toBe('function');
  });

  it('returns a Promise that resolves to a parser object exposing parse and parseBatch', async () => {
    const parser: Parser = await createParserFromFactory();
    expect(parser).toBeDefined();
    expect(typeof parser.parse).toBe('function');
    expect(typeof parser.parseBatch).toBe('function');
  });
});

describe('parser.parse contract', () => {
  it('parses a simple valid document with zero consumer configuration', async () => {
    const parser = await createParserFromFactory();
    const doc: SourceDocument = { name: 'a.siren', content: 'task a {}' };
    const parsed = await parser.parse(doc);
    expect(parsed).toBeDefined();
  });

  it('parses an empty-content document without throwing', async () => {
    const parser = await createParserFromFactory();
    await expect(parser.parse({ name: 'empty.siren', content: '' })).resolves.toBeDefined();
  });

  it('returns a ParsedDocument exposing the four service members', async () => {
    const parser = await createParserFromFactory();
    const parsed: ParsedDocument = await parser.parse({
      name: 'a.siren',
      content: 'task a {}',
    });

    expect(parsed.ast).toBeDefined();
    expect(Array.isArray(parsed.ast.resources)).toBe(true);

    expect(parsed.diagnostics).toBeDefined();
    expect(Array.isArray(parsed.diagnostics)).toBe(true);
    expect(parsed.diagnostics.length).toBe(0);

    expect(typeof parsed.toSirenDocument).toBe('function');
    const sirenDoc = parsed.toSirenDocument();
    expect(sirenDoc).toBeDefined();
    expect(typeof sirenDoc.id).toBe('string');
    expect(Array.isArray(sirenDoc.resources)).toBe(true);
    expect(sirenDoc.resources.length).toBe(0);
    expect(sirenDoc.directive).toBeUndefined();

    expect(typeof parsed.format).toBe('function');
    expect(parsed.format()).toBe('task a {}');
  });
});

describe('parser.parseBatch contract', () => {
  it('returns one ParsedDocument per input in the same order', async () => {
    const parser = await createParserFromFactory();
    const inputs: readonly SourceDocument[] = [
      { name: 'a.siren', content: 'task a {}' },
      { name: 'b.siren', content: 'task b {}' },
      { name: 'c.siren', content: '' },
    ];

    const results = await parser.parseBatch(inputs);
    expect(results).toHaveLength(inputs.length);
    for (const result of results) {
      expect(result).toBeDefined();
      expect(typeof result.format).toBe('function');
    }
    expect(results[0].format()).toBe('task a {}');
    expect(results[1].format()).toBe('task b {}');
    expect(results[2].format()).toBe('');
  });

  it('is equivalent to mapping parse per document', async () => {
    const parser = await createParserFromFactory();
    const inputs: readonly SourceDocument[] = [
      { name: 'a.siren', content: 'task a {}' },
      { name: 'b.siren', content: 'task b {}' },
    ];

    const batched = await parser.parseBatch(inputs);
    const mapped = await Promise.all(inputs.map((d) => parser.parse(d)));

    expect(batched).toHaveLength(mapped.length);
    for (let i = 0; i < batched.length; i++) {
      expect(batched[i].format()).toBe(mapped[i].format());
      expect(batched[i].toSirenDocument().id).toBe(mapped[i].toSirenDocument().id);
    }
  });
});

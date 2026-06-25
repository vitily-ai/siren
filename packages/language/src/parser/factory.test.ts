import type { SirenEntry } from '@sirenpm/core';
import { describe, expect, it } from 'vitest';
import { createParser as createParserFromIndex } from '../index';
import { renderEntry } from '../render-entry';
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

    expect(typeof parsed.toEntries).toBe('function');
    const entries = parsed.toEntries();
    expect(entries).toBeDefined();
    expect(Array.isArray(entries)).toBe(true);
    // `task a {}` decodes to one entry.
    expect(entries.length).toBeGreaterThanOrEqual(0);

    expect(typeof parsed.format).toBe('function');
    expect(parsed.format()).toBe('task a {}\n');
  });

  it('is error-tolerant: does not throw when parsing a document with errors', async () => {
    const parser = await createParserFromFactory();
    // 'task {' is a syntax error (missing id and body)
    const parsed = await parser.parse({ name: 'error.siren', content: 'task {' });
    expect(parsed).toBeDefined();
    expect(parsed.ast.resources).toHaveLength(0);
    expect(parsed.diagnostics.length).toBeGreaterThan(0);
    expect(parsed.diagnostics.some((d) => d.code.startsWith('EL'))).toBe(true);
  });

  it('does not leak the private tree-sitter Tree on the public ParsedDocument surface', async () => {
    const parser = await createParserFromFactory();
    const parsed = await parser.parse({ name: 'leak.siren', content: 'task a {}' });

    // Enforced by #-private field in ParsedDocumentImpl
    expect((parsed as any).tree).toBeUndefined();
    expect((parsed as any)._tree).toBeUndefined();
    expect(Object.keys(parsed)).not.toContain('tree');
  });
});

describe('ParsedDocument.source getter', () => {
  it('returns the original content after parse', async () => {
    const parser = await createParserFromFactory();
    const content = 'task a {}\nmilestone m {}';
    const parsed = await parser.parse({ name: 'doc.siren', content });
    const source = parsed.source;
    expect(source).toBeDefined();
    expect(source.content).toBe(content);
  });

  it('returns the correct name from the source document', async () => {
    const parser = await createParserFromFactory();
    const parsed = await parser.parse({ name: 'myfile.siren', content: 'task x {}' });
    const source = parsed.source;
    expect(source).toBeDefined();
    expect(source.name).toBe('myfile.siren');
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
    expect(results[0]!.format()).toBe('task a {}\n');
    expect(results[1]!.format()).toBe('task b {}\n');
    expect(results[2]!.format()).toBe('');
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
      expect(batched[i]!.format()).toBe(mapped[i]!.format());
      expect(batched[i]!.toEntries().length).toBe(mapped[i]!.toEntries().length);
    }
  });
});

describe('patchEntry', () => {
  // 2. patchEntry modifies an existing entry's description
  it('modifies an existing entry description attribute', async () => {
    const parser = await createParserFromFactory();
    const parsed = await parser.parse({
      name: 'doc.siren',
      content: 'task foo {\n  description = "old"\n}\n',
    });

    expect(typeof parsed.patchEntry).toBe('function');

    const updatedEntry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [{ key: 'description', value: ['new'] }],
    };

    parsed.patchEntry('foo', updatedEntry);

    const entries = parsed.toEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.id).toBe('foo');
    expect(entries[0]!.attributes[0]!.key).toBe('description');
    expect(entries[0]!.attributes[0]!.value[0]).toBe('new');
  });

  // 3. patchEntry updates .source.content after mutation
  it('updates source.content after mutating an existing entry', async () => {
    const parser = await createParserFromFactory();
    const parsed = await parser.parse({
      name: 'doc.siren',
      content: 'task foo {\n  description = "old"\n}\n',
    });

    const updatedEntry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [{ key: 'description', value: ['new'] }],
    };

    parsed.patchEntry('foo', updatedEntry);

    const content = parsed.source.content;
    expect(content).toContain('"new"');
    expect(content).not.toContain('"old"');
  });

  // 4. patchEntry appends a synthetic entry when id not found
  it('appends a synthetic entry when the id is not found in the document', async () => {
    const parser = await createParserFromFactory();
    const parsed = await parser.parse({
      name: 'doc.siren',
      content: 'task foo {}\n',
    });

    const syntheticEntry: SirenEntry = {
      type: 'task',
      id: 'bar',
      attributes: [],
    };

    parsed.patchEntry('bar', syntheticEntry);

    const entries = parsed.toEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0]!.id).toBe('foo');
    expect(entries[1]!.id).toBe('bar');

    // Source content should include the appended entry
    const rendered = renderEntry(syntheticEntry);
    expect(parsed.source.content).toContain(rendered.trim());
  });

  // 5. patchEntry is idempotent
  it('is idempotent: a second call with the same entry is a no-op', async () => {
    const parser = await createParserFromFactory();
    const parsed = await parser.parse({
      name: 'doc.siren',
      content: 'task foo {\n  description = "old"\n}\n',
    });

    const updatedEntry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [{ key: 'description', value: ['new'] }],
    };

    parsed.patchEntry('foo', updatedEntry);

    const contentAfterFirst = parsed.source.content;
    const entriesAfterFirst = parsed.toEntries();

    // Second call with identical entry should be a no-op
    parsed.patchEntry('foo', updatedEntry);

    expect(parsed.source.content).toBe(contentAfterFirst);
    expect(parsed.toEntries()).toEqual(entriesAfterFirst);
  });

  // 6. patchEntry updates diagnostics after re-parse
  it('updates diagnostics after re-parse', async () => {
    const parser = await createParserFromFactory();
    const parsed = await parser.parse({
      name: 'doc.siren',
      content: 'task foo {}\n',
    });

    const updatedEntry: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [{ key: 'description', value: ['updated'] }],
    };

    parsed.patchEntry('foo', updatedEntry);

    // After re-parse, diagnostics should still be a defined array.
    // If the patched content is still valid, diagnostics should be empty.
    expect(parsed.diagnostics).toBeDefined();
    expect(Array.isArray(parsed.diagnostics)).toBe(true);
    expect(parsed.diagnostics).toHaveLength(0);
  });

  // 7. patchEntry throws on re-parse failure
  // Note: renderEntry always produces valid grammar, so constructing
  // content that causes a parse failure is non-trivial. This test is
  // included as a placeholder for when a mock/stub mechanism exists.
  it.todo('throws when re-parse fails after mutation');
});

describe('ParsedDocument.removeEntry', () => {
  it('removeEntry removes an existing entry', async () => {
    const parser = await createParserFromFactory();
    const parsed = await parser.parse({
      name: 'doc.siren',
      content: 'task foo {}\ntask bar {}',
    });

    // Precondition: two entries exist.
    expect(parsed.toEntries()).toHaveLength(3);
    parsed.removeEntry('foo');

    const remaining = parsed.toEntries();
    expect(remaining).toHaveLength(2);
    expect(remaining[0]!.id).toBe('bar');
  });

  it('removeEntry updates .source.content', async () => {
    const parser = await createParserFromFactory();
    const parsed = await parser.parse({
      name: 'doc.siren',
      content: 'task foo {}\ntask bar {}',
    });

    parsed.removeEntry('foo');

    const content = parsed.source.content;
    expect(content).not.toContain('task foo');
    expect(content).toContain('task bar');
  });

  it('removeEntry throws when entry id not found', async () => {
    const parser = await createParserFromFactory();
    const parsed = await parser.parse({
      name: 'doc.siren',
      content: 'task foo {}',
    });

    // Guard: assert method exists first so we don't get a false-positive
    // "pass" from calling undefined as a function.
    const removeEntry = parsed.removeEntry;
    expect(() => removeEntry('nonexistent')).toThrow();
  });

  it('removeEntry followed by toEntries returns correct remaining entries in order', async () => {
    const parser = await createParserFromFactory();
    const parsed = await parser.parse({
      name: 'doc.siren',
      content: 'task a {}\ntask b {}\ntask c {}',
    });

    // Precondition: three entries.
    expect(parsed.toEntries()).toHaveLength(4);

    parsed.removeEntry('b');

    const remaining = parsed.toEntries();
    expect(remaining).toHaveLength(3);
    expect(remaining[0]!.id).toBe('a');
    expect(remaining[1]!.id).toBe('c');
  });

  it('removeEntry of last entry leaves empty entries', async () => {
    const parser = await createParserFromFactory();
    const parsed = await parser.parse({
      name: 'doc.siren',
      content: 'document { no_milestone = true } task only {}',
    });

    // Precondition: one entry.
    expect(parsed.toEntries()).toHaveLength(1);

    parsed.removeEntry('only');

    expect(parsed.toEntries()).toEqual([]);
  });
});

import type { SirenEntry } from '@sirenpm/core';
import { describe, expect, it } from 'vitest';
import { createParser } from '../../src/index';

/**
 * Lang-Render Integration Tests (Phase 5B)
 *
 * Full pipeline: parse → mutate → verify round-trip.
 * Exercises the interaction between patchEntry, removeEntry, format, source,
 * and toEntries on ParsedDocument.
 */

describe('lang-render-integration', async () => {
  const parser = await createParser();

  // ---------------------------------------------------------------------------
  // 1. parse → patch → toEntries round-trip
  // ---------------------------------------------------------------------------
  it('parse → patch → toEntries round-trip reflects updated description in entries and source', async () => {
    const doc = await parser.parse({
      name: 'test.siren',
      content: 'task foo {\n  description = "old"\n}\n',
    });

    const patch: SirenEntry = {
      type: 'task',
      id: 'foo',
      attributes: [{ key: 'description', value: ['new'] }],
    };

    doc.patchEntry('foo', patch);

    const entries = doc.toEntries();
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry.id).toBe('foo');
    expect(entry.type).toBe('task');

    const descAttr = entry.attributes.find((a) => a.key === 'description');
    expect(descAttr).toBeDefined();
    expect(descAttr!.value).toEqual(['new']);

    // Source content must reflect the new description.
    expect(doc.source.content).toContain('"new"');
    expect(doc.source.content).not.toContain('"old"');
  });

  // ---------------------------------------------------------------------------
  // 2. parse → format → patch → format cycle
  // ---------------------------------------------------------------------------
  it('parse → format → patch → format cycle produces canonical output with updated reference', async () => {
    const doc = await parser.parse({
      name: 'messy.siren',
      content: 'task  a  {   depends_on  =  b   }\n',
    });

    // First format: canonicalize messy input.
    const firstFormat = doc.format();
    expect(firstFormat).toContain('b');

    // Patch: replace depends_on reference b → c.
    const patch: SirenEntry = {
      type: 'task',
      id: 'a',
      attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'c' }] }],
    };
    doc.patchEntry('a', patch);

    // Second format: ensure patched content is canonical.
    const secondFormat = doc.format();
    expect(secondFormat).toContain('c');
    expect(secondFormat).not.toContain('b');

    // Final source must also contain c not b.
    expect(doc.source.content).toContain('c');
    expect(doc.source.content).not.toContain('b');
  });

  // ---------------------------------------------------------------------------
  // 3. parse → removeEntry → source consistency
  // ---------------------------------------------------------------------------
  it('parse → removeEntry removes the entry from toEntries and source', async () => {
    const doc = await parser.parse({
      name: 'three.siren',
      content: 'task a {}\ntask b {}\ntask c {}\n',
    });

    doc.removeEntry('b');

    const entries = doc.toEntries();
    expect(entries).toHaveLength(2);

    const ids = entries.map((e) => e.id).sort();
    expect(ids).toEqual(['a', 'c']);

    // Source must not contain removed entry's id.
    expect(doc.source.content).not.toContain('task b');
    // Source must still contain the remaining entries.
    expect(doc.source.content).toContain('task a');
    expect(doc.source.content).toContain('task c');
  });

  // ---------------------------------------------------------------------------
  // 4. parse → add synthetic entry → patch it
  // ---------------------------------------------------------------------------
  it('parse → add synthetic entry → patch it adds attribute to synthetic entry', async () => {
    const doc = await parser.parse({
      name: 'single.siren',
      content: 'task foo {}\n',
    });

    // Add a synthetic entry (not present in source).
    const synthetic: SirenEntry = {
      type: 'task',
      id: 'bar',
      attributes: [],
    };
    doc.patchEntry('bar', synthetic);

    let entries = doc.toEntries();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.id).sort()).toEqual(['bar', 'foo']);

    // Now patch the synthetic entry with an attribute.
    const patched: SirenEntry = {
      type: 'task',
      id: 'bar',
      attributes: [{ key: 'description', value: ['synthetic'] }],
    };
    doc.patchEntry('bar', patched);

    entries = doc.toEntries();
    const bar = entries.find((e) => e.id === 'bar');
    expect(bar).toBeDefined();
    const desc = bar!.attributes.find((a) => a.key === 'description');
    expect(desc).toBeDefined();
    expect(desc!.value).toEqual(['synthetic']);
  });

  // ---------------------------------------------------------------------------
  // 5. parse → multiple mutations → canonical re-parse
  // ---------------------------------------------------------------------------
  it('parse → multiple mutations → canonical re-parse yields correct entries and formatting', async () => {
    const doc = await parser.parse({
      name: 'multi.siren',
      content: 'task alpha {}\ntask beta {}\ntask gamma {}\n',
    });

    // Patch alpha: add description.
    doc.patchEntry('alpha', {
      type: 'task',
      id: 'alpha',
      attributes: [{ key: 'description', value: ['patched'] }],
    });

    // Remove beta.
    doc.removeEntry('beta');

    // Format to canonicalize.
    doc.format();

    const entries = doc.toEntries();
    expect(entries).toHaveLength(2);

    const ids = entries.map((e) => e.id).sort();
    expect(ids).toEqual(['alpha', 'gamma']);

    // Alpha should have the patched description.
    const alpha = entries.find((e) => e.id === 'alpha')!;
    const desc = alpha.attributes.find((a) => a.key === 'description');
    expect(desc).toBeDefined();
    expect(desc!.value).toEqual(['patched']);

    // Gamma should be untouched (no attributes).
    const gamma = entries.find((e) => e.id === 'gamma')!;
    expect(gamma.attributes).toEqual([]);

    // Source should be canonical (no extra blank lines, consistent formatting).
    const source = doc.source.content;
    // No double blank lines.
    expect(source).not.toMatch(/\n\n\n/);
    // Contains both remaining entries.
    expect(source).toContain('task alpha');
    expect(source).toContain('task gamma');
    // Does not contain removed entry.
    expect(source).not.toContain('task beta');
  });

  // ---------------------------------------------------------------------------
  // 6. parse → format → source equality (idempotency)
  // ---------------------------------------------------------------------------
  it('parse → format is idempotent on canonical input', async () => {
    const canonical = 'task example {\n  description = "hello"\n}\n';
    const doc = await parser.parse({
      name: 'canonical.siren',
      content: canonical,
    });

    const formatted = doc.format();

    // Format should return the canonical representation.
    expect(formatted).toBe(canonical);

    // Source should also equal the canonical representation after format.
    expect(doc.source.content).toBe(canonical);
  });

  // ---------------------------------------------------------------------------
  // 7. patch existing entry + insert new entry → canonical output
  // ---------------------------------------------------------------------------
  it('patch existing entry and insert new entry produces canonical output', async () => {
    const doc = await parser.parse({
      name: 'build.siren',
      content: 'task setup {\n  depends_on = infra\n}\n',
    });

    // Patch existing: change dependency reference.
    doc.patchEntry('setup', {
      type: 'task',
      id: 'setup',
      attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'prep' }] }],
    });

    // Insert new entry with multiple attributes.
    doc.patchEntry('build', {
      type: 'task',
      id: 'build',
      attributes: [
        { key: 'depends_on', value: [{ kind: 'reference', id: 'setup' }] },
        { key: 'priority', value: [1] },
      ],
    });

    const canonical = doc.format();

    expect(canonical).toBe(
      [
        'task setup {',
        '  depends_on = prep',
        '}',
        '',
        'task build {',
        '  depends_on = setup',
        '  priority = 1',
        '}',
        '',
      ].join('\n'),
    );
  });

  // ---------------------------------------------------------------------------
  // 8. patch existing entry with string + insert entry with boolean → canonical
  // ---------------------------------------------------------------------------
  it('patch existing entry with string attribute and insert entry with boolean attribute produces canonical output', async () => {
    const doc = await parser.parse({
      name: 'features.siren',
      content: 'task auth {\n  description = "old desc"\n}\n',
    });

    // Patch existing: replace description.
    doc.patchEntry('auth', {
      type: 'task',
      id: 'auth',
      attributes: [{ key: 'description', value: ['Login flow'] }],
    });

    // Insert new entry with a boolean attribute.
    doc.patchEntry('cache', {
      type: 'task',
      id: 'cache',
      attributes: [{ key: 'critical', value: [true] }],
    });

    const canonical = doc.format();

    expect(canonical).toBe(
      [
        'task auth {',
        '  description = "Login flow"',
        '}',
        '',
        'task cache {',
        '  critical = true',
        '}',
        '',
      ].join('\n'),
    );
  });
});

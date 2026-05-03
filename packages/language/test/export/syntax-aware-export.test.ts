import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AttributeValue, IRContext, isArray, isReference, type Resource } from '@sirenpm/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { createIRContextFromParseResult } from '../../src/context-factory';
import { exportToSiren } from '../../src/export/siren-exporter';
import type { ParserAdapter, SourceDocument } from '../../src/parser/adapter';
import { getTestAdapter } from '../helpers/parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures', 'projects');

function doc(content: string, name = 'main.siren'): SourceDocument[] {
  return [{ name, content }];
}

function readProjectFixture(projectName: string): string {
  return readFileSync(join(fixturesDir, projectName, 'siren', 'main.siren'), 'utf-8');
}

function normalizeValue(value: AttributeValue): unknown {
  if (isReference(value)) {
    return { kind: 'reference', id: value.id };
  }
  if (isArray(value)) {
    return {
      kind: 'array',
      elements: value.elements.map((element) => normalizeValue(element)),
    };
  }
  return value;
}

function normalizeResources(resources: readonly Resource[]): unknown {
  return resources.map((resource) => ({
    type: resource.type,
    id: resource.id,
    complete: resource.complete,
    attributes: resource.attributes.map((attribute) => ({
      key: attribute.key,
      value: normalizeValue(attribute.value),
    })),
  }));
}

describe('syntax-aware export', () => {
  let adapter: ParserAdapter;

  beforeAll(async () => {
    adapter = await getTestAdapter();
  });

  it('preserves syntax identifier spelling for quoted IDs when syntaxDocuments are provided', async () => {
    const source = readProjectFixture('quoted-identifiers-format');
    const parseResult = await adapter.parse(doc(source));
    const { context } = createIRContextFromParseResult(parseResult);

    const exported = exportToSiren(context, { syntaxDocuments: parseResult.syntaxDocuments });

    expect(exported).toContain('task "safe_id" {}');
    expect(exported).toContain('milestone "Release 1" {}');
    expect(exported).toContain('task bare_ok {}');
    expect(exported).toContain('task "dash-ok" {}');
  });

  it('quotes unsafe semantic IDs when syntax context is unavailable', () => {
    const context = IRContext.fromResources([
      { type: 'task', id: 'needs quote', complete: false, attributes: [] },
      { type: 'milestone', id: 'safe_id', complete: false, attributes: [] },
      { type: 'task', id: 'quote"inside', complete: false, attributes: [] },
    ]);

    const exported = exportToSiren(context);

    expect(exported).toContain('task "needs quote" {}');
    expect(exported).toContain('milestone safe_id {}');
    expect(exported).toContain('task "quote\\"inside" {}');
  });

  it('preserves comments and quoted headers in syntax-aware export', async () => {
    const source = readProjectFixture('comments-quoted-identifiers');
    const parseResult = await adapter.parse(doc(source));
    const { context } = createIRContextFromParseResult(parseResult);

    const exported = exportToSiren(context, { syntaxDocuments: parseResult.syntaxDocuments });

    expect(exported).toContain('# Leading comment before quoted-safe identifier');
    expect(exported).toContain('task "safe_id" {');
    expect(exported).toContain('# Inner comment inside first task');
    expect(exported).toContain('milestone "Release 1" {  # trailing header comment');
    expect(exported).toContain('# EOF comment after quoted resource');
  });

  it('round-trips semantically after syntax-aware formatting', async () => {
    const source = readProjectFixture('comments-quoted-identifiers');

    const parseResult1 = await adapter.parse(doc(source));
    const { context: context1 } = createIRContextFromParseResult(parseResult1);
    const exported = exportToSiren(context1, { syntaxDocuments: parseResult1.syntaxDocuments });

    const parseResult2 = await adapter.parse(doc(exported));
    const { context: context2 } = createIRContextFromParseResult(parseResult2);

    expect(normalizeResources(context2.resources)).toEqual(normalizeResources(context1.resources));
  });
});

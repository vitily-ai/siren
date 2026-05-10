import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AttributeValue,
  isArray,
  isReference,
  type Resource,
  type SirenProject,
  SirenBuilder,
} from '@sirenpm/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSirenProjectFromParseResult } from '../../src/context-factory';
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

function deriveSyntheticId(documentName: string): string {
  return basename(documentName).replace(/\.siren$/u, '');
}

function withSyntheticMilestones(
  resources: readonly Resource[],
  documents: readonly SourceDocument[],
): readonly Resource[] {
  const synthetic = documents.flatMap((document) => {
    const documentResources = resources.filter((resource) => resource.origin?.document === document.name);
    if (documentResources.length === 0) {
      return [];
    }

    const derivedId = deriveSyntheticId(document.name);
    const alreadyHasSynthetic = resources.some(
      (resource) =>
        resource.synthetic === true &&
        resource.id === derivedId &&
        resource.origin?.document === document.name,
    );
    if (alreadyHasSynthetic) {
      return [];
    }

    return {
      type: 'milestone' as const,
      id: derivedId,
      synthetic: true,
      status: 'draft' as const,
      attributes: [
        {
          key: 'depends_on',
          value: {
            kind: 'array' as const,
            elements: documentResources.map((resource) => ({
              kind: 'reference' as const,
              id: resource.id,
            })),
          },
        },
      ],
      origin: {
        startByte: 0,
        endByte: 0,
        startRow: 0,
        endRow: 0,
        document: document.name,
      },
    };
  });
  return [...resources, ...synthetic];
}

function asProject(resources: readonly Resource[]): SirenProject {
  return { resources } as unknown as SirenProject;
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
    synthetic: resource.synthetic,
    status: resource.status,
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
    const { context } = createSirenProjectFromParseResult(parseResult);

    const exported = exportToSiren(context, { syntaxDocuments: parseResult.syntaxDocuments });

    expect(exported).toContain('task "safe_id" {}');
    expect(exported).toContain('milestone "Release 1" {}');
    expect(exported).toContain('task bare_ok {}');
    expect(exported).toContain('task "dash-ok" {}');
  });

  it('quotes unsafe semantic IDs when syntax context is unavailable', () => {
    const context = SirenBuilder.fromResources([
      { type: 'task', id: 'needs quote', attributes: [] },
      { type: 'milestone', id: 'safe_id', attributes: [] },
      { type: 'task', id: 'quote"inside', attributes: [] },
    ]).build();

    const exported = exportToSiren(context);

    expect(exported).toContain('task "needs quote" {}');
    expect(exported).toContain('milestone safe_id {}');
    expect(exported).toContain('task "quote\\"inside" {}');
  });

  it('preserves comments and quoted headers in syntax-aware export', async () => {
    const source = readProjectFixture('comments-quoted-identifiers');
    const parseResult = await adapter.parse(doc(source));
    const { context } = createSirenProjectFromParseResult(parseResult);

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
    const { context: context1 } = createSirenProjectFromParseResult(parseResult1);
    const exported = exportToSiren(context1, { syntaxDocuments: parseResult1.syntaxDocuments });

    const parseResult2 = await adapter.parse(doc(exported));
    const { context: context2 } = createSirenProjectFromParseResult(parseResult2);

    expect(normalizeResources(context2.resources)).toEqual(normalizeResources(context1.resources));
  });

  it('omits synthetic milestones from source export and re-derives them on reparse', async () => {
    const sourceDocs: SourceDocument[] = [
      { name: 'alpha.siren', content: 'task alpha_task {}\n' },
      { name: 'beta.siren', content: 'task beta_task {}\n' },
    ];

    const parseResult1 = await adapter.parse(sourceDocs);
    const { context: context1 } = createSirenProjectFromParseResult(parseResult1);
    const contextWithSynthetic1 = asProject(withSyntheticMilestones(context1.resources, sourceDocs));

    const syntheticIds1 = new Set(['alpha', 'beta']);

    const exportedDocs = sourceDocs.map((sourceDoc) => {
      const perDocumentResources = contextWithSynthetic1.resources.filter(
        (resource) => resource.synthetic !== true && resource.origin?.document === sourceDoc.name,
      );
      const perDocumentContext = asProject(perDocumentResources);
      const exported = exportToSiren(perDocumentContext);

      expect(exported).not.toContain(`milestone ${sourceDoc.name.replace(/\.siren$/u, '')}`);
      return { name: sourceDoc.name, content: exported };
    });

    const parseResult2 = await adapter.parse(exportedDocs);
    const { context: context2 } = createSirenProjectFromParseResult(parseResult2);
    const contextWithSynthetic2 = asProject(withSyntheticMilestones(context2.resources, sourceDocs));

    const syntheticIds2 = new Set(
      contextWithSynthetic2.resources
        .filter((resource) => resource.synthetic === true)
        .map((resource) => resource.id),
    );
    expect(syntheticIds2).toEqual(syntheticIds1);
    expect(normalizeResources(contextWithSynthetic2.resources)).toEqual(
      normalizeResources(contextWithSynthetic1.resources),
    );
  });
});

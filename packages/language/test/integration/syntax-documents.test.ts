import { beforeAll, describe, expect, it } from 'vitest';
import type { ParserAdapter, SourceDocument } from '../../src/parser/adapter';
import { getTestAdapter } from '../helpers/parser';

describe('ParseResult syntaxDocuments', () => {
  let adapter: ParserAdapter;

  beforeAll(async () => {
    adapter = await getTestAdapter();
  });

  it('creates one syntax document per source document including empty/comment-only files', async () => {
    const documents: SourceDocument[] = [
      {
        name: 'a.siren',
        content: 'task alpha {}\n',
      },
      {
        name: 'empty.siren',
        content: '',
      },
      {
        name: 'comments.siren',
        content: '# comments only\n\n',
      },
    ];

    const result = await adapter.parse(documents);
    const syntaxDocuments = result.syntaxDocuments;

    expect(result.tree).not.toBeNull();
    expect(syntaxDocuments).toBeDefined();
    if (!syntaxDocuments) throw new Error('expected syntax documents');

    expect(syntaxDocuments).toHaveLength(3);

    const byName = new Map(syntaxDocuments.map((doc) => [doc.source.name, doc]));

    expect(byName.get('a.siren')?.resources).toHaveLength(1);
    expect(byName.get('empty.siren')?.resources).toHaveLength(0);
    expect(byName.get('comments.siren')?.resources).toHaveLength(0);
    expect(
      byName.get('comments.siren')?.trivia.some((trivia) => trivia.kind === 'line-comment'),
    ).toBe(true);
  });

  it('preserves resource identifier spelling and keyword tokens', async () => {
    const result = await adapter.parse([
      {
        name: 'quoted.siren',
        content: 'milestone "Q1 Launch" complete {}\n',
      },
    ]);

    const syntaxDocument = result.syntaxDocuments?.[0];
    expect(syntaxDocument).toBeDefined();
    if (!syntaxDocument) throw new Error('expected syntax document');

    const resource = syntaxDocument.resources[0];
    expect(resource).toBeDefined();
    if (!resource) throw new Error('expected resource');

    expect(resource.resourceTypeToken.raw).toBe('milestone');
    expect(resource.identifier.value).toBe('Q1 Launch');
    expect(resource.identifier.raw).toBe('"Q1 Launch"');
    expect(resource.identifier.quoted).toBe(true);
    expect(resource.completeKeyword?.raw).toBe('complete');
  });

  it('retains raw expression slices for unicode + CRLF source', async () => {
    const source = 'task "Sprint α" {\r\n  description = "Line α"\r\n}\r\n';

    const result = await adapter.parse([
      {
        name: 'unicode-crlf.siren',
        content: source,
      },
    ]);

    const syntaxDocument = result.syntaxDocuments?.[0];
    expect(syntaxDocument).toBeDefined();
    if (!syntaxDocument) throw new Error('expected syntax document');

    const resource = syntaxDocument.resources[0];
    expect(resource).toBeDefined();
    if (!resource) throw new Error('expected resource');

    const attribute = resource.attributes.find((item) => item.key.value === 'description');
    expect(attribute).toBeDefined();
    if (!attribute) throw new Error('expected description attribute');

    expect(attribute.value.kind).toBe('literal');
    expect(attribute.value.raw).toBe('"Line α"');

    const span = attribute.value.span;
    const sliced = syntaxDocument.source.content.slice(span.startByte, span.endByte);
    expect(sliced).toBe(attribute.value.raw);
  });

  it('populates syntaxDocuments even when parse success is false', async () => {
    const result = await adapter.parse([
      {
        name: 'broken.siren',
        content: 'task broken {\n',
      },
    ]);

    expect(result.success).toBe(false);
    expect(result.syntaxDocuments).toBeDefined();
    expect(result.syntaxDocuments).toHaveLength(1);
  });

  it('classifies comment and blank-line trivia as leading/trailing/inner/eof', async () => {
    const source = [
      '# leading',
      'task a {',
      '  x = 1  # trailing',
      '  ',
      '  y = 2',
      '}',
      '',
      '# eof',
      '',
    ].join('\n');

    const result = await adapter.parse([
      {
        name: 'trivia.siren',
        content: source,
      },
    ]);

    const syntaxDocument = result.syntaxDocuments?.[0];
    expect(syntaxDocument).toBeDefined();
    if (!syntaxDocument) throw new Error('expected syntax document');

    const classifications = new Set(syntaxDocument.trivia.map((trivia) => trivia.classification));

    expect(classifications.has('leading')).toBe(true);
    expect(classifications.has('trailing')).toBe(true);
    expect(classifications.has('inner')).toBe(true);
    expect(classifications.has('eof')).toBe(true);
  });
});

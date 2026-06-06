/**
 * Unit tests for `decodeSyntaxDocuments`.
 *
 * These exercise the decoder directly against hand-constructed
 * `SyntaxDocument` inputs (post-lint), so the WL001 status semantics can be
 * verified without going through the parser.
 */

import { describe, expect, it } from 'vitest';

import { decodeSyntaxDocuments } from '../../src/decoder/index';
import type {
  SourceSpan,
  SyntaxAttribute,
  SyntaxDocument,
  SyntaxLiteralExpression,
  SyntaxResource,
  SyntaxToken,
} from '../../src/syntax/types';

const DOC = 'test.siren';

function span(startRow = 0, document = DOC): SourceSpan {
  return { startByte: 0, endByte: 0, startRow, endRow: startRow, document };
}

function token(raw: string): SyntaxToken {
  return { raw, span: span() };
}

function stringLiteral(value: string): SyntaxLiteralExpression {
  return {
    kind: 'literal',
    literalType: 'string',
    value,
    raw: `"${value}"`,
    span: span(),
  };
}

function attribute(key: string, value: SyntaxLiteralExpression): SyntaxAttribute {
  return {
    kind: 'attribute',
    key: { kind: 'identifier', value: key, raw: key, quoted: false, span: span() },
    value,
    raw: `${key} = ${value.raw}`,
    span: span(),
  };
}

function resource(options: {
  id: string;
  statusKeyword?: SyntaxToken;
  attributes?: readonly SyntaxAttribute[];
}): SyntaxResource {
  const { id, statusKeyword, attributes = [] } = options;
  return {
    kind: 'resource',
    resourceType: 'task',
    resourceTypeToken: token('task'),
    identifier: { kind: 'identifier', value: id, raw: id, quoted: false, span: span() },
    statusKeywords: statusKeyword ? [statusKeyword] : [],
    statusKeyword,
    attributes,
    trivia: { leading: [], trailing: [], inner: [] },
    raw: '',
    span: span(),
  };
}

function decodeOne(res: SyntaxResource) {
  const doc: SyntaxDocument = {
    kind: 'document',
    source: { name: DOC, content: '' },
    resources: [res],
    trivia: [],
  };
  const result = decodeSyntaxDocuments([doc]);
  return {
    resource: result.documents?.[0]?.resources[0],
    diagnostics: result.diagnostics,
  };
}

describe('decodeSyntaxDocuments — status', () => {
  it('carries the `complete` keyword through as status', () => {
    const { resource: r, diagnostics } = decodeOne(
      resource({ id: 'a', statusKeyword: token('complete') }),
    );
    expect(r?.status).toBe('complete');
    expect(diagnostics).toHaveLength(0);
  });

  it('carries the `draft` keyword through as status', () => {
    const { resource: r, diagnostics } = decodeOne(
      resource({ id: 'a', statusKeyword: token('draft') }),
    );
    expect(r?.status).toBe('draft');
    expect(diagnostics).toHaveLength(0);
  });

  it('leaves status undefined when no keyword is present', () => {
    const { resource: r, diagnostics } = decodeOne(resource({ id: 'a' }));
    expect(r?.status).toBeUndefined();
    expect(diagnostics).toHaveLength(0);
  });
});

describe('decodeSyntaxDocuments — WL001', () => {
  it('mismatch: keyword and status attribute disagree → keyword wins, attribute dropped', () => {
    const { resource: r, diagnostics } = decodeOne(
      resource({
        id: 'foo',
        statusKeyword: token('draft'),
        attributes: [attribute('status', stringLiteral('complete'))],
      }),
    );
    expect(r?.status).toBe('draft');
    expect(r?.attributes.find((a) => a.key === 'status')).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'WL001',
      severity: 'warning',
      message:
        "resource 'foo' declares status keyword 'draft' but also has attribute status = \"complete\"; keyword wins, attribute ignored",
    });
  });

  it('attribute-only: status attribute without keyword → attribute dropped, status undefined', () => {
    const { resource: r, diagnostics } = decodeOne(
      resource({
        id: 'foo',
        attributes: [attribute('status', stringLiteral('draft'))],
      }),
    );
    expect(r?.status).toBeUndefined();
    expect(r?.attributes.find((a) => a.key === 'status')).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'WL001',
      severity: 'warning',
      message:
        'resource \'foo\' uses attribute form status = "draft"; use the keyword form instead (e.g. `task foo draft {}`); attribute ignored',
    });
  });

  it('matching keyword and attribute → no diagnostic, attribute still dropped', () => {
    const { resource: r, diagnostics } = decodeOne(
      resource({
        id: 'foo',
        statusKeyword: token('draft'),
        attributes: [attribute('status', stringLiteral('draft'))],
      }),
    );
    expect(r?.status).toBe('draft');
    expect(r?.attributes.find((a) => a.key === 'status')).toBeUndefined();
    expect(diagnostics).toHaveLength(0);
  });
});

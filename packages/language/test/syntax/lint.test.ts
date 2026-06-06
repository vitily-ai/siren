/**
 * Unit tests for `lintSyntaxDocuments`.
 *
 * These exercise the collapse rules in `packages/language/src/syntax/lint.ts`
 * directly against hand-constructed `SyntaxDocument` inputs — no parser
 * involved — to lock in the WL002 / WL003 semantics independent of the CST.
 */

import { describe, expect, it } from 'vitest';

import { lintSyntaxDocuments } from '../../src/syntax/lint';
import type {
  SourceSpan,
  SyntaxDocument,
  SyntaxIdentifier,
  SyntaxResource,
  SyntaxToken,
} from '../../src/syntax/types';

const DOC = 'test.siren';

function span(startRow = 0, document = DOC): SourceSpan {
  return {
    startByte: 0,
    endByte: 0,
    startRow,
    endRow: startRow,
    document,
  };
}

function token(raw: string, startRow = 0, document = DOC): SyntaxToken {
  return { raw, span: span(startRow, document) };
}

function identifier(value: string, quoted = false): SyntaxIdentifier {
  return {
    kind: 'identifier',
    value,
    raw: quoted ? `"${value}"` : value,
    quoted,
    span: span(),
  };
}

function resource(options: {
  id: string;
  statusKeywords: readonly SyntaxToken[];
  quoted?: boolean;
  startRow?: number;
  document?: string;
}): SyntaxResource {
  const { id, statusKeywords, quoted = false, startRow = 0, document = DOC } = options;
  return {
    kind: 'resource',
    resourceType: 'task',
    resourceTypeToken: token('task', startRow, document),
    identifier: { ...identifier(id, quoted), span: span(startRow, document) },
    statusKeywords,
    // Pre-lint: the builder sets this to the last token; the lint pass owns
    // the final collapse. Seeding it lets us prove the pass overrides it.
    statusKeyword: statusKeywords[statusKeywords.length - 1],
    attributes: [],
    trivia: { leading: [], trailing: [], inner: [] },
    raw: '',
    span: span(startRow, document),
  };
}

function document(resources: readonly SyntaxResource[], name = DOC): SyntaxDocument {
  return {
    kind: 'document',
    source: { name, content: '' },
    resources,
    trivia: [],
  };
}

function lintOne(res: SyntaxResource) {
  const result = lintSyntaxDocuments([document([res])]);
  return {
    resource: result.documents[0]!.resources[0]!,
    diagnostics: result.diagnostics,
  };
}

describe('lintSyntaxDocuments — collapse rule (last-wins)', () => {
  it('0 status tokens: statusKeyword is undefined, no diagnostics', () => {
    const { resource: r, diagnostics } = lintOne(resource({ id: 'a', statusKeywords: [] }));
    expect(r.statusKeyword).toBeUndefined();
    expect(diagnostics).toHaveLength(0);
  });

  it('1 valid token (complete): statusKeyword is that token, no diagnostics', () => {
    const t = token('complete');
    const { resource: r, diagnostics } = lintOne(resource({ id: 'a', statusKeywords: [t] }));
    expect(r.statusKeyword).toBe(t);
    expect(diagnostics).toHaveLength(0);
  });

  it('1 valid token (draft): statusKeyword is that token, no diagnostics', () => {
    const t = token('draft');
    const { resource: r, diagnostics } = lintOne(resource({ id: 'a', statusKeywords: [t] }));
    expect(r.statusKeyword).toBe(t);
    expect(diagnostics).toHaveLength(0);
  });

  it('2 same valid tokens (complete complete): WL002 names complete as winner', () => {
    const t1 = token('complete');
    const t2 = token('complete');
    const { resource: r, diagnostics } = lintOne(resource({ id: 'a', statusKeywords: [t1, t2] }));
    expect(r.statusKeyword).toBe(t2);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'WL002',
      severity: 'warning',
    });
    expect(diagnostics[0]!.message).toBe(
      "resource 'a' has multiple status keywords; treated as 'complete'",
    );
  });

  it('2 different valid tokens (draft complete): WL002 names complete; statusKeyword is the second token', () => {
    const t1 = token('draft');
    const t2 = token('complete');
    const { resource: r, diagnostics } = lintOne(resource({ id: 'a', statusKeywords: [t1, t2] }));
    expect(r.statusKeyword).toBe(t2);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('WL002');
    expect(diagnostics[0]!.message).toContain("treated as 'complete'");
  });

  it('2 different valid tokens reversed (complete draft): WL002 names draft; statusKeyword is the second (draft)', () => {
    const t1 = token('complete');
    const t2 = token('draft');
    const { resource: r, diagnostics } = lintOne(resource({ id: 'a', statusKeywords: [t1, t2] }));
    expect(r.statusKeyword).toBe(t2);
    expect(r.statusKeyword!.raw).toBe('draft');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('WL002');
    expect(diagnostics[0]!.message).toContain("treated as 'draft'");
  });

  it('3 tokens (draft draft complete): WL002 fires once naming complete; statusKeyword is the last', () => {
    const t1 = token('draft');
    const t2 = token('draft');
    const t3 = token('complete');
    const { resource: r, diagnostics } = lintOne(
      resource({ id: 'a', statusKeywords: [t1, t2, t3] }),
    );
    expect(r.statusKeyword).toBe(t3);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('WL002');
    expect(diagnostics[0]!.message).toContain("treated as 'complete'");
  });
});

describe('lintSyntaxDocuments — unknown-token rule (WL003)', () => {
  it('1 unknown token (bogus): WL003 fires; statusKeyword cleared', () => {
    const t = token('bogus');
    const { resource: r, diagnostics } = lintOne(resource({ id: 'a', statusKeywords: [t] }));
    expect(r.statusKeyword).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'WL003',
      severity: 'warning',
    });
    expect(diagnostics[0]!.message).toBe(
      "unknown status keyword 'bogus' on resource 'a'; status will be ignored",
    );
  });

  it('multi-token, winner unknown (complete bogus): WL002 names bogus AND WL003 fires; statusKeyword cleared', () => {
    const t1 = token('complete');
    const t2 = token('bogus');
    const { resource: r, diagnostics } = lintOne(resource({ id: 'a', statusKeywords: [t1, t2] }));
    expect(r.statusKeyword).toBeUndefined();
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]!.code).toBe('WL002');
    expect(diagnostics[0]!.message).toContain("treated as 'bogus'");
    expect(diagnostics[1]!.code).toBe('WL003');
    expect(diagnostics[1]!.message).toContain("'bogus'");
  });

  it('multi-token, non-winner unknown (bogus complete): WL002 only; statusKeyword is complete', () => {
    const t1 = token('bogus');
    const t2 = token('complete');
    const { resource: r, diagnostics } = lintOne(resource({ id: 'a', statusKeywords: [t1, t2] }));
    expect(r.statusKeyword).toBe(t2);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('WL002');
    expect(diagnostics.some((d) => d.code === 'WL003')).toBe(false);
  });

  it('multi-token, every token unknown (bogus bogus): WL002 + WL003 once; statusKeyword cleared', () => {
    const t1 = token('bogus');
    const t2 = token('bogus');
    const { resource: r, diagnostics } = lintOne(resource({ id: 'a', statusKeywords: [t1, t2] }));
    expect(r.statusKeyword).toBeUndefined();
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]!.code).toBe('WL002');
    expect(diagnostics[0]!.message).toContain("treated as 'bogus'");
    expect(diagnostics[1]!.code).toBe('WL003');
    expect(diagnostics.filter((d) => d.code === 'WL003')).toHaveLength(1);
  });
});

describe('lintSyntaxDocuments — diagnostic shape', () => {
  it('WL002 carries code/severity/file/line; column is pinned to 0', () => {
    const r = resource({
      id: 'a',
      statusKeywords: [token('complete', 7), token('draft', 7)],
      startRow: 7,
      document: 'shape.siren',
    });
    const { diagnostics } = lintSyntaxDocuments([document([r], 'shape.siren')]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'WL002',
      severity: 'warning',
      file: 'shape.siren',
      line: 8, // startRow + 1
      column: 0,
    });
  });

  it('WL003 carries the same shape (file/line from resource.span)', () => {
    const r = resource({
      id: 'a',
      statusKeywords: [token('bogus', 4)],
      startRow: 4,
      document: 'shape.siren',
    });
    const { diagnostics } = lintSyntaxDocuments([document([r], 'shape.siren')]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'WL003',
      severity: 'warning',
      file: 'shape.siren',
      line: 5,
      column: 0,
    });
  });
});

describe('lintSyntaxDocuments — multi-resource and multi-document', () => {
  it('single document, multiple resources: diagnostics ordered; each names its own resource', () => {
    const r1 = resource({ id: 'one', statusKeywords: [], startRow: 0 });
    const r2 = resource({
      id: 'two',
      statusKeywords: [token('draft', 2), token('complete', 2)],
      startRow: 2,
    });
    const r3 = resource({
      id: 'three',
      statusKeywords: [token('bogus', 5)],
      startRow: 5,
    });
    const { documents, diagnostics } = lintSyntaxDocuments([document([r1, r2, r3])]);
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({
      code: 'WL002',
      file: DOC,
      line: 3,
    });
    expect(diagnostics[0]!.message).toContain("resource 'two'");
    expect(diagnostics[1]).toMatchObject({
      code: 'WL003',
      file: DOC,
      line: 6,
    });
    expect(diagnostics[1]!.message).toContain("resource 'three'");

    const linted = documents[0]!.resources;
    expect(linted[0]!.statusKeyword).toBeUndefined();
    expect(linted[1]!.statusKeyword?.raw).toBe('complete');
    expect(linted[2]!.statusKeyword).toBeUndefined();
  });

  it('multiple documents: each is linted independently with the correct file in diagnostics', () => {
    const docA = document(
      [
        resource({
          id: 'a',
          statusKeywords: [token('draft', 0, 'a.siren'), token('complete', 0, 'a.siren')],
          document: 'a.siren',
        }),
      ],
      'a.siren',
    );
    const docB = document(
      [
        resource({
          id: 'b',
          statusKeywords: [token('bogus', 1, 'b.siren')],
          startRow: 1,
          document: 'b.siren',
        }),
      ],
      'b.siren',
    );
    const { diagnostics } = lintSyntaxDocuments([docA, docB]);
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({ code: 'WL002', file: 'a.siren', line: 1 });
    expect(diagnostics[1]).toMatchObject({ code: 'WL003', file: 'b.siren', line: 2 });
  });
});

describe('lintSyntaxDocuments — raw token list preservation', () => {
  it('multi-token case: statusKeywords array is carried through unchanged', () => {
    const tokens = [token('draft'), token('complete')];
    const { resource: r } = lintOne(resource({ id: 'a', statusKeywords: tokens }));
    expect(r.statusKeywords).toHaveLength(2);
    expect(r.statusKeywords[0]).toBe(tokens[0]);
    expect(r.statusKeywords[1]).toBe(tokens[1]);
  });

  it('unknown-token case: statusKeywords array is carried through unchanged even when statusKeyword is cleared', () => {
    const tokens = [token('complete'), token('bogus')];
    const { resource: r } = lintOne(resource({ id: 'a', statusKeywords: tokens }));
    expect(r.statusKeyword).toBeUndefined();
    expect(r.statusKeywords).toHaveLength(2);
    expect(r.statusKeywords[0]).toBe(tokens[0]);
    expect(r.statusKeywords[1]).toBe(tokens[1]);
  });
});

describe('lintSyntaxDocuments — identifier rendering in messages', () => {
  it('quoted identifier: messages use identifier.value (unquoted), not the raw quoted form', () => {
    const r = resource({
      id: 'Q1 Launch',
      quoted: true,
      statusKeywords: [token('complete'), token('bogus')],
    });
    const { diagnostics } = lintOne(r);
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]!.message).toBe(
      "resource 'Q1 Launch' has multiple status keywords; treated as 'bogus'",
    );
    expect(diagnostics[1]!.message).toBe(
      "unknown status keyword 'bogus' on resource 'Q1 Launch'; status will be ignored",
    );
    // Negative assertion: no embedded quotes from the raw form.
    expect(diagnostics[0]!.message).not.toContain('"Q1 Launch"');
    expect(diagnostics[1]!.message).not.toContain('"Q1 Launch"');
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { renderSyntaxDocument } from '../../src/format/syntax-formatter';
import type { ParseResult, ParserAdapter } from '../../src/parser/adapter';
import type { SyntaxDocument } from '../../src/syntax/types';
import { doc, getTestAdapter } from '../helpers/parser';

describe('syntax formatter', () => {
  let adapter: ParserAdapter;

  beforeAll(async () => {
    adapter = await getTestAdapter();
  });

  async function parseSingle(
    source: string,
    name = 'test.siren',
  ): Promise<{ result: ParseResult; syntaxDocument: SyntaxDocument }> {
    const result = await adapter.parse(doc(source, name));
    const syntaxDocument = result.syntaxDocuments?.[0];
    expect(syntaxDocument).toBeDefined();
    if (!syntaxDocument) throw new Error('expected syntax document');
    return { result, syntaxDocument };
  }

  it('renders resource headers from syntax spelling', async () => {
    const source = [
      'task bare {}',
      'task "safe_id" {}',
      'milestone "Release 1" {}',
      'task done complete {}',
      '',
    ].join('\n');

    const { syntaxDocument } = await parseSingle(source);

    expect(renderSyntaxDocument(syntaxDocument)).toBe(
      [
        'task bare {}',
        '',
        'task "safe_id" {}',
        '',
        'milestone "Release 1" {}',
        '',
        'task done complete {}',
        '',
      ].join('\n'),
    );
  });

  it('renders attributes from syntax values without semantic IR', async () => {
    const source = [
      'task attr_task {',
      'description="hello"',
      'count=42',
      'enabled=true',
      'missing=null',
      'depends_on=[alpha, [beta, "gamma"]]',
      '}',
      '',
    ].join('\n');

    const { syntaxDocument } = await parseSingle(source);

    expect(renderSyntaxDocument(syntaxDocument)).toBe(
      [
        'task attr_task {',
        '  description = "hello"',
        '  count = 42',
        '  enabled = true',
        '  missing = null',
        '  depends_on = [alpha, [beta, "gamma"]]',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('renders comments and structurally meaningful blank lines from syntax trivia', async () => {
    const source = [
      '# leading',
      'task "safe_id" { # header',
      '  description = "x" # attr',
      '  # inner',
      '',
      '  depends_on = [other]',
      '}',
      '',
      '# detached',
      'milestone other {}',
      '',
      '# eof',
      '',
    ].join('\n');

    const { syntaxDocument } = await parseSingle(source);

    expect(renderSyntaxDocument(syntaxDocument)).toBe(
      [
        '# leading',
        'task "safe_id" {  # header',
        '  description = "x"  # attr',
        '  # inner',
        '',
        '  depends_on = [other]',
        '}',
        '',
        '# detached',
        'milestone other {}',
        '',
        '# eof',
        '',
      ].join('\n'),
    );
  });

  it('preserves comment-only documents and canonicalizes empty documents', async () => {
    const commentsOnly = await parseSingle('# one\n\n// two\n');
    const empty = await parseSingle('', 'empty.siren');

    expect(renderSyntaxDocument(commentsOnly.syntaxDocument)).toBe('# one\n\n// two\n');
    expect(renderSyntaxDocument(empty.syntaxDocument)).toBe('');
  });

  it('does not crash for recovered syntax documents', async () => {
    const { result, syntaxDocument } = await parseSingle('task draft {\n  description = "x"\n');

    expect(result.success).toBe(false);
    expect(() => renderSyntaxDocument(syntaxDocument)).not.toThrow();
  });

  it('is idempotent after parsing the rendered output', async () => {
    const source = [
      '# leading',
      'task a { # header',
      '  x = [one, two] # attr',
      '',
      '  # body',
      '  y = true',
      '}',
      '',
    ].join('\n');

    const firstParse = await parseSingle(source);
    const firstOutput = renderSyntaxDocument(firstParse.syntaxDocument);
    const secondParse = await parseSingle(firstOutput);

    expect(secondParse.result.errors.filter((error) => error.severity !== 'warning')).toEqual([]);
    expect(renderSyntaxDocument(secondParse.syntaxDocument)).toBe(firstOutput);
  });

  it('keeps raw Unicode and CRLF expression slices intact', async () => {
    const source = 'task "Sprint α" {\r\n  description = "Line α"\r\n}\r\n';

    const { syntaxDocument } = await parseSingle(source, 'unicode-crlf.siren');

    expect(renderSyntaxDocument(syntaxDocument)).toBe(
      ['task "Sprint α" {', '  description = "Line α"', '}', ''].join('\n'),
    );
  });
});

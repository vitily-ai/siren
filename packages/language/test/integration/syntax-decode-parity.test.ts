import { beforeAll, describe, expect, it } from 'vitest';
import { createIRContextFromParseResult } from '../../src/context-factory';
import type { ParserAdapter, SourceDocument } from '../../src/parser/adapter';
import { getTestAdapter } from '../helpers/parser';

describe('Syntax decode parity', () => {
  let adapter: ParserAdapter;

  beforeAll(async () => {
    adapter = await getTestAdapter();
  });

  it('preserves SourceDocument order and per-document resource order in decoded IR', async () => {
    const documents: SourceDocument[] = [
      {
        name: 'b.siren',
        content: 'task b1 {}\nmilestone b2 {}\n',
      },
      {
        name: 'a.siren',
        content: 'task a1 {}\n',
      },
    ];

    const parseResult = await adapter.parse(documents);
    const { context } = createIRContextFromParseResult(parseResult);

    expect(
      context.resources.map((resource) => `${resource.origin?.document}:${resource.id}`),
    ).toEqual(['b.siren:b1', 'b.siren:b2', 'a.siren:a1']);
  });

  it('preserves resource and attribute origins through syntax decoding', async () => {
    const source = [
      'task sample {',
      '  description = "hello"',
      '  depends_on = another',
      '}',
      '',
    ].join('\n');

    const parseResult = await adapter.parse([{ name: 'origin.siren', content: source }]);
    const { context } = createIRContextFromParseResult(parseResult);

    const resource = context.resources[0];
    expect(resource).toBeDefined();
    if (!resource || !resource.origin) throw new Error('expected resource origin');

    expect(resource.origin.document).toBe('origin.siren');
    expect(resource.origin.startRow).toBe(0);
    expect(resource.origin.endRow).toBeGreaterThanOrEqual(3);

    const description = resource.attributes.find((attr) => attr.key === 'description');
    expect(description?.origin?.document).toBe('origin.siren');
    expect(description?.origin?.startRow).toBe(1);

    const dependsOn = resource.attributes.find((attr) => attr.key === 'depends_on');
    expect(dependsOn?.origin?.document).toBe('origin.siren');
    expect(dependsOn?.origin?.startRow).toBe(2);
  });

  it('keeps complete-keyword semantics and parse diagnostics behavior', async () => {
    const source = 'task done complete {\n  complete = false\n}\n';

    const parseResult = await adapter.parse([{ name: 'complete.siren', content: source }]);
    const { context, parseDiagnostics } = createIRContextFromParseResult(parseResult);

    expect(context.resources[0]?.complete).toBe(true);

    const warning = parseDiagnostics.find((diagnostic) => diagnostic.code === 'WL001');
    expect(warning?.severity).toBe('warning');
    expect(warning?.file).toBe('complete.siren');
  });
});

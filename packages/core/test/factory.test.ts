import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { Language, Parser } from 'web-tree-sitter';
import { IRContext } from '../src/ir/context.js';
import type { ParserAdapter, SourceDocument } from '../src/parser/adapter.js';
import { createParserFactory } from '../src/parser/factory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmPath = join(__dirname, '../grammar/tree-sitter-siren.wasm');

// TODO move to helper - this is duplicated a lot
/** Helper to wrap a string as SourceDocument[]. */
function doc(content: string, name = 'test.siren'): SourceDocument[] {
  return [{ name, content }];
}

async function createAdapter(): Promise<ParserAdapter> {
  const loadWasm = async (runtimeWasmPath: string) => {
    await Parser.init();
    const language = await Language.load(runtimeWasmPath);
    return {
      createParser: () => {
        const parser = new Parser();
        parser.setLanguage(language);
        return parser;
      },
    };
  };

  return createParserFactory({ loadWasm, wasmPath });
}

describe('createParserFactory', () => {
  let adapter: ParserAdapter;

  beforeAll(async () => {
    adapter = await createAdapter();
  });

  it('parses a simple resource and decode() accepts the CST', async () => {
    const source = 'task my_task { description = "hello" }';
    const result = await adapter.parse(doc(source));

    expect(result.success).toBe(true);
    expect(result.tree).not.toBeNull();
    expect(result.comments).toEqual([]);

    // IRContext.fromCst should accept the produced CST without throwing
    const ir = IRContext.fromCst(result.tree!);
    expect(ir).not.toBeNull();
    expect(ir.resources.length).toBeGreaterThan(0);
  });

  it('returns comments array when no comments exist', async () => {
    const result = await adapter.parse(doc('task foo {}'));
    expect(result.comments).toEqual([]);
  });

  it('extracts comment text and offsets', async () => {
    const source = '# lead\ntask foo {} # trailing';
    const result = await adapter.parse(doc(source));

    expect(result.comments).toHaveLength(2);
    const leading = result.comments?.find((comment) => comment.text === '# lead');
    const trailing = result.comments?.find((comment) => comment.text === '# trailing');

    expect(leading).toBeDefined();
    expect(trailing).toBeDefined();
    expect(leading?.startByte).toBe(0);
    expect(source.slice(leading!.startByte, leading!.endByte)).toBe('# lead');
    expect(source.slice(trailing!.startByte, trailing!.endByte)).toBe('# trailing');
  });

  it('attributes comments to their source documents', async () => {
    const documents: SourceDocument[] = [
      { name: 'one.siren', content: '# one\ntask one {}' },
      { name: 'two.siren', content: '# two\ntask two {}' },
    ];

    const result = await adapter.parse(documents);
    const oneComment = result.comments?.find((comment) => comment.text === '# one');
    const twoComment = result.comments?.find((comment) => comment.text === '# two');

    expect(oneComment?.document).toBe('one.siren');
    expect(twoComment?.document).toBe('two.siren');
    expect(oneComment?.startByte).toBe(0);
    expect(twoComment?.startByte).toBe(0);
  });

  it('emits structured syntax diagnostics', async () => {
    const result = await adapter.parse(doc('!!! broken'));

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatchObject({
      severity: 'error',
      kind: 'unexpected_token',
      found: '!!!',
      expected: ['task', 'milestone'],
      line: 1,
      column: 1,
      document: 'test.siren',
    });
    expect(result.errors[0]?.message).toBe(
      "unexpected token '!!!'; expected 'task' or 'milestone'",
    );
  });
});

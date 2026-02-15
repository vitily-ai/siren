import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Language, Parser } from 'web-tree-sitter';
import { IRContext } from '../src/ir/context.js';
import type { SourceDocument } from '../src/parser/adapter.js';
import { createParserFactory } from '../src/parser/factory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// TODO move to helper - this is duplicated a lot
/** Helper to wrap a string as SourceDocument[]. */
function doc(content: string, name = 'test.siren'): SourceDocument[] {
  return [{ name, content }];
}

describe('createParserFactory', () => {
  it('parses a simple resource and decode() accepts the CST', async () => {
    // loader implementation that the host (Node tests) provides
    const loadWasm = async (wasmPath: string) => {
      await Parser.init();
      const language = await Language.load(wasmPath);
      return {
        createParser: () => {
          const p = new Parser();
          p.setLanguage(language);
          return p;
        },
      };
    };

    const wasmPath = join(__dirname, '../grammar/tree-sitter-siren.wasm');

    const adapter = await createParserFactory({ loadWasm, wasmPath });

    const source = 'task my_task { description = "hello" }';
    const result = await adapter.parse(doc(source));

    expect(result.success).toBe(true);
    expect(result.tree).not.toBeNull();

    // IRContext.fromCst should accept the produced CST without throwing
    const ir = IRContext.fromCst(result.tree!);
    expect(ir).not.toBeNull();
    expect(ir.resources.length).toBeGreaterThan(0);
  });
});

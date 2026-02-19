/**
 * Node.js parser adapter shim.
 *
 * CLI owns the runtime wiring for `web-tree-sitter` and delegates parsing
 * semantics (CST conversion, diagnostics, comments) to `@siren/core`.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createParserFactory,
  type ParseResult,
  type ParserAdapter,
  type SourceDocument,
} from '@siren/core';
import { Language, Parser } from 'web-tree-sitter';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveWasmPath(): string {
  const candidates = [
    join(__dirname, '../../../../packages/core/grammar/tree-sitter-siren.wasm'), // source layout
    join(__dirname, '../../../packages/core/grammar/tree-sitter-siren.wasm'), // built (dist) layout
    join(__dirname, '../../packages/core/grammar/tree-sitter-siren.wasm'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

export class NodeParserAdapter implements ParserAdapter {
  private constructor(private readonly delegate: ParserAdapter) {}

  static async create(): Promise<NodeParserAdapter> {
    const wasmPath = resolveWasmPath();
    const delegate = await createParserFactory({
      wasmPath,
      loadWasm: async (runtimeWasmPath) => {
        await Parser.init();
        const language = await Language.load(runtimeWasmPath);
        return {
          createParser: () => {
            const parser = new Parser();
            parser.setLanguage(language);
            return parser;
          },
        };
      },
    });

    return new NodeParserAdapter(delegate);
  }

  async parse(documents: readonly SourceDocument[]): Promise<ParseResult> {
    return this.delegate.parse(documents);
  }
}

let adapterInstance: ParserAdapter | null = null;

export async function getNodeParser(): Promise<ParserAdapter> {
  if (!adapterInstance) {
    adapterInstance = await NodeParserAdapter.create();
  }
  return adapterInstance;
}

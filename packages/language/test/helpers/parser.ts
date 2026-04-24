/**
 * Test helpers — wrap `createParser()` from the language package.
 *
 * The pre-split codebase carried a hand-written `NodeParserAdapter`
 * (~520 lines) that re-implemented CST conversion. That logic now lives
 * in `packages/language/src/parser/factory.ts`; helpers here are thin
 * wrappers and must NOT re-implement CST translation.
 */

/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Language, Parser, type Tree } from 'web-tree-sitter';
import type { ParserAdapter, SourceDocument } from '../../src/parser/adapter';
import { createParser } from '../../src/parser/factory';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _adapterPromise: Promise<ParserAdapter> | null = null;
let _rawParser: Parser | null = null;

/**
 * Wrap a source string as a single-document `SourceDocument` array.
 */
export function doc(content: string, name = 'test.siren'): SourceDocument[] {
  return [{ name, content }];
}

/**
 * Cached `ParserAdapter` for tests. Calls `createParser()` once and
 * memoizes the resulting adapter so integration tests share initialization
 * cost.
 */
export async function getTestAdapter(): Promise<ParserAdapter> {
  if (!_adapterPromise) {
    _adapterPromise = createParser();
  }
  return _adapterPromise;
}

/**
 * Parse a fixture by name and return the **raw** `web-tree-sitter` `Tree`.
 *
 * Used only by grammar-shape assertions in `fixtures.test.ts` that inspect
 * tree-sitter API directly (e.g. `rootNode.hasError`,
 * `childForFieldName('type').text`). Decode-level integration tests should
 * use `getTestAdapter()` instead.
 */
export async function parseFixture(name: string): Promise<Tree> {
  const parser = await getRawParser();
  const fixturePath = join(__dirname, '..', 'fixtures', `${name}.siren`);
  const source = readFileSync(fixturePath, 'utf-8');
  const tree = parser.parse(source);
  if (!tree) {
    throw new Error(`tree-sitter returned null tree for fixture ${name}`);
  }
  return tree;
}

async function getRawParser(): Promise<Parser> {
  if (_rawParser) return _rawParser;
  await Parser.init();
  const wasmPath = join(__dirname, '..', '..', 'grammar', 'tree-sitter-siren.wasm');
  const language = await Language.load(wasmPath);
  const parser = new Parser();
  parser.setLanguage(language);
  _rawParser = parser;
  return parser;
}

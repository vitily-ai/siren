/**
 * Test helper: Provides initialized ParserAdapter for tests
 * 
 * This is NOT shipped code - only used in tests.
 * Tests can use Node APIs and real WASM parsing.
 */
/// <reference types="node" />

import { Parser, Language, type Tree } from 'web-tree-sitter';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeAdapter } from './node-adapter.js';
import type { ParserAdapter } from '../../src/parser/adapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _parser: Parser | null = null;
let _adapter: ParserAdapter | null = null;

/**
 * Get a cached ParserAdapter instance for tests.
 * 
 * This is the preferred way to get a parser in tests.
 * The adapter is initialized once and reused across tests.
 */
export async function getTestAdapter(): Promise<ParserAdapter> {
  if (!_adapter) {
    _adapter = await createNodeAdapter();
  }
  return _adapter;
}

/**
 * Initialize and return a tree-sitter parser for Siren grammar.
 * Caches the parser instance across tests.
 * 
 * @deprecated Use getTestAdapter() for new tests. This is kept for backward compatibility.
 */
export async function getTestParser(): Promise<Parser> {
  if (_parser) {
    return _parser;
  }

  // Initialize web-tree-sitter WASM runtime
  await Parser.init();
  const parser = new Parser();
  
  // Load the committed WASM grammar
  const wasmPath = join(__dirname, '../../grammar/tree-sitter-siren.wasm');
  const language = await Language.load(wasmPath);
  parser.setLanguage(language);
  
  _parser = parser;
  return parser;
}

/**
 * Parse a Siren source string using the real tree-sitter grammar.
 * 
 * @deprecated Use getTestAdapter() for new tests. This is kept for backward compatibility.
 */
export async function parseSource(source: string): Promise<Tree> {
  const parser = await getTestParser();
  const tree = parser.parse(source);
  if (!tree) {
    throw new Error('Parser returned null tree');
  }
  return tree;
}

/**
 * Parse a fixture file by name (without extension).
 * Example: parseFixture('01-minimal') loads test/fixtures/01-minimal.siren
 * 
 * @deprecated Use getTestAdapter() for new tests. This is kept for backward compatibility.
 */
export async function parseFixture(name: string): Promise<Tree> {
  const fixturePath = join(__dirname, '../fixtures', `${name}.siren`);
  const source = readFileSync(fixturePath, 'utf-8');
  return parseSource(source);
}

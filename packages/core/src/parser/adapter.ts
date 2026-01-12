/**
 * ParserAdapter interface
 * 
 * Environment-agnostic abstraction over tree-sitter.
 * Apps provide concrete implementations for browser (WASM) or Node.
 */

import type { DocumentNode } from './cst.js';

/**
 * Result of a parse operation
 */
export interface ParseResult {
  /** The parsed CST (null if parse failed completely) */
  readonly tree: DocumentNode | null;
  
  /** Any parse errors encountered */
  readonly errors: readonly ParseError[];
  
  /** Whether the parse was successful (no errors) */
  readonly success: boolean;
}

/**
 * Parse error with location information
 */
export interface ParseError {
  readonly message: string;
  readonly line: number;
  readonly column: number;
}

/**
 * Parser adapter interface
 * 
 * Adapters must be fully initialized when constructed.
 * If you have an adapter reference, it is guaranteed ready to parse.
 * 
 * Implementations must:
 * - Load the tree-sitter WASM runtime (browser or Node)
 * - Initialize the Siren language grammar
 * - Parse source text into CST nodes
 * - Handle errors gracefully (error recovery)
 * 
 * Real adapters should use async factory functions for initialization.
 * Test stubs can be constructed synchronously.
 */
export interface ParserAdapter {
  /**
   * Parse Siren source code into a CST
   * 
   * @param source - The Siren source code to parse
   * @returns Parse result with tree and/or errors
   */
  parse(source: string): Promise<ParseResult>;
}

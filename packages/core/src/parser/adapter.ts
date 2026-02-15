/**
 * ParserAdapter interface
 *
 * Environment-agnostic abstraction over tree-sitter.
 * Apps provide concrete implementations for browser (WASM) or Node.
 */

import type { DocumentNode } from './cst.js';

/**
 * Source document for parsing
 *
 * Represents a single source file to be parsed.
 * Used when parsing multiple documents in a single operation.
 */
export interface SourceDocument {
  /** Document identifier (e.g., relative file path) */
  readonly name: string;
  /** Document source text */
  readonly content: string;
}

/**
 * Comment token from source code
 *
 * Represents a single comment extracted by the parser.
 * Used by formatters to preserve comments during output.
 */
export interface CommentToken {
  readonly startByte: number;
  readonly endByte: number;
  readonly startRow: number;
  readonly endRow: number;
  readonly text: string;
  /** Document identifier (e.g., relative file path) when parsing multiple documents */
  readonly document?: string;
}

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

  /**
   * Comments extracted from the source code.
   * Optional field for backward compatibility. Used by formatters
   * to preserve comments during export. Early code doesn't require this.
   */
  readonly comments?: readonly CommentToken[];
}

/**
 * Parse error with location information
 */
export interface ParseError {
  readonly message: string;
  readonly line: number;
  readonly column: number;
  /** Document identifier (e.g., relative file path) when parsing multiple documents */
  readonly document?: string;
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
   * Parse Siren source documents into a CST
   *
   * Accepts an array of source documents. Documents are concatenated internally
   * for parsing, with offsets adjusted to per-document coordinates in the result.
   * Each node's origin.document field identifies its source document.
   *
   * @param documents - Array of source documents to parse
   * @returns Parse result with tree and/or errors
   */
  parse(documents: readonly SourceDocument[]): Promise<ParseResult>;
}

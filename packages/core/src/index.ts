/**
 * @siren/core
 * Environment-agnostic core library for Siren PMaC framework
 */

export const version = '0.1.0';

export type { DecodeResult, Diagnostic } from './decoder/index.js';
// Decoder (CST → IR transformation)
export { decode } from './decoder/index.js';
// Export text exporter utilities
export * from './export/index.js';
// IR types (intermediate representation)
export * from './ir/index.js';
// Export the parser factory so hosts (CLI/Web) can inject WASM loaders.
export { createParserFactory } from './parser/factory.js';
// Parser types and interfaces
// NOTE: parser types were intentionally not re-exported previously. The CLI
// needs a small set of parser type declarations; re-export them as a
// type-only API to avoid importing from internal source paths.
// Re-export parser types (type-only) - minimal and non-breaking.
export type {
  ArrayNode,
  AttributeNode,
  ClassifiedComment,
  CommentToken,
  DocumentNode,
  ExpressionNode,
  IdentifierNode,
  LiteralNode,
  Origin,
  ParseError,
  ParseResult,
  ParserAdapter,
  ReferenceNode,
  ResourceNode,
} from './parser/index.js';

// Export SourceIndex for comment classification
export { SourceIndex } from './parser/index.js';

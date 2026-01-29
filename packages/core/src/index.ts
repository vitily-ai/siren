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
// Parser types and interfaces
// NOTE: parser types were intentionally not re-exported previously. The CLI
// needs a small set of parser type declarations; re-export them as a
// type-only API to avoid importing from internal source paths.
// Re-export parser types (type-only) - minimal and non-breaking.
export type {
  ArrayNode,
  AttributeNode,
  DocumentNode,
  ExpressionNode,
  IdentifierNode,
  LiteralNode,
  ParseError,
  ParseResult,
  ParserAdapter,
  ReferenceNode,
  ResourceNode,
} from './parser/index.js';

/**
 * @sirenpm/language
 * Parser, decoder, and exporter for the Siren grammar.
 */

// biome-ignore-all lint/performance/noBarrelFile: public package entrypoint; mirrors @sirenpm/core.

// Parser adapter contracts
export type {
  CommentToken,
  ParseError,
  ParseResult,
  ParserAdapter,
  SourceDocument,
} from './parser/adapter';
// Concrete syntax tree node types
export type {
  ArrayNode,
  AttributeNode,
  CSTNode,
  DocumentNode,
  ExpressionNode,
  IdentifierNode,
  LiteralNode,
  Origin,
  ReferenceNode,
  ResourceNode,
} from './parser/cst';
// Parser factory — owns web-tree-sitter runtime + grammar loading.
export { createParser } from './parser/factory';
// Comment classification types
export type { ClassifiedComment } from './parser/source-index';
// Source index for comment classification
export { SourceIndex } from './parser/source-index';

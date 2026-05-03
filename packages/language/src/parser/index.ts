/**
 * Parser module exports
 */

// biome-ignore-all lint/performance/noBarrelFile: internal module aggregator surfaced via the package entrypoint.

export type {
  CommentToken,
  ParseError,
  ParseResult,
  ParserAdapter,
  SourceDocument,
} from './adapter';
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
} from './cst';

// Parser factory — owns web-tree-sitter runtime + grammar loading.
export { createParser } from './factory';

// Legacy compatibility export — NOT-TO-BE-USED for new rendering code.
export type { ClassifiedComment } from './source-index';
export { SourceIndex } from './source-index';

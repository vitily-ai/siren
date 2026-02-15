/**
 * Parser module exports
 */

export type {
  CommentToken,
  ParseError,
  ParseResult,
  ParserAdapter,
  SourceDocument,
} from './adapter.js';
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
} from './cst.js';

// Parser factory that allows WASM loader injection from hosts.
export { createParserFactory } from './factory.js';

// SourceIndex for comment classification
export type { ClassifiedComment } from './source-index.js';
export { SourceIndex } from './source-index.js';

/**
 * Parser module exports
 */

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

// Parser factory that allows WASM loader injection from hosts.
export { createParserFactory } from './factory';

// SourceIndex for comment classification
export type { ClassifiedComment } from './source-index';
export { SourceIndex } from './source-index';

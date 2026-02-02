/**
 * Parser module exports
 */

export type { CommentToken, ParseError, ParseResult, ParserAdapter } from './adapter.js';
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

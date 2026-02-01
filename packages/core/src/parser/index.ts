/**
 * Parser module exports
 */

export type { ParseError, ParseResult, ParserAdapter } from './adapter.js';
export type {
  ArrayNode,
  AttributeNode,
  CSTNode,
  DocumentNode,
  ExpressionNode,
  IdentifierNode,
  LiteralNode,
  ReferenceNode,
  ResourceNode,
} from './cst.js';

// Parser factory that allows WASM loader injection from hosts.
export { createParserFactory } from './factory.js';

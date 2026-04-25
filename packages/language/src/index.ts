/**
 * @sirenpm/language
 * Parser, decoder, and exporter for the Siren grammar.
 */

// biome-ignore-all lint/performance/noBarrelFile: public package entrypoint; mirrors @sirenpm/core.

export type { CreateIRContextResult } from './context-factory';
// Bridge — decode a CST into a fully-populated IRContext.
export { createIRContextFromCst } from './context-factory';
export type { ParseDiagnostic } from './decoder/index';
// Decoder — CST → IR transformation, with language-phase diagnostics (WL/EL codes).
export { decodeDocument } from './decoder/index';
// Exporter — render IR back to Siren source. Comments are preserved automatically
// when a SourceIndex is supplied.
export { exportToSiren, SirenExporter } from './export/siren-exporter';
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

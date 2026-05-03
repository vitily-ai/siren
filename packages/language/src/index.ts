/**
 * @sirenpm/language
 * Parser, decoder, and exporter for the Siren grammar.
 */

// biome-ignore-all lint/performance/noBarrelFile: public package entrypoint; mirrors @sirenpm/core.

export type { CreateIRContextResult } from './context-factory';
// Bridge — decode parser output or syntax documents into a fully-populated IRContext.
export {
  createIRContextFromParseResult,
  createIRContextFromSyntaxDocuments,
} from './context-factory';
export type { ParseDiagnostic } from './decoder/index';
// Decoder — Parsed Document Model → IR transformation, with language-phase diagnostics.
export { decodeSyntaxDocuments } from './decoder/index';
export type { ExportToSirenOptions } from './export/siren-exporter';
// Exporter — render IR back to Siren source. Comments are preserved automatically
// when syntax documents are supplied in options.
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

export type {
  SourceSpan,
  SyntaxAttribute,
  SyntaxDocument,
  SyntaxExpression,
  SyntaxIdentifier,
  SyntaxResource,
  SyntaxSourceDocument,
  SyntaxToken,
  SyntaxTrivia,
  SyntaxTriviaClassification,
} from './syntax/types';

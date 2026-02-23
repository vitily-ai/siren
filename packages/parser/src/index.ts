/**
 * @siren/parser - Grammar, parser, decoder, and export for the Siren language
 *
 * This package transforms Siren text into Resource objects consumed by @siren/core,
 * and formats Resource objects back into Siren text.
 */

// Bridge (convenience: CST → IRContext)
// biome-ignore lint/performance/noBarrelFile: Intentional public API barrel
export { type DecodeToIRResult, decodeToIR } from './bridge.js';
export { ParserDiagnosticCode, type ParserDiagnosticCodeValue } from './decoder/codes.js';
// Decoder (CST → Resource[])
export { type DecodeResult, decodeDocument, type ParseDiagnostic } from './decoder/index.js';
export { exportWithComments } from './export/comment-exporter.js';
export {
  formatAttributeLine,
  formatAttributeValue,
  formatPrimitive,
  wrapResourceBlock,
} from './export/formatters.js';
// Export (Resource[] → Siren text)
export { exportToSiren } from './export/siren-exporter.js';
// Parser (CST types, adapter, factory, SourceIndex)
export type {
  CommentToken,
  ParseError,
  ParseResult,
  ParserAdapter,
  SourceDocument,
} from './parser/adapter.js';
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
} from './parser/cst.js';
export { createParserFactory } from './parser/factory.js';
export type { ClassifiedComment } from './parser/source-index.js';
export { SourceIndex } from './parser/source-index.js';

/**
 * @sirenpm/core
 * Environment-agnostic core library for Siren PMaC framework
 */

export { buildMetadata } from './build-metadata';
// Parse diagnostics
export type { ParseDiagnostic } from './decoder/index';
// Export text exporter utilities
export * from './export/index';
// IR context with diagnostics
export type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  Diagnostic,
  DuplicateIdDiagnostic,
} from './ir/context';
export type { DiagnosticBase } from './ir/diagnostics';
export type { IRExporter } from './ir/exporter';
// IR types (intermediate representation)
export * from './ir/index';
// Export the parser factory so hosts (CLI/Web) can inject WASM loaders.
export { createParserFactory } from './parser/factory';
// Parser types and interfaces
// NOTE: parser types were intentionally not re-exported previously. The CLI
// needs a small set of parser type declarations; re-export them as a
// type-only API to avoid importing from internal source paths.
// Re-export parser types (type-only) - minimal and non-breaking.
export type {
  ArrayNode,
  AttributeNode,
  ClassifiedComment,
  CommentToken,
  DocumentNode,
  ExpressionNode,
  IdentifierNode,
  LiteralNode,
  Origin,
  ParseError,
  ParseResult,
  ParserAdapter,
  ReferenceNode,
  ResourceNode,
  SourceDocument,
} from './parser/index';
// Export SourceIndex for comment classification
export { SourceIndex } from './parser/index';
// Export dependency tree utilities
export type { DependencyTree } from './utilities/dependency-tree';
export { version } from './version';

// biome-ignore-all lint/performance/noBarrelFile: Public API export

export type {
  AstAttribute,
  AstBooleanMember,
  AstIdentifierMember,
  AstNumberMember,
  AstResource,
  AstResourceKind,
  AstStatusModifier,
  AstStringMember,
  AstTuple,
  AstTupleMember,
  SirenAst,
} from './ast/types';
export type {
  EL001GenericParseErrorDiagnostic as EL001FallbackDiagnostic,
  EL002MissingTokenDiagnostic,
  EL003UnexpectedTokenDiagnostic,
  LanguageDiagnostic,
  WL001UnrecognizedModifierDiagnostic,
  WL002CollapsedModifiersDiagnostic,
} from './diagnostics';
export type {
  Origin,
  RangeOrigin,
  SourcedAttribute,
  SourcedEntry,
  SyntheticOrigin,
} from './origin';
export { createParser } from './parser/factory';
export type { ParsedDocument, Parser, SourceDocument } from './parser/types';

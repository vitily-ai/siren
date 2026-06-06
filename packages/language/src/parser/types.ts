import type { SourcedEntry } from '../origin';

export interface SourceDocument {
  readonly name: string;
  readonly content: string;
}

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
} from '../ast/types';

export type { LanguageDiagnostic } from '../diagnostics/types';

import type { SirenAst } from '../ast/types';
import type { LanguageDiagnostic } from '../diagnostics/types';

export interface ParsedDocument {
  readonly ast: SirenAst;
  readonly diagnostics: readonly LanguageDiagnostic[];
  toEntries(): readonly SourcedEntry[];
  format(): string;
}

export interface Parser {
  parse(document: SourceDocument): Promise<ParsedDocument>;
  parseBatch(documents: readonly SourceDocument[]): Promise<ParsedDocument[]>;
}

import type { SirenDocument } from '@sirenpm/core';

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
  toSirenDocument(): SirenDocument;
  format(): string;
}

export interface Parser {
  parse(document: SourceDocument): Promise<ParsedDocument>;
  parseBatch(documents: readonly SourceDocument[]): Promise<ParsedDocument[]>;
}

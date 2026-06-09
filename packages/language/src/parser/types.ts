import type { SirenEntry } from '@sirenpm/core';
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

export type { LanguageDiagnostic } from '../diagnostics';

import type { SirenAst } from '../ast/types';
import type { LanguageDiagnostic } from '../diagnostics';

export interface ParsedDocument {
  readonly ast: SirenAst;
  readonly diagnostics: readonly LanguageDiagnostic[];
  readonly source: SourceDocument;
  toEntries(): readonly SourcedEntry[];
  format(): string;
  patchEntry(id: string, entry: SirenEntry): void;
  removeEntry(id: string): void;
}

export interface Parser {
  parse(document: SourceDocument): Promise<ParsedDocument>;
  parseBatch(documents: readonly SourceDocument[]): Promise<ParsedDocument[]>;
}

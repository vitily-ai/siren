import type { SirenDocument } from '@sirenpm/core';

export interface SourceDocument {
  readonly name: string;
  readonly content: string;
}

// Placeholder until lang-ast-builder lands the real shape.
export type AstResource = never;

export interface SirenAst {
  readonly resources: readonly AstResource[];
}

// Placeholder until lang-diagnostics lands the real union.
export type LanguageDiagnostic = never;

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

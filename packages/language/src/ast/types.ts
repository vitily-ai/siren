/**
 * Siren AST — public, span-free, trivia-free, non-semantic representation of
 * a parsed Siren document. See ADR 0004 for binding decisions.
 *
 * Identifiers in the AST are always normalized bare strings: a source-spelling
 * like `task "has spaces" {}` and `task has_spaces {}` both yield `id` strings
 * carrying just the identifier text. Source spelling (quoted vs. bare) is a
 * CST-internal concern and is preserved only for the formatter.
 */

export type AstResourceKind = 'task' | 'milestone';

export type AstStatusModifier = 'complete' | 'draft';

export interface AstStringMember {
  readonly kind: 'string';
  readonly value: string;
}

export interface AstNumberMember {
  readonly kind: 'number';
  readonly value: number;
}

export interface AstBooleanMember {
  readonly kind: 'boolean';
  readonly value: boolean;
}

export interface AstIdentifierMember {
  readonly kind: 'identifier';
  readonly name: string;
}

export type AstTupleMember =
  | AstStringMember
  | AstNumberMember
  | AstBooleanMember
  | AstIdentifierMember;

export interface AstTuple {
  readonly members: readonly AstTupleMember[];
}

export interface AstAttribute {
  readonly name: string;
  readonly value: AstTuple;
}

export interface AstResource {
  readonly kind: AstResourceKind;
  readonly id: string;
  readonly status?: AstStatusModifier;
  readonly attributes: readonly AstAttribute[];
}

export interface DocumentDirective {
  readonly noMilestone: boolean;
}

export interface SirenAst {
  readonly directives: DocumentDirective;
  readonly resources: readonly AstResource[];
}

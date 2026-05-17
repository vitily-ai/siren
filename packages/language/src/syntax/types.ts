/**
 * Parsed Document Model (syntax layer) types.
 *
 * This model sits between CST and semantic IR and preserves source details
 * needed for formatting/export while keeping core IR syntax-free.
 */

export interface SourceSpan {
  readonly startByte: number;
  readonly endByte: number;
  readonly startRow: number;
  readonly endRow: number;
  readonly document: string;
}

export interface SyntaxSourceDocument {
  readonly name: string;
  readonly content: string;
}

export interface SyntaxToken {
  readonly raw: string;
  readonly span: SourceSpan;
}

export interface SyntaxIdentifier {
  readonly kind: 'identifier';
  readonly value: string;
  readonly raw: string;
  readonly quoted: boolean;
  readonly span: SourceSpan;
}

export interface SyntaxLiteralExpression {
  readonly kind: 'literal';
  readonly literalType: 'string' | 'number' | 'boolean' | 'null';
  readonly value: string | number | boolean | null;
  readonly raw: string;
  readonly span: SourceSpan;
}

export interface SyntaxReferenceExpression {
  readonly kind: 'reference';
  readonly identifier: SyntaxIdentifier;
  readonly raw: string;
  readonly span: SourceSpan;
}

export interface SyntaxArrayExpression {
  readonly kind: 'array';
  readonly elements: readonly SyntaxExpression[];
  readonly raw: string;
  readonly span: SourceSpan;
}

export type SyntaxExpression =
  | SyntaxLiteralExpression
  | SyntaxReferenceExpression
  | SyntaxArrayExpression;

export interface SyntaxAttribute {
  readonly kind: 'attribute';
  readonly key: SyntaxIdentifier;
  readonly value: SyntaxExpression;
  readonly raw: string;
  readonly span: SourceSpan;
}

export type SyntaxTriviaClassification = 'leading' | 'trailing' | 'inner' | 'detached' | 'eof';

export interface SyntaxTrivia {
  readonly kind: 'line-comment' | 'blank-line';
  readonly raw: string;
  readonly classification: SyntaxTriviaClassification;
  readonly span: SourceSpan;
  /**
   * Present when trivia is associated with a specific resource.
   * Detached/EOF trivia intentionally has no resource span.
   */
  readonly resourceSpan?: SourceSpan;
}

export interface SyntaxResource {
  readonly kind: 'resource';
  readonly resourceType: 'task' | 'milestone';
  readonly resourceTypeToken: SyntaxToken;
  readonly identifier: SyntaxIdentifier;
  /**
   * All `status_modifier` tokens in source order. Empty when no status keyword
   * is present. Consumed by the lint pass to collapse multi-token cases and
   * emit WL002/WL003 diagnostics.
   */
  readonly statusKeywords: readonly SyntaxToken[];
  /**
   * The single status keyword surfaced to downstream consumers (decoder,
   * formatter, exporter). Currently set to the last entry in `statusKeywords`
   * (last-wins). The lint pass will own the final collapsing rule, including
   * dropping unknown-status tokens to `undefined`.
   */
  readonly statusKeyword?: SyntaxToken;
  readonly attributes: readonly SyntaxAttribute[];
  readonly trivia: {
    readonly leading: readonly SyntaxTrivia[];
    readonly trailing: readonly SyntaxTrivia[];
    readonly inner: readonly SyntaxTrivia[];
  };
  readonly raw: string;
  readonly span: SourceSpan;
}

export interface SyntaxDocument {
  readonly kind: 'document';
  readonly source: SyntaxSourceDocument;
  readonly resources: readonly SyntaxResource[];
  readonly trivia: readonly SyntaxTrivia[];
}

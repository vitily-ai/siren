import type { IRContext, IRExporter } from '@sirenpm/core';
import type { CommentToken } from '../parser/adapter';
import { SourceIndex } from '../parser/source-index';
import type { SyntaxDocument, SyntaxIdentifier } from '../syntax/types';
import { exportWithComments } from './comment-exporter';
import { formatAttributeLine, formatResourceIdentifier, wrapResourceBlock } from './formatters';

export interface ExportToSirenOptions {
  readonly syntaxDocuments?: readonly SyntaxDocument[];
}

function makeResourceKey(document: string, startByte: number, endByte: number): string {
  return `${document}:${startByte}:${endByte}`;
}

function buildSyntaxIdentifierLookup(
  syntaxDocuments?: readonly SyntaxDocument[],
): ReadonlyMap<string, SyntaxIdentifier> {
  const lookup = new Map<string, SyntaxIdentifier>();
  if (!syntaxDocuments) return lookup;

  for (const syntaxDocument of syntaxDocuments) {
    for (const syntaxResource of syntaxDocument.resources) {
      lookup.set(
        makeResourceKey(
          syntaxResource.span.document,
          syntaxResource.span.startByte,
          syntaxResource.span.endByte,
        ),
        syntaxResource.identifier,
      );
    }
  }

  return lookup;
}

function findSyntaxIdentifierForResource(
  syntaxIdentifierLookup: ReadonlyMap<string, SyntaxIdentifier>,
  resourceOrigin: { document?: string; startByte: number; endByte: number } | undefined,
): SyntaxIdentifier | undefined {
  if (!resourceOrigin?.document) return undefined;
  return syntaxIdentifierLookup.get(
    makeResourceKey(resourceOrigin.document, resourceOrigin.startByte, resourceOrigin.endByte),
  );
}

function buildSourceIndexFromSyntaxDocuments(
  syntaxDocuments?: readonly SyntaxDocument[],
): SourceIndex | undefined {
  if (!syntaxDocuments || syntaxDocuments.length !== 1) return undefined;
  const syntaxDocument = syntaxDocuments[0];
  if (!syntaxDocument) return undefined;

  const comments: CommentToken[] = syntaxDocument.trivia
    .filter((trivia) => trivia.kind === 'line-comment')
    .map((trivia) => ({
      startByte: trivia.span.startByte,
      endByte: trivia.span.endByte,
      startRow: trivia.span.startRow,
      endRow: trivia.span.endRow,
      text: trivia.raw,
      document: syntaxDocument.source.name,
    }))
    .sort((a, b) => a.startByte - b.startByte);

  return new SourceIndex(comments, syntaxDocument.source.content);
}

/**
 * Render an {@link IRContext} back to Siren source.
 *
 * When `syntaxDocuments` are supplied, source-preserving identifier spelling
 * and comments are used where possible. Without syntax context, output falls
 * back to semantic formatting.
 */
export function exportToSiren(ctx: IRContext, options: ExportToSirenOptions = {}): string {
  const syntaxDocuments = options.syntaxDocuments;
  const syntaxIdentifierLookup = buildSyntaxIdentifierLookup(syntaxDocuments);

  const sourceIndex = buildSourceIndexFromSyntaxDocuments(syntaxDocuments);
  if (sourceIndex) {
    return exportWithComments(ctx, sourceIndex, syntaxDocuments);
  }

  const lines: string[] = [];

  for (const res of ctx.resources) {
    const body: string[] = [];
    for (const attr of res.attributes) {
      body.push(formatAttributeLine(attr.key, attr.value, attr.raw));
    }
    const syntaxIdentifier = findSyntaxIdentifierForResource(syntaxIdentifierLookup, res.origin);
    lines.push(
      wrapResourceBlock(
        res.type,
        formatResourceIdentifier(res.id, syntaxIdentifier),
        res.complete,
        body,
      ),
    );
  }

  // Join resources with double newline for readability
  return lines.join('\n\n') + (lines.length ? '\n' : '');
}

export class SirenExporter implements IRExporter {
  constructor(private readonly options: ExportToSirenOptions = {}) {}

  export(ctx: IRContext): string {
    return exportToSiren(ctx, this.options);
  }
}

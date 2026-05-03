import type { Origin } from '@sirenpm/core';
import type { CommentToken, SourceDocument } from '../parser/adapter';
import type {
  ArrayNode,
  AttributeNode,
  DocumentNode,
  ExpressionNode,
  IdentifierNode,
  LiteralNode,
  ReferenceNode,
  ResourceNode,
} from '../parser/cst';
import type {
  SourceSpan,
  SyntaxArrayExpression,
  SyntaxAttribute,
  SyntaxDocument,
  SyntaxExpression,
  SyntaxIdentifier,
  SyntaxLiteralExpression,
  SyntaxReferenceExpression,
  SyntaxResource,
  SyntaxToken,
  SyntaxTrivia,
} from './types';

interface SourceState {
  readonly source: { name: string; content: string };
  readonly lineStarts: readonly number[];
  readonly lineEnds: readonly number[];
}

interface TriviaClassification {
  readonly classification: 'leading' | 'trailing' | 'inner' | 'detached' | 'eof';
  readonly resourceSpan?: SourceSpan;
}

function buildLineStarts(content: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

function buildLineEnds(content: string, lineStarts: readonly number[]): number[] {
  const ends: number[] = [];
  for (let row = 0; row < lineStarts.length; row++) {
    const start = lineStarts[row] ?? content.length;
    const nextStart = lineStarts[row + 1];
    let end = nextStart === undefined ? content.length : Math.max(start, nextStart - 1);
    if (end > start && content[end - 1] === '\r') {
      end -= 1;
    }
    ends.push(end);
  }
  return ends;
}

function rowForByte(state: SourceState, byte: number): number {
  const maxByte = Math.max(0, state.source.content.length - 1);
  const clamped = Math.max(0, Math.min(byte, maxByte));
  let lo = 0;
  let hi = state.lineStarts.length - 1;
  let answer = 0;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const lineStart = state.lineStarts[mid] ?? 0;
    if (lineStart <= clamped) {
      answer = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return answer;
}

function lineText(state: SourceState, row: number): string {
  const start = state.lineStarts[row];
  const end = state.lineEnds[row];
  if (start === undefined || end === undefined || end < start) return '';
  return state.source.content.slice(start, end);
}

function spanFromOrigin(origin: Origin | undefined, fallbackDocument: string): SourceSpan {
  return {
    startByte: origin?.startByte ?? 0,
    endByte: origin?.endByte ?? 0,
    startRow: origin?.startRow ?? 0,
    endRow: origin?.endRow ?? 0,
    document: origin?.document ?? fallbackDocument,
  };
}

function clampSlice(content: string, startByte: number, endByte: number): string {
  const start = Math.max(0, Math.min(startByte, content.length));
  const end = Math.max(start, Math.min(endByte, content.length));
  return content.slice(start, end);
}

function sliceBySpan(
  statesByDocument: ReadonlyMap<string, SourceState>,
  span: SourceSpan,
  fallback: string,
): string {
  const state = statesByDocument.get(span.document);
  if (!state) return fallback;
  const sliced = clampSlice(state.source.content, span.startByte, span.endByte);
  return sliced.length > 0 ? sliced : fallback;
}

function spanKey(span: SourceSpan): string {
  return `${span.document}:${span.startByte}:${span.endByte}`;
}

function buildIdentifier(
  node: IdentifierNode,
  statesByDocument: ReadonlyMap<string, SourceState>,
  fallbackDocument: string,
): SyntaxIdentifier {
  const span = spanFromOrigin(node.origin, fallbackDocument);
  const raw = sliceBySpan(statesByDocument, span, node.text);
  return {
    kind: 'identifier',
    value: node.value,
    raw,
    quoted: node.quoted,
    span,
  };
}

function buildLiteralExpression(
  node: LiteralNode,
  statesByDocument: ReadonlyMap<string, SourceState>,
  fallbackDocument: string,
): SyntaxLiteralExpression {
  const span = spanFromOrigin(node.origin, fallbackDocument);
  return {
    kind: 'literal',
    literalType: node.literalType,
    value: node.value,
    raw: sliceBySpan(statesByDocument, span, node.text),
    span,
  };
}

function buildReferenceExpression(
  node: ReferenceNode,
  statesByDocument: ReadonlyMap<string, SourceState>,
  fallbackDocument: string,
): SyntaxReferenceExpression {
  const span = spanFromOrigin(node.origin, fallbackDocument);
  return {
    kind: 'reference',
    identifier: buildIdentifier(node.identifier, statesByDocument, fallbackDocument),
    raw: sliceBySpan(statesByDocument, span, node.identifier.text),
    span,
  };
}

function buildArrayExpression(
  node: ArrayNode,
  statesByDocument: ReadonlyMap<string, SourceState>,
  fallbackDocument: string,
): SyntaxArrayExpression {
  const span = spanFromOrigin(node.origin, fallbackDocument);
  return {
    kind: 'array',
    elements: node.elements.map((element) =>
      buildExpression(element, statesByDocument, fallbackDocument),
    ),
    raw: sliceBySpan(statesByDocument, span, '[]'),
    span,
  };
}

function buildExpression(
  node: ExpressionNode,
  statesByDocument: ReadonlyMap<string, SourceState>,
  fallbackDocument: string,
): SyntaxExpression {
  switch (node.type) {
    case 'literal':
      return buildLiteralExpression(node, statesByDocument, fallbackDocument);
    case 'reference':
      return buildReferenceExpression(node, statesByDocument, fallbackDocument);
    case 'array':
      return buildArrayExpression(node, statesByDocument, fallbackDocument);
  }
}

function buildAttribute(
  node: AttributeNode,
  statesByDocument: ReadonlyMap<string, SourceState>,
  fallbackDocument: string,
): SyntaxAttribute {
  const span = spanFromOrigin(node.origin, fallbackDocument);
  return {
    kind: 'attribute',
    key: buildIdentifier(node.key, statesByDocument, fallbackDocument),
    value: buildExpression(node.value, statesByDocument, fallbackDocument),
    raw: sliceBySpan(statesByDocument, span, ''),
    span,
  };
}

function buildResourceTypeToken(
  node: ResourceNode,
  span: SourceSpan,
  statesByDocument: ReadonlyMap<string, SourceState>,
): SyntaxToken {
  const startByte = span.startByte;
  const endByte = Math.min(span.endByte, startByte + node.resourceType.length);
  const tokenSpan: SourceSpan = {
    document: span.document,
    startByte,
    endByte,
    startRow: span.startRow,
    endRow: span.startRow,
  };
  return {
    raw: sliceBySpan(statesByDocument, tokenSpan, node.resourceType),
    span: tokenSpan,
  };
}

function findCompleteKeywordToken(
  node: ResourceNode,
  resourceSpan: SourceSpan,
  identifierSpan: SourceSpan,
  attributes: readonly SyntaxAttribute[],
  statesByDocument: ReadonlyMap<string, SourceState>,
): SyntaxToken | undefined {
  if (!node.complete) return undefined;

  const state = statesByDocument.get(resourceSpan.document);
  if (!state) {
    const fallbackStart = identifierSpan.endByte;
    return {
      raw: 'complete',
      span: {
        document: resourceSpan.document,
        startByte: fallbackStart,
        endByte: fallbackStart + 'complete'.length,
        startRow: resourceSpan.startRow,
        endRow: resourceSpan.startRow,
      },
    };
  }

  const rangeStart = Math.min(
    resourceSpan.endByte,
    Math.max(resourceSpan.startByte, identifierSpan.endByte),
  );
  let rangeEnd = resourceSpan.endByte;
  const firstAttribute = attributes[0];
  if (firstAttribute && firstAttribute.span.startByte < rangeEnd) {
    rangeEnd = firstAttribute.span.startByte;
  }
  if (rangeEnd < rangeStart) {
    rangeEnd = rangeStart;
  }

  const searchText = clampSlice(state.source.content, rangeStart, rangeEnd);
  const match = /\bcomplete\b/u.exec(searchText);
  const matchStart = match ? rangeStart + match.index : rangeStart;
  const matchEnd = Math.min(resourceSpan.endByte, matchStart + 'complete'.length);
  const tokenSpan: SourceSpan = {
    document: resourceSpan.document,
    startByte: matchStart,
    endByte: matchEnd,
    startRow: rowForByte(state, matchStart),
    endRow: rowForByte(state, Math.max(matchStart, matchEnd - 1)),
  };

  return {
    raw: clampSlice(state.source.content, tokenSpan.startByte, tokenSpan.endByte) || 'complete',
    span: tokenSpan,
  };
}

function buildResource(
  node: ResourceNode,
  statesByDocument: ReadonlyMap<string, SourceState>,
  fallbackDocument: string,
): SyntaxResource {
  const span = spanFromOrigin(node.origin, fallbackDocument);
  const attributes = node.body.map((attribute) =>
    buildAttribute(attribute, statesByDocument, span.document),
  );
  const identifier = buildIdentifier(node.identifier, statesByDocument, span.document);

  return {
    kind: 'resource',
    resourceType: node.resourceType,
    resourceTypeToken: buildResourceTypeToken(node, span, statesByDocument),
    identifier,
    completeKeyword: findCompleteKeywordToken(
      node,
      span,
      identifier.span,
      attributes,
      statesByDocument,
    ),
    attributes,
    trivia: {
      leading: [],
      trailing: [],
      inner: [],
    },
    raw: sliceBySpan(statesByDocument, span, ''),
    span,
  };
}

function hasBlankLineBetweenRows(state: SourceState, fromRow: number, toRow: number): boolean {
  const start = Math.max(0, fromRow + 1);
  const end = Math.min(toRow - 1, state.lineStarts.length - 1);
  for (let row = start; row <= end; row++) {
    if (lineText(state, row).trim() === '') {
      return true;
    }
  }
  return false;
}

function classifyCommentTrivia(
  commentSpan: SourceSpan,
  resources: readonly SyntaxResource[],
  state: SourceState,
): TriviaClassification {
  const owner = resources.find(
    (resource) =>
      commentSpan.startByte >= resource.span.startByte &&
      commentSpan.endByte <= resource.span.endByte,
  );

  if (owner) {
    if (commentSpan.startRow === owner.span.startRow) {
      return { classification: 'trailing', resourceSpan: owner.span };
    }

    const trailingAttribute = owner.attributes.find(
      (attribute) =>
        commentSpan.startRow === attribute.span.endRow &&
        commentSpan.startByte >= attribute.span.endByte,
    );
    if (trailingAttribute) {
      return { classification: 'trailing', resourceSpan: owner.span };
    }

    const firstAttribute = owner.attributes[0];
    if (firstAttribute && commentSpan.endByte <= firstAttribute.span.startByte) {
      return { classification: 'leading', resourceSpan: owner.span };
    }

    return { classification: 'inner', resourceSpan: owner.span };
  }

  const nextResource = resources.find((resource) => resource.span.startByte >= commentSpan.endByte);
  if (!nextResource) {
    return { classification: 'eof' };
  }

  const hasBlankLine = hasBlankLineBetweenRows(
    state,
    commentSpan.endRow,
    nextResource.span.startRow,
  );
  if (!hasBlankLine) {
    return { classification: 'leading', resourceSpan: nextResource.span };
  }

  return { classification: 'detached' };
}

function previousNonEmptyRow(state: SourceState, row: number): number | undefined {
  for (let cursor = row - 1; cursor >= 0; cursor--) {
    if (lineText(state, cursor).trim() !== '') return cursor;
  }
  return undefined;
}

function nextNonEmptyRow(state: SourceState, row: number): number | undefined {
  for (let cursor = row + 1; cursor < state.lineStarts.length; cursor++) {
    if (lineText(state, cursor).trim() !== '') return cursor;
  }
  return undefined;
}

function classifyBlankLineTrivia(
  row: number,
  resources: readonly SyntaxResource[],
): TriviaClassification {
  const owner = resources.find(
    (resource) => row > resource.span.startRow && row < resource.span.endRow,
  );
  if (owner) {
    return { classification: 'inner', resourceSpan: owner.span };
  }

  const lastResource = resources[resources.length - 1];
  if (lastResource && row > lastResource.span.endRow) {
    return { classification: 'eof' };
  }

  return { classification: 'detached' };
}

function buildBlankLineTrivia(
  state: SourceState,
  resources: readonly SyntaxResource[],
): readonly SyntaxTrivia[] {
  const trivia: SyntaxTrivia[] = [];

  for (let row = 0; row < state.lineStarts.length; row++) {
    if (lineText(state, row).trim() !== '') continue;

    const prev = previousNonEmptyRow(state, row);
    const next = nextNonEmptyRow(state, row);

    // Keep only structurally meaningful blank lines (between non-empty lines).
    if (prev === undefined || next === undefined) continue;

    const startByte = state.lineStarts[row] ?? 0;
    const endByte = state.lineEnds[row] ?? startByte;
    const span: SourceSpan = {
      document: state.source.name,
      startByte,
      endByte,
      startRow: row,
      endRow: row,
    };

    const classified = classifyBlankLineTrivia(row, resources);

    trivia.push({
      kind: 'blank-line',
      raw: clampSlice(state.source.content, startByte, endByte),
      classification: classified.classification,
      span,
      resourceSpan: classified.resourceSpan,
    });
  }

  return trivia;
}

function attachResourceTrivia(
  resources: readonly SyntaxResource[],
  trivia: readonly SyntaxTrivia[],
): readonly SyntaxResource[] {
  const byResource = new Map<
    string,
    { leading: SyntaxTrivia[]; trailing: SyntaxTrivia[]; inner: SyntaxTrivia[] }
  >();

  for (const resource of resources) {
    byResource.set(spanKey(resource.span), { leading: [], trailing: [], inner: [] });
  }

  for (const item of trivia) {
    if (!item.resourceSpan) continue;
    const bucket = byResource.get(spanKey(item.resourceSpan));
    if (!bucket) continue;

    if (item.classification === 'leading') {
      bucket.leading.push(item);
    } else if (item.classification === 'trailing') {
      bucket.trailing.push(item);
    } else if (item.classification === 'inner') {
      bucket.inner.push(item);
    }
  }

  return resources.map((resource) => {
    const bucket = byResource.get(spanKey(resource.span));
    if (!bucket) return resource;
    return {
      ...resource,
      trivia: {
        leading: bucket.leading,
        trailing: bucket.trailing,
        inner: bucket.inner,
      },
    };
  });
}

function buildDocumentTrivia(
  state: SourceState,
  resources: readonly SyntaxResource[],
  comments: readonly CommentToken[],
): readonly SyntaxTrivia[] {
  const sortedComments = comments
    .filter((comment) => (comment.document ?? state.source.name) === state.source.name)
    .slice()
    .sort((a, b) => a.startByte - b.startByte);

  const commentTrivia: SyntaxTrivia[] = sortedComments.map((comment) => {
    const span: SourceSpan = {
      document: comment.document ?? state.source.name,
      startByte: comment.startByte,
      endByte: comment.endByte,
      startRow: comment.startRow,
      endRow: comment.endRow,
    };

    const classified = classifyCommentTrivia(span, resources, state);

    return {
      kind: 'line-comment',
      raw: clampSlice(state.source.content, span.startByte, span.endByte) || comment.text,
      classification: classified.classification,
      span,
      resourceSpan: classified.resourceSpan,
    };
  });

  const blankLineTrivia = buildBlankLineTrivia(state, resources);

  return [...commentTrivia, ...blankLineTrivia].sort((a, b) => {
    if (a.span.startByte !== b.span.startByte) {
      return a.span.startByte - b.span.startByte;
    }
    return a.span.endByte - b.span.endByte;
  });
}

export function buildSyntaxDocuments(
  cst: DocumentNode,
  sourceDocuments: readonly SourceDocument[],
  comments: readonly CommentToken[] = [],
): readonly SyntaxDocument[] {
  if (sourceDocuments.length === 0) return [];

  const statesByDocument = new Map<string, SourceState>();
  for (const sourceDocument of sourceDocuments) {
    const lineStarts = buildLineStarts(sourceDocument.content);
    statesByDocument.set(sourceDocument.name, {
      source: {
        name: sourceDocument.name,
        content: sourceDocument.content,
      },
      lineStarts,
      lineEnds: buildLineEnds(sourceDocument.content, lineStarts),
    });
  }

  const resourcesByDocument = new Map<string, SyntaxResource[]>();
  const defaultDocument = sourceDocuments[0]?.name ?? 'unknown';

  for (const resourceNode of cst.resources) {
    const documentName = resourceNode.origin?.document ?? defaultDocument;
    const resource = buildResource(resourceNode, statesByDocument, documentName);
    const existing = resourcesByDocument.get(documentName);
    if (existing) {
      existing.push(resource);
    } else {
      resourcesByDocument.set(documentName, [resource]);
    }
  }

  return sourceDocuments.map((sourceDocument) => {
    const state = statesByDocument.get(sourceDocument.name);
    if (!state) {
      return {
        kind: 'document' as const,
        source: {
          name: sourceDocument.name,
          content: sourceDocument.content,
        },
        resources: [],
        trivia: [],
      };
    }

    const resources = resourcesByDocument.get(sourceDocument.name) ?? [];
    const trivia = buildDocumentTrivia(state, resources, comments);

    return {
      kind: 'document' as const,
      source: {
        name: sourceDocument.name,
        content: sourceDocument.content,
      },
      resources: attachResourceTrivia(resources, trivia),
      trivia,
    };
  });
}

import type {
  SourceSpan,
  SyntaxAttribute,
  SyntaxDocument,
  SyntaxExpression,
  SyntaxResource,
  SyntaxTrivia,
} from '../syntax/types';

const INDENT = '  ';

interface RenderSegment {
  readonly kind: 'comment' | 'resource';
  readonly lines: readonly string[];
  readonly startRow: number;
  readonly endRow: number;
}

interface BodyEntry {
  readonly order: number;
  readonly seq: number;
  text: string;
}

function isSafeBareIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/u.test(value);
}

function renderIdentifier(raw: string, value: string): string {
  const trimmed = raw.trim();
  if (trimmed.length > 0) return trimmed;
  return isSafeBareIdentifier(value) ? value : JSON.stringify(value);
}

function renderExpression(expression: SyntaxExpression): string {
  const raw = expression.raw.trim();
  if (raw.length > 0) return raw;

  switch (expression.kind) {
    case 'literal':
      return typeof expression.value === 'string'
        ? JSON.stringify(expression.value)
        : String(expression.value);
    case 'reference':
      return renderIdentifier(expression.identifier.raw, expression.identifier.value);
    case 'array':
      return `[${expression.elements.map((element) => renderExpression(element)).join(', ')}]`;
  }
}

function renderAttributeLine(attribute: SyntaxAttribute, trailingComment?: string): string {
  const key = renderIdentifier(attribute.key.raw, attribute.key.value);
  const line = `${INDENT}${key} = ${renderExpression(attribute.value)}`;
  return trailingComment ? `${line}  ${trailingComment}` : line;
}

function renderCommentLines(raw: string, indent = ''): string[] {
  const trimmed = raw.replace(/\r?\n$/u, '');
  return trimmed.split(/\r?\n/u).map((line) => `${indent}${line}`);
}

function isInsideSpan(trivia: SyntaxTrivia, span: SourceSpan): boolean {
  return trivia.span.startByte >= span.startByte && trivia.span.endByte <= span.endByte;
}

function isInsideAnyResource(trivia: SyntaxTrivia, resources: readonly SyntaxResource[]): boolean {
  return resources.some((resource) => isInsideSpan(trivia, resource.span));
}

function triviaForResource(
  document: SyntaxDocument,
  resource: SyntaxResource,
): readonly SyntaxTrivia[] {
  return document.trivia.filter((trivia) => isInsideSpan(trivia, resource.span));
}

function wrapResourceBlock(
  resource: SyntaxResource,
  bodyLines: readonly string[],
  headerTrailingComment?: string,
): string {
  const id = renderIdentifier(resource.identifier.raw, resource.identifier.value);
  const complete = resource.completeKeyword ? ' complete' : '';
  const headerBase = `${resource.resourceType} ${id}${complete}`;

  if (bodyLines.length === 0) {
    const singleLine = `${headerBase} {}`;
    return headerTrailingComment ? `${singleLine}  ${headerTrailingComment}` : singleLine;
  }

  const header = headerTrailingComment
    ? `${headerBase} {  ${headerTrailingComment}`
    : `${headerBase} {`;
  return [header, ...bodyLines, '}'].join('\n');
}

function renderResource(document: SyntaxDocument, resource: SyntaxResource): string {
  const trivia = triviaForResource(document, resource)
    .slice()
    .sort((a, b) => {
      if (a.span.startByte !== b.span.startByte) return a.span.startByte - b.span.startByte;
      return a.span.endByte - b.span.endByte;
    });

  const bodyEntries: BodyEntry[] = [];
  const attributeByEndRow = new Map<number, { entry: BodyEntry; attribute: SyntaxAttribute }>();
  let seq = 0;
  let headerTrailingComment: string | undefined;

  for (const attribute of resource.attributes) {
    const entry: BodyEntry = {
      order: attribute.span.startByte,
      seq: seq++,
      text: renderAttributeLine(attribute),
    };
    bodyEntries.push(entry);
    attributeByEndRow.set(attribute.span.endRow, { entry, attribute });
  }

  for (const item of trivia) {
    if (item.kind === 'blank-line') {
      if (
        item.span.startRow > resource.span.startRow &&
        item.span.startRow < resource.span.endRow
      ) {
        bodyEntries.push({ order: item.span.startByte, seq: seq++, text: '' });
      }
      continue;
    }

    if (item.span.startRow === resource.span.startRow) {
      headerTrailingComment ??= item.raw.trim();
      continue;
    }

    const attributeOnSameLine = attributeByEndRow.get(item.span.startRow);
    if (attributeOnSameLine && item.span.startByte >= attributeOnSameLine.attribute.span.endByte) {
      attributeOnSameLine.entry.text = renderAttributeLine(
        attributeOnSameLine.attribute,
        item.raw.trim(),
      );
      continue;
    }

    let order = item.span.startByte;
    for (const line of renderCommentLines(item.raw, INDENT)) {
      bodyEntries.push({ order, seq: seq++, text: line });
      order += 0.0001;
    }
  }

  bodyEntries.sort((a, b) => (a.order === b.order ? a.seq - b.seq : a.order - b.order));

  return wrapResourceBlock(
    resource,
    bodyEntries.map((entry) => entry.text),
    headerTrailingComment,
  );
}

function buildSegments(document: SyntaxDocument): RenderSegment[] {
  const resources = document.resources.slice().sort((a, b) => a.span.startByte - b.span.startByte);
  const segments: RenderSegment[] = [];

  for (const trivia of document.trivia) {
    if (trivia.kind !== 'line-comment') continue;
    if (isInsideAnyResource(trivia, resources)) continue;

    segments.push({
      kind: 'comment',
      lines: renderCommentLines(trivia.raw),
      startRow: trivia.span.startRow,
      endRow: trivia.span.endRow,
    });
  }

  for (const resource of resources) {
    segments.push({
      kind: 'resource',
      lines: renderResource(document, resource).split('\n'),
      startRow: resource.span.startRow,
      endRow: resource.span.endRow,
    });
  }

  segments.sort((a, b) => a.startRow - b.startRow);
  return segments;
}

export function renderSyntaxDocument(document: SyntaxDocument): string {
  const segments = buildSegments(document);
  const lines: string[] = [];

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;

    if (index > 0) {
      const previous = segments[index - 1]!;
      const alwaysSeparateResources = previous.kind === 'resource' && segment.kind === 'resource';
      const rowGap = segment.startRow - previous.endRow - 1;
      if (alwaysSeparateResources || rowGap >= 1) {
        lines.push('');
      }
    }

    lines.push(...segment.lines);
  }

  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

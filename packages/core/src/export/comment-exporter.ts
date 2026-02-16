import type { IRContext } from '../ir/context.js';
import type { AttributeValue } from '../ir/types.js';
import type { SourceIndex } from '../parser/source-index.js';
import { formatAttributeLine, wrapResourceBlock } from './formatters.js';
import { exportToSiren } from './siren-exporter.js';

const BODY_INDENT = '  ';

function formatBodyCommentLines(text: string): string[] {
  const trimmed = text.replace(/\r?\n$/, '');
  return trimmed.split(/\r?\n/).map((line) => `${BODY_INDENT}${line}`);
}

type Segment = { kind: 'comment-block' | 'resource'; lines: string[] };

type Seg = Segment & { startRow: number; endRow: number };

/**
 * Export IR to Siren format with comments preserved via interleaving
 *
 * When a SourceIndex is provided, interleaves classified comments with IR nodes.
 * If no SourceIndex is provided, falls back to semantic-only export.
 *
 * @param ctx - IR context with resources to export
 * @param sourceIndex - Optional comment classification index
 * @returns Formatted Siren source with comments intact
 */
export function exportWithComments(ctx: IRContext, sourceIndex?: SourceIndex): string {
  // If no source index, fall back to semantic-only export
  if (!sourceIndex) {
    return exportToSiren(ctx);
  }

  // Track emitted comments by byte span to avoid duplicates across contexts.
  const emitted = new Set<string>();

  const allComments = sourceIndex.getAllComments();

  const resources = ctx.resources.slice();
  // If origin exists, prefer stable byte order (matches the file for per-file IR)
  resources.sort((a, b) => {
    const ao = a.origin?.startByte ?? Number.POSITIVE_INFINITY;
    const bo = b.origin?.startByte ?? Number.POSITIVE_INFINITY;
    return ao - bo;
  });

  function markEmitted(startByte: number, endByte: number): void {
    emitted.add(`${startByte}-${endByte}`);
  }
  function isEmitted(startByte: number, endByte: number): boolean {
    return emitted.has(`${startByte}-${endByte}`);
  }

  // Partition comments: those inside a resource go into the resource body; the rest
  // are emitted as top-level comment blocks between resources.
  const segments: Seg[] = [];

  let commentIdx = 0;

  function flushTopLevelCommentsUntil(endByteExclusive: number): void {
    const blockLines: string[] = [];
    let blockStartRow: number | undefined;
    let prevRow: number | undefined;

    const pushBlockIfAny = () => {
      if (blockLines.length > 0) {
        segments.push({
          kind: 'comment-block',
          lines: blockLines.splice(0),
          startRow: blockStartRow ?? 0,
          endRow: prevRow ?? blockStartRow ?? 0,
        });
      }
      prevRow = undefined;
      blockStartRow = undefined;
    };

    while (commentIdx < allComments.length) {
      const c = allComments[commentIdx]!;
      if (c.startByte >= endByteExclusive) break;

      // Skip comments already emitted (defensive).
      if (isEmitted(c.startByte, c.endByte)) {
        commentIdx++;
        continue;
      }

      // If this comment is inside any resource span, don't treat as top-level.
      // We'll emit it when building the owning resource body.
      const owningRes = resources.find(
        (r) => r.origin && c.startByte >= r.origin.startByte && c.endByte <= r.origin.endByte,
      );
      if (owningRes) {
        commentIdx++;
        continue;
      }

      // Start a new block if there is a blank line gap (>= 2 rows).
      if (prevRow !== undefined && c.startRow > prevRow + 1) {
        pushBlockIfAny();
      }

      if (blockStartRow === undefined) blockStartRow = c.startRow;
      blockLines.push(c.text.replace(/\r?\n$/u, ''));
      markEmitted(c.startByte, c.endByte);
      prevRow = c.endRow;
      commentIdx++;
    }

    pushBlockIfAny();
  }

  for (const res of resources) {
    const resStart = res.origin?.startByte ?? Number.POSITIVE_INFINITY;
    const resEnd = res.origin?.endByte ?? Number.NEGATIVE_INFINITY;

    // Emit any top-level comment blocks that occur before this resource.
    flushTopLevelCommentsUntil(resStart);

    // Build resource body entries: attributes + any comments within the resource span.
    const bodyEntries: Array<{ order: number; seq: number; text: string }> = [];
    let seq = 0;

    // Track the header line (opening brace line) for detecting trailing comments on it
    // The header is on the startRow of the resource (first line with "type id {")
    const headerRow = res.origin?.startRow;
    let headerTrailingComment: string | undefined;

    // Track attributes by their end row to detect trailing comments
    const attributeByEndRow = new Map<
      number,
      { index: number; key: string; value: AttributeValue; raw?: string }
    >();

    for (const attr of res.attributes) {
      const order = attr.origin?.startByte ?? Number.POSITIVE_INFINITY;
      const entryIndex = bodyEntries.length;
      const endRow = attr.origin?.endRow;

      bodyEntries.push({
        order,
        seq: seq++,
        text: formatAttributeLine(attr.key, attr.value, attr.raw),
      });

      if (endRow !== undefined) {
        attributeByEndRow.set(endRow, {
          index: entryIndex,
          key: attr.key,
          value: attr.value,
          raw: attr.raw,
        });
      }
    }

    // Emit comments inside the resource span as indented body lines, ordered by byte.
    for (const c of allComments) {
      if (isEmitted(c.startByte, c.endByte)) continue;
      if (c.startByte >= resStart && c.endByte <= resEnd) {
        // Check if this is a trailing comment on the header line
        if (headerRow !== undefined && c.startRow === headerRow) {
          // This comment is on the same line as the opening brace.
          // Store it to append to the header.
          if (!headerTrailingComment) {
            headerTrailingComment = c.text.trim();
          }
          markEmitted(c.startByte, c.endByte);
        } else {
          // Check if this is a trailing comment on an attribute line
          const attrOnSameLine = attributeByEndRow.get(c.startRow);

          if (attrOnSameLine) {
            // This is a trailing comment: append it to the attribute's line
            const entryIndex = attrOnSameLine.index;
            const attr = bodyEntries[entryIndex]!;
            // Re-format the attribute line with the trailing comment
            attr.text = formatAttributeLine(
              attrOnSameLine.key,
              attrOnSameLine.value,
              attrOnSameLine.raw,
              c.text.trim(),
            );
            markEmitted(c.startByte, c.endByte);
          } else {
            // Not a trailing comment: emit as separate indented lines
            const commentLines = formatBodyCommentLines(c.text);
            let lineOrder = c.startByte;
            for (const line of commentLines) {
              bodyEntries.push({ order: lineOrder, seq: seq++, text: line });
              // Ensure stable ordering for multi-line comment tokens.
              lineOrder += 0.0001;
            }
            markEmitted(c.startByte, c.endByte);
          }
        }
      }
    }

    bodyEntries.sort((a, b) => (a.order === b.order ? a.seq - b.seq : a.order - b.order));
    const body = bodyEntries.map((e) => e.text);

    const block = wrapResourceBlock(res.type, res.id, res.complete, body, headerTrailingComment);
    segments.push({
      kind: 'resource',
      lines: block.split('\n'),
      startRow: res.origin?.startRow ?? 0,
      endRow: res.origin?.endRow ?? 0,
    });
  }

  // Emit remaining top-level comment blocks (EOF).
  flushTopLevelCommentsUntil(Number.POSITIVE_INFINITY);

  // Join segments: one blank line between top-level sections.
  const outLines: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (i > 0) {
      const prev = segments[i - 1]!;

      // Keep existing Siren formatting convention: always separate resources.
      const alwaysSeparate = prev.kind === 'resource' && seg.kind === 'resource';
      const rowGap = seg.startRow - prev.endRow - 1;

      // Otherwise, only insert a blank line when there was a blank line gap
      // in the original source (detached comment blocks, EOF blocks, etc).
      if (alwaysSeparate || rowGap >= 1) {
        outLines.push('');
      }
    }
    outLines.push(...seg.lines);
  }

  return outLines.join('\n') + (outLines.length ? '\n' : '');
}

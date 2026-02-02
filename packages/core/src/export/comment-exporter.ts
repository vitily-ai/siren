import type { IRContext } from '../ir/context.js';
import type { SourceIndex } from '../parser/source-index.js';
import { formatAttributeLine, wrapResourceBlock } from './formatters.js';
import { exportToSiren } from './siren-exporter.js';

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

  // Track which comments have been emitted to avoid duplicates
  const emittedComments = new Set<string>();

  const lines: string[] = [];

  for (const res of ctx.resources) {
    // Only process resources with origin information
    if (res.origin) {
      // 1. Emit leading comments for this resource (that haven't been emitted yet)
      const leadingComments = sourceIndex.getLeadingComments(res.origin);
      for (const classified of leadingComments) {
        const key = `${classified.token.startByte}-${classified.token.endByte}`;
        if (!emittedComments.has(key)) {
          lines.push(classified.token.text);
          emittedComments.add(key);
        }
      }
    }

    // 2. Print resource block
    const body: string[] = [];
    for (const attr of res.attributes) {
      body.push(formatAttributeLine(attr.key, attr.value as any, (attr as any).raw));
    }
    lines.push(wrapResourceBlock(res.type, res.id, res.complete, body));

    // 3. Emit trailing comments for this resource (that haven't been emitted yet)
    if (res.origin) {
      const trailingComments = sourceIndex.getTrailingComments(res.origin);
      for (const classified of trailingComments) {
        const key = `${classified.token.startByte}-${classified.token.endByte}`;
        if (!emittedComments.has(key)) {
          lines.push(classified.token.text);
          emittedComments.add(key);
        }
      }
    }
  }

  // 4. Emit detached comment blocks (with preserved blank lines)
  const detachedBlocks = sourceIndex.getDetachedBlocks();
  for (const block of detachedBlocks) {
    // Preserve blank lines before the block
    if (block.length > 0) {
      const blankLinesBefore = block[0]?.blankLinesBefore ?? 0;
      for (let i = 0; i < blankLinesBefore; i++) {
        lines.push('');
      }
    }
    for (const classified of block) {
      const key = `${classified.token.startByte}-${classified.token.endByte}`;
      if (!emittedComments.has(key)) {
        lines.push(classified.token.text);
        emittedComments.add(key);
      }
    }
  }

  // 5. Emit EOF comments (that haven't been emitted yet)
  const eofComments = sourceIndex.getEOFComments();
  for (const classified of eofComments) {
    const key = `${classified.token.startByte}-${classified.token.endByte}`;
    if (!emittedComments.has(key)) {
      lines.push(classified.token.text);
      emittedComments.add(key);
    }
  }

  // Join and return
  return lines.join('\n') + (lines.length ? '\n' : '');
}

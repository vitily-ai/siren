import type { IRContext, IRExporter } from '@sirenpm/core';
import type { SourceIndex } from '../parser/source-index';
import { exportWithComments } from './comment-exporter';
import { formatAttributeLine, wrapResourceBlock } from './formatters';

/**
 * Render an {@link IRContext} back to Siren source.
 *
 * When a {@link SourceIndex} is supplied, comments captured during parsing
 * are preserved and interleaved with the emitted resources. Without one,
 * the output contains only semantically-meaningful tokens.
 */
export function exportToSiren(ctx: IRContext, sourceIndex?: SourceIndex): string {
  if (sourceIndex) {
    return exportWithComments(ctx, sourceIndex);
  }

  const lines: string[] = [];

  for (const res of ctx.resources) {
    const body: string[] = [];
    for (const attr of res.attributes) {
      body.push(formatAttributeLine(attr.key, attr.value, attr.raw));
    }
    lines.push(wrapResourceBlock(res.type, res.id, res.complete, body));
  }

  // Join resources with double newline for readability
  return lines.join('\n\n') + (lines.length ? '\n' : '');
}

export class SirenExporter implements IRExporter {
  constructor(private readonly sourceIndex?: SourceIndex) {}

  export(ctx: IRContext): string {
    return exportToSiren(ctx, this.sourceIndex);
  }
}

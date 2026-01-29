import type { IRContext } from '../ir/context.js';
import { formatAttributeLine, wrapResourceBlock } from './formatters.js';

export function exportToSiren(ctx: IRContext): string {
  const lines: string[] = [];

  for (const res of ctx.resources) {
    const body: string[] = [];
    for (const attr of res.attributes) {
      body.push(formatAttributeLine(attr.key, attr.value as any));
    }
    lines.push(wrapResourceBlock(res.type, res.id, res.complete, body));
  }

  // Join resources with double newline for readability
  return lines.join('\n\n') + (lines.length ? '\n' : '');
}

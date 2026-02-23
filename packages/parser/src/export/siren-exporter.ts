import type { Resource } from '@siren/core';
import { formatAttributeLine, wrapResourceBlock } from './formatters.js';

export function exportToSiren(resources: readonly Resource[]): string {
  const lines: string[] = [];

  for (const res of resources) {
    const body: string[] = [];
    for (const attr of res.attributes) {
      body.push(formatAttributeLine(attr.key, attr.value, (attr as { _raw?: string })._raw));
    }
    lines.push(wrapResourceBlock(res.type, res.id, res.complete, body));
  }

  // Join resources with double newline for readability
  return lines.join('\n\n') + (lines.length ? '\n' : '');
}

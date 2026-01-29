import type { AttributeValue } from '../ir/types.js';

const INDENT = '  ';

export function formatPrimitive(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export function formatAttributeValue(value: AttributeValue): string {
  // Discriminate by shape
  // Reference: { kind: 'reference', id }
  // Array: { kind: 'array', elements }
  // Primitive: string|number|boolean|null
  // We avoid importing type guards to keep this file minimal.
  if (typeof value === 'object' && value !== null && 'kind' in value) {
    if ((value as any).kind === 'reference') {
      // Reference: emit bare id
      return (value as any).id;
    }
    if ((value as any).kind === 'array') {
      const elems = (value as any).elements as AttributeValue[];
      return `[${elems.map((e) => formatAttributeValue(e)).join(', ')}]`;
    }
  }
  return formatPrimitive(value as unknown);
}

export function formatAttributeLine(key: string, value: AttributeValue): string {
  return `${INDENT}${key} = ${formatAttributeValue(value)}`;
}

export function wrapResourceBlock(
  type: string,
  id: string,
  complete: boolean,
  bodyLines: string[],
): string {
  const header = `${type} ${id}${complete ? ' complete' : ''} {`;
  const footer = `}`;
  if (bodyLines.length === 0) return `${header}\n${footer}`;
  return [header, ...bodyLines, footer].join('\n');
}

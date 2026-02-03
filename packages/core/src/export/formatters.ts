import type { AttributeValue } from '../ir/types.js';

const INDENT = '  ';

export function formatPrimitive(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function isSafeRaw(raw: string): boolean {
  const t = raw.trim();
  if (t.length === 0) return false;
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('[') && t.endsWith(']'))) return true;
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(t)) return true;
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return true;
  if (t === 'true' || t === 'false' || t === 'null') return true;
  return false;
}

export function formatAttributeValue(value: AttributeValue, raw?: string): string {
  // If raw textual form is provided and appears safe, prefer it verbatim
  if (typeof raw === 'string' && isSafeRaw(raw)) return raw;

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

export function formatAttributeLine(
  key: string,
  value: AttributeValue,
  raw?: string,
  trailingComment?: string,
): string {
  const line = `${INDENT}${key} = ${formatAttributeValue(value, raw)}`;
  if (trailingComment) {
    return `${line}  ${trailingComment}`; // Two spaces before comment per Siren convention
  }
  return line;
}

export function wrapResourceBlock(
  type: string,
  id: string,
  complete: boolean,
  bodyLines: string[],
  headerTrailingComment?: string,
): string {
  let header = `${type} ${id}${complete ? ' complete' : ''} {`;
  if (headerTrailingComment) {
    header = `${header}  ${headerTrailingComment}`; // Two spaces before comment per Siren convention
  }
  const footer = `}`;
  if (bodyLines.length === 0) return `${header}\n${footer}`;
  return [header, ...bodyLines, footer].join('\n');
}

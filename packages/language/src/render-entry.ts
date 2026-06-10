import type { Atom, SirenEntry } from '@sirenpm/core';

const VALID_BARE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

function needsQuoting(id: string): boolean {
  return !VALID_BARE_IDENT.test(id);
}

function renderAtom(atom: Atom): string {
  if (typeof atom === 'string') {
    return JSON.stringify(atom);
  }
  if (typeof atom === 'number') {
    return String(atom);
  }
  if (typeof atom === 'boolean') {
    return atom ? 'true' : 'false';
  }
  // EntryReference
  return needsQuoting(atom.id) ? JSON.stringify(atom.id) : atom.id;
}

function renderTuple(tuple: readonly Atom[]): string {
  return tuple.map(renderAtom).join(', ');
}

/**
 * Serialize a `SirenEntry` back into Siren source text.
 *
 * Produces a minimal, lossy representation of the in-memory entry. String
 * attribute values are emitted as JSON-encoded strings, numbers and booleans
 * are emitted literally, and references are emitted as bare or quoted
 * identifiers as needed.
 *
 * @param entry - The in-memory entry to render.
 * @returns A string containing the entry as Siren source text.
 *
 * @remarks
 * This renderer is **not currently guaranteed** to produce valid Siren syntax
 * when the in-memory `SirenEntry` contains values outside the grammar's native
 * expression space — for example, string values with escaped characters produce
 * double-encoding. This is not an issue as long as the entry being rendered was
 * originally produced by the parser, but the onus is on consumers to ensure that
 * synthetic entries are valid for the current grammar.
 */
export function renderEntry(entry: SirenEntry): string {
  const statusPart = entry.status ? ` ${entry.status}` : '';
  const idPart = needsQuoting(entry.id) ? JSON.stringify(entry.id) : entry.id;
  const header = `${entry.type} ${idPart}${statusPart}`;

  // Filter out empty-tuple attributes
  const renderableAttrs = entry.attributes.filter((a) => a.value.length > 0);

  if (renderableAttrs.length === 0) {
    return `${header} {}\n`;
  }

  const attrLines = renderableAttrs.map((attr) => {
    const renderedValue = renderTuple(attr.value);
    return `  ${attr.key} = ${renderedValue}`;
  });

  return `${header} {\n${attrLines.join('\n')}\n}\n`;
}

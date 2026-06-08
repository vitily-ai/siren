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

export function renderEntry(entry: SirenEntry): string {
  const statusPart = entry.status ? ` ${entry.status}` : '';
  const header = `${entry.type} ${entry.id}${statusPart}`;

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

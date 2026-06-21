import type { Atom, Tuple } from '@sirenpm/core';
import type { AstOriginMap } from './ast/origins';
import type { AstTupleMember, SirenAst } from './ast/types';
import type { Origin, SourcedAttribute, SourcedEntry } from './origin';
import type { SourceDocument } from './parser/types';

/**
 * Decode the language-layer AST into flat core `SirenEntry[]`.
 *
 * Each AstResource maps directly to `{ type, id, status?, attributes }` — no
 * Resource/SirenDocument wrapper. When an `origins` map is supplied, entries
 * and attributes are returned as `SourcedEntry`/`SourcedAttribute` with origin
 * attached; otherwise plain `SirenEntry`/`Attribute`.
 */
export function decodeAstToEntries(
  ast: SirenAst,
  source: SourceDocument,
  origins: AstOriginMap,
): readonly SourcedEntry[] {
  const entries: SourcedEntry[] = ast.resources.map((astResource) => {
    const attributes: SourcedAttribute[] = astResource.attributes.map((astAttr) => {
      const value: Tuple = astAttr.value.members.map((m) => decodeMember(m, astAttr.name));
      const attrOrigin = origins?.get(astAttr) as Origin | undefined;
      return {
        key: astAttr.name,
        value,
        // Attribute origins should always be present in the WeakMap once the
        // AST builder guarantees full coverage. Keep the fallback for now.
        origin: attrOrigin ?? { kind: 'synthetic', document: source.name },
      };
    });

    const resourceOrigin = origins.get(astResource);
    if (!resourceOrigin) {
      throw new Error(
        `Origin missing for resource ${astResource.id}. This is unlikely to be user error.`,
      );
    }
    return {
      type: astResource.kind,
      id: astResource.id,
      status: astResource.status,
      attributes,
      origin: resourceOrigin,
    };
  });

  if (!ast.directives.noMilestone) {
    return appendSyntheticMilestone(entries, source.name);
  }
  return entries;
}

function decodeMember(member: AstTupleMember, attributeName: string): Atom {
  switch (member.kind) {
    case 'string':
      return attributeName === 'depends_on'
        ? { kind: 'reference', id: member.value }
        : member.value;
    case 'number':
      return member.value;
    case 'boolean':
      return member.value;
    case 'identifier':
      return { kind: 'reference', id: member.name };
  }
}

/**
 * Strip `.siren` suffix and optional `siren/` directory prefix from a source
 * name to derive the document id.
 *
 * The CLI passes source names as paths relative to the project root (e.g.
 * `siren/main.siren`). The `siren/` prefix is a directory convention, not
 * part of the document identity, so it is removed.
 */
function documentIdFromSourceName(name: string): string {
  let id = name.endsWith('.siren') ? name.slice(0, -'.siren'.length) : name;
  if (id.startsWith('siren/')) {
    id = id.slice('siren/'.length);
  }
  return id;
}

/**
 * Append a synthetic milestone for the given source document.
 *
 * Synthesis is skipped when an explicit milestone with the same id already
 * exists. Otherwise the milestone depends on every decoded entry (no
 * root-detection, per ADR-0005).
 */
function appendSyntheticMilestone(
  entries: readonly SourcedEntry[],
  sourceName: string,
): readonly SourcedEntry[] {
  const documentId = documentIdFromSourceName(sourceName);

  // Skip if an explicit milestone with the document id already exists.
  const hasExplicitMilestone = entries.some((e) => e.type === 'milestone' && e.id === documentId);
  if (hasExplicitMilestone) {
    return entries;
  }

  const dependsOnAttr: SourcedAttribute[] =
    entries.length > 0
      ? [
          {
            key: 'depends_on',
            value: entries.map((e) => ({ kind: 'reference' as const, id: e.id })),
            origin: { kind: 'synthetic', document: sourceName },
          },
        ]
      : [];

  const syntheticMilestone: SourcedEntry = {
    type: 'milestone',
    id: documentId,
    attributes: dependsOnAttr,
    origin: { kind: 'synthetic', document: sourceName },
  };

  return [...entries, syntheticMilestone];
}

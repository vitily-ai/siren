import type { Atom, Tuple } from '@sirenpm/core';
import type { AstOriginMap } from '../ast/origins';
import type { AstTupleMember, SirenAst } from '../ast/types';
import type { Origin, SourcedAttribute, SourcedEntry } from '../origin';
import type { SourceDocument } from '../parser/types';

// TODO lang-v060-synthesis: this should be `DecodeDirectives`, as this will eventually be derived from in-grammar document-scoped directives
export interface DecodeEntriesOptions {
  /**
   * When true, append a synthetic milestone per source document.
   * Default false. Full implementation in lang-v060-synthesis.
   */
  readonly shouldSynthesizeMilestone?: boolean;
}

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
  options?: DecodeEntriesOptions,
): readonly SourcedEntry[] {
  const entries: SourcedEntry[] = ast.resources.map((astResource) => {
    const attributes: SourcedAttribute[] = astResource.attributes.map((astAttr) => {
      const value: Tuple = astAttr.value.members.map((m) => decodeMember(m, astAttr.name));
      const attrOrigin = origins?.get(astAttr) as Origin | undefined;
      return {
        key: astAttr.name,
        value,
        origin: attrOrigin ?? { kind: 'synthetic', document: source.name },
      };
    });

    // FIXME: Origin must never be missing. Narrow the weakmap type if possible, or throw on missing if not.
    const resourceOrigin = origins.get(astResource);
    return {
      type: astResource.kind,
      id: astResource.id,
      ...(astResource.status !== undefined ? { status: astResource.status } : {}),
      // TODO verify core invariant: missing fields and explicit `undefined`/`null` fields are not differentiated
      status: astResource.status,
      attributes,
      origin: resourceOrigin ?? { kind: 'synthetic', document: source.name },
    };
  });

  // synthesizeMilestones is a stub for lang-v060-synthesis
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

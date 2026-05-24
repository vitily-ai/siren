import type { Atom, Attribute, Resource, SirenDocument, Tuple } from '@sirenpm/core';
import type { AstOriginMap } from '../ast/origins';
import type { AstTupleMember, SirenAst } from '../ast/types';
import type { SourceDocument } from '../parser/types';

/**
 * Decode the language-layer AST into a core `SirenDocument`.
 *
 * Pure: no I/O, deterministic. See ADR 0004 for the full set of decode rules.
 *
 * When an `origins` map is supplied, each IR resource/attribute receives the
 * `RangeOrigin` keyed to its source AST node. The map is the package-private
 * sidechannel emitted by `buildAst`; the parameter is optional so the decoder
 * remains independently callable (degraded mode = no `origin` on IR nodes).
 */
export function decodeAstToSirenDocument(
  ast: SirenAst,
  source: SourceDocument,
  origins?: AstOriginMap,
): SirenDocument {
  const resources: Resource[] = ast.resources.map((astResource) => {
    const attributes: Attribute[] = astResource.attributes.map((astAttr) => {
      const value: Tuple = astAttr.value.members.map((m) => decodeMember(m, astAttr.name));
      const attrOrigin = origins?.get(astAttr);
      return attrOrigin !== undefined
        ? { key: astAttr.name, value, origin: attrOrigin }
        : { key: astAttr.name, value };
    });

    const resourceOrigin = origins?.get(astResource);
    const resource: Resource = {
      type: astResource.kind,
      id: astResource.id,
      ...(astResource.status !== undefined ? { status: astResource.status } : {}),
      attributes,
      ...(resourceOrigin !== undefined ? { origin: resourceOrigin } : {}),
    };
    return resource;
  });

  return {
    id: source.name.endsWith('.siren') ? source.name.slice(0, -'.siren'.length) : source.name,
    resources,
  };
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

import type { Node, Tree } from 'web-tree-sitter';
import {
  createEL001,
  createWL001,
  createWL002,
  type LanguageDiagnostic,
} from '../diagnostics/types';
import type { SourceDocument } from '../parser/types';
import type { AstOriginMap, RangeOrigin } from './origins';
import type {
  AstAttribute,
  AstResource,
  AstResourceKind,
  AstStatusModifier,
  AstTuple,
  AstTupleMember,
  SirenAst,
} from './types';

export interface BuildAstResult {
  readonly ast: SirenAst;
  readonly diagnostics: readonly LanguageDiagnostic[];
  /**
   * Package-private map from AST node identity (resource or attribute) to its
   * source `RangeOrigin`. Not part of the public AST shape — see ADR 0004,
   * Decision 13.
   */
  readonly origins: AstOriginMap;
}

const EMPTY_AST: SirenAst = Object.freeze({ resources: Object.freeze([]) });
const EMPTY_DIAGNOSTICS: readonly LanguageDiagnostic[] = Object.freeze([]);

function rangeOriginFromNode(node: Node, documentName: string): RangeOrigin {
  return {
    kind: 'range',
    startByte: node.startIndex,
    endByte: node.endIndex,
    startRow: node.startPosition.row,
    endRow: node.endPosition.row,
    document: documentName,
  };
}

const RECOGNIZED_STATUSES: ReadonlySet<AstStatusModifier> = new Set(['complete', 'draft']);

function isRecognizedStatus(text: string): text is AstStatusModifier {
  return RECOGNIZED_STATUSES.has(text as AstStatusModifier);
}

function unexpected(detail: string): Error {
  return new Error(`lang-ast-builder: unexpected node shape: ${detail}`);
}

/**
 * Freeze an AstResource and its nested `readonly` arrays so the public AST is
 * immutable at runtime in addition to its compile-time `readonly` typing.
 */
function freezeResource(r: AstResource): AstResource {
  for (const attr of r.attributes) {
    Object.freeze(attr.value.members);
    Object.freeze(attr.value);
    Object.freeze(attr);
  }
  Object.freeze(r.attributes);
  return Object.freeze(r);
}

/**
 * Extract the bare identifier text from an `identifier` node, which is either
 * a `bare_identifier` or a `string_literal`. Quoted strings are unwrapped via
 * the `str_body` child; the grammar does not currently permit escape sequences
 * inside string bodies, so the body text is used verbatim.
 *
 * Callers only invoke this on nodes from an error-free subtree, so any
 * mismatch with the grammar is a hard implementation error.
 */
function identifierText(identifierNode: Node): string {
  const inner = identifierNode.namedChild(0);
  if (!inner) {
    throw unexpected(`identifier node has no named child (type=${identifierNode.type})`);
  }
  if (inner.type === 'bare_identifier') return inner.text;
  if (inner.type === 'string_literal') {
    for (let i = 0; i < inner.namedChildCount; i++) {
      const c = inner.namedChild(i);
      if (c && c.type === 'str_body') return c.text;
    }
    throw unexpected('string_literal identifier missing str_body child');
  }
  throw unexpected(`identifier inner type=${inner.type}`);
}

function resourceKind(headerNode: Node): AstResourceKind {
  const typeNode = headerNode.childForFieldName('type');
  if (!typeNode) throw unexpected('resource_header missing `type` field');
  const text = typeNode.text;
  if (text === 'task' || text === 'milestone') return text;
  throw unexpected(`resource_header type text=${JSON.stringify(text)}`);
}

function headerResourceId(headerNode: Node): string {
  const idNode = headerNode.childForFieldName('id');
  if (!idNode) throw unexpected('resource_header missing `id` field');
  return identifierText(idNode);
}

function buildTupleMember(node: Node): AstTupleMember {
  if (node.type === 'bare_identifier') {
    return { kind: 'identifier', name: node.text };
  }
  if (node.type === 'literal') {
    const inner = node.namedChild(0);
    if (!inner) throw unexpected('literal node has no named child');
    if (inner.type === 'string_literal') {
      for (let i = 0; i < inner.namedChildCount; i++) {
        const c = inner.namedChild(i);
        if (c && c.type === 'str_body') {
          return { kind: 'string', value: c.text };
        }
      }
      throw unexpected('string_literal missing str_body child');
    }
    if (inner.type === 'number_literal') {
      return { kind: 'number', value: Number(inner.text) };
    }
    if (inner.type === 'boolean_literal') {
      return { kind: 'boolean', value: inner.text === 'true' };
    }
    throw unexpected(`literal inner type=${inner.type}`);
  }
  throw unexpected(`tuple member node type=${node.type}`);
}

function buildAttribute(attrNode: Node, documentName: string, origins: AstOriginMap): AstAttribute {
  const keyNode = attrNode.childForFieldName('key');
  const valueNode = attrNode.childForFieldName('value');
  if (!keyNode) throw unexpected('attribute missing `key` field');
  if (!valueNode) throw unexpected('attribute missing `value` field');

  // value is an `expression` wrapping a `tuple`.
  let tupleNode: Node | undefined;
  if (valueNode.type === 'expression') {
    const inner = valueNode.namedChild(0);
    if (inner && inner.type === 'tuple') tupleNode = inner;
  } else if (valueNode.type === 'tuple') {
    tupleNode = valueNode;
  }
  if (!tupleNode) {
    throw unexpected(`attribute value did not yield a tuple (valueNode.type=${valueNode.type})`);
  }

  const members: AstTupleMember[] = [];
  for (let i = 0; i < tupleNode.namedChildCount; i++) {
    const child = tupleNode.namedChild(i);
    if (!child) continue;
    members.push(buildTupleMember(child));
  }
  const value: AstTuple = { members };
  const attribute: AstAttribute = { name: keyNode.text, value };
  origins.set(attribute, rangeOriginFromNode(attrNode, documentName));
  return attribute;
}

function buildResource(
  resourceNode: Node,
  documentName: string,
  diagnostics: LanguageDiagnostic[],
  origins: AstOriginMap,
): AstResource {
  const headerNode = resourceNode.namedChild(0);
  if (!headerNode || headerNode.type !== 'resource_header') {
    throw unexpected(
      `resource first named child is not resource_header (got ${headerNode?.type ?? 'null'})`,
    );
  }

  const kind = resourceKind(headerNode);
  const id = headerResourceId(headerNode);

  // Walk header's `resource_modifier` children (in source order) and classify.
  const recognized: AstStatusModifier[] = [];
  const unrecognized: string[] = [];
  for (let i = 0; i < headerNode.namedChildCount; i++) {
    const child = headerNode.namedChild(i);
    if (!child || child.type !== 'resource_modifier') continue;
    const inner = child.namedChild(0);
    if (!inner) throw unexpected('resource_modifier has no named child');
    const text = identifierText(inner);
    if (isRecognizedStatus(text)) recognized.push(text);
    else unrecognized.push(text);
  }

  const status: AstStatusModifier | undefined =
    recognized.length > 0 ? recognized[recognized.length - 1] : undefined;

  for (const modifier of unrecognized) {
    diagnostics.push(createWL001({ documentName, resourceId: id, modifier }));
  }
  if (recognized.length > 1 && status !== undefined) {
    diagnostics.push(
      createWL002({
        documentName,
        resourceId: id,
        recognizedModifiers: recognized,
        resolvedStatus: status,
      }),
    );
  }

  // Body block → attributes (in source order).
  const bodyNode = resourceNode.childForFieldName('body');
  const attributes: AstAttribute[] = [];
  if (bodyNode) {
    for (let i = 0; i < bodyNode.namedChildCount; i++) {
      const child = bodyNode.namedChild(i);
      if (!child || child.type !== 'attribute') continue;
      attributes.push(buildAttribute(child, documentName, origins));
    }
  }

  const resource: AstResource =
    status !== undefined ? { kind, id, status, attributes } : { kind, id, attributes };
  origins.set(resource, rangeOriginFromNode(resourceNode, documentName));
  return freezeResource(resource);
}

/**
 * CST → AST builder. Pure: deterministic, no I/O.
 *
 * Top-level walk over `document`'s children:
 * - `resource` without errors → emit `AstResource`.
 * - `resource` with a parse error in its subtree → omit and emit `EL001`,
 *   preserving the resource id if the header parsed cleanly enough.
 * - `ERROR` node directly under the document → emit `EL001` with
 *   `nodeType: 'ERROR'`.
 */
export function buildAst(tree: Tree | null, source: SourceDocument): BuildAstResult {
  const origins: AstOriginMap = new WeakMap();
  if (!tree) return { ast: EMPTY_AST, diagnostics: EMPTY_DIAGNOSTICS, origins };

  const root = tree.rootNode;
  const resources: AstResource[] = [];
  const diagnostics: LanguageDiagnostic[] = [];

  for (let i = 0; i < root.namedChildCount; i++) {
    const child = root.namedChild(i);
    if (!child) continue;

    if (child.type === 'resource') {
      if (child.hasError) {
        // Salvage the id from the header if it parsed cleanly.
        const headerNode = child.namedChild(0);
        let salvagedId: string | undefined;
        if (headerNode && headerNode.type === 'resource_header' && !headerNode.hasError) {
          salvagedId = headerResourceId(headerNode);
        }
        diagnostics.push(
          createEL001({
            documentName: source.name,
            nodeType: child.type,
            resourceId: salvagedId,
          }),
        );
        continue;
      }
      const built = buildResource(child, source.name, diagnostics, origins);
      resources.push(built);
      continue;
    }

    if (child.isError || child.type === 'ERROR') {
      diagnostics.push(createEL001({ documentName: source.name, nodeType: child.type }));
    }
  }

  const ast: SirenAst = Object.freeze({ resources: Object.freeze(resources) });
  return { ast, diagnostics: Object.freeze(diagnostics), origins };
}

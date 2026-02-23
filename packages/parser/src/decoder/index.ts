/**
 * Decoder module - transforms CST to Resource[]
 *
 * Converts the raw parse tree (CST) into Resource objects compatible
 * with @siren/core. Produces `source` strings for attribution and
 * carries `_origin`/`_raw` surplus fields for the export module.
 */

import type {
  ArrayValue,
  Attribute,
  AttributeValue,
  Resource,
  ResourceReference,
  ResourceType,
} from '@siren/core';
import { serializeSourceAddress } from '@siren/core';
import type {
  ArrayNode,
  AttributeNode,
  DocumentNode,
  ExpressionNode,
  LiteralNode,
  ReferenceNode,
  ResourceNode,
} from '../parser/cst.js';
import { ParserDiagnosticCode } from './codes.js';
import type { DecodedAttribute, DecodedResource } from './decoded-types.js';

/**
 * Parse-level diagnostic message (grammar/syntax issues only)
 */
export interface ParseDiagnostic {
  /** Diagnostic code (e.g., 'WP-001' for warnings, 'EP-001' for errors) */
  readonly code: string;
  /** Human-readable description of the issue */
  readonly message: string;
  /** Severity level */
  readonly severity: 'error' | 'warning' | 'info';
  /** Serialized source address (e.g. "file.siren:5:0") */
  readonly source?: string;
}

/**
 * Result of decoding a CST into resources
 */
export interface DecodeResult {
  /** The decoded resources (empty if decoding failed with errors) */
  readonly resources: readonly Resource[];
  /** Parse-level diagnostics (grammar/syntax issues only) */
  readonly diagnostics: readonly ParseDiagnostic[];
  /** True if decoding succeeded without errors (warnings allowed) */
  readonly success: boolean;
}

/**
 * Check if an expression node is a literal
 */
function isLiteralNode(node: ExpressionNode): node is LiteralNode {
  return node.type === 'literal';
}

/**
 * Check if an expression node is a reference
 */
function isReferenceNode(node: ExpressionNode): node is ReferenceNode {
  return node.type === 'reference';
}

/**
 * Check if an expression node is an array
 */
function isArrayNode(node: ExpressionNode): node is ArrayNode {
  return node.type === 'array';
}

/**
 * Decode a literal node to a primitive AttributeValue
 */
function decodeLiteral(node: LiteralNode): AttributeValue {
  return node.value;
}

/**
 * Decode a reference node to a ResourceReference
 */
function decodeReference(node: ReferenceNode): ResourceReference {
  return {
    kind: 'reference',
    id: node.identifier.value,
  };
}

/**
 * Decode an array node to an ArrayValue
 */
function decodeArray(node: ArrayNode): ArrayValue {
  const elements: AttributeValue[] = [];
  for (const element of node.elements) {
    if (isLiteralNode(element)) {
      elements.push(decodeLiteral(element));
    } else if (isReferenceNode(element)) {
      elements.push(decodeReference(element));
    } else if (isArrayNode(element)) {
      elements.push(decodeArray(element));
    }
  }
  return {
    kind: 'array',
    elements,
  };
}

/**
 * Decode an attribute node from CST to a DecodedAttribute.
 * Produces `source` for core attribution plus `_raw`/`_origin` surplus fields
 * for the export module.
 */
function decodeAttribute(node: AttributeNode): DecodedAttribute | null {
  const key = node.key.value;
  const expr = node.value;
  const attrSource = node.origin
    ? serializeSourceAddress(node.origin.document, node.origin.startRow + 1, 0)
    : undefined;

  if (isLiteralNode(expr)) {
    return {
      key,
      value: decodeLiteral(expr),
      source: attrSource,
      _raw: expr.text,
      _origin: node.origin,
    };
  }

  if (isReferenceNode(expr)) {
    return {
      key,
      value: decodeReference(expr),
      source: attrSource,
      _raw: expr.identifier.text,
      _origin: node.origin,
    };
  }

  if (isArrayNode(expr)) {
    return {
      key,
      value: decodeArray(expr),
      source: attrSource,
      _origin: node.origin,
    };
  }

  return null;
}

/**
 * Build a source address string from a ResourceNode's origin
 */
function resourceSource(node: ResourceNode): string | undefined {
  if (!node.origin) return undefined;
  return serializeSourceAddress(node.origin.document, node.origin.startRow + 1, 0);
}

/**
 * Build a diagnostic source address from a ResourceNode's origin
 */
function diagnosticSource(node: ResourceNode): string | undefined {
  return resourceSource(node);
}

/**
 * Decode a resource node from CST to a DecodedResource.
 * Produces `source` for core attribution plus `_origin` surplus field
 * for the export module.
 */
function decodeResource(
  node: ResourceNode & { completeKeywordCount?: number; completeKeywordDiagnostics?: string[] },
  diagnostics: ParseDiagnostic[],
): DecodedResource {
  const type: ResourceType = node.resourceType;
  const id = node.identifier.value;
  const complete = typeof node.complete === 'boolean' ? node.complete : false;
  const src = diagnosticSource(node);

  // Error-tolerant: handle multiple 'complete' keywords
  if (typeof node.completeKeywordCount === 'number' && node.completeKeywordCount > 1) {
    diagnostics.push({
      code: ParserDiagnosticCode.MULTIPLE_COMPLETE,
      message: `Resource '${id}' has 'complete' keyword specified more than once. Only one is allowed; resource will be treated as complete: true.`,
      severity: 'warning',
      source: src,
    });
  }

  // Error-tolerant: handle 'complete' on unsupported resource types
  if (complete && type !== 'task' && type !== 'milestone') {
    diagnostics.push({
      code: ParserDiagnosticCode.COMPLETE_UNSUPPORTED,
      message: `Resource type '${type}' does not support the 'complete' keyword. It will be ignored.`,
      severity: 'warning',
      source: src,
    });
  }

  // Error-tolerant: propagate parse-time diagnostics for misplaced/invalid 'complete'
  if (Array.isArray(node.completeKeywordDiagnostics)) {
    for (const msg of node.completeKeywordDiagnostics) {
      diagnostics.push({
        code: ParserDiagnosticCode.COMPLETE_INVALID,
        message: msg,
        severity: 'error',
        source: src,
      });
    }
  }

  // Decode attributes, filtering out null (unsupported expression types)
  const attributes: Attribute[] = [];
  let completeAttr: Attribute | undefined;
  for (const attrNode of node.body) {
    const attr = decodeAttribute(attrNode);
    if (attr !== null) {
      if (attr.key === 'complete') completeAttr = attr;
      attributes.push(attr);
    }
  }

  // Emit warning if both keyword and attribute are present, and attribute is not true
  if (complete && completeAttr && completeAttr.value !== true) {
    diagnostics.push({
      code: ParserDiagnosticCode.COMPLETE_CONFLICT,
      message:
        "Resource has both 'complete' keyword and a 'complete' attribute whose value is not true. The resource will be treated as complete.",
      severity: 'warning',
      source: src,
    });
  }

  return {
    type,
    id,
    complete,
    attributes,
    source: resourceSource(node),
    _origin: node.origin,
  };
}

/**
 * Decode a CST into resources with diagnostics.
 *
 * @param cst - The parsed concrete syntax tree
 * @returns Decoded resources with diagnostics
 */
export function decodeDocument(cst: DocumentNode): DecodeResult {
  const diagnostics: ParseDiagnostic[] = [];
  const resources: Resource[] = [];

  for (const resourceNode of cst.resources) {
    resources.push(decodeResource(resourceNode, diagnostics));
  }

  const hasErrors = diagnostics.some((d) => d.severity === 'error');

  return {
    resources: hasErrors ? [] : resources,
    diagnostics,
    success: !hasErrors,
  };
}

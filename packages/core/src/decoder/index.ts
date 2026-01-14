/**
 * Decoder module - transforms CST to IR
 *
 * Converts the raw parse tree (CST) into a semantic intermediate
 * representation (IR) with validation and diagnostics.
 */

import type {
  Attribute,
  AttributeValue,
  Document,
  Resource,
  ResourceReference,
  ResourceType,
} from '../ir/index.js';
import type {
  AttributeNode,
  DocumentNode,
  ExpressionNode,
  LiteralNode,
  ReferenceNode,
  ResourceNode,
} from '../parser/cst.js';

/**
 * Diagnostic message produced during decoding
 */
export interface Diagnostic {
  /** Diagnostic code (e.g., 'W001' for warnings, 'E001' for errors) */
  readonly code: string;
  /** Human-readable description of the issue */
  readonly message: string;
  /** Severity level */
  readonly severity: 'error' | 'warning' | 'info';
}

/**
 * Result of decoding a CST into IR
 */
export interface DecodeResult {
  /** The decoded document, or null if decoding failed with errors */
  readonly document: Document | null;
  /** Diagnostics collected during decoding */
  readonly diagnostics: readonly Diagnostic[];
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
 * Decode a literal node to a primitive AttributeValue
 *
 * @param node - The CST literal node
 * @returns The primitive value (string, number, boolean, or null)
 */
function decodeLiteral(node: LiteralNode): AttributeValue {
  // LiteralNode.value is already the correct runtime type:
  // - string literals have string value (quotes stripped by CST)
  // - number literals have number value
  // - boolean literals have boolean value
  // - null literals have null value
  return node.value;
}

/**
 * Decode a reference node to a ResourceReference
 *
 * @param node - The CST reference node
 * @returns The ResourceReference with target ID (quotes stripped if quoted)
 */
function decodeReference(node: ReferenceNode): ResourceReference {
  // IdentifierNode.value has quotes already stripped by the CST
  return {
    kind: 'reference',
    id: node.identifier.value,
  };
}

/**
 * Decode an attribute node from CST to IR
 *
 * @param node - The CST attribute node
 * @returns The decoded Attribute, or null if expression type is not yet supported
 */
function decodeAttribute(node: AttributeNode): Attribute | null {
  const key = node.key.value;
  const expr = node.value;

  // Handle LiteralNode → primitive value
  if (isLiteralNode(expr)) {
    return {
      key,
      value: decodeLiteral(expr),
    };
  }

  // Handle ReferenceNode → ResourceReference
  if (isReferenceNode(expr)) {
    return {
      key,
      value: decodeReference(expr),
    };
  }

  // Skip ArrayNode expressions for now (to be handled later)
  return null;
}

/**
 * Decode a resource node from CST to IR
 *
 * @param node - The CST resource node
 * @returns The decoded Resource
 */
function decodeResource(node: ResourceNode): Resource {
  const type: ResourceType = node.resourceType;
  // The identifier.value has quotes already stripped (from the CST)
  const id = node.identifier.value;

  // Decode attributes, filtering out null (unsupported expression types)
  const attributes: Attribute[] = [];
  for (const attrNode of node.body) {
    const attr = decodeAttribute(attrNode);
    if (attr !== null) {
      attributes.push(attr);
    }
  }

  return {
    type,
    id,
    attributes,
  };
}

/**
 * Decode a CST into an IR Document
 *
 * @param cst - The parsed concrete syntax tree
 * @returns The decode result with document, diagnostics, and success flag
 */
export function decode(cst: DocumentNode): DecodeResult {
  const diagnostics: Diagnostic[] = [];
  const resources: Resource[] = [];

  for (const resourceNode of cst.resources) {
    resources.push(decodeResource(resourceNode));
  }

  const hasErrors = diagnostics.some((d) => d.severity === 'error');

  return {
    document: hasErrors ? null : { resources },
    diagnostics,
    success: !hasErrors,
  };
}

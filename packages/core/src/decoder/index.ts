/**
 * Decoder module - transforms CST to IR
 *
 * Converts the raw parse tree (CST) into a semantic intermediate
 * representation (IR) with validation and diagnostics.
 */

import type {
  ArrayValue,
  Attribute,
  AttributeValue,
  Document,
  Resource,
  ResourceReference,
  ResourceType,
} from '../ir/index.js';
import type {
  ArrayNode,
  AttributeNode,
  DocumentNode,
  ExpressionNode,
  LiteralNode,
  ReferenceNode,
  ResourceNode,
} from '../parser/cst.js';

/**
 * Parse-level diagnostic message (grammar/syntax issues only)
 * For semantic diagnostics, use IRContext.diagnostics getter
 * @internal - Use IRContext.fromCst() instead
 */
export interface ParseDiagnostic {
  /** Diagnostic code (e.g., 'W001' for warnings, 'E001' for errors) */
  readonly code: string;
  /** Human-readable description of the issue */
  readonly message: string;
  /** Severity level */
  readonly severity: 'error' | 'warning' | 'info';
  /** Source file path (populated by fromCst when file is provided) */
  readonly file?: string;
  /** 1-based line number (when origin available) */
  readonly line?: number;
  /** 0-based column number (when origin available) */
  readonly column?: number;
}

/**
 * Result of decoding a CST into IR
 * @internal - Use IRContext.fromCst() instead
 */
export interface DecodeResult {
  /** The decoded document, or null if decoding failed with errors */
  readonly document: Document | null;
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
 * Decode an array node to an ArrayValue
 *
 * @param node - The CST array node
 * @returns The ArrayValue with decoded elements
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
    } else {
      // Skip unsupported element types for now
    }
  }
  return {
    kind: 'array',
    elements,
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
      raw: expr.text,
      origin: node.origin,
    };
  }

  // Handle ReferenceNode → ResourceReference
  if (isReferenceNode(expr)) {
    return {
      key,
      value: decodeReference(expr),
      raw: expr.identifier.text,
      origin: node.origin,
    };
  }

  // Handle ArrayNode → ArrayValue
  if (isArrayNode(expr)) {
    return {
      key,
      value: decodeArray(expr),
      origin: node.origin,
    };
  }

  return null;
}

/**
 * Decode a resource node from CST to IR
 *
 * @param node - The CST resource node
 * @param diagnostics - Array to collect diagnostics
 * @param source - Optional source file path for diagnostic attribution
 * @returns The decoded Resource
 */
function decodeResource(
  node: ResourceNode & { completeKeywordCount?: number; completeKeywordDiagnostics?: string[] },
  diagnostics: ParseDiagnostic[],
  _source?: string,
): Resource {
  const type: ResourceType = node.resourceType;
  const id = node.identifier.value;
  const complete = typeof node.complete === 'boolean' ? node.complete : false;

  // Error-tolerant: handle multiple 'complete' keywords
  if (typeof node.completeKeywordCount === 'number' && node.completeKeywordCount > 1) {
    diagnostics.push({
      code: 'W002',
      message: `Resource '${id}' has 'complete' keyword specified more than once. Only one is allowed; resource will be treated as complete: true.`,
      severity: 'warning',
      file: node.origin?.document,
      line: node.origin ? node.origin.startRow + 1 : undefined,
      column: node.origin ? 0 : undefined,
    });
  }

  // Error-tolerant: handle 'complete' on unsupported resource types
  if (complete && type !== 'task' && type !== 'milestone') {
    diagnostics.push({
      code: 'W003',
      message: `Resource type '${type}' does not support the 'complete' keyword. It will be ignored.`,
      severity: 'warning',
      file: node.origin?.document,
      line: node.origin ? node.origin.startRow + 1 : undefined,
      column: node.origin ? 0 : undefined,
    });
  }

  // Error-tolerant: propagate parse-time diagnostics for misplaced/invalid 'complete'
  if (Array.isArray(node.completeKeywordDiagnostics)) {
    for (const msg of node.completeKeywordDiagnostics) {
      diagnostics.push({
        code: 'E001',
        message: msg,
        severity: 'error',
        file: node.origin?.document,
        line: node.origin ? node.origin.startRow + 1 : undefined,
        column: node.origin ? 0 : undefined,
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
      code: 'W001',
      message:
        "Resource has both 'complete' keyword and a 'complete' attribute whose value is not true. The resource will be treated as complete.",
      severity: 'warning',
      file: node.origin?.document,
      line: node.origin ? node.origin.startRow + 1 : undefined,
      column: node.origin ? 0 : undefined,
    });
  }

  return {
    type,
    id,
    complete,
    attributes,
    origin: node.origin,
  };
}

/**
 * Decode a CST into an IR Document
 * @internal Not part of the public API; use IRContext.fromCst() instead.
 * @param cst - The parsed concrete syntax tree
 * @param source - Optional source file path for diagnostic attribution
 * @returns Decoded document with diagnostics
 */
export function decodeDocument(cst: DocumentNode, source?: string): DecodeResult {
  const diagnostics: ParseDiagnostic[] = [];
  const resources: Resource[] = [];

  for (const resourceNode of cst.resources) {
    resources.push(decodeResource(resourceNode, diagnostics, source));
  }

  const hasErrors = diagnostics.some((d) => d.severity === 'error');

  const document = hasErrors ? null : { resources, documents: cst.documents };

  return {
    document,
    diagnostics,
    success: !hasErrors,
  };
}

/**
 * Alias for backwards compatibility with existing tests
 * @deprecated Use IRContext.fromCst() instead
 */
export const decode = decodeDocument;

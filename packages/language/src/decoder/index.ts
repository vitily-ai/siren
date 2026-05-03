/**
 * Decoder module - transforms parsed syntax documents to IR.
 */

import type {
  ArrayValue,
  Attribute,
  AttributeValue,
  Document,
  Origin,
  Resource,
  ResourceReference,
  ResourceType,
} from '@sirenpm/core';
import type {
  SourceSpan,
  SyntaxArrayExpression,
  SyntaxAttribute,
  SyntaxDocument,
  SyntaxExpression,
  SyntaxLiteralExpression,
  SyntaxReferenceExpression,
  SyntaxResource,
} from '../syntax/types';

/**
 * Parse-level diagnostic message (grammar/syntax issues only)
 * For semantic diagnostics, use IRContext.diagnostics getter
 * @internal - Use IRContext.fromCst() instead
 */
export interface ParseDiagnostic {
  /** Diagnostic code (e.g., 'WL001' for warnings, 'EL001' for errors) */
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

function toOrigin(span: SourceSpan): Origin {
  return {
    startByte: span.startByte,
    endByte: span.endByte,
    startRow: span.startRow,
    endRow: span.endRow,
    document: span.document,
  };
}

/**
 * Check if a syntax expression is a literal.
 */
function isLiteralExpression(node: SyntaxExpression): node is SyntaxLiteralExpression {
  return node.kind === 'literal';
}

/**
 * Check if a syntax expression is a reference.
 */
function isReferenceExpression(node: SyntaxExpression): node is SyntaxReferenceExpression {
  return node.kind === 'reference';
}

/**
 * Check if a syntax expression is an array.
 */
function isArrayExpression(node: SyntaxExpression): node is SyntaxArrayExpression {
  return node.kind === 'array';
}

/**
 * Decode a literal expression to a primitive AttributeValue.
 */
function decodeLiteral(node: SyntaxLiteralExpression): AttributeValue {
  return node.value;
}

/**
 * Decode a reference expression to a ResourceReference.
 */
function decodeReference(node: SyntaxReferenceExpression): ResourceReference {
  return {
    kind: 'reference',
    id: node.identifier.value,
  };
}

/**
 * Decode an array expression to an ArrayValue.
 */
function decodeArray(node: SyntaxArrayExpression): ArrayValue {
  const elements: AttributeValue[] = [];
  for (const element of node.elements) {
    if (isLiteralExpression(element)) {
      elements.push(decodeLiteral(element));
    } else if (isReferenceExpression(element)) {
      elements.push(decodeReference(element));
    } else if (isArrayExpression(element)) {
      elements.push(decodeArray(element));
    }
  }
  return {
    kind: 'array',
    elements,
  };
}

/**
 * Decode a syntax attribute to IR.
 */
function decodeAttribute(node: SyntaxAttribute): Attribute | null {
  const key = node.key.value;
  const expr = node.value;

  if (isLiteralExpression(expr)) {
    return {
      key,
      value: decodeLiteral(expr),
      raw: expr.raw,
      origin: toOrigin(node.span),
    };
  }

  if (isReferenceExpression(expr)) {
    return {
      key,
      value: decodeReference(expr),
      raw: expr.identifier.raw,
      origin: toOrigin(node.span),
    };
  }

  if (isArrayExpression(expr)) {
    return {
      key,
      value: decodeArray(expr),
      origin: toOrigin(node.span),
    };
  }

  return null;
}

/**
 * Decode a syntax resource to IR.
 */
function decodeResource(node: SyntaxResource, diagnostics: ParseDiagnostic[]): Resource {
  const type: ResourceType = node.resourceType;
  const id = node.identifier.value;
  const complete = node.completeKeyword !== undefined;

  if (complete && type !== 'task' && type !== 'milestone') {
    diagnostics.push({
      code: 'WL003',
      message: `Resource type '${type}' does not support the 'complete' keyword. It will be ignored.`,
      severity: 'warning',
      file: node.span.document,
      line: node.span.startRow + 1,
      column: 0,
    });
  }

  const attributes: Attribute[] = [];
  let completeAttr: Attribute | undefined;
  for (const attrNode of node.attributes) {
    const attr = decodeAttribute(attrNode);
    if (attr !== null) {
      if (attr.key === 'complete') completeAttr = attr;
      attributes.push(attr);
    }
  }

  if (complete && completeAttr && completeAttr.value !== true) {
    diagnostics.push({
      code: 'WL001',
      message:
        "Resource has both 'complete' keyword and a 'complete' attribute whose value is not true. The resource will be treated as complete.",
      severity: 'warning',
      file: node.span.document,
      line: node.span.startRow + 1,
      column: 0,
    });
  }

  return {
    type,
    id,
    complete,
    attributes,
    origin: toOrigin(node.span),
  };
}

/**
 * Decode syntax documents into an IR Document.
 */
export function decodeSyntaxDocuments(syntaxDocuments: readonly SyntaxDocument[]): DecodeResult {
  const diagnostics: ParseDiagnostic[] = [];
  const resources: Resource[] = [];

  for (const syntaxDocument of syntaxDocuments) {
    for (const resourceNode of syntaxDocument.resources) {
      resources.push(decodeResource(resourceNode, diagnostics));
    }
  }

  const hasErrors = diagnostics.some((d) => d.severity === 'error');

  return {
    document: hasErrors
      ? null
      : {
          resources,
          source: syntaxDocuments.length === 1 ? syntaxDocuments[0]?.source.name : undefined,
        },
    diagnostics,
    success: !hasErrors,
  };
}

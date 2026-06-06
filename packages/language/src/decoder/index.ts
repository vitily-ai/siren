/**
 * Decoder module - transforms parsed syntax documents to IR.
 */

import type {
  ArrayValue,
  Attribute,
  AttributeValue,
  Origin,
  Resource,
  ResourceReference,
  ResourceStatus,
  ResourceType,
  SirenDocument,
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

/** @deprecated Use SirenDocument from @sirenpm/core directly */
export type DecodedDocument = SirenDocument;

/**
 * Result of decoding a CST into a Project
 */
export interface DecodeResult {
  /** One SirenDocument per source syntax document, or null if decoding failed with errors */
  readonly documents: readonly SirenDocument[] | null;
  /** Parse-level diagnostics (grammar/syntax issues only) */
  readonly diagnostics: readonly ParseDiagnostic[];
  /** True if decoding succeeded without errors (warnings allowed) */
  readonly success: boolean;
}

function toOrigin(span: SourceSpan): Origin {
  return {
    kind: 'range',
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
  // The lint pass guarantees `statusKeyword` is either a token whose `raw`
  // is a valid `ResourceStatus` (`'complete'` or `'draft'`), or undefined.
  const status = node.statusKeyword?.raw as ResourceStatus | undefined;

  const attributes: Attribute[] = [];
  let statusAttr: Attribute | undefined;
  for (const attrNode of node.attributes) {
    const attr = decodeAttribute(attrNode);
    if (attr === null) continue;
    if (attr.key === 'status') {
      // `status` is a reserved concept owned by the keyword form; never carry
      // an attribute-form value into the IR. WL001 below describes the drop.
      statusAttr = attr;
      continue;
    }
    attributes.push(attr);
  }

  if (statusAttr !== undefined) {
    const attrValue =
      typeof statusAttr.value === 'string' ? statusAttr.value : JSON.stringify(statusAttr.value);
    if (status === undefined) {
      diagnostics.push({
        code: 'WL001',
        message: `resource '${id}' uses attribute form status = "${attrValue}"; use the keyword form instead (e.g. \`${type} ${id} ${attrValue} {}\`); attribute ignored`,
        severity: 'warning',
        file: node.span.document,
        line: node.span.startRow + 1,
        column: 0,
      });
    } else if (attrValue !== status) {
      diagnostics.push({
        code: 'WL001',
        message: `resource '${id}' declares status keyword '${status}' but also has attribute status = "${attrValue}"; keyword wins, attribute ignored`,
        severity: 'warning',
        file: node.span.document,
        line: node.span.startRow + 1,
        column: 0,
      });
    }
  }

  return {
    type,
    id,
    status,
    attributes,
    origin: toOrigin(node.span),
  };
}

/**
 * Decode syntax documents into one SirenDocument per source document.
 */
export function decodeSyntaxDocuments(syntaxDocuments: readonly SyntaxDocument[]): DecodeResult {
  const diagnostics: ParseDiagnostic[] = [];
  const sirenDocuments: SirenDocument[] = [];

  for (const syntaxDocument of syntaxDocuments) {
    const resources: Resource[] = [];
    for (const resourceNode of syntaxDocument.resources) {
      resources.push(decodeResource(resourceNode, diagnostics));
    }
    sirenDocuments.push({
      id: syntaxDocument.source.name,
      resources,
      directive: { implicitMilestone: false },
    });
  }

  const hasErrors = diagnostics.some((d) => d.severity === 'error');

  return {
    documents: hasErrors ? null : sirenDocuments,
    diagnostics,
    success: !hasErrors,
  };
}

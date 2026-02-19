/**
 * Concrete Syntax Tree (CST) node types
 *
 * These types mirror the tree-sitter grammar structure.
 * They represent the raw parse tree before semantic analysis.
 */

/**
 * Origin metadata for CST nodes
 *
 * Tracks source code position (byte and row offsets) for a node.
 * Used by formatters to preserve comments and structure.
 * Optional on nodes—early code doesn't require origin tracking.
 */
export interface Origin {
  readonly startByte: number;
  readonly endByte: number;
  readonly startRow: number;
  readonly endRow: number;
  /** Document identifier (e.g., relative file path from project root) */
  readonly document?: string;
}

/**
 * Base interface for all CST nodes
 *
 * Note: Position tracking (line/column) intentionally omitted until
 * diagnostics/error reporting are implemented. Will be added when needed.
 *
 * origin: Optional source code position metadata. Used by formatters
 * to preserve comments and track source structure. Early code doesn't
 * require this field.
 */
export interface CSTNode {
  readonly type: string;
  readonly origin?: Origin;
}

/**
 * Document root node
 */
export interface DocumentNode extends CSTNode {
  readonly type: 'document';
  readonly resources: readonly ResourceNode[];
}

/**
 * Resource block (task or milestone)
 */
export interface ResourceNode extends CSTNode {
  readonly type: 'resource';
  readonly resourceType: 'task' | 'milestone';
  readonly identifier: IdentifierNode;
  readonly body: readonly AttributeNode[];
  /**
   * True if the 'complete' keyword is present on this resource (set by parser)
   */
  readonly complete?: boolean;
}

/**
 * Identifier (bare or quoted)
 */
export interface IdentifierNode extends CSTNode {
  readonly type: 'identifier';
  readonly text: string;
  readonly value: string;
  readonly quoted: boolean;
}

/**
 * Attribute assignment (key = value)
 */
export interface AttributeNode extends CSTNode {
  readonly type: 'attribute';
  readonly key: IdentifierNode;
  readonly value: ExpressionNode;
}

/**
 * Expression types (right-hand side of attribute assignments)
 */
export type ExpressionNode = LiteralNode | ReferenceNode | ArrayNode;

/**
 * Literal values (string, number, boolean, null)
 */
export interface LiteralNode extends CSTNode {
  readonly type: 'literal';
  readonly text: string;
  readonly literalType: 'string' | 'number' | 'boolean' | 'null';
  readonly value: string | number | boolean | null;
}

/**
 * Reference to another resource
 */
export interface ReferenceNode extends CSTNode {
  readonly type: 'reference';
  readonly identifier: IdentifierNode;
}

/**
 * Array of expressions
 */
export interface ArrayNode extends CSTNode {
  readonly type: 'array';
  readonly elements: readonly ExpressionNode[];
}

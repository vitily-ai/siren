/**
 * Node.js ParserAdapter implementation using web-tree-sitter
 *
 * This is test infrastructure - NOT part of the public API.
 * Tests can use real WASM parsing without environment abstraction concerns.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Node as SyntaxNode, Tree } from 'web-tree-sitter';
import { Language, Parser } from 'web-tree-sitter';
import type {
  ParseError,
  ParseResult,
  ParserAdapter,
  SourceDocument,
} from '../../src/parser/adapter.js';
import type {
  ArrayNode,
  AttributeNode,
  DocumentNode,
  ExpressionNode,
  IdentifierNode,
  LiteralNode,
  Origin,
  ReferenceNode,
  ResourceNode,
} from '../../src/parser/cst.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Document boundary tracking for multi-document parsing
 */
interface DocumentBoundary {
  name: string;
  startByte: number;
  startRow: number;
}

/**
 * Extract origin metadata from a tree-sitter node with document adjustment
 */
function extractOrigin(node: SyntaxNode, boundary: DocumentBoundary): Origin {
  return {
    startByte: node.startIndex - boundary.startByte,
    endByte: node.endIndex - boundary.startByte,
    startRow: node.startPosition.row - boundary.startRow,
    endRow: node.endPosition.row - boundary.startRow,
    document: boundary.name,
  };
}

/**
 * Find the document boundary for a given byte offset.
 */
function findDocumentForByte(
  globalByte: number,
  boundaries: readonly DocumentBoundary[],
): DocumentBoundary {
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (boundaries[i].startByte <= globalByte) {
      return boundaries[i];
    }
  }
  return boundaries[0];
}

/**
 * Node-based ParserAdapter using web-tree-sitter
 */
class NodeParserAdapter implements ParserAdapter {
  private constructor(private readonly parser: Parser) {}

  /**
   * Create a fully-initialized NodeParserAdapter
   *
   * Loads tree-sitter WASM runtime and Siren grammar.
   */
  static async create(): Promise<NodeParserAdapter> {
    // Initialize web-tree-sitter WASM runtime
    await Parser.init();
    const parser = new Parser();

    // Load the Siren grammar WASM
    const wasmPath = join(__dirname, '../../grammar/tree-sitter-siren.wasm');
    const language = await Language.load(wasmPath);
    parser.setLanguage(language);

    return new NodeParserAdapter(parser);
  }

  async parse(documents: readonly SourceDocument[]): Promise<ParseResult> {
    // Build boundaries and concatenate documents
    const boundaries: DocumentBoundary[] = [];
    let concatenated = '';
    let currentByte = 0;
    let currentRow = 0;

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      boundaries.push({ name: doc.name, startByte: currentByte, startRow: currentRow });
      concatenated += doc.content;
      currentByte += Buffer.byteLength(doc.content, 'utf8');
      currentRow += doc.content.split('\n').length - 1;

      // Add separator between documents (except after last)
      if (i < documents.length - 1) {
        concatenated += '\n';
        currentByte += 1;
        currentRow += 1;
      }
    }

    const tree = this.parser.parse(concatenated) as Tree | null;
    if (!tree) {
      throw new Error('web-tree-sitter returned null tree');
    }

    const rootNode = tree.rootNode;

    // Collect parse errors first
    const errors = rootNode.hasError ? this.extractErrors(rootNode, boundaries) : [];

    // Convert tree-sitter tree to our CST
    // Even if there are errors, we attempt to convert what we can
    const documentNode = this.convertDocument(rootNode, boundaries);

    return {
      tree: documentNode,
      errors,
      success: !rootNode.hasError,
    };
  }

  /**
   * Convert tree-sitter document node to DocumentNode
   */
  private convertDocument(node: SyntaxNode, boundaries: readonly DocumentBoundary[]): DocumentNode {
    const resources: ResourceNode[] = [];

    for (const child of node.namedChildren) {
      if (child.type === 'resource') {
        const resource = this.convertResource(child, boundaries);
        if (resource) {
          resources.push(resource);
        }
      }
    }

    const boundary = findDocumentForByte(node.startIndex, boundaries);
    return {
      type: 'document',
      resources,
      origin: extractOrigin(node, boundary),
    };
  }

  /**
   * Convert tree-sitter resource node to ResourceNode
   */
  private convertResource(
    node: SyntaxNode,
    boundaries: readonly DocumentBoundary[],
  ): ResourceNode | null {
    const typeNode = node.childForFieldName('type');
    const idNode = node.childForFieldName('id');
    const completeModifierNode = node.childForFieldName('complete_modifier');

    if (!typeNode || !idNode) {
      return null;
    }

    const resourceType = typeNode.text as 'task' | 'milestone';
    const identifier = this.convertIdentifier(idNode, boundaries);
    const complete = completeModifierNode !== null;
    const attributes: AttributeNode[] = [];

    // Body is a repeat field - use childrenForFieldName to get all body attributes
    const bodyChildren = node.childrenForFieldName('body');
    for (const child of bodyChildren) {
      if (child.type === 'attribute') {
        const attr = this.convertAttribute(child, boundaries);
        if (attr) {
          attributes.push(attr);
        }
      }
    }

    const boundary = findDocumentForByte(node.startIndex, boundaries);
    return {
      type: 'resource',
      resourceType,
      identifier,
      complete,
      body: attributes,
      origin: extractOrigin(node, boundary),
    };
  }

  /**
   * Convert tree-sitter identifier node to IdentifierNode
   *
   * identifier is a wrapper node containing bare_identifier or quoted_identifier
   */
  private convertIdentifier(
    node: SyntaxNode,
    boundaries: readonly DocumentBoundary[],
  ): IdentifierNode {
    const boundary = findDocumentForByte(node.startIndex, boundaries);

    // Get the actual identifier child (bare or quoted)
    const child = node.namedChildren[0];
    if (!child) {
      return {
        type: 'identifier',
        value: node.text,
        quoted: false,
        text: node.text,
        origin: extractOrigin(node, boundary),
      };
    }

    const isQuoted = child.type === 'quoted_identifier';
    let value = child.text;

    // Strip quotes if quoted
    if (isQuoted && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    return {
      type: 'identifier',
      value,
      quoted: isQuoted,
      text: node.text,
      origin: extractOrigin(node, boundary),
    };
  }

  /**
   * Convert tree-sitter attribute node to AttributeNode
   */
  private convertAttribute(
    node: SyntaxNode,
    boundaries: readonly DocumentBoundary[],
  ): AttributeNode | null {
    const keyNode = node.childForFieldName('key');
    const valueNode = node.childForFieldName('value');

    if (!keyNode || !valueNode) {
      return null;
    }

    const boundary = findDocumentForByte(node.startIndex, boundaries);

    const key: IdentifierNode = {
      type: 'identifier',
      value: keyNode.text,
      quoted: false,
      text: keyNode.text,
      origin: extractOrigin(keyNode, boundary),
    };

    const value = this.convertExpression(valueNode, boundaries);
    if (!value) {
      return null;
    }

    return {
      type: 'attribute',
      key,
      value,
      origin: extractOrigin(node, boundary),
    };
  }

  /**
   * Convert tree-sitter expression node to ExpressionNode
   *
   * expression is a wrapper node containing literal/reference/array child
   */
  private convertExpression(
    node: SyntaxNode,
    boundaries: readonly DocumentBoundary[],
  ): ExpressionNode | null {
    // Expression is a wrapper - get the actual child
    if (node.type === 'expression') {
      const child = node.namedChildren[0];
      if (!child) return null;
      return this.convertExpression(child, boundaries);
    }

    switch (node.type) {
      case 'literal':
        return this.convertLiteral(node, boundaries);
      case 'reference':
        return this.convertReference(node, boundaries);
      case 'array':
        return this.convertArray(node, boundaries);
      case 'string_literal':
      case 'number_literal':
      case 'boolean_literal':
      case 'null_literal':
        return this.convertLiteralDirect(node, boundaries);
      case 'bare_identifier':
        // Bare identifier as expression is a reference
        return this.convertReference(node, boundaries);
      default:
        return null;
    }
  }

  /**
   * Convert tree-sitter literal node to LiteralNode
   */
  private convertLiteral(
    node: SyntaxNode,
    boundaries: readonly DocumentBoundary[],
  ): LiteralNode | null {
    // Literal is a choice node, get the actual literal child
    const child = node.namedChildren[0];
    if (!child) {
      return null;
    }

    return this.convertLiteralDirect(child, boundaries);
  }

  /**
   * Convert direct literal node types
   */
  private convertLiteralDirect(
    node: SyntaxNode,
    boundaries: readonly DocumentBoundary[],
  ): LiteralNode | null {
    const boundary = findDocumentForByte(node.startIndex, boundaries);
    const origin = extractOrigin(node, boundary);

    switch (node.type) {
      case 'string_literal': {
        let value = node.text;
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        return {
          type: 'literal',
          literalType: 'string',
          value,
          text: node.text,
          origin,
        };
      }

      case 'number_literal': {
        const value = parseFloat(node.text);
        return {
          type: 'literal',
          literalType: 'number',
          value,
          text: node.text,
          origin,
        };
      }

      case 'boolean_literal': {
        const value = node.text === 'true';
        return {
          type: 'literal',
          literalType: 'boolean',
          value,
          text: node.text,
          origin,
        };
      }

      case 'null_literal': {
        return {
          type: 'literal',
          literalType: 'null',
          value: null,
          text: node.text,
          origin,
        };
      }

      default:
        return null;
    }
  }

  /**
   * Convert tree-sitter reference node to ReferenceNode
   */
  private convertReference(
    node: SyntaxNode,
    boundaries: readonly DocumentBoundary[],
  ): ReferenceNode {
    const boundary = findDocumentForByte(node.startIndex, boundaries);

    const identifier: IdentifierNode = {
      type: 'identifier',
      value: node.text,
      quoted: false,
      text: node.text,
      origin: extractOrigin(node, boundary),
    };

    return {
      type: 'reference',
      identifier,
      origin: extractOrigin(node, boundary),
    };
  }

  /**
   * Convert tree-sitter array node to ArrayNode
   */
  private convertArray(node: SyntaxNode, boundaries: readonly DocumentBoundary[]): ArrayNode {
    const boundary = findDocumentForByte(node.startIndex, boundaries);
    const elements: ExpressionNode[] = [];

    for (const child of node.namedChildren) {
      const expr = this.convertExpression(child, boundaries);
      if (expr) {
        elements.push(expr);
      }
    }

    return {
      type: 'array',
      elements,
      origin: extractOrigin(node, boundary),
    };
  }

  /**
   * Extract parse errors from tree-sitter tree with document attribution
   */
  private extractErrors(node: SyntaxNode, boundaries: readonly DocumentBoundary[]): ParseError[] {
    const errors: ParseError[] = [];

    const walk = (n: SyntaxNode) => {
      if (n.type === 'ERROR' || n.isMissing) {
        const boundary = findDocumentForByte(n.startIndex, boundaries);
        const adjustedRow = n.startPosition.row - boundary.startRow;
        errors.push({
          message: n.isMissing ? `Missing ${n.type}` : 'Syntax error',
          line: adjustedRow + 1, // tree-sitter uses 0-based rows
          column: n.startPosition.column + 1, // tree-sitter uses 0-based columns
          document: boundary.name,
        });
      }

      for (const child of n.children) {
        walk(child);
      }
    };

    walk(node);
    return errors;
  }
}

/**
 * Create a fully-initialized Node ParserAdapter
 *
 * Use this async factory to get a ready-to-use adapter.
 * Tests should cache this using the test helper.
 */
export async function createNodeAdapter(): Promise<ParserAdapter> {
  return NodeParserAdapter.create();
}

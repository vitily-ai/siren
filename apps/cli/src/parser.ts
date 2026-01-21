/**
 * Node.js ParserAdapter implementation using web-tree-sitter
 *
 * Adapted from packages/core/test/helpers/node-adapter.ts
 * This is intentional duplication - CLI owns its runtime adapter.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ArrayNode,
  AttributeNode,
  DocumentNode,
  ExpressionNode,
  IdentifierNode,
  LiteralNode,
  ParseError,
  ParseResult,
  ParserAdapter,
  ReferenceNode,
  ResourceNode,
} from '@siren/core';
import type { Node as SyntaxNode, Tree } from 'web-tree-sitter';
import { Language, Parser } from 'web-tree-sitter';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

    // Load the Siren grammar WASM from the core package
    // In dev: resolve from workspace source
    // In prod: shipped alongside CLI dist
    const wasmPath = join(__dirname, '../../../packages/core/grammar/tree-sitter-siren.wasm');
    const language = await Language.load(wasmPath);
    parser.setLanguage(language);

    return new NodeParserAdapter(parser);
  }

  async parse(source: string): Promise<ParseResult> {
    const tree = this.parser.parse(source) as Tree | null;
    if (!tree) {
      throw new Error('web-tree-sitter returned null tree');
    }

    const rootNode = tree.rootNode;

    // Collect parse errors first
    const errors = rootNode.hasError ? this.extractErrors(rootNode) : [];

    // Convert tree-sitter tree to our CST
    // Even if there are errors, we attempt to convert what we can
    const documentNode = this.convertDocument(rootNode);

    return {
      tree: documentNode,
      errors,
      success: !rootNode.hasError,
    };
  }

  /**
   * Convert tree-sitter document node to DocumentNode
   */
  private convertDocument(node: SyntaxNode): DocumentNode {
    const resources: ResourceNode[] = [];

    for (const child of node.namedChildren) {
      if (child.type === 'resource') {
        const resource = this.convertResource(child);
        if (resource) {
          resources.push(resource);
        }
      }
    }

    return {
      type: 'document',
      resources,
    };
  }

  /**
   * Convert tree-sitter resource node to ResourceNode
   */
  private convertResource(node: SyntaxNode): ResourceNode | null {
    const typeNode = node.childForFieldName('type');
    const idNode = node.childForFieldName('id');

    if (!typeNode || !idNode) {
      return null;
    }

    const resourceType = typeNode.text as 'task' | 'milestone';
    const identifier = this.convertIdentifier(idNode);
    const attributes: AttributeNode[] = [];

    // Body is a repeat field - use childrenForFieldName to get all body attributes
    const bodyChildren = node.childrenForFieldName('body');
    for (const child of bodyChildren) {
      if (child.type === 'attribute') {
        const attr = this.convertAttribute(child);
        if (attr) {
          attributes.push(attr);
        }
      }
    }

    return {
      type: 'resource',
      resourceType,
      identifier,
      body: attributes,
    };
  }

  /**
   * Convert tree-sitter identifier node to IdentifierNode
   *
   * identifier is a wrapper node containing bare_identifier or quoted_identifier
   */
  private convertIdentifier(node: SyntaxNode): IdentifierNode {
    // Get the actual identifier child (bare or quoted)
    const child = node.namedChildren[0];
    if (!child) {
      return {
        type: 'identifier',
        value: node.text,
        quoted: false,
        text: node.text,
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
    };
  }

  /**
   * Convert tree-sitter attribute node to AttributeNode
   */
  private convertAttribute(node: SyntaxNode): AttributeNode | null {
    const keyNode = node.childForFieldName('key');
    const valueNode = node.childForFieldName('value');

    if (!keyNode || !valueNode) {
      return null;
    }

    const key: IdentifierNode = {
      type: 'identifier',
      value: keyNode.text,
      quoted: false,
      text: keyNode.text,
    };

    const value = this.convertExpression(valueNode);
    if (!value) {
      return null;
    }

    return {
      type: 'attribute',
      key,
      value,
    };
  }

  /**
   * Convert tree-sitter expression node to ExpressionNode
   *
   * expression is a wrapper node containing literal/reference/array child
   */
  private convertExpression(node: SyntaxNode): ExpressionNode | null {
    // Expression is a wrapper - get the actual child
    if (node.type === 'expression') {
      const child = node.namedChildren[0];
      if (!child) return null;
      return this.convertExpression(child);
    }

    switch (node.type) {
      case 'literal':
        return this.convertLiteral(node);
      case 'reference':
        return this.convertReference(node);
      case 'array':
        return this.convertArray(node);
      case 'string_literal':
      case 'number_literal':
      case 'boolean_literal':
      case 'null_literal':
        return this.convertLiteralDirect(node);
      case 'bare_identifier':
        // Bare identifier as expression is a reference
        return this.convertReference(node);
      default:
        return null;
    }
  }

  /**
   * Convert tree-sitter literal node to LiteralNode
   */
  private convertLiteral(node: SyntaxNode): LiteralNode | null {
    // Literal is a choice node, get the actual literal child
    const child = node.namedChildren[0];
    if (!child) {
      return null;
    }

    return this.convertLiteralDirect(child);
  }

  /**
   * Convert direct literal node types
   */
  private convertLiteralDirect(node: SyntaxNode): LiteralNode | null {
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
        };
      }

      case 'number_literal': {
        const value = parseFloat(node.text);
        return {
          type: 'literal',
          literalType: 'number',
          value,
          text: node.text,
        };
      }

      case 'boolean_literal': {
        const value = node.text === 'true';
        return {
          type: 'literal',
          literalType: 'boolean',
          value,
          text: node.text,
        };
      }

      case 'null_literal': {
        return {
          type: 'literal',
          literalType: 'null',
          value: null,
          text: node.text,
        };
      }

      default:
        return null;
    }
  }

  /**
   * Convert tree-sitter reference node to ReferenceNode
   */
  private convertReference(node: SyntaxNode): ReferenceNode {
    const identifier: IdentifierNode = {
      type: 'identifier',
      value: node.text,
      quoted: false,
      text: node.text,
    };

    return {
      type: 'reference',
      identifier,
    };
  }

  /**
   * Convert tree-sitter array node to ArrayNode
   */
  private convertArray(node: SyntaxNode): ArrayNode {
    const elements: ExpressionNode[] = [];

    for (const child of node.namedChildren) {
      const expr = this.convertExpression(child);
      if (expr) {
        elements.push(expr);
      }
    }

    return {
      type: 'array',
      elements,
    };
  }

  /**
   * Extract parse errors from tree-sitter tree
   */
  private extractErrors(node: SyntaxNode): ParseError[] {
    const errors: ParseError[] = [];

    const walk = (n: SyntaxNode) => {
      if (n.type === 'ERROR' || n.isMissing) {
        errors.push({
          message: n.isMissing ? `Missing ${n.type}` : 'Syntax error',
          line: n.startPosition.row + 1, // tree-sitter uses 0-based rows
          column: n.startPosition.column + 1, // tree-sitter uses 0-based columns
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

// Singleton adapter instance (lazy-initialized)
let adapterInstance: ParserAdapter | null = null;

/**
 * Get the singleton parser adapter instance
 *
 * Initializes on first call, reuses thereafter.
 */
export async function getParser(): Promise<ParserAdapter> {
  if (!adapterInstance) {
    adapterInstance = await NodeParserAdapter.create();
  }
  return adapterInstance;
}

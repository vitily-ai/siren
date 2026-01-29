/**
 * Node.js ParserAdapter implementation using web-tree-sitter
 *
 * Owned by the CLI app so runtime dependency on `web-tree-sitter` stays
 * inside `apps/cli` rather than leaking into `packages/core`.
 */

import { existsSync } from 'node:fs';
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

export class NodeParserAdapter implements ParserAdapter {
  private constructor(private readonly parser: Parser) {}

  static async create(): Promise<NodeParserAdapter> {
    await Parser.init();
    const parser = new Parser();

    // Resolve WASM shipped in packages/core/grammar. Built output (`dist`) may
    // sit in a different sibling (dist vs src) so try a small set of candidate
    // relative paths and pick the first that exists. This keeps the CLI
    // resilient to the ESM build output layout.
    const candidates = [
      join(__dirname, '../../../../packages/core/grammar/tree-sitter-siren.wasm'), // source layout
      join(__dirname, '../../../packages/core/grammar/tree-sitter-siren.wasm'), // built (dist) layout
      join(__dirname, '../../packages/core/grammar/tree-sitter-siren.wasm'),
    ];

    let wasmPath: string | undefined;
    for (const c of candidates) {
      if (existsSync(c)) {
        wasmPath = c;
        break;
      }
    }
    if (!wasmPath) {
      // Fall back to the first candidate; Language.load will surface a clear
      // error if the file is missing. This preserves the previous behavior
      // while making success more likely in common layouts.
      wasmPath = candidates[0];
    }

    const language = await Language.load(wasmPath);
    parser.setLanguage(language);

    return new NodeParserAdapter(parser);
  }

  async parse(source: string): Promise<ParseResult> {
    const tree = this.parser.parse(source) as Tree | null;
    if (!tree) throw new Error('web-tree-sitter returned null tree');

    const rootNode = tree.rootNode;
    const errors = rootNode.hasError ? this.extractErrors(rootNode) : [];
    const documentNode = this.convertDocument(rootNode);

    return {
      tree: documentNode,
      errors,
      success: !rootNode.hasError,
    };
  }

  private convertDocument(node: SyntaxNode): DocumentNode {
    const resources: ResourceNode[] = [];
    for (const child of node.namedChildren) {
      if (child.type === 'resource') {
        const resource = this.convertResource(child);
        if (resource) resources.push(resource);
      }
    }

    return { type: 'document', resources };
  }

  private convertResource(node: SyntaxNode): ResourceNode | null {
    const typeNode = node.childForFieldName('type');
    const idNode = node.childForFieldName('id');
    const completeModifierNode = node.childForFieldName('complete_modifier');

    if (!typeNode || !idNode) return null;

    const resourceType = typeNode.text as 'task' | 'milestone';
    const identifier = this.convertIdentifier(idNode);
    const complete = completeModifierNode !== null;
    const attributes: AttributeNode[] = [];

    const bodyChildren = node.childrenForFieldName('body');
    for (const child of bodyChildren) {
      if (child.type === 'attribute') {
        const attr = this.convertAttribute(child);
        if (attr) attributes.push(attr);
      }
    }

    return {
      type: 'resource',
      resourceType,
      identifier,
      complete,
      body: attributes,
    };
  }

  private convertIdentifier(node: SyntaxNode): IdentifierNode {
    const child = node.namedChildren[0];
    if (!child) {
      return { type: 'identifier', value: node.text, quoted: false, text: node.text };
    }

    const isQuoted = child.type === 'quoted_identifier';
    let value = child.text;
    if (isQuoted && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);

    return { type: 'identifier', value, quoted: isQuoted, text: node.text };
  }

  private convertAttribute(node: SyntaxNode): AttributeNode | null {
    const keyNode = node.childForFieldName('key');
    const valueNode = node.childForFieldName('value');
    if (!keyNode || !valueNode) return null;

    const key: IdentifierNode = {
      type: 'identifier',
      value: keyNode.text,
      quoted: false,
      text: keyNode.text,
    };
    const value = this.convertExpression(valueNode);
    if (!value) return null;

    return { type: 'attribute', key, value };
  }

  private convertExpression(node: SyntaxNode): ExpressionNode | null {
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
        return this.convertReference(node);
      default:
        return null;
    }
  }

  private convertLiteral(node: SyntaxNode): LiteralNode | null {
    const child = node.namedChildren[0];
    if (!child) return null;
    return this.convertLiteralDirect(child);
  }

  private convertLiteralDirect(node: SyntaxNode): LiteralNode | null {
    switch (node.type) {
      case 'string_literal': {
        let value = node.text;
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        return { type: 'literal', literalType: 'string', value, text: node.text };
      }
      case 'number_literal': {
        const value = parseFloat(node.text);
        return { type: 'literal', literalType: 'number', value, text: node.text };
      }
      case 'boolean_literal': {
        const value = node.text === 'true';
        return { type: 'literal', literalType: 'boolean', value, text: node.text };
      }
      case 'null_literal': {
        return { type: 'literal', literalType: 'null', value: null, text: node.text };
      }
      default:
        return null;
    }
  }

  private convertReference(node: SyntaxNode): ReferenceNode {
    const identifier: IdentifierNode = {
      type: 'identifier',
      value: node.text,
      quoted: false,
      text: node.text,
    };
    return { type: 'reference', identifier };
  }

  private convertArray(node: SyntaxNode): ArrayNode {
    const elements: ExpressionNode[] = [];
    for (const child of node.namedChildren) {
      const expr = this.convertExpression(child);
      if (expr) elements.push(expr);
    }
    return { type: 'array', elements };
  }

  private extractErrors(node: SyntaxNode): ParseError[] {
    const errors: ParseError[] = [];

    const walk = (n: SyntaxNode) => {
      if (n.type === 'ERROR' || n.isMissing) {
        errors.push({
          message: n.isMissing ? `Missing ${n.type}` : 'Syntax error',
          line: n.startPosition.row + 1,
          column: n.startPosition.column + 1,
        });
      }
      for (const child of n.children) walk(child);
    };

    walk(node);
    return errors;
  }
}

// Singleton adapter instance (lazy-initialized)
let adapterInstance: ParserAdapter | null = null;

export async function getNodeParser(): Promise<ParserAdapter> {
  if (!adapterInstance) {
    adapterInstance = await NodeParserAdapter.create();
  }
  return adapterInstance;
}

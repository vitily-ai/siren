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
  CommentToken,
  DocumentNode,
  ExpressionNode,
  IdentifierNode,
  LiteralNode,
  Origin,
  ParseError,
  ParseResult,
  ParserAdapter,
  ReferenceNode,
  ResourceNode,
  SourceDocument,
} from '@siren/core';
import type { Node as SyntaxNode, Tree } from 'web-tree-sitter';
import { Language, Parser } from 'web-tree-sitter';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Document boundary tracking for multi-document parsing
 */
interface DocumentBoundary {
  name: string;
  startByte: number;
  startRow: number;
}

export class NodeParserAdapter implements ParserAdapter {
  private constructor(private readonly parser: Parser) {}

  private scanToken(source: string, index: number): { token: string; length: number } {
    let i = index;
    while (i < source.length && /\s/u.test(source[i]!)) i++;
    if (i >= source.length) return { token: 'EOF', length: 1 };

    const ch = source[i]!;

    if (ch === '"') {
      let j = i + 1;
      while (j < source.length && source[j] !== '"') j++;
      if (j < source.length) j++;
      const token = source.slice(i, j);
      return { token, length: Math.max(1, token.length) };
    }

    if (/[a-zA-Z_]/u.test(ch)) {
      let j = i + 1;
      while (j < source.length && /[a-zA-Z0-9_-]/u.test(source[j]!)) j++;
      const token = source.slice(i, j);
      return { token, length: Math.max(1, token.length) };
    }

    if (/[0-9]/u.test(ch)) {
      let j = i + 1;
      while (j < source.length && /[0-9]/u.test(source[j]!)) j++;
      if (j < source.length && source[j] === '.') {
        j++;
        while (j < source.length && /[0-9]/u.test(source[j]!)) j++;
      }
      const token = source.slice(i, j);
      return { token, length: Math.max(1, token.length) };
    }

    // Punctuation / other: consume a short run until whitespace or an identifier/number starts.
    let j = i + 1;
    while (
      j < source.length &&
      !/\s/u.test(source[j]!) &&
      !/[a-zA-Z0-9_"]/u.test(source[j]!) &&
      j - i < 16
    ) {
      j++;
    }
    const token = source.slice(i, j);
    return { token, length: Math.max(1, token.length) };
  }

  private formatExpectedList(expected: readonly string[]): string {
    const items = expected.map((e) => `'${e}'`);
    if (items.length === 0) return '';
    if (items.length === 1) return items[0]!;
    if (items.length === 2) return `${items[0]} or ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
  }

  private isMissingResourceId(node: SyntaxNode): boolean {
    if (node.type !== 'bare_identifier' || !node.isMissing) return false;
    if (node.parent?.type !== 'identifier') return false;
    let cur: SyntaxNode | null = node.parent;
    while (cur) {
      if (cur.type === 'resource') return true;
      cur = cur.parent;
    }
    return false;
  }

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
      // web-tree-sitter indices are JS string offsets, not UTF-8 byte offsets.
      currentByte += doc.content.length;
      currentRow += doc.content.split('\n').length - 1;

      // Add separator between documents (except after last)
      if (i < documents.length - 1) {
        concatenated += '\n';
        currentByte += 1;
        currentRow += 1;
      }
    }

    const tree = this.parser.parse(concatenated) as Tree | null;
    if (!tree) throw new Error('web-tree-sitter returned null tree');

    const rootNode = tree.rootNode;
    const errors = rootNode.hasError ? this.extractErrors(rootNode, boundaries, documents) : [];
    const documentNode = this.convertDocument(rootNode, boundaries);
    const comments = this.extractComments(rootNode, concatenated, boundaries);

    return {
      tree: documentNode,
      errors,
      success: !rootNode.hasError,
      comments,
    };
  }

  /**
   * Find the document boundary for a given byte offset.
   * Returns the last boundary where startByte <= globalByte.
   */
  private findDocumentForByte(
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
   * Adjust global origin to per-document coordinates.
   */
  private adjustOrigin(globalOrigin: Origin, boundary: DocumentBoundary): Origin {
    return {
      startByte: globalOrigin.startByte - boundary.startByte,
      endByte: globalOrigin.endByte - boundary.startByte,
      startRow: globalOrigin.startRow - boundary.startRow,
      endRow: globalOrigin.endRow - boundary.startRow,
      document: boundary.name,
    };
  }

  /**
   * Get origin from node with document boundary adjustment.
   */
  private getOrigin(node: SyntaxNode, boundaries: readonly DocumentBoundary[]): Origin {
    const globalOrigin: Origin = {
      startByte: node.startIndex,
      endByte: node.endIndex,
      startRow: node.startPosition.row,
      endRow: node.endPosition.row,
    };
    const boundary = this.findDocumentForByte(node.startIndex, boundaries);
    return this.adjustOrigin(globalOrigin, boundary);
  }

  private convertDocument(node: SyntaxNode, boundaries: readonly DocumentBoundary[]): DocumentNode {
    const resources: ResourceNode[] = [];
    for (const child of node.namedChildren) {
      if (child.type === 'resource') {
        const resource = this.convertResource(child, boundaries);
        if (resource) resources.push(resource);
      }
    }

    return {
      type: 'document',
      resources,
      origin: this.getOrigin(node, boundaries),
    };
  }

  private convertResource(
    node: SyntaxNode,
    boundaries: readonly DocumentBoundary[],
  ): ResourceNode | null {
    const typeNode = node.childForFieldName('type');
    const idNode = node.childForFieldName('id');
    const completeModifierNode = node.childForFieldName('complete_modifier');

    if (!typeNode || !idNode) return null;

    const resourceType = typeNode.text as 'task' | 'milestone';
    const identifier = this.convertIdentifier(idNode, boundaries);
    const complete = completeModifierNode !== null;
    const attributes: AttributeNode[] = [];

    const bodyChildren = node.childrenForFieldName('body');
    for (const child of bodyChildren) {
      if (child.type === 'attribute') {
        const attr = this.convertAttribute(child, boundaries);
        if (attr) attributes.push(attr);
      }
    }

    return {
      type: 'resource',
      resourceType,
      identifier,
      complete,
      body: attributes,
      origin: this.getOrigin(node, boundaries),
    };
  }

  private convertIdentifier(
    node: SyntaxNode,
    boundaries: readonly DocumentBoundary[],
  ): IdentifierNode {
    const child = node.namedChildren[0];
    if (!child) {
      return {
        type: 'identifier',
        value: node.text,
        quoted: false,
        text: node.text,
        origin: this.getOrigin(node, boundaries),
      };
    }

    const isQuoted = child.type === 'quoted_identifier';
    let value = child.text;
    if (isQuoted && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);

    return {
      type: 'identifier',
      value,
      quoted: isQuoted,
      text: node.text,
      origin: this.getOrigin(node, boundaries),
    };
  }

  private convertAttribute(
    node: SyntaxNode,
    boundaries: readonly DocumentBoundary[],
  ): AttributeNode | null {
    const keyNode = node.childForFieldName('key');
    const valueNode = node.childForFieldName('value');
    if (!keyNode || !valueNode) return null;

    const key: IdentifierNode = {
      type: 'identifier',
      value: keyNode.text,
      quoted: false,
      text: keyNode.text,
    };
    const value = this.convertExpression(valueNode, boundaries);
    if (!value) return null;

    return {
      type: 'attribute',
      key,
      value,
      origin: this.getOrigin(node, boundaries),
    };
  }

  private convertExpression(
    node: SyntaxNode,
    boundaries: readonly DocumentBoundary[],
  ): ExpressionNode | null {
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
        return this.convertReference(node, boundaries);
      default:
        return null;
    }
  }

  private convertLiteral(
    node: SyntaxNode,
    boundaries: readonly DocumentBoundary[],
  ): LiteralNode | null {
    const child = node.namedChildren[0];
    if (!child) return null;
    return this.convertLiteralDirect(child, boundaries);
  }

  private convertLiteralDirect(
    node: SyntaxNode,
    boundaries: readonly DocumentBoundary[],
  ): LiteralNode | null {
    switch (node.type) {
      case 'string_literal': {
        let value = node.text;
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        return {
          type: 'literal',
          literalType: 'string',
          value,
          text: node.text,
          origin: this.getOrigin(node, boundaries),
        };
      }
      case 'number_literal': {
        const value = parseFloat(node.text);
        return {
          type: 'literal',
          literalType: 'number',
          value,
          text: node.text,
          origin: this.getOrigin(node, boundaries),
        };
      }
      case 'boolean_literal': {
        const value = node.text === 'true';
        return {
          type: 'literal',
          literalType: 'boolean',
          value,
          text: node.text,
          origin: this.getOrigin(node, boundaries),
        };
      }
      case 'null_literal': {
        return {
          type: 'literal',
          literalType: 'null',
          value: null,
          text: node.text,
          origin: this.getOrigin(node, boundaries),
        };
      }
      default:
        return null;
    }
  }

  private convertReference(
    node: SyntaxNode,
    boundaries: readonly DocumentBoundary[],
  ): ReferenceNode {
    const identifier: IdentifierNode = {
      type: 'identifier',
      value: node.text,
      quoted: false,
      text: node.text,
    };
    return {
      type: 'reference',
      identifier,
      origin: this.getOrigin(node, boundaries),
    };
  }

  private convertArray(node: SyntaxNode, boundaries: readonly DocumentBoundary[]): ArrayNode {
    const elements: ExpressionNode[] = [];
    for (const child of node.namedChildren) {
      const expr = this.convertExpression(child, boundaries);
      if (expr) elements.push(expr);
    }
    return {
      type: 'array',
      elements,
      origin: this.getOrigin(node, boundaries),
    };
  }

  private extractErrors(
    node: SyntaxNode,
    boundaries: readonly DocumentBoundary[],
    documents: readonly SourceDocument[],
  ): ParseError[] {
    const sourceByDoc = new Map<string, string>();
    for (const doc of documents) sourceByDoc.set(doc.name, doc.content);

    const errors: ParseError[] = [];
    const seen = new Set<string>();

    const emit = (error: ParseError) => {
      const key = `${error.document ?? 'unknown'}:${error.line}:${error.column}:${error.message}`;
      if (seen.has(key)) return;
      seen.add(key);
      errors.push(error);
    };

    const topLevelExpected = ['task', 'milestone'] as const;

    const walk = (n: SyntaxNode) => {
      const isLeafError = n.type === 'ERROR' && !n.children.some((c) => c.type === 'ERROR');

      if (n.isMissing) {
        const boundary = this.findDocumentForByte(n.startIndex, boundaries);
        const adjustedRow = n.startPosition.row - boundary.startRow;
        const localStartByte = n.startIndex - boundary.startByte;
        const expectedToken =
          n.type === '}'
            ? '}'
            : n.type === ']'
              ? ']'
              : n.type === 'bare_identifier'
                ? this.isMissingResourceId(n)
                  ? 'identifier after resource type'
                  : 'expression'
                : n.type;
        emit({
          severity: 'error',
          kind: 'missing_token',
          message: `expected ${expectedToken}`,
          expected: [expectedToken],
          line: adjustedRow + 1,
          column: n.startPosition.column + 1,
          document: boundary.name,
          startByte: localStartByte,
          endByte: localStartByte,
        });
      } else if (isLeafError) {
        const boundary = this.findDocumentForByte(n.startIndex, boundaries);
        const adjustedRow = n.startPosition.row - boundary.startRow;
        const localStartByte = n.startIndex - boundary.startByte;
        const source = sourceByDoc.get(boundary.name) ?? '';
        const { token: found, length } = this.scanToken(source, localStartByte);

        let nearestNonErrorParent: SyntaxNode | null = n.parent;
        while (nearestNonErrorParent && nearestNonErrorParent.type === 'ERROR') {
          nearestNonErrorParent = nearestNonErrorParent.parent;
        }
        const isTopLevel = !nearestNonErrorParent || nearestNonErrorParent.type === 'document';
        const expected = isTopLevel ? [...topLevelExpected] : [];

        const parent = n.parent;
        const isDuplicateComplete =
          found === 'complete' &&
          parent?.type === 'resource' &&
          parent.childForFieldName('complete_modifier') !== null;

        const message = isDuplicateComplete
          ? `duplicate 'complete' keyword; expected '{'`
          : expected.length > 0
            ? `unexpected token '${found}'; expected ${this.formatExpectedList(expected)}`
            : `unexpected token '${found}'`;

        emit({
          severity: isDuplicateComplete ? 'warning' : 'error',
          kind: 'unexpected_token',
          message,
          found,
          expected: isDuplicateComplete ? ['{'] : expected,
          line: adjustedRow + 1,
          column: n.startPosition.column + 1,
          document: boundary.name,
          startByte: localStartByte,
          endByte: Math.min(localStartByte + length, source.length),
        });

        // Cross-document ERROR splitting: if an error span crosses document boundaries,
        // emit an additional top-level error at each subsequent document start.
        for (const b of boundaries) {
          if (b.startByte <= n.startIndex) continue;
          if (b.startByte >= n.endIndex) continue;
          const docSource = sourceByDoc.get(b.name) ?? '';
          const scanned = this.scanToken(docSource, 0);
          emit({
            severity: 'error',
            kind: 'unexpected_token',
            message: `unexpected token '${scanned.token}'; expected ${this.formatExpectedList([
              ...topLevelExpected,
            ])}`,
            found: scanned.token,
            expected: [...topLevelExpected],
            line: 1,
            column: 1,
            document: b.name,
            startByte: 0,
            endByte: Math.min(scanned.length, docSource.length),
          });
        }
      }
      for (const child of n.children) walk(child);
    };

    walk(node);
    return errors;
  }

  /**
   * Extract comment tokens from the parse tree with document attribution.
   */
  private extractComments(
    rootNode: SyntaxNode,
    source: string,
    boundaries: readonly DocumentBoundary[],
  ): CommentToken[] {
    const comments: CommentToken[] = [];
    const commentNodes = rootNode.descendantsOfType('comment');

    for (const commentNode of commentNodes) {
      const boundary = this.findDocumentForByte(commentNode.startIndex, boundaries);
      comments.push({
        startByte: commentNode.startIndex - boundary.startByte,
        endByte: commentNode.endIndex - boundary.startByte,
        startRow: commentNode.startPosition.row - boundary.startRow,
        endRow: commentNode.endPosition.row - boundary.startRow,
        text: source.slice(commentNode.startIndex, commentNode.endIndex),
        document: boundary.name,
      });
    }

    // Sort comments by document, then byte offset
    comments.sort((a, b) => {
      if (a.document !== b.document) {
        return (a.document ?? '').localeCompare(b.document ?? '');
      }
      return a.startByte - b.startByte;
    });

    return comments;
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

/**
 * Parser factory with injectable WASM loader.
 *
 * This module is environment-agnostic and must not import runtime-specific
 * packages such as `web-tree-sitter`. Hosts supply a `loadWasm` function
 * that returns a minimal Language-like object.
 */

import type {
  CommentToken,
  ParseError,
  ParseResult,
  ParserAdapter,
  SourceDocument,
} from './adapter.js';
import type {
  ArrayNode,
  AttributeNode,
  DocumentNode,
  ExpressionNode,
  IdentifierNode,
  LiteralNode,
  ReferenceNode,
  ResourceNode,
} from './cst.js';

// Minimal structural types describing host-provided parser/runtime.
export interface ParserLike {
  parse(source: string): unknown; // returns a tree with rootNode-like shape
}

export interface LanguageLike {
  // Host should return an object that can produce a ParserLike instance.
  createParser(): ParserLike;
}

export interface ParserFactoryInit {
  /**
   * Load the WASM runtime and grammar. Called with the wasm path.
   */
  loadWasm(wasmPath: string): Promise<LanguageLike>;

  /** Optional path to the Siren WASM grammar. If omitted the factory will
   * try a sensible package-relative default path. Hosts should pass a
   * concrete path when running in Node environments. */
  wasmPath?: string;
}

/**
 * Create a ParserAdapter by injecting a WASM loader.
 *
 * The returned object implements the `ParserAdapter` interface used by the
 * rest of the core package.
 */
export async function createParserFactory(init: ParserFactoryInit): Promise<ParserAdapter> {
  // Default to a package-relative URL based on this module's location.
  // Hosts (CLI/Web) should prefer to pass a concrete `wasmPath` appropriate
  // for their runtime (filesystem path or asset URL). This fallback is a
  // best-effort convenience for local/dev runs and ESM-aware environments.
  // `import.meta.url` and the global `URL` constructor may not have TypeScript
  // types available in all environments (core is environment-agnostic). Use
  // runtime-safe access via `any` to avoid TS errors while still computing a
  // sensible package-relative fallback in ESM-capable runtimes.
  let defaultWasmUrl: string | undefined;
  try {
    const metaUrl = (import.meta as unknown as { url?: string }).url;
    const URLCtor = (
      globalThis as unknown as {
        URL?: { new (path: string, base?: string): { href: string } };
      }
    ).URL;
    if (metaUrl && URLCtor) {
      defaultWasmUrl = new URLCtor('../../grammar/tree-sitter-siren.wasm', metaUrl).href;
    }
  } catch {
    // ignore and leave defaultWasmUrl undefined; fallback to raw relative
    // string to preserve tolerant UX in non-ESM environments.
  }

  const wasmPath = init.wasmPath ?? defaultWasmUrl ?? '../../grammar/tree-sitter-siren.wasm';

  const language = await init.loadWasm(wasmPath);
  const parser = language.createParser();

  // Document boundary tracking for multi-document parsing
  interface DocumentBoundary {
    name: string;
    startByte: number;
    startRow: number;
  }

  // Lightweight structural shape for parser runtime nodes. Keep explicit
  // optional properties so callers can use dot-access without `any`.
  interface NodeLike {
    type?: string;
    text?: string;
    namedChildren?: NodeLike[];
    parent?: NodeLike;
    startPosition?: { row?: number; column?: number };
    endPosition?: { row?: number };
    startIndex?: number;
    endIndex?: number;
    childForFieldName?: (s: string) => NodeLike | undefined;
    childrenForFieldName?: (s: string) => NodeLike[];
    children?: NodeLike[];
    isMissing?: boolean;
    hasError?: boolean;
    descendantsOfType?: (type: string | string[]) => NodeLike[];
  }

  function scanToken(source: string, index: number): { token: string; length: number } {
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

  function formatExpectedList(expected: readonly string[]): string {
    const items = expected.map((e) => `'${e}'`);
    if (items.length === 0) return '';
    if (items.length === 1) return items[0]!;
    if (items.length === 2) return `${items[0]} or ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
  }

  function isMissingResourceId(node: NodeLike): boolean {
    if (String(node.type ?? '') !== 'bare_identifier' || !node.isMissing) return false;
    if (String(node.parent?.type ?? '') !== 'identifier') return false;
    let cur: NodeLike | undefined = node.parent;
    while (cur) {
      if (String(cur.type ?? '') === 'resource') return true;
      cur = cur.parent;
    }
    return false;
  }

  // Conversion helpers adapted from the Node test adapter. Keep logic here
  // so core owns the CST shape while the runtime provides parsing only.

  /**
   * Extract origin metadata from a tree-sitter node with document adjustment
   */
  function extractOrigin(node: NodeLike | undefined, boundary: DocumentBoundary) {
    if (!node) return undefined;
    const startPos = node.startPosition;
    const endPos = node.endPosition;
    if (!startPos || !endPos) return undefined;
    return {
      startByte: (Number(node.startIndex ?? 0) as number) - boundary.startByte,
      endByte: (Number(node.endIndex ?? 0) as number) - boundary.startByte,
      startRow: (Number(startPos.row ?? 0) as number) - boundary.startRow,
      endRow: (Number(endPos.row ?? 0) as number) - boundary.startRow,
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
      const boundary = boundaries[i];
      if (boundary && boundary.startByte <= globalByte) {
        return boundary;
      }
    }
    return boundaries[0] ?? { name: 'unknown', startByte: 0, startRow: 0 };
  }

  function convertIdentifier(node: NodeLike, boundary: DocumentBoundary): IdentifierNode {
    const child = node.namedChildren?.[0];
    if (!child) {
      return {
        type: 'identifier',
        value: node ? String(node.text ?? '') : '',
        quoted: false,
        text: node ? String(node.text ?? '') : '',
        origin: extractOrigin(node, boundary),
      };
    }

    const isQuoted = String(child.type ?? '') === 'quoted_identifier';
    let value = String(child.text ?? '');
    if (isQuoted && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    return {
      type: 'identifier',
      value,
      quoted: isQuoted,
      text: String(node.text ?? ''),
      origin: extractOrigin(node, boundary),
    };
  }

  function convertLiteralDirect(node: NodeLike, boundary: DocumentBoundary): LiteralNode | null {
    const origin = extractOrigin(node, boundary);
    switch (String(node.type ?? '')) {
      case 'string_literal': {
        let value = String(node.text ?? '');
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        return {
          type: 'literal',
          literalType: 'string',
          value,
          text: String(node.text ?? ''),
          origin,
        };
      }
      case 'number_literal': {
        const value = parseFloat(String(node.text ?? ''));
        return {
          type: 'literal',
          literalType: 'number',
          value,
          text: String(node.text ?? ''),
          origin,
        };
      }
      case 'boolean_literal': {
        const value = String(node.text) === 'true';
        return {
          type: 'literal',
          literalType: 'boolean',
          value,
          text: String(node.text ?? ''),
          origin,
        };
      }
      case 'null_literal':
        return {
          type: 'literal',
          literalType: 'null',
          value: null,
          text: String(node.text ?? ''),
          origin,
        };
      default:
        return null;
    }
  }

  function convertReference(node: NodeLike, boundary: DocumentBoundary): ReferenceNode {
    const identifier: IdentifierNode = {
      type: 'identifier',
      value: String(node.text ?? ''),
      quoted: false,
      text: String(node.text ?? ''),
      origin: extractOrigin(node, boundary),
    };
    return { type: 'reference', identifier, origin: extractOrigin(node, boundary) };
  }

  function convertArray(node: NodeLike, boundary: DocumentBoundary): ArrayNode {
    const elements: ExpressionNode[] = [];
    for (const child of node.namedChildren ?? []) {
      const expr = convertExpression(child, boundary);
      if (expr) elements.push(expr);
    }
    return { type: 'array', elements, origin: extractOrigin(node, boundary) };
  }

  function convertLiteral(node: NodeLike, boundary: DocumentBoundary): LiteralNode | null {
    const child = node.namedChildren?.[0];
    if (!child) return null;
    return convertLiteralDirect(child, boundary);
  }

  function convertExpression(
    node: NodeLike | undefined,
    boundary: DocumentBoundary,
  ): ExpressionNode | null {
    if (!node) return null;
    if (String(node.type ?? '') === 'expression') {
      const child = node.namedChildren?.[0];
      if (!child) return null;
      return convertExpression(child, boundary);
    }

    switch (String(node.type ?? '')) {
      case 'literal':
        return convertLiteral(node as NodeLike, boundary);
      case 'reference':
        return convertReference(node as NodeLike, boundary);
      case 'array':
        return convertArray(node as NodeLike, boundary);
      case 'string_literal':
      case 'number_literal':
      case 'boolean_literal':
      case 'null_literal':
        return convertLiteralDirect(node as NodeLike, boundary);
      case 'bare_identifier':
        return convertReference(node as NodeLike, boundary);
      default:
        return null;
    }
  }

  function convertAttribute(node: NodeLike, boundary: DocumentBoundary): AttributeNode | null {
    const keyNode = node.childForFieldName?.('key');
    const valueNode = node.childForFieldName?.('value');
    if (!keyNode || !valueNode) return null;

    const key: IdentifierNode = {
      type: 'identifier',
      value: String(keyNode.text ?? ''),
      quoted: false,
      text: String(keyNode.text ?? ''),
      origin: extractOrigin(keyNode, boundary),
    };
    const value = convertExpression(valueNode, boundary);
    if (!value) return null;
    return { type: 'attribute', key, value, origin: extractOrigin(node, boundary) };
  }

  function convertResource(node: NodeLike, boundary: DocumentBoundary): ResourceNode | null {
    const typeNode = node?.childForFieldName?.('type');
    const idNode = node?.childForFieldName?.('id');
    const completeModifierNode = node?.childForFieldName?.('complete_modifier');
    if (!typeNode || !idNode) return null;

    const resourceType = String(typeNode.text) as 'task' | 'milestone';
    const identifier = convertIdentifier(idNode, boundary);
    const complete = !!completeModifierNode;
    const attributes: AttributeNode[] = [];

    const bodyChildren = node.childrenForFieldName?.('body');
    for (const child of bodyChildren ?? []) {
      if (String(child.type ?? '') === 'attribute') {
        const attr = convertAttribute(child, boundary);
        if (attr) attributes.push(attr);
      }
    }

    // Attach any simple diagnostics related to complete keyword duplication
    const result: ResourceNode = {
      type: 'resource',
      resourceType,
      identifier,
      complete,
      body: attributes,
      origin: extractOrigin(node, boundary),
    };
    return result;
  }

  function convertDocument(root: NodeLike, boundaries: readonly DocumentBoundary[]): DocumentNode {
    const resources: ResourceNode[] = [];
    for (const child of root.namedChildren ?? []) {
      if (String(child.type ?? '') === 'resource') {
        const boundary = findDocumentForByte(Number(child.startIndex ?? 0), boundaries);
        const r = convertResource(child, boundary);
        if (r) resources.push(r);
      }
    }
    // For the root document node, use the first boundary
    const rootBoundary = boundaries[0] ?? { name: 'unknown', startByte: 0, startRow: 0 };
    return { type: 'document', resources, origin: extractOrigin(root, rootBoundary) };
  }

  function extractErrors(
    node: NodeLike | undefined,
    boundaries: readonly DocumentBoundary[],
    documents: readonly SourceDocument[],
  ): ParseError[] {
    const sourceByDoc = new Map<string, string>();
    for (const doc of documents) {
      if (doc) sourceByDoc.set(doc.name, doc.content);
    }

    const errors: ParseError[] = [];
    const seen = new Set<string>();

    const emit = (error: ParseError) => {
      const key = `${error.document ?? 'unknown'}:${error.line}:${error.column}:${error.message}`;
      if (seen.has(key)) return;
      seen.add(key);
      errors.push(error);
    };

    const topLevelExpected = ['task', 'milestone'] as const;
    const walk = (n: NodeLike | undefined) => {
      if (!n) return;
      const nType = String(n.type ?? '');
      const isMissing = Boolean(n.isMissing);
      const children = n.children ?? [];
      const isLeafError =
        nType === 'ERROR' && !children.some((c) => String(c.type ?? '') === 'ERROR');

      if (isMissing) {
        const boundary = findDocumentForByte(Number(n.startIndex ?? 0), boundaries);
        const startPos = n.startPosition;
        const localStartByte = Number(n.startIndex ?? 0) - boundary.startByte;
        const expectedToken =
          nType === '}'
            ? '}'
            : nType === ']'
              ? ']'
              : nType === 'bare_identifier'
                ? isMissingResourceId(n)
                  ? 'identifier after resource type'
                  : 'expression'
                : nType;

        emit({
          severity: 'error',
          kind: 'missing_token',
          message: `expected ${expectedToken}`,
          expected: [expectedToken],
          line: (Number(startPos?.row ?? 0) as number) - boundary.startRow + 1,
          column: (Number(startPos?.column ?? 0) as number) + 1,
          document: boundary.name,
          startByte: localStartByte,
          endByte: localStartByte,
        });
      } else if (isLeafError) {
        const boundary = findDocumentForByte(Number(n.startIndex ?? 0), boundaries);
        const startPos = n.startPosition;
        const localStartByte = Number(n.startIndex ?? 0) - boundary.startByte;
        const source = sourceByDoc.get(boundary.name) ?? '';
        const scanned = scanToken(source, localStartByte);
        const found = scanned.token;

        let nearestNonErrorParent = n.parent;
        while (String(nearestNonErrorParent?.type ?? '') === 'ERROR') {
          nearestNonErrorParent = nearestNonErrorParent?.parent;
        }
        const parentType = String(n.parent?.type ?? '');
        const isTopLevel =
          !nearestNonErrorParent || String(nearestNonErrorParent.type ?? '') === 'document';
        const expected = isTopLevel ? [...topLevelExpected] : [];

        const isDuplicateComplete =
          found === 'complete' &&
          parentType === 'resource' &&
          n.parent?.childForFieldName?.('complete_modifier') != null;

        const message = isDuplicateComplete
          ? `duplicate 'complete' keyword; expected '{'`
          : expected.length > 0
            ? `unexpected token '${found}'; expected ${formatExpectedList(expected)}`
            : `unexpected token '${found}'`;

        emit({
          severity: isDuplicateComplete ? 'warning' : 'error',
          kind: 'unexpected_token',
          message,
          found,
          expected: isDuplicateComplete ? ['{'] : expected,
          line: (Number(startPos?.row ?? 0) as number) - boundary.startRow + 1,
          column: (Number(startPos?.column ?? 0) as number) + 1,
          document: boundary.name,
          startByte: localStartByte,
          endByte: Math.min(localStartByte + scanned.length, source.length),
        });

        // Cross-document ERROR splitting: if an error span crosses document boundaries,
        // emit an additional top-level error at each subsequent document start.
        const startIndex = Number(n.startIndex ?? 0);
        const endIndex = Number(n.endIndex ?? startIndex);
        for (const b of boundaries) {
          if (b.startByte <= startIndex) continue;
          if (b.startByte >= endIndex) continue;
          const docSource = sourceByDoc.get(b.name) ?? '';
          const docScanned = scanToken(docSource, 0);
          emit({
            severity: 'error',
            kind: 'unexpected_token',
            message: `unexpected token '${docScanned.token}'; expected ${formatExpectedList([
              ...topLevelExpected,
            ])}`,
            found: docScanned.token,
            expected: [...topLevelExpected],
            line: 1,
            column: 1,
            document: b.name,
            startByte: 0,
            endByte: Math.min(docScanned.length, docSource.length),
          });
        }
      }

      for (const child of children) walk(child);
    };
    walk(node);
    return errors;
  }

  function extractComments(
    root: NodeLike | undefined,
    source: string,
    boundaries: readonly DocumentBoundary[],
  ): CommentToken[] {
    const comments: CommentToken[] = [];
    const commentNodes = root?.descendantsOfType?.('comment') ?? [];

    for (const commentNode of commentNodes) {
      const startIndex = Number(commentNode.startIndex ?? 0);
      const endIndex = Number(commentNode.endIndex ?? startIndex);
      const boundary = findDocumentForByte(startIndex, boundaries);
      comments.push({
        startByte: startIndex - boundary.startByte,
        endByte: endIndex - boundary.startByte,
        startRow: (Number(commentNode.startPosition?.row ?? 0) as number) - boundary.startRow,
        endRow: (Number(commentNode.endPosition?.row ?? 0) as number) - boundary.startRow,
        text: source.slice(startIndex, endIndex),
        document: boundary.name,
      });
    }

    comments.sort((a, b) => {
      if (a.document !== b.document) {
        return (a.document ?? '').localeCompare(b.document ?? '');
      }
      return a.startByte - b.startByte;
    });

    return comments;
  }

  // Return the ParserAdapter-compatible object
  return {
    async parse(documents: readonly SourceDocument[]) {
      // Build boundaries and concatenate documents
      const boundaries: DocumentBoundary[] = [];
      let concatenated = '';
      let currentByte = 0;
      let currentRow = 0;

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        if (!doc) continue;
        boundaries.push({ name: doc.name, startByte: currentByte, startRow: currentRow });
        concatenated += doc.content;
        // Use a simple byte count approximation (works for ASCII, most common case)
        // For proper UTF-8 handling in browsers, we'd need TextEncoder
        currentByte += doc.content.length;
        currentRow += doc.content.split('\n').length - 1;

        // Add separator between documents (except after last)
        if (i < documents.length - 1) {
          concatenated += '\n';
          currentByte += 1;
          currentRow += 1;
        }
      }

      const tree = parser.parse(concatenated) as
        | { rootNode: NodeLike; hasError?: boolean }
        | null
        | undefined;
      if (!tree) throw new Error('parser returned null tree');
      const root = tree.rootNode;
      const hasError = Boolean(tree.hasError === true || root?.hasError === true);
      const errors = hasError ? extractErrors(root, boundaries, documents) : [];
      const documentNode = convertDocument(root, boundaries);
      const comments = extractComments(root, concatenated, boundaries);
      const success = !hasError;
      const result: ParseResult = { tree: documentNode, errors, success, comments };
      return result;
    },
  };
}

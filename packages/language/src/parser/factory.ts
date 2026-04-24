/**
 * Parser factory.
 *
 * Owns the `web-tree-sitter` runtime and Siren grammar WASM. Zero-config:
 * callers invoke `createParser()` and receive a fully initialized
 * `ParserAdapter`. Grammar WASM is resolved relative to the emitted bundle
 * using `import.meta.url`; `Language.load` receives a filesystem path in
 * Node. Browser support is deferred to a later phase.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Language, Parser } from 'web-tree-sitter';
import type {
  CommentToken,
  ParseError,
  ParseResult,
  ParserAdapter,
  SourceDocument,
} from './adapter';
import type {
  ArrayNode,
  AttributeNode,
  DocumentNode,
  ExpressionNode,
  IdentifierNode,
  LiteralNode,
  ReferenceNode,
  ResourceNode,
} from './cst';

// Module-level flag: `Parser.init()` must run exactly once per process.
let parserInitPromise: Promise<void> | null = null;

function ensureParserInitialized(): Promise<void> {
  if (!parserInitPromise) {
    parserInitPromise = Parser.init();
  }
  return parserInitPromise;
}

// Resolve the grammar WASM location. The WASM ships at
// `<pkg>/grammar/tree-sitter-siren.wasm`. When loaded from the bundled
// `dist/index.js`, that's one level up. When tests run against the raw
// source (`src/parser/factory.ts`), it's two levels up. Try both and use
// whichever exists.
function resolveGrammarWasmPath(): string {
  const bundleRelative = new URL('../grammar/tree-sitter-siren.wasm', import.meta.url);
  const sourceRelative = new URL('../../grammar/tree-sitter-siren.wasm', import.meta.url);
  for (const url of [bundleRelative, sourceRelative]) {
    const path = fileURLToPath(url);
    if (existsSync(path)) return path;
  }
  // Fall back to the bundle-relative path; surfaces a clear ENOENT.
  return fileURLToPath(bundleRelative);
}

/**
 * Create a ready-to-use `ParserAdapter`.
 *
 * Each invocation returns a fresh adapter backed by its own `Parser`
 * instance. `Parser.init()` runs lazily on the first call; subsequent calls
 * reuse the cached initialization.
 */
export async function createParser(): Promise<ParserAdapter> {
  await ensureParserInitialized();

  const wasmPath = resolveGrammarWasmPath();
  const language = await Language.load(wasmPath);

  const parser = new Parser();
  parser.setLanguage(language);

  return buildAdapter(parser);
}

// ---------------------------------------------------------------------------
// Adapter construction
//
// CST conversion, error extraction, and comment extraction. Depends on the
// concrete `web-tree-sitter` `Parser` instance owned by this package.
// ---------------------------------------------------------------------------

interface DocumentBoundary {
  name: string;
  startByte: number;
  startRow: number;
}

// Lightweight structural shape for tree-sitter runtime nodes. Kept permissive
// because the web-tree-sitter type surface is large and our conversion code
// only touches a small subset.
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

function buildAdapter(parser: Parser): ParserAdapter {
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
        return convertLiteral(node, boundary);
      case 'reference':
        return convertReference(node, boundary);
      case 'array':
        return convertArray(node, boundary);
      case 'string_literal':
      case 'number_literal':
      case 'boolean_literal':
      case 'null_literal':
        return convertLiteralDirect(node, boundary);
      case 'bare_identifier':
        return convertReference(node, boundary);
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

    return {
      type: 'resource',
      resourceType,
      identifier,
      complete,
      body: attributes,
      origin: extractOrigin(node, boundary),
    };
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

  return {
    async parse(documents: readonly SourceDocument[]) {
      const boundaries: DocumentBoundary[] = [];
      let concatenated = '';
      let currentByte = 0;
      let currentRow = 0;

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        if (!doc) continue;
        boundaries.push({ name: doc.name, startByte: currentByte, startRow: currentRow });
        concatenated += doc.content;
        // ASCII-byte approximation (matches the original implementation).
        currentByte += doc.content.length;
        currentRow += doc.content.split('\n').length - 1;

        if (i < documents.length - 1) {
          concatenated += '\n';
          currentByte += 1;
          currentRow += 1;
        }
      }

      const tree = (parser as unknown as { parse(s: string): unknown }).parse(concatenated) as
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

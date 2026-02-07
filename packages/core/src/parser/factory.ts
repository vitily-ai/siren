/**
 * Parser factory with injectable WASM loader.
 *
 * This module is environment-agnostic and must not import runtime-specific
 * packages such as `web-tree-sitter`. Hosts supply a `loadWasm` function
 * that returns a minimal Language-like object.
 */

import type { ParseError, ParseResult, ParserAdapter } from './adapter.js';
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
  parse(source: string): any; // returns a tree with rootNode
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
    const metaUrl = (import.meta as any).url;
    const URLCtor = (globalThis as any).URL;
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

  // Conversion helpers adapted from the Node test adapter. Keep logic here
  // so core owns the CST shape while the runtime provides parsing only.
  
  /**
   * Extract origin metadata from a tree-sitter node
   */
  function extractOrigin(node: any) {
    if (!node || !node.startPosition || !node.endPosition) return undefined;
    return {
      startByte: node.startIndex ?? 0,
      endByte: node.endIndex ?? 0,
      startRow: node.startPosition.row ?? 0,
      endRow: node.endPosition.row ?? 0,
    };
  }

  function convertIdentifier(node: any): IdentifierNode {
    const child = node?.namedChildren?.[0];
    if (!child) {
      return {
        type: 'identifier',
        value: node ? String(node.text) : '',
        quoted: false,
        text: node ? String(node.text) : '',
        origin: extractOrigin(node),
      };
    }

    const isQuoted = child.type === 'quoted_identifier';
    let value = String(child.text ?? '');
    if (isQuoted && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    return {
      type: 'identifier',
      value,
      quoted: isQuoted,
      text: String(node.text ?? ''),
      origin: extractOrigin(node),
    };
  }

  function convertLiteralDirect(node: any): LiteralNode | null {
    const origin = extractOrigin(node);
    switch (node.type) {
      case 'string_literal': {
        let value = String(node.text ?? '');
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        return { type: 'literal', literalType: 'string', value, text: String(node.text ?? ''), origin };
      }
      case 'number_literal': {
        const value = parseFloat(String(node.text ?? ''));
        return { type: 'literal', literalType: 'number', value, text: String(node.text ?? ''), origin };
      }
      case 'boolean_literal': {
        const value = String(node.text) === 'true';
        return { type: 'literal', literalType: 'boolean', value, text: String(node.text ?? ''), origin };
      }
      case 'null_literal':
        return { type: 'literal', literalType: 'null', value: null, text: String(node.text ?? ''), origin };
      default:
        return null;
    }
  }

  function convertReference(node: any): ReferenceNode {
    const identifier: IdentifierNode = {
      type: 'identifier',
      value: String(node.text ?? ''),
      quoted: false,
      text: String(node.text ?? ''),
      origin: extractOrigin(node),
    };
    return { type: 'reference', identifier, origin: extractOrigin(node) };
  }

  function convertArray(node: any): ArrayNode {
    const elements: ExpressionNode[] = [];
    for (const child of node.namedChildren ?? []) {
      const expr = convertExpression(child);
      if (expr) elements.push(expr);
    }
    return { type: 'array', elements, origin: extractOrigin(node) };
  }

  function convertLiteral(node: any): LiteralNode | null {
    const child = node?.namedChildren?.[0];
    if (!child) return null;
    return convertLiteralDirect(child);
  }

  function convertExpression(node: any): ExpressionNode | null {
    if (!node) return null;
    if (node.type === 'expression') {
      const child = node.namedChildren?.[0];
      if (!child) return null;
      return convertExpression(child);
    }

    switch (node.type) {
      case 'literal':
        return convertLiteral(node);
      case 'reference':
        return convertReference(node);
      case 'array':
        return convertArray(node);
      case 'string_literal':
      case 'number_literal':
      case 'boolean_literal':
      case 'null_literal':
        return convertLiteralDirect(node);
      case 'bare_identifier':
        return convertReference(node);
      default:
        return null;
    }
  }

  function convertAttribute(node: any): AttributeNode | null {
    const keyNode = node?.childForFieldName?.('key');
    const valueNode = node?.childForFieldName?.('value');
    if (!keyNode || !valueNode) return null;

    const key: IdentifierNode = {
      type: 'identifier',
      value: String(keyNode.text ?? ''),
      quoted: false,
      text: String(keyNode.text ?? ''),
      origin: extractOrigin(keyNode),
    };
    const value = convertExpression(valueNode);
    if (!value) return null;
    return { type: 'attribute', key, value, origin: extractOrigin(node) };
  }

  function convertResource(node: any): ResourceNode | null {
    const typeNode = node?.childForFieldName?.('type');
    const idNode = node?.childForFieldName?.('id');
    const completeModifierNode = node?.childForFieldName?.('complete_modifier');
    if (!typeNode || !idNode) return null;

    const resourceType = String(typeNode.text) as 'task' | 'milestone';
    const identifier = convertIdentifier(idNode);
    const complete = !!completeModifierNode;
    const attributes: AttributeNode[] = [];

    const bodyChildren = node.childrenForFieldName ? node.childrenForFieldName('body') : [];
    for (const child of bodyChildren) {
      if (child.type === 'attribute') {
        const attr = convertAttribute(child);
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
      origin: extractOrigin(node),
    };
    return result;
  }

  function convertDocument(root: any): DocumentNode {
    const resources: ResourceNode[] = [];
    for (const child of root.namedChildren ?? []) {
      if (child.type === 'resource') {
        const r = convertResource(child);
        if (r) resources.push(r);
      }
    }
    return { type: 'document', resources, origin: extractOrigin(root) };
  }

  function extractErrors(node: any): ParseError[] {
    const errors: ParseError[] = [];
    const walk = (n: any) => {
      if (!n) return;
      if (n.type === 'ERROR' || n.isMissing) {
        errors.push({
          message: n.isMissing ? `Missing ${n.type}` : 'Syntax error',
          line: (n.startPosition?.row ?? 0) + 1,
          column: (n.startPosition?.column ?? 0) + 1,
        });
      }
      for (const child of n.children ?? []) walk(child);
    };
    walk(node);
    return errors;
  }

  // Return the ParserAdapter-compatible object
  return {
    async parse(source: string) {
      const tree = parser.parse(source);
      if (!tree) throw new Error('parser returned null tree');
      const root = tree.rootNode;
      const errors = root.hasError ? extractErrors(root) : [];
      const documentNode = convertDocument(root);
      const success = !(root.hasError === true);
      const result: ParseResult = { tree: documentNode, errors, success };
      return result;
    },
  };
}

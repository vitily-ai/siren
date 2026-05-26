import type { SirenDocument } from '@sirenpm/core';
import { Language, type Tree, Parser as TsParser } from 'web-tree-sitter';
import { buildAst } from '../ast/builder';
import type { AstOriginMap } from '../ast/origins';
import { decodeAstToSirenDocument } from '../decoder';
import { formatCst } from '../format/formatter';
import { getWasmUrl } from '../grammar/loadHandle';
import type { LanguageDiagnostic, ParsedDocument, Parser, SirenAst, SourceDocument } from './types';

let runtimeInit: Promise<void> | undefined;
function ensureRuntimeInit(): Promise<void> {
  if (!runtimeInit) {
    runtimeInit = TsParser.init();
  }
  return runtimeInit;
}

let languagePromise: Promise<Language> | undefined;
/**
 * Loads the tree-sitter Language WASM. This is memoized to avoid repeated
 * fetch and compilation across `createParser()` calls.
 */
function getLanguage(): Promise<Language> {
  if (!languagePromise) {
    languagePromise = (async () => {
      await ensureRuntimeInit();
      // only pathname here because tree-sitter breaks if scheme is included
      // side-note, raw tree-sitter supports URL directly, but the typescript doesn't allow it.
      // Open issue against tree-sitter?
      return Language.load(getWasmUrl().pathname);
    })();
  }
  return languagePromise;
}

const EMPTY_DIAGNOSTICS: readonly LanguageDiagnostic[] = Object.freeze([]);

/**
 * Concrete ParsedDocument.
 *
 * The raw tree-sitter CST is retained on a `#tree` private field for future
 * tasks (`lang-format`) to consume. It is intentionally NOT exposed on the
 * public `ParsedDocument` type — downstream services gain access via internal
 * helpers (e.g. the AST builder is invoked at construction time).
 */
class ParsedDocumentImpl implements ParsedDocument {
  readonly ast: SirenAst;
  readonly diagnostics: readonly LanguageDiagnostic[];
  readonly #source: SourceDocument;
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: retained for lang-format.
  readonly #tree: Tree | null;
  readonly #origins: AstOriginMap;

  constructor(source: SourceDocument, tree: Tree | null) {
    this.#source = source;
    this.#tree = tree;
    const built = buildAst(tree, source);
    this.ast = built.ast;
    this.diagnostics = built.diagnostics ?? EMPTY_DIAGNOSTICS;
    this.#origins = built.origins;
  }

  toSirenDocument(): SirenDocument {
    return decodeAstToSirenDocument(this.ast, this.#source, this.#origins);
  }

  format(): string {
    if (!this.#tree) {
      throw new Error('Cannot format a document without a parse tree');
    }
    const hasErrors =
      this.diagnostics.some((d) => d.severity === 'error') || this.#tree.rootNode.hasError;
    return formatCst(this.#tree, this.#source.content, hasErrors);
  }
}

export async function createParser(): Promise<Parser> {
  const language = await getLanguage();
  // One Parser instance per `createParser()` call; the loaded `Language` is
  // cached on the instance and reused across every `parse` / `parseBatch`.
  const tsParser = new TsParser();
  tsParser.setLanguage(language);

  const parseOne = (document: SourceDocument): ParsedDocument => {
    const tree = tsParser.parse(document.content ?? '');
    return new ParsedDocumentImpl(document, tree);
  };

  return {
    parse: async (document) => parseOne(document),
    // Sequential map: tree-sitter's `Parser` is not designed for concurrent
    // reuse, and the underlying `parse` is synchronous, so a serial loop is
    // both safe and trivially equivalent to per-document `parse` calls
    // (as asserted by the contract test).
    parseBatch: async (documents) => documents.map(parseOne),
  };
}

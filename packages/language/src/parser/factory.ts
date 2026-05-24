import type { SirenDocument } from '@sirenpm/core';
import { Language, type Tree, Parser as TsParser } from 'web-tree-sitter';
import { buildAst } from '../ast/builder';
import type { LanguageDiagnostic, ParsedDocument, Parser, SirenAst, SourceDocument } from './types';

/**
 * Package-relative WASM URL. This file lives at
 *   packages/language/src/parser/factory.ts
 * and the committed grammar artifact lives at
 *   packages/language/grammar/tree-sitter-siren.wasm
 * so `../../grammar/...` resolves correctly both from source (vitest, ts-node)
 * and from the built `dist/` bundle, since tsup preserves `import.meta.url`
 * and `grammar/tree-sitter-siren.wasm` is shipped via the package `files` array.
 */
const WASM_URL = new URL('../../grammar/tree-sitter-siren.wasm', import.meta.url);

let runtimeInit: Promise<void> | undefined;
function ensureRuntimeInit(): Promise<void> {
  if (!runtimeInit) {
    runtimeInit = TsParser.init();
  }
  return runtimeInit;
}

const EMPTY_DIAGNOSTICS: readonly LanguageDiagnostic[] = Object.freeze([]);

function deriveDocumentId(name: string): string {
  return name.endsWith('.siren') ? name.slice(0, -'.siren'.length) : name;
}

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

  constructor(source: SourceDocument, tree: Tree | null) {
    this.#source = source;
    this.#tree = tree;
    const built = buildAst(tree, source);
    this.ast = built.ast;
    this.diagnostics = built.diagnostics ?? EMPTY_DIAGNOSTICS;
  }

  toSirenDocument(): SirenDocument {
    // `id` is derived from the source document name with any `.siren` suffix
    // stripped. The contract test only requires `typeof id === 'string'`; this
    // mirrors how the CLI already addresses documents by basename.
    return {
      id: deriveDocumentId(this.#source.name),
      resources: [],
      directive: undefined,
    };
  }

  format(): string {
    // Real formatter lands in `lang-format`; until then return source verbatim.
    return this.#source.content;
  }
}

export async function createParser(): Promise<Parser> {
  await ensureRuntimeInit();
  // `Language.load` is typed as `string | Uint8Array`, but its runtime
  // implementation accepts a `URL` directly: in Node it forwards to
  // `fs/promises.readFile(input)` and in browsers to `fetch(input)`, both of
  // which natively accept `URL`. Passing the `URL` lets web-tree-sitter own
  // the Node-vs-browser branch so we don't have to.
  // TODO convert the URL to a string instead of casting
  const language = await Language.load(WASM_URL as unknown as string);
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

import type { SirenEntry } from '@sirenpm/core';
import { Language, type Node, type Tree, Parser as TsParser } from 'web-tree-sitter';
import { buildAst } from '../ast/builder';
import type { AstOriginMap } from '../ast/origins';
import { decodeAstToEntries } from '../decoder';
import { formatCst } from '../formatter';
import { getWasmUrl } from '../grammar/loadHandle';
import type { SourcedEntry } from '../origin';
import { renderEntry } from '../render-entry';
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
 * Walk `root`'s named children to find a `resource` node whose id matches
 * `targetId`. Returns the `resource` CST node if found, or `undefined`.
 */
function findResourceNode(root: Node, targetId: string): Node | undefined {
  for (let i = 0; i < root.namedChildCount; i++) {
    const child = root.namedChild(i);
    if (child?.type !== 'resource') continue;

    const headerNode = child.namedChild(0);
    if (headerNode?.type !== 'resource_header') continue;

    const idNode = headerNode.childForFieldName('id');
    if (!idNode) continue;

    const inner = idNode.namedChild(0);
    if (!inner) continue;

    let idText: string;
    if (inner.type === 'bare_identifier') {
      idText = inner.text;
    } else if (inner.type === 'string_literal') {
      let bodyText = '';
      for (let j = 0; j < inner.namedChildCount; j++) {
        const c = inner.namedChild(j);
        if (c && c.type === 'str_body') {
          bodyText = c.text;
          break;
        }
      }
      idText = bodyText;
    } else {
      continue;
    }

    if (idText === targetId) {
      return child;
    }
  }
  return undefined;
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
  readonly #sourceName: string;
  #sourceContent: string;
  #tree: Tree;
  #ast: SirenAst;
  #diagnostics: readonly LanguageDiagnostic[];
  #origins: AstOriginMap;
  #entries: readonly SourcedEntry[];
  readonly #reparse: (content: string, oldTree: Tree) => Tree;

  // TODO: remove, not needed, breaks encapsulation
  get ast(): SirenAst {
    return this.#ast;
  }

  get diagnostics(): readonly LanguageDiagnostic[] {
    return this.#diagnostics;
  }

  constructor(
    source: SourceDocument,
    tree: Tree,
    // TODO reparse does not need to be external. tree and content are both captured already.
    reparse: (content: string, oldTree: Tree) => Tree,
  ) {
    this.#sourceName = source.name;
    this.#sourceContent = source.content;
    this.#tree = tree;
    this.#reparse = reparse;
    const built = buildAst(tree, source);
    this.#ast = built.ast;
    // TODO: buildAst should return empty diags by default
    this.#diagnostics = built.diagnostics ?? EMPTY_DIAGNOSTICS;
    this.#origins = built.origins;
    // TODO: directives should come from the document, instead of being hardcoded here. Requires grammar support.
    this.#entries = decodeAstToEntries(this.#ast, source, this.#origins, {
      synthesizeMilestones: false,
    });
  }

  get source(): SourceDocument {
    return { name: this.#sourceName, content: this.#sourceContent };
  }

  toEntries(): readonly SourcedEntry[] {
    return this.#entries;
  }

  format(): string {
    const canonical = formatCst(this.#tree, this.#sourceContent);
    this.#sourceContent = canonical;
    this.#tree = this.#reparse(canonical, this.#tree);
    const rebuilt = buildAst(this.#tree, this.#toSourceDoc());
    this.#ast = rebuilt.ast;
    this.#diagnostics = rebuilt.diagnostics ?? EMPTY_DIAGNOSTICS;
    this.#origins = rebuilt.origins;
    this.#redecode();
    return canonical;
  }

  patchEntry(id: string, entry: SirenEntry): void {
    const resourceNode = findResourceNode(this.#tree.rootNode, id);
    const rendered = renderEntry(entry);

    if (resourceNode) {
      // Extend endIndex to include the following newline separator, if any,
      // so the splice replaces the resource plus its trailing whitespace.
      // (Tree-sitter classifies whitespace as "extra", so named node spans
      // do not include the trailing newline.)
      let endIndex = resourceNode.endIndex;
      if (endIndex < this.#sourceContent.length && this.#sourceContent[endIndex] === '\n') {
        endIndex++;
      }

      // Splice rendered block in place of existing resource span.
      this.#sourceContent =
        this.#sourceContent.slice(0, resourceNode.startIndex) +
        rendered +
        this.#sourceContent.slice(endIndex);
    } else {
      // Append synthetic entry at end.
      const trimmed = this.#sourceContent.trimEnd();
      if (trimmed.length === 0) {
        this.#sourceContent = rendered;
      } else {
        this.#sourceContent = `${trimmed}\n\n${rendered}`;
      }
    }

    // Incremental re-parse using the previous tree.
    this.#tree = this.#reparse(this.#sourceContent, this.#tree);

    // Rebuild AST and sidechannel from the updated tree.
    const rebuilt = buildAst(this.#tree, this.#toSourceDoc());
    this.#ast = rebuilt.ast;
    this.#diagnostics = rebuilt.diagnostics ?? EMPTY_DIAGNOSTICS;
    this.#origins = rebuilt.origins;

    // Re-decode entries.
    this.#redecode();
  }

  removeEntry(id: string): void {
    const targetNode = findResourceNode(this.#tree.rootNode, id);

    if (!targetNode) {
      throw new Error(`Entry not found: ${id}`);
    }

    // Splice byte range out of source content.
    const startIndex = targetNode.startIndex;
    const endIndex = targetNode.endIndex;
    let newContent = this.#sourceContent.slice(0, startIndex) + this.#sourceContent.slice(endIndex);
    // Trim leading blank lines left by removing the first resource.
    newContent = newContent.replace(/^\n+/, '');
    this.#sourceContent = newContent;

    // Incremental re-parse, AST rebuild, diagnostics, origins, entries.
    this.#tree = this.#reparse(this.#sourceContent, this.#tree);
    const rebuilt = buildAst(this.#tree, this.#toSourceDoc());
    this.#ast = rebuilt.ast;
    this.#diagnostics = rebuilt.diagnostics ?? EMPTY_DIAGNOSTICS;
    this.#origins = rebuilt.origins;
    this.#redecode();
  }

  #redecode(): void {
    this.#entries = decodeAstToEntries(this.#ast, this.#toSourceDoc(), this.#origins);
  }

  #toSourceDoc(): SourceDocument {
    return { name: this.#sourceName, content: this.#sourceContent };
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
    if (!tree) {
      throw new Error('Parse failed: tree-sitter returned no tree');
    }

    // FIXME: reparse should be internal to parseddocimpl
    // also oldtree isn't even being used for incremental reparse - why?
    const reparse = (content: string, _oldTree: Tree): Tree => {
      const newTree = tsParser.parse(content);
      if (!newTree) throw new Error('Re-parse failed');
      return newTree;
    };
    return new ParsedDocumentImpl(document, tree, reparse);
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

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IRContext, Resource } from '@sirenpm/core';
import {
  createIRContextFromParseResult,
  type ParseError,
  type SourceDocument,
} from '@sirenpm/language';
import { formatDiagnostic } from './format-diagnostics';
import { formatParseError } from './format-parse-error';
import { getParser } from './parser';

const SIREN_DIR = 'siren';

export interface ProjectContext {
  cwd: string;
  rootDir: string;
  sirenDir: string;
  files: string[];
  resources: Resource[];
  milestones: string[];
  ir?: IRContext;
  warnings: string[];
  errors: string[];
}

let loadedContext: ProjectContext | null = null;

/**
 * Recursively find all .siren files in a directory.
 */
function findSirenFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSirenFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.siren')) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

export function getLoadedContext(): ProjectContext | null {
  return loadedContext;
}

export async function loadProject(cwd: string): Promise<ProjectContext> {
  const rootDir = cwd;
  let sirenDir = path.join(rootDir, SIREN_DIR);

  const ctx: ProjectContext = {
    cwd,
    rootDir,
    sirenDir,
    files: [],
    resources: [],
    milestones: [],
    warnings: [],
    errors: [],
  };

  // Prefer 'siren/' directory when present and containing .siren files; otherwise
  // search the project root. This supports legacy fixtures with a `siren/`
  // subdirectory as well as newer fixtures that place files at the project root.
  if (fs.existsSync(sirenDir)) {
    const nestedFiles = findSirenFiles(sirenDir);
    if (nestedFiles.length > 0) {
      // Prefer nested files only if at least one contains data. Empty files are
      // treated as absent to allow fixtures that moved files to the project root.
      const hasNonEmpty = nestedFiles.some((p) => {
        try {
          return fs.statSync(p).size > 0;
        } catch {
          return false;
        }
      });
      if (hasNonEmpty) {
        ctx.files = nestedFiles;
      } else {
        // Treat empty nested files as absent — scan project root instead.
        sirenDir = rootDir;
        ctx.files = findSirenFiles(rootDir);
      }
    } else {
      // No files under nested siren/ — fall back to scanning the project root.
      sirenDir = rootDir;
      ctx.files = findSirenFiles(rootDir);
    }
  } else {
    // Fall back to scanning the project root for .siren files.
    sirenDir = rootDir;
    ctx.files = findSirenFiles(rootDir);
  }
  if (ctx.files.length === 0) {
    loadedContext = ctx;
    return ctx;
  }

  const parser = await getParser();

  // Build SourceDocument array from discovered files
  const documents: SourceDocument[] = ctx.files.map((filePath) => ({
    name: path.relative(rootDir, filePath),
    content: fs.readFileSync(filePath, 'utf-8'),
  }));
  const contentByDocument = new Map<string, string>(documents.map((d) => [d.name, d.content]));

  // Parse all documents in a single call - origin.document is set automatically
  const parseResult = await parser.parse(documents);

  if (!parseResult.tree) {
    // No valid parse tree at all
    ctx.warnings.push('Warning: no valid parse tree could be produced');
    loadedContext = ctx;
    return ctx;
  }

  // Report parse errors, skip documents with error-severity syntax issues
  const errorsByDocument = new Map<string, ParseError[]>();
  for (const error of parseResult.errors) {
    const doc = error.document ?? 'unknown';
    const list = errorsByDocument.get(doc) ?? [];
    list.push(error);
    errorsByDocument.set(doc, list);
  }

  const skippedDocs = new Set<string>();
  for (const [doc, errors] of errorsByDocument) {
    errors.sort((a, b) => a.line - b.line || a.column - b.column);
    const source = contentByDocument.get(doc) ?? '';

    for (const e of errors) {
      if ((e.severity ?? 'error') === 'warning') continue;

      const formatted = formatParseError(e, source);
      ctx.errors.push(formatted);
    }

    if (errors.some((e) => (e.severity ?? 'error') === 'error')) {
      skippedDocs.add(doc);
      ctx.errors.push(`note: skipping ${doc} due to syntax errors`);
    }
  }

  const filteredSyntaxDocuments = (parseResult.syntaxDocuments ?? []).filter(
    (syntaxDocument) => !skippedDocs.has(syntaxDocument.source.name),
  );
  // TODO[PARSER-DIAGNOSTIC-OWNERSHIP]: Unify parser diagnostic ownership so the
  // CLI does not split rich syntax errors above from warning-only parse/decode
  // diagnostics here. See task `parser-diagnostic-ownership` in siren/debt.siren.
  const retainedParseWarnings = parseResult.errors.filter((error) => {
    const severity = error.severity ?? 'error';
    const document = error.document ?? 'unknown';
    return severity === 'warning' && !skippedDocs.has(document);
  });

  const { context: ir, parseDiagnostics } = createIRContextFromParseResult({
    ...parseResult,
    errors: retainedParseWarnings,
    syntaxDocuments: filteredSyntaxDocuments,
  });

  ctx.resources = [...ir.resources];
  ctx.ir = ir;
  ctx.milestones = ir.getMilestoneIds();

  // Collect retained parse/decode diagnostics. Error-severity parser errors are
  // reported above via formatParseError + skip notes, so this path is currently
  // warning-oriented until parser diagnostic ownership is unified.
  for (const diagnostic of parseDiagnostics) {
    const formatted = formatDiagnostic(diagnostic);
    if (diagnostic.severity === 'warning') {
      ctx.warnings.push(formatted);
    } else if (diagnostic.severity === 'error') {
      ctx.errors.push(formatted);
    }
  }

  // Collect semantic diagnostics (W001, W002, W003) - file attribution comes from origin.document
  for (const diagnostic of ir.diagnostics) {
    const formatted = formatDiagnostic(diagnostic);
    if (diagnostic.severity === 'warning') {
      ctx.warnings.push(formatted);
    } else if (diagnostic.severity === 'error') {
      ctx.errors.push(formatted);
    }
  }

  loadedContext = ctx;
  return ctx;
}

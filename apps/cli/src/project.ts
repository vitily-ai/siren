import * as fs from 'node:fs';
import * as path from 'node:path';
import { type Resource, SirenBuilder, type SirenProject } from '@sirenpm/core';
import {
  decodeSyntaxDocuments,
  type ParseDiagnostic,
  type ParseError,
  type SourceDocument,
  type SyntaxDocument,
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
  ir?: SirenProject;
  warnings: string[];
  errors: string[];
}

let loadedContext: ProjectContext | null = null;

function toDiagnosticColumn(column: number | undefined): number | undefined {
  if (column === undefined) return undefined;
  return Math.max(0, column - 1);
}

function isDuplicateCompleteParseError(error: ParseError): boolean {
  return (
    (error.severity ?? 'error') === 'warning' &&
    error.kind === 'unexpected_token' &&
    error.found === 'complete' &&
    (error.expected ?? []).includes('{') &&
    error.message.includes("duplicate 'complete' keyword")
  );
}

function findResourceForParseError(
  error: ParseError,
  syntaxDocuments: readonly SyntaxDocument[],
): SyntaxDocument['resources'][number] | undefined {
  const documentName = error.document;
  const startByte = error.startByte;

  for (const syntaxDocument of syntaxDocuments) {
    if (documentName && syntaxDocument.source.name !== documentName) continue;

    for (const resource of syntaxDocument.resources) {
      if (startByte !== undefined) {
        if (startByte >= resource.span.startByte && startByte <= resource.span.endByte) {
          return resource;
        }
      } else if (
        error.line >= resource.span.startRow + 1 &&
        error.line <= resource.span.endRow + 1
      ) {
        return resource;
      }
    }
  }

  return undefined;
}

function parseErrorsToDiagnostics(
  errors: readonly ParseError[],
  syntaxDocuments: readonly SyntaxDocument[],
): readonly ParseDiagnostic[] {
  const diagnostics: ParseDiagnostic[] = [];

  for (const error of errors) {
    if (isDuplicateCompleteParseError(error)) {
      const resource = findResourceForParseError(error, syntaxDocuments);
      const resourceId = resource?.identifier.value ?? 'unknown';
      diagnostics.push({
        code: 'WL002',
        message: `Resource '${resourceId}' has 'complete' keyword specified more than once. Only one is allowed; resource will be treated as complete: true.`,
        severity: 'warning',
        file: resource?.span.document ?? error.document,
        line: resource ? resource.span.startRow + 1 : error.line,
        column: resource ? 0 : toDiagnosticColumn(error.column),
      });
      continue;
    }

    if ((error.severity ?? 'error') === 'error') {
      diagnostics.push({
        code: 'EL001',
        message: `Invalid syntax: ${error.message}`,
        severity: 'error',
        file: error.document,
        line: error.line,
        column: toDiagnosticColumn(error.column),
      });
    }
  }

  return diagnostics;
}

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
  const sourceDocuments: SourceDocument[] = ctx.files.map((filePath) => ({
    name: path.relative(rootDir, filePath),
    content: fs.readFileSync(filePath, 'utf-8'),
  }));
  const contentByDocument = new Map<string, string>(
    sourceDocuments.map((d) => [d.name, d.content]),
  );

  // Parse all documents in a single call - origin.document is set automatically
  const parseResult = await parser.parse(sourceDocuments);

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

  const { documents: sirenDocuments, diagnostics: decodeDiagnostics } =
    decodeSyntaxDocuments(filteredSyntaxDocuments);
  const ir = SirenBuilder.fromDocuments(sirenDocuments ?? []).build();
  const parseDiagnostics = [
    ...parseErrorsToDiagnostics(retainedParseWarnings, filteredSyntaxDocuments),
    ...decodeDiagnostics,
  ];

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

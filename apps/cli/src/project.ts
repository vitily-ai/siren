import * as fs from 'node:fs';
import * as path from 'node:path';
import { IRContext, type Resource, type SourceDocument } from '@siren/core';
import { formatDiagnostic } from './format-diagnostics.js';
import { getParser } from './parser.js';

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

  // Parse all documents in a single call - origin.document is set automatically
  const parseResult = await parser.parse(documents);

  if (!parseResult.tree) {
    // No valid parse tree at all
    ctx.warnings.push('Warning: no valid parse tree could be produced');
    loadedContext = ctx;
    return ctx;
  }

  // Report parse errors but continue processing what we can
  for (const error of parseResult.errors) {
    const filePrefix = error.document ? `${error.document}:` : '';
    const suffix = error.message === 'Syntax error' ? ' - skipping document' : '';
    ctx.warnings.push(
      `Warning: ${filePrefix}${error.line}:${error.column}: ${error.message}${suffix}`,
    );
  }

  // Decode CST to IR - resources now have origin.document set by the parser
  const ir = IRContext.fromCst(parseResult.tree);
  ctx.resources = [...ir.resources];
  ctx.ir = ir;
  ctx.milestones = ir.getMilestoneIds();

  // Collect parse-level diagnostics (W001, W002, W003, E001)
  for (const diagnostic of ir.parseDiagnostics) {
    const formatted = formatDiagnostic(diagnostic);
    if (diagnostic.severity === 'warning') {
      ctx.warnings.push(formatted);
    } else if (diagnostic.severity === 'error') {
      ctx.errors.push(formatted);
    }
  }

  // Collect semantic diagnostics (W004, W005) - file attribution comes from origin.document
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

import * as fs from 'node:fs';
import * as path from 'node:path';
import { IRContext, type Resource } from '@siren/core';
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
  const allResources: Resource[] = [];
  const resourceSources = new Map<string, string>();

  for (const filePath of ctx.files) {
    const source = fs.readFileSync(filePath, 'utf-8');
    const parseResult = await parser.parse(source);
    if (!parseResult.success || !parseResult.tree) {
      const relPath = path.relative(rootDir, filePath);
      ctx.warnings.push(`Warning: skipping ${relPath} (parse error)`);
      continue;
    }

    const ir = IRContext.fromCst(parseResult.tree, filePath);

    // Track which file each resource came from
    for (const resource of ir.resources) {
      const relPath = path.relative(rootDir, filePath);
      resourceSources.set(resource.id, relPath);
    }

    allResources.push(...ir.resources);
  }

  ctx.resources = allResources;

  // Build project-wide IR context and collect all diagnostics with file attribution
  const ir = IRContext.fromResources(allResources, undefined, resourceSources);
  ctx.ir = ir;
  ctx.milestones = ir.getMilestoneIds();

  // Collect all project-wide diagnostics
  for (const diagnostic of ir.diagnostics) {
    if (diagnostic.severity === 'warning') {
      ctx.warnings.push(`Warning: ${diagnostic.message}`);
    } else if (diagnostic.severity === 'error') {
      ctx.errors.push(`Error: ${diagnostic.message}`);
    }
  }

  loadedContext = ctx;
  return ctx;
}

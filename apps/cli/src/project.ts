import * as fs from 'node:fs';
import * as path from 'node:path';
import { decode, IRContext, type Resource } from '@siren/core';
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
  const sirenDir = path.join(rootDir, SIREN_DIR);

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

  if (!fs.existsSync(sirenDir)) {
    loadedContext = ctx;
    return ctx;
  }

  ctx.files = findSirenFiles(sirenDir);
  if (ctx.files.length === 0) {
    loadedContext = ctx;
    return ctx;
  }

  const parser = await getParser();
  const allResources: Resource[] = [];

  for (const filePath of ctx.files) {
    const source = fs.readFileSync(filePath, 'utf-8');
    const parseResult = await parser.parse(source);
    if (!parseResult.success || !parseResult.tree) {
      const relPath = path.relative(rootDir, filePath);
      ctx.warnings.push(`Warning: skipping ${relPath} (parse error)`);
      continue;
    }

    const decodeResult = decode(parseResult.tree);
    if (!decodeResult.document) {
      continue;
    }

    // Collect decoding warnings (e.g., circular dependencies)
    if (decodeResult.diagnostics) {
      for (const diagnostic of decodeResult.diagnostics) {
        if (diagnostic.severity === 'warning') {
          const relPath = path.relative(rootDir, filePath);
          ctx.warnings.push(`Warning: ${relPath}: ${diagnostic.message}`);
        }
      }
    }

    allResources.push(...decodeResult.document.resources);
  }

  ctx.resources = allResources;
  // Build an immutable IR context for the project and derive milestones
  const ir = IRContext.fromResources(allResources);
  ctx.ir = ir;
  ctx.milestones = ir.getMilestoneIds();

  loadedContext = ctx;
  return ctx;
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliContext } from './context';

const SIREN_DIR = 'siren';

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

export function runDiscovery(ctx: CliContext): void {
  const sirenDir = path.join(ctx.rootDir, SIREN_DIR);

  if (fs.existsSync(sirenDir)) {
    const nestedFiles = findSirenFiles(sirenDir);
    if (nestedFiles.length > 0) {
      const hasNonEmpty = nestedFiles.some((filePath) => {
        try {
          return fs.statSync(filePath).size > 0;
        } catch {
          return false;
        }
      });
      if (hasNonEmpty) {
        ctx.files = nestedFiles;
      } else {
        ctx.files = findSirenFiles(ctx.rootDir);
      }
    } else {
      ctx.files = findSirenFiles(ctx.rootDir);
    }
  } else {
    ctx.files = findSirenFiles(ctx.rootDir);
  }

  ctx.phasesRun.add('discovery');
}

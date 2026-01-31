import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect } from 'vitest';

function toRegexFromGlob(glob: string): RegExp {
  // very small subset glob -> regex for common patterns used in tests
  const esc = glob.replace(/([.+^=!:${}()|\\[\\]\/\\])/g, '\\$1');
  const repl = esc
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^\\/]*')
    .replace(/\\\?/g, '.');
  return new RegExp(`^${repl}$`);
}

export function readFileNormalized(filePath: string): string {
  const s = fs.readFileSync(filePath, 'utf8');
  return s.replace(/\r\n/g, '\n');
}

export function listFiles(dir: string, options?: { ignoreGlobs?: string[] }): string[] {
  const base = path.resolve(dir);
  const ignore = (options?.ignoreGlobs || []).map(toRegexFromGlob);
  const results: string[] = [];

  function walk(p: string) {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const rel = path.relative(base, path.join(p, entry.name)).replace(/\\\\/g, '/');
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      if (ignore.some((r) => r.test(rel))) continue;
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        results.push(rel);
      }
    }
  }

  walk(base);
  results.sort();
  return results;
}

export async function assertDirMatchesExpected(
  actualDir: string,
  expectedDir: string,
  options?: { allowExtraFiles?: boolean; ignoreGlobs?: string[] },
): Promise<void> {
  const ignore = options?.ignoreGlobs;
  const actualList = listFiles(actualDir, { ignoreGlobs: ignore });
  let expectedList = listFiles(expectedDir, { ignoreGlobs: ignore });

  // Normalize expected list: if expected contains nested paths like "siren/x" and
  // also root entries "x", prefer the nested paths (this handles duplicated test fixtures)
  const hasNested = expectedList.some((p) => p.includes('/'));
  if (hasNested) {
    const _rootNames = new Set(expectedList.filter((p) => !p.includes('/')));
    expectedList = expectedList.filter((p) => {
      if (!p.includes('/')) return ![...expectedList].some((q) => q.endsWith(`/${p}`));
      return true;
    });
  }

  if (!options?.allowExtraFiles) {
    expect(actualList).toEqual(expectedList);
  } else {
    // ensure all expected files exist in actual
    for (const e of expectedList) expect(actualList).toContain(e);
  }

  for (const rel of expectedList) {
    const aPath = path.join(actualDir, rel);
    const ePath = path.join(expectedDir, rel);
    const aText = fs.readFileSync(aPath, 'utf8').replace(/\r\n/g, '\n');
    const eText = fs.readFileSync(ePath, 'utf8').replace(/\r\n/g, '\n');
    // Normalize single trailing newline differences (common across editors)
    const aNorm = aText.endsWith('\n') ? aText : `${aText}\n`;
    const eNorm = eText.endsWith('\n') ? eText : `${eText}\n`;
    expect(aNorm, `file contents differ: ${rel}`).toBe(eNorm);
  }
}

export default {
  listFiles,
  readFileNormalized,
  assertDirMatchesExpected,
};

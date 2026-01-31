import * as crypto from 'node:crypto';
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
  const buf = fs.readFileSync(filePath);
  // If file contains NUL, return base64 to avoid encoding issues (binary)
  if (Buffer.from(buf).includes(0)) {
    return buf.toString('base64');
  }
  const s = buf.toString('utf8');
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

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
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
    const aBuf = fs.readFileSync(aPath);
    const eBuf = fs.readFileSync(ePath);
    const aIsBinary = aBuf.includes(0);
    const eIsBinary = eBuf.includes(0);
    if (aIsBinary || eIsBinary) {
      // compare hashes for binary
      const aHash = sha256(aBuf);
      const eHash = sha256(eBuf);
      expect(aHash, `binary file mismatch: ${rel}`).toBe(eHash);
    } else {
      const aText = aBuf.toString('utf8').replace(/\r\n/g, '\n');
      const eText = eBuf.toString('utf8').replace(/\r\n/g, '\n');
      // Normalize single trailing newline differences (common across editors)
      const aNorm = aText.endsWith('\n') ? aText : `${aText}\n`;
      const eNorm = eText.endsWith('\n') ? eText : `${eText}\n`;
      expect(aNorm, `file contents differ: ${rel}`).toBe(eNorm);
    }
  }
}

export default {
  listFiles,
  readFileNormalized,
  assertDirMatchesExpected,
};

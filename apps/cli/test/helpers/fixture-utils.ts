import * as fs from 'node:fs';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const fixturesDir = join(dirname(__dirname), '../../../packages/core/test/fixtures/projects');

/**
 * Copies a project fixture to a temporary directory and returns the path to the copied siren/ directory.
 * Useful for CLI tests that need to operate on full project structures.
 */
export async function copyProjectFixture(name: string): Promise<string> {
  const src = join(fixturesDir, name);
  const dest = await mkdtemp(join(tmpdir(), 'siren-fixture-'));
  await cp(src, dest, { recursive: true });
  // If the fixture contains a nested `siren/` directory, return that path (legacy fixtures).
  const nested = join(dest, 'siren');
  if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
    // Prefer nested siren/ only if it contains at least one non-empty .siren file.
    try {
      const entries = fs.readdirSync(nested);
      const hasContent = entries.some(
        (e) => e.endsWith('.siren') && fs.statSync(join(nested, e)).size > 0,
      );
      if (hasContent) return nested;
    } catch {
      // Fallthrough to return dest
    }
  }
  // Otherwise return the project root (files are directly under the fixture)
  return dest;
}

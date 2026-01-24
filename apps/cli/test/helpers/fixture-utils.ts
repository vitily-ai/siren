import { cp, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

const fixturesDir = join(dirname(__dirname), '../../../packages/core/test/fixtures/projects');

/**
 * Copies a project fixture to a temporary directory and returns the path to the copied siren/ directory.
 * Useful for CLI tests that need to operate on full project structures.
 */
export async function copyProjectFixture(name: string): Promise<string> {
  const src = join(fixturesDir, name);
  const dest = await mkdtemp(join(tmpdir(), 'siren-fixture-'));
  await cp(src, dest, { recursive: true });
  return join(dest, 'siren');
}

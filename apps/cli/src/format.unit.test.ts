import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { copyProjectFixture } from '../test/helpers/fixture-utils.js';
import { runFormat } from './commands/format.js';

describe('runFormat unit', () => {
  it('prints formatted output for multiple-files fixture', async () => {
    const sirenDir = await copyProjectFixture('multiple-files');
    const cwd = path.basename(sirenDir) === 'siren' ? path.dirname(sirenDir) : sirenDir;
    const originalCwd = process.cwd();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      process.chdir(cwd);
      await runFormat({ dryRun: true });
      expect(logSpy.mock.calls.length).toBeGreaterThan(0);
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
    }
  });
});

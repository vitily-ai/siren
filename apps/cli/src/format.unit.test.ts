import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { copyProjectFixture } from '../test/helpers/fixture-utils';
import { runFormat } from './commands/format';
import { setCurrentContext } from './context-store';
import { runPrepareLifecycle } from './lifecycle';

describe('runFormat unit', () => {
  it('prints formatted output for multiple-files fixture', async () => {
    const sirenDir = await copyProjectFixture('multiple-files');
    const cwd = path.basename(sirenDir) === 'siren' ? path.dirname(sirenDir) : sirenDir;
    const originalCwd = process.cwd();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.chdir(cwd);
    setCurrentContext(await runPrepareLifecycle(process.cwd()));
    await runFormat({ dryRun: true });
    expect(logSpy.mock.calls.length).toBeGreaterThan(0);
    process.chdir(originalCwd);
    logSpy.mockRestore();
  });
});

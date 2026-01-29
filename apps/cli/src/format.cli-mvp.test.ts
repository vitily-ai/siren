import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyProjectFixture } from '../test/helpers/fixture-utils.js';
import { runFormat } from './commands/format.js';

describe('runFormat integration: cli-mvp fixture', () => {
  it('detects semantic change for cli-mvp.siren', async () => {
    const sirenDir = await copyProjectFixture('cli-mvp');
    const cwd = sirenDir.replace(/\/siren$/, '');
    const originalCwd = process.cwd();

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      process.chdir(cwd);
      await runFormat({ dryRun: true });

      const calledWith = errSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(calledWith).not.toContain('Format round-trip changed semantics');
    } finally {
      process.chdir(originalCwd);
      errSpy.mockRestore();
    }
  });
});

describe('cli format round-trip for cli-mvp fixture', () => {
  let originalCwd: string;
  let sirenDir: string;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    originalCwd = process.cwd();
    sirenDir = await copyProjectFixture('cli-mvp');
    // change CWD to project root (parent of siren/)
    process.chdir(path.dirname(sirenDir));
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    process.chdir(originalCwd);
  });

  it('does not emit round-trip changed semantics message', async () => {
    await runFormat({ dryRun: true });

    const called = consoleErrorSpy.mock.calls.some((c) =>
      String(c[0]).includes('Format round-trip changed semantics'),
    );

    expect(called).toBe(false);
  });
});

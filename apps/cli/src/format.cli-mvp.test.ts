import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyProjectFixture } from '../test/helpers/fixture-utils.js';
import { runFormat } from './commands/format.js';

describe('runFormat integration: cli-mvp fixture', () => {
  it('detects semantic change for cli-mvp.siren', async () => {
    const sirenDir = await copyProjectFixture('cli-mvp');
    const cwd = path.basename(sirenDir) === 'siren' ? path.dirname(sirenDir) : sirenDir;
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
    // change CWD to project root (parent of siren/) or to fixture root
    const cwd = path.basename(sirenDir) === 'siren' ? path.dirname(sirenDir) : sirenDir;
    process.chdir(cwd);
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

describe('format summary and verbose listing', () => {
  it('prints Updated 1 files out of 2 and lists updated file when verbose', async () => {
    const originalCwd = process.cwd();
    const sirenDir = await copyProjectFixture('multiple-files');
    try {
      // change CWD to project root (parent of siren/) or to fixture root
      const cwd = path.basename(sirenDir) === 'siren' ? path.dirname(sirenDir) : sirenDir;
      process.chdir(cwd);

      // Make a.siren already match exported form (no attributes -> formatted block)
      const aPath = path.join(sirenDir, 'a.siren');
      fs.writeFileSync(aPath, 'milestone alpha {}\n', 'utf-8');

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        await runFormat({ dryRun: true, verbose: false });
        const calls = logSpy.mock.calls.map((c) => String(c[0]));
        // Last summary line should be 'Updated 1 files out of 2'
        expect(calls[calls.length - 1]).toBe('Updated 1 files out of 2');

        // Verbose run lists the updated file
        logSpy.mockClear();
        await runFormat({ dryRun: true, verbose: true });
        const calls2 = logSpy.mock.calls.map((c) => String(c[0]));
        expect(calls2[0]).toContain('milestone'); // exported content printed first
        // summary should appear at end
        expect(calls2[calls2.length - 2]).toBe('Updated 1 files out of 2');
        // last line should be the file list entry for the updated file (accept
        // either 'b.siren' or 'siren/b.siren' depending on fixture layout)
        const lastLine = String(calls2[calls2.length - 1]);
        expect(lastLine.endsWith('b.siren')).toBe(true);
      } finally {
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(originalCwd);
    }
  });
});

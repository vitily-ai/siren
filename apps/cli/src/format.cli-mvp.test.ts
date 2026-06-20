import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyProjectFixture } from '../test/helpers/fixture-utils';
import { runFormat } from './commands/format';

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

    const errorCalls = consoleErrorSpy.mock.calls as Parameters<typeof console.error>[];
    const called = errorCalls.some((c) =>
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
        // Dry-run mode outputs 'would update' lines via the lifecycle write phase
        expect(calls2[0]).toBe('would update b.siren');
        // summary should appear at end
        expect(calls2[calls2.length - 1]).toBe('Updated 1 files out of 2');
      } finally {
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(originalCwd);
    }
  });
});

// TODO the below should be integration tests
describe('format idempotency — non-dry-run two-pass', () => {
  let originalCwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalCwd = process.cwd();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    process.chdir(originalCwd);
  });

  it('first pass updates some files, second pass shows Updated 0 files out of 2', async () => {
    const sirenDir = await copyProjectFixture('multiple-files');
    const cwd = path.basename(sirenDir) === 'siren' ? path.dirname(sirenDir) : sirenDir;
    process.chdir(cwd);

    // First pass: non-dry-run format with raw fixture
    await runFormat({});
    expect(consoleLogSpy).toHaveBeenCalledExactlyOnceWith('Updated 2 files out of 2');

    // Clear spy to capture second pass output only
    consoleLogSpy.mockClear();

    // Second pass: format again — files are now canonical on disk
    await runFormat({});
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});

describe('format idempotency — pre-canonical content', () => {
  let originalCwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalCwd = process.cwd();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    process.chdir(originalCwd);
  });

  it('detects both files as unchanged when pre-written with canonical format', async () => {
    const sirenDir = await copyProjectFixture('multiple-files');
    const cwd = path.basename(sirenDir) === 'siren' ? path.dirname(sirenDir) : sirenDir;
    process.chdir(cwd);

    // Pre-write both files with already-canonical content
    const aPath = path.join(sirenDir, 'a.siren');
    const bPath = path.join(sirenDir, 'b.siren');
    fs.writeFileSync(aPath, 'milestone alpha {\n  # this is a comment\n}\n', 'utf-8');
    fs.writeFileSync(bPath, 'milestone beta {}\n# this is a comment\n', 'utf-8');

    await runFormat({});
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});

describe('format idempotency — partial update', () => {
  let originalCwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalCwd = process.cwd();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    process.chdir(originalCwd);
  });

  it('updates only the non-canonical file (b.siren) when a.siren is pre-canonical', async () => {
    const sirenDir = await copyProjectFixture('multiple-files');
    const cwd = path.basename(sirenDir) === 'siren' ? path.dirname(sirenDir) : sirenDir;
    process.chdir(cwd);

    // Pre-write a.siren with canonical format (empty milestone)
    const aPath = path.join(sirenDir, 'a.siren');
    fs.writeFileSync(aPath, 'milestone alpha {}\n', 'utf-8');
    // b.siren is left untouched (has original non-canonical content)

    await runFormat({});
    const calls = consoleLogSpy.mock.calls.map((c: any[]) => String(c[0]));
    const summary = calls[calls.length - 1];
    expect(summary).toBe('Updated 1 files out of 2');
  });

  it('lists updated file name when verbose and only one file changed', async () => {
    const sirenDir = await copyProjectFixture('multiple-files');
    const cwd = path.basename(sirenDir) === 'siren' ? path.dirname(sirenDir) : sirenDir;
    process.chdir(cwd);

    // Pre-write a.siren with canonical format
    const aPath = path.join(sirenDir, 'a.siren');
    fs.writeFileSync(aPath, 'milestone alpha {}\n', 'utf-8');

    await runFormat({ verbose: true });
    const calls = consoleLogSpy.mock.calls.map((c: any[]) => String(c[0]));
    // First line should be the updated file name
    expect(calls[0]).toBe('b.siren');
    // Last line should be the summary
    expect(calls[calls.length - 1]).toBe('Updated 1 files out of 2');
  });
});

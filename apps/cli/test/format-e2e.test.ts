import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runFormat } from '../src/commands/format';
import { copyProjectFixture } from './helpers/fixture-utils';

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

  it('first pass updates some files, second pass no updates', async () => {
    const sirenDir = await copyProjectFixture('generic');
    const cwd = path.basename(sirenDir) === 'siren' ? path.dirname(sirenDir) : sirenDir;
    process.chdir(cwd);

    // First pass: non-dry-run format with raw fixture
    await runFormat({});
    expect(consoleLogSpy).toHaveBeenCalledExactlyOnceWith('Updated 1 files out of 7');

    // Clear spy to capture second pass output only
    consoleLogSpy.mockClear();

    // Second pass: format again — files are now canonical on disk
    await runFormat({});
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});

// TODO needs a 'canonical' fixture
describe.skip('format idempotency — pre-canonical content', () => {
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
    const sirenDir = await copyProjectFixture('generic');
    const cwd = path.basename(sirenDir) === 'siren' ? path.dirname(sirenDir) : sirenDir;
    process.chdir(cwd);

    // Pre-write a.siren with canonical format (empty milestone)
    const aPath = path.join(sirenDir, 'a.siren');
    fs.writeFileSync(aPath, 'milestone alpha {}\n', 'utf-8');
    // b.siren is left untouched (has original non-canonical content)

    await runFormat({});
    const calls = consoleLogSpy.mock.calls.map((c: any[]) => String(c[0]));
    const summary = calls[calls.length - 1];
    expect(summary).toBe('Updated 1 files out of 8');
  });

  it('lists updated file name when verbose and only one file changed', async () => {
    const sirenDir = await copyProjectFixture('generic');
    const cwd = path.basename(sirenDir) === 'siren' ? path.dirname(sirenDir) : sirenDir;
    process.chdir(cwd);

    // Pre-write a.siren with canonical format
    const aPath = path.join(sirenDir, 'a.siren');
    fs.writeFileSync(aPath, 'milestone alpha {}\n', 'utf-8');

    await runFormat({ verbose: true });
    const calls = consoleLogSpy.mock.calls.map((c: any[]) => String(c[0]));
    // First line should be the updated file name
    expect(calls[0]).toBe('unformatted.siren');
    // Last line should be the summary
    expect(calls[calls.length - 1]).toBe('Updated 1 files out of 8');
  });
});

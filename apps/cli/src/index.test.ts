import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from './index';
import * as lifecycle from './lifecycle';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'packages',
  'language',
  'test',
  'fixtures',
  'projects',
);

function copyFixture(fixtureName: string, targetDir: string) {
  const nested = path.join(fixturesDir, fixtureName, 'siren');
  const fixturePath = fs.existsSync(nested) ? nested : path.join(fixturesDir, fixtureName);
  const targetSirenDir = path.join(targetDir, 'siren');
  fs.cpSync(fixturePath, targetSirenDir, { recursive: true });
}

describe('siren main', () => {
  let tempDir: string;
  let originalCwd: string;
  let originalExitCode: typeof process.exitCode;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let runLifecycleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siren-main-test-'));
    originalCwd = process.cwd();
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    process.chdir(tempDir);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    runLifecycleSpy = vi.spyOn(lifecycle, 'runLifecycle');
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;
    fs.rmSync(tempDir, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    runLifecycleSpy.mockRestore();
  });

  it('prints version with --version flag', async () => {
    await main(['--version']);

    expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    expect(consoleLogSpy.mock.calls[0][0]).toMatch(/^Siren CLI v\d+\.\d+\.\d+/);
    expect(consoleLogSpy.mock.calls[1][0]).toMatch(/^Siren Core v\d+\.\d+\.\d+/);
    expect(runLifecycleSpy).not.toHaveBeenCalled();
  });

  it('prints usage for unknown command', async () => {
    await main(['unknown-command']);

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][0]).toContain('Usage: siren <command>');
    expect(runLifecycleSpy).not.toHaveBeenCalled();
  });

  it('prints usage with no arguments', async () => {
    await main([]);

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][0]).toContain('Usage: siren <command>');
    expect(runLifecycleSpy).not.toHaveBeenCalled();
  });

  it('show command sets exit code when entry id is missing', async () => {
    await main(['show']);

    expect(consoleErrorSpy).toHaveBeenCalledWith('missing entry id — usage: siren show <entry-id>');
    expect(process.exitCode).toBe(1);
    // The command throws before invoking the lifecycle.
    expect(runLifecycleSpy).not.toHaveBeenCalled();
  });

  it('show command sets exit code on runtime error', async () => {
    copyFixture('generic-thin', tempDir);

    await main(['show', 'missing']);

    const errOutput = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(errOutput).toContain("Entry with ID 'missing' not found");
    expect(process.exitCode).toBe(1);
    expect(runLifecycleSpy).toHaveBeenCalledTimes(1);
  });
});

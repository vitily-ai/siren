import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init, list, main } from './index.js';

describe('siren init', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siren-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates all files on fresh init', () => {
    const result = init(tempDir);

    expect(result.created).toEqual(['siren', 'siren/siren.config.yaml', 'siren/main.siren']);
    expect(result.skipped).toEqual([]);

    // Verify files exist with correct contents
    const sirenDir = path.join(tempDir, 'siren');
    expect(fs.existsSync(sirenDir)).toBe(true);
    expect(fs.statSync(sirenDir).isDirectory()).toBe(true);

    const configPath = path.join(sirenDir, 'siren.config.yaml');
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.readFileSync(configPath, 'utf-8')).toBe('# project_name: Siren Project\n');

    const mainPath = path.join(sirenDir, 'main.siren');
    expect(fs.existsSync(mainPath)).toBe(true);
    expect(fs.readFileSync(mainPath, 'utf-8')).toBe('');
  });

  it('skips existing directory but creates missing files', () => {
    // Pre-create the siren directory
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);

    const result = init(tempDir);

    expect(result.created).toEqual(['siren/siren.config.yaml', 'siren/main.siren']);
    expect(result.skipped).toEqual(['siren']);

    // Verify files were created
    expect(fs.existsSync(path.join(sirenDir, 'siren.config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(sirenDir, 'main.siren'))).toBe(true);
  });

  it('skips existing config but creates missing main file', () => {
    // Pre-create siren directory and config
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'siren.config.yaml'), '# custom config\n');

    const result = init(tempDir);

    expect(result.created).toEqual(['siren/main.siren']);
    expect(result.skipped).toEqual(['siren', 'siren/siren.config.yaml']);

    // Verify original config is preserved
    expect(fs.readFileSync(path.join(sirenDir, 'siren.config.yaml'), 'utf-8')).toBe(
      '# custom config\n',
    );
  });

  it('skips everything when all files already exist', () => {
    // Pre-create everything
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'siren.config.yaml'), '# existing\n');
    fs.writeFileSync(path.join(sirenDir, 'main.siren'), 'milestone "existing" {}');

    const result = init(tempDir);

    expect(result.created).toEqual([]);
    expect(result.skipped).toEqual(['siren', 'siren/siren.config.yaml', 'siren/main.siren']);

    // Verify original contents are preserved
    expect(fs.readFileSync(path.join(sirenDir, 'siren.config.yaml'), 'utf-8')).toBe('# existing\n');
    expect(fs.readFileSync(path.join(sirenDir, 'main.siren'), 'utf-8')).toBe(
      'milestone "existing" {}',
    );
  });

  it('skips main.siren but creates config when only main exists', () => {
    // Pre-create siren directory and main file only
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'main.siren'), '');

    const result = init(tempDir);

    expect(result.created).toEqual(['siren/siren.config.yaml']);
    expect(result.skipped).toEqual(['siren', 'siren/main.siren']);
  });
});

describe('siren list', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siren-list-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty when no siren/ directory exists', async () => {
    const result = await list(tempDir);

    expect(result.milestones).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('returns empty when siren/ exists but has no .siren files', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);

    const result = await list(tempDir);

    expect(result.milestones).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('returns empty when siren/ has .siren files but no milestones', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(
      path.join(sirenDir, 'tasks.siren'),
      `task alpha {}
task beta {}`,
    );

    const result = await list(tempDir);

    expect(result.milestones).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('lists milestones from valid .siren files', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(
      path.join(sirenDir, 'main.siren'),
      `milestone alpha {}
milestone beta {}
task not_a_milestone {}`,
    );

    const result = await list(tempDir);

    expect(result.milestones).toEqual(['alpha', 'beta']);
    expect(result.warnings).toEqual([]);
  });

  it('lists milestones from multiple .siren files', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'a.siren'), 'milestone alpha {}');
    fs.writeFileSync(path.join(sirenDir, 'b.siren'), 'milestone beta {}');

    const result = await list(tempDir);

    expect(result.milestones).toContain('alpha');
    expect(result.milestones).toContain('beta');
    expect(result.milestones).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('recursively finds .siren files in subdirectories', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    const subDir = path.join(sirenDir, 'subdir');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(sirenDir, 'root.siren'), 'milestone root {}');
    fs.writeFileSync(path.join(subDir, 'nested.siren'), 'milestone nested {}');

    const result = await list(tempDir);

    expect(result.milestones).toContain('root');
    expect(result.milestones).toContain('nested');
    expect(result.milestones).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('skips files with parse errors and emits warning', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'valid.siren'), 'milestone valid {}');
    fs.writeFileSync(path.join(sirenDir, 'broken.siren'), 'this is not valid siren syntax!!!');

    const result = await list(tempDir);

    expect(result.milestones).toEqual(['valid']);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toBe('Warning: skipping siren/broken.siren (parse error)');
  });

  it('handles quoted milestone identifiers', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(
      path.join(sirenDir, 'quoted.siren'),
      `milestone "Q1 Launch" {}
milestone "MVP Release" {}`,
    );

    const result = await list(tempDir);

    expect(result.milestones).toEqual(['Q1 Launch', 'MVP Release']);
    expect(result.warnings).toEqual([]);
  });

  it('handles empty .siren files gracefully', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'empty.siren'), '');
    fs.writeFileSync(path.join(sirenDir, 'whitespace.siren'), '   \n  \n  ');

    const result = await list(tempDir);

    expect(result.milestones).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('handles Unicode in milestone names', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(
      path.join(sirenDir, 'unicode.siren'),
      `milestone "🚀 Launch" {}
milestone "日本語マイルストーン" {}
milestone "émojis-and-accénts" {}`,
    );

    const result = await list(tempDir);

    expect(result.milestones).toContain('🚀 Launch');
    expect(result.milestones).toContain('日本語マイルストーン');
    expect(result.milestones).toContain('émojis-and-accénts');
    expect(result.milestones).toHaveLength(3);
    expect(result.warnings).toEqual([]);
  });

  it('handles deeply nested directories', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    const deepPath = path.join(sirenDir, 'a', 'b', 'c', 'd', 'e');
    fs.mkdirSync(deepPath, { recursive: true });
    fs.writeFileSync(path.join(sirenDir, 'root.siren'), 'milestone root {}');
    fs.writeFileSync(path.join(sirenDir, 'a', 'level1.siren'), 'milestone level1 {}');
    fs.writeFileSync(path.join(deepPath, 'deep.siren'), 'milestone deep {}');

    const result = await list(tempDir);

    expect(result.milestones).toContain('root');
    expect(result.milestones).toContain('level1');
    expect(result.milestones).toContain('deep');
    expect(result.milestones).toHaveLength(3);
    expect(result.warnings).toEqual([]);
  });

  it('handles multiple files with parse errors', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'valid.siren'), 'milestone valid {}');
    fs.writeFileSync(path.join(sirenDir, 'broken1.siren'), '!!! syntax error');
    fs.writeFileSync(path.join(sirenDir, 'broken2.siren'), '@@@ another error');

    const result = await list(tempDir);

    expect(result.milestones).toEqual(['valid']);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.every((w) => w.startsWith('Warning: skipping'))).toBe(true);
  });
});

describe('siren main', () => {
  let tempDir: string;
  let originalCwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siren-main-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('prints version with --version flag', async () => {
    await main(['--version']);

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy.mock.calls[0][0]).toMatch(/^Siren CLI v\d+\.\d+\.\d+/);
  });

  it('prints usage for unknown command', async () => {
    await main(['unknown-command']);

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][0]).toContain('Usage: siren <command>');
  });

  it('prints usage with no arguments', async () => {
    await main([]);

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][0]).toContain('Usage: siren <command>');
  });

  it('runs init command', async () => {
    await main(['init']);

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls.some((call) => call[0].includes('Created siren'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'siren'))).toBe(true);
  });

  it('runs list command', async () => {
    // Setup: create siren dir with milestones
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'main.siren'), 'milestone test_milestone {}');

    await main(['list']);

    expect(consoleLogSpy).toHaveBeenCalledWith('test_milestone');
  });

  it('list command outputs warnings to stderr', async () => {
    // Setup: create siren dir with broken file
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'broken.siren'), '!!! broken');

    await main(['list']);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('Warning: skipping');
  });
});

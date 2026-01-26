import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyProjectFixture } from '../test/helpers/fixture-utils.js';
import { init, list, main, renderDependencyChains } from './index.js';
import * as project from './project.js';
import { loadProject } from './project.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'packages',
  'core',
  'test',
  'fixtures',
  'projects',
);

function copyFixture(fixtureName: string, targetDir: string) {
  const fixturePath = path.join(fixturesDir, fixtureName, 'siren');
  const targetSirenDir = path.join(targetDir, 'siren');
  fs.cpSync(fixturePath, targetSirenDir, { recursive: true });
}

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
    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('returns empty when siren/ exists but has no .siren files', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);

    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('returns empty when siren/ has .siren files but no milestones', async () => {
    copyFixture('no-milestones-only-tasks', tempDir);

    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('lists milestones from valid .siren files', async () => {
    const sirenDir = await copyProjectFixture('list-milestones');
    const cwd = path.dirname(sirenDir);

    await loadProject(cwd);
    const result = await list();

    expect(result.milestones).toEqual(['alpha', 'beta']);
    expect(result.warnings).toEqual([]);
  });

  // Output for listing milestones is covered by golden-file tests; keep list() return-value checks above.

  it('lists milestones from multiple .siren files', async () => {
    copyFixture('multiple-files', tempDir);

    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toContain('alpha');
    expect(result.milestones).toContain('beta');
    expect(result.milestones).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('recursively finds .siren files in subdirectories', async () => {
    copyFixture('recursive', tempDir);

    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toContain('root');
    expect(result.milestones).toContain('nested');
    expect(result.milestones).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('skips files with parse errors and emits warning', async () => {
    copyFixture('parse-errors', tempDir);

    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toEqual(['valid']);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toBe('Warning: skipping siren/broken.siren (parse error)');
  });

  it('handles quoted milestone identifiers', async () => {
    copyFixture('quoted-identifiers', tempDir);

    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toEqual(['Q1 Launch', 'MVP Release']);
    expect(result.warnings).toEqual([]);
  });

  it('handles empty .siren files gracefully', async () => {
    copyFixture('empty-files', tempDir);

    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('handles Unicode in milestone names', async () => {
    copyFixture('unicode', tempDir);

    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toContain('🚀 Launch');
    expect(result.milestones).toContain('日本語マイルストーン');
    expect(result.milestones).toContain('émojis-and-accénts');
    expect(result.milestones).toHaveLength(3);
    expect(result.warnings).toEqual([]);
  });

  it('handles deeply nested directories', async () => {
    copyFixture('deep-nested', tempDir);

    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toContain('root');
    expect(result.milestones).toContain('level1');
    expect(result.milestones).toContain('deep');
    expect(result.milestones).toHaveLength(3);
    expect(result.warnings).toEqual([]);
  });

  it('handles multiple files with parse errors', async () => {
    copyFixture('multiple-parse-errors', tempDir);

    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toEqual(['valid']);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.every((w) => w.startsWith('Warning: skipping'))).toBe(true);
  });

  it('uses the loaded project context', async () => {
    copyFixture('loaded-project', tempDir);

    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toEqual(['test']);
  });

  it('lists tasks by milestone when showTasks is true', async () => {
    copyFixture('tasks-by-milestone', tempDir);

    await loadProject(tempDir);
    const result = await list(true);

    expect(result.milestones).toEqual(['alpha', 'beta']);
    expect(result.chainsByMilestone).toBeDefined();
    expect(result.chainsByMilestone?.get('alpha')).toEqual([['alpha', 'task1']]);
    expect(result.chainsByMilestone?.get('beta')).toEqual([]);
  });

  it('handles array depends_on in tasks', async () => {
    copyFixture('array-depends', tempDir);

    await loadProject(tempDir);
    const result = await list(true);

    expect(result.chainsByMilestone?.get('alpha')).toEqual([['alpha', 'task1']]);
    expect(result.chainsByMilestone?.get('gamma')).toEqual([['gamma', 'task1']]);
  });
});

describe('renderDependencyChains', () => {
  it('renders empty chains', () => {
    expect(renderDependencyChains([])).toEqual([]);
  });

  it('renders single chain with depth 1', () => {
    const chains = [['milestone', 'task1']];
    expect(renderDependencyChains(chains)).toEqual(['└─ task1']);
  });

  it('renders single chain with depth 2', () => {
    const chains = [['milestone', 'dep1', 'task1']];
    expect(renderDependencyChains(chains)).toEqual(['└─ dep1', '   └─ task1']);
  });

  it('renders truncated chain', () => {
    const chains = [['milestone', 'dep1', 'dep2', 'dep3', 'dep4', 'task1']];
    expect(renderDependencyChains(chains)).toEqual([
      '└─ dep1',
      '   └─ … (3 intermediate dependencies)',
      '      └─ task1',
    ]);
  });

  it('renders multiple chains', () => {
    const chains = [
      ['milestone', 'dep1', 'task1'],
      ['milestone', 'dep1', 'task2'],
    ];
    expect(renderDependencyChains(chains)).toEqual(['└─ dep1', '   ├─ task1', '   └─ task2']);
  });

  it('renders branching chains', () => {
    const chains = [
      ['milestone', 'dep1', 'sub1', 'task1'],
      ['milestone', 'dep1', 'sub2', 'task2'],
    ];
    expect(renderDependencyChains(chains)).toEqual([
      '└─ dep1',
      '   ├─ sub1',
      '   │  └─ task1',
      '   └─ sub2',
      '      └─ task2',
    ]);
  });
});

describe('siren main', () => {
  let tempDir: string;
  let originalCwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let loadProjectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siren-main-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadProjectSpy = vi.spyOn(project, 'loadProject');
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    loadProjectSpy.mockRestore();
  });

  it('prints version with --version flag', async () => {
    await main(['--version']);

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy.mock.calls[0][0]).toMatch(/^Siren CLI v\d+\.\d+\.\d+/);
    expect(loadProjectSpy).not.toHaveBeenCalled();
  });

  it('prints usage for unknown command', async () => {
    await main(['unknown-command']);

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][0]).toContain('Usage: siren <command>');
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });

  it('prints usage with no arguments', async () => {
    await main([]);

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][0]).toContain('Usage: siren <command>');
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });

  it('runs init command', async () => {
    await main(['init']);
    // Creation side-effect verified below; CLI output string is covered by golden tests.
    expect(fs.existsSync(path.join(tempDir, 'siren'))).toBe(true);
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });

  it('init command outputs warnings to stderr before command output', async () => {
    // Setup: create siren dir with broken file
    copyFixture('init-with-broken', tempDir);

    await main(['init']);

    // Check that error is called before log
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('Warning: skipping');
    expect(consoleLogSpy).toHaveBeenCalled();
    expect(
      consoleLogSpy.mock.calls.some((call: unknown[]) =>
        (call[0] as string).includes('Skipped siren'),
      ),
    ).toBe(true);
    // Since error is called in main before runInit, and runInit calls log
    expect(consoleErrorSpy.mock.invocationCallOrder[0]).toBeLessThan(
      consoleLogSpy.mock.invocationCallOrder[0],
    );
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });

  it('runs list command', async () => {
    // Setup: create siren dir with milestones
    copyFixture('list-single-milestone', tempDir);

    await main(['list']);
    // Output content is covered by golden tests; here we ensure the project was loaded.
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });

  it('list command outputs warnings to stderr', async () => {
    // Setup: create siren dir with broken file
    copyFixture('list-with-broken', tempDir);

    await main(['list']);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('Warning: skipping');
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });

  it('list command outputs warnings before milestones', async () => {
    // Setup: create siren dir with broken and valid files
    copyFixture('list-with-broken-and-valid', tempDir);

    await main(['list']);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('Warning: skipping');
    expect(consoleLogSpy).toHaveBeenCalledWith('test');
    // Since runList prints warnings to error, then milestones to log
    expect(consoleErrorSpy.mock.invocationCallOrder[0]).toBeLessThan(
      consoleLogSpy.mock.invocationCallOrder[0],
    );
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });

  it('runs list -t command', async () => {
    // Setup: create siren dir with milestones and tasks
    copyFixture('tasks-by-milestone', tempDir);

    await main(['list', '-t']);
    // Detailed output assertions covered by golden tests; ensure CLI invoked project loading and emitted output.
    expect(consoleLogSpy).toHaveBeenCalled();
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });

  it('runs list --tasks command', async () => {
    // Setup: create siren dir with milestones and tasks
    copyFixture('list-tasks-alpha-only', tempDir);

    await main(['list', '--tasks']);
    // Detailed output assertions covered by golden tests; ensure CLI invoked project loading and emitted output.
    expect(consoleLogSpy).toHaveBeenCalled();
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });

  it('list command outputs multiple circular dependency warnings', async () => {
    // Setup: create siren dir with overlapping cycles
    copyFixture('overlapping-cycles', tempDir);

    await main(['list']);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      1,
      'Warning: siren/main.siren: Circular dependency detected: a -> b -> c -> a',
    );
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      2,
      'Warning: siren/main.siren: Circular dependency detected: a -> c -> a',
    );
    // The milestone output itself is validated by golden tests; ensure something was logged.
    expect(consoleLogSpy).toHaveBeenCalled();
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });
});

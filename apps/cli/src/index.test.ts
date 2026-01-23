import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init, list, main } from './index.js';
import * as project from './project.js';
import { loadProject } from './project.js';

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
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(
      path.join(sirenDir, 'tasks.siren'),
      `task alpha {}
task beta {}`,
    );

    await loadProject(tempDir);
    const result = await list();

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

    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toEqual(['alpha', 'beta']);
    expect(result.warnings).toEqual([]);
  });

  it('lists milestones from multiple .siren files', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'a.siren'), 'milestone alpha {}');
    fs.writeFileSync(path.join(sirenDir, 'b.siren'), 'milestone beta {}');

    await loadProject(tempDir);
    const result = await list();

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

    await loadProject(tempDir);
    const result = await list();

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

    await loadProject(tempDir);
    const result = await list();

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

    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toEqual(['Q1 Launch', 'MVP Release']);
    expect(result.warnings).toEqual([]);
  });

  it('handles empty .siren files gracefully', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'empty.siren'), '');
    fs.writeFileSync(path.join(sirenDir, 'whitespace.siren'), '   \n  \n  ');

    await loadProject(tempDir);
    const result = await list();

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

    await loadProject(tempDir);
    const result = await list();

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

    await loadProject(tempDir);
    const result = await list();

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

    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toEqual(['valid']);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.every((w) => w.startsWith('Warning: skipping'))).toBe(true);
  });

  it('uses the loaded project context', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'test.siren'), 'milestone test {}');

    await loadProject(tempDir);
    const result = await list();

    expect(result.milestones).toEqual(['test']);
  });

  it('lists tasks by milestone when showTasks is true', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(
      path.join(sirenDir, 'main.siren'),
      `milestone alpha {
  depends_on = task1
}
task task1 {}
task task2 complete {}
milestone beta {}`,
    );

    await loadProject(tempDir);
    const result = await list(true);

    expect(result.milestones).toEqual(['alpha', 'beta']);
    expect(result.tasksByMilestone).toBeDefined();
    expect(result.tasksByMilestone!.get('alpha')).toEqual(['task1']);
    expect(result.tasksByMilestone!.get('beta')).toEqual([]);
  });

  it('handles array depends_on in tasks', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(
      path.join(sirenDir, 'main.siren'),
      `milestone alpha {
  depends_on = task1
}
milestone gamma {
  depends_on = task1
}
task task1 {}`,
    );

    await loadProject(tempDir);
    const result = await list(true);

    expect(result.tasksByMilestone!.get('alpha')).toEqual(['task1']);
    expect(result.tasksByMilestone!.get('gamma')).toEqual(['task1']);
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

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls.some((call) => call[0].includes('Created siren'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'siren'))).toBe(true);
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });

  it('init command outputs warnings to stderr before command output', async () => {
    // Setup: create siren dir with broken file
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'broken.siren'), '!!! broken');

    await main(['init']);

    // Check that error is called before log
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('Warning: skipping');
    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls.some((call) => call[0].includes('Skipped siren'))).toBe(true);
    // Since error is called in main before runInit, and runInit calls log
    expect(consoleErrorSpy.mock.invocationCallOrder[0]).toBeLessThan(
      consoleLogSpy.mock.invocationCallOrder[0],
    );
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });

  it('runs list command', async () => {
    // Setup: create siren dir with milestones
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'main.siren'), 'milestone test_milestone {}');

    await main(['list']);

    expect(consoleLogSpy).toHaveBeenCalledWith('test_milestone');
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });

  it('list command outputs warnings to stderr', async () => {
    // Setup: create siren dir with broken file
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'broken.siren'), '!!! broken');

    await main(['list']);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('Warning: skipping');
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });

  it('list command outputs warnings before milestones', async () => {
    // Setup: create siren dir with broken and valid files
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'broken.siren'), '!!! broken');
    fs.writeFileSync(path.join(sirenDir, 'valid.siren'), 'milestone test {}');

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
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(
      path.join(sirenDir, 'main.siren'),
      `milestone alpha {
  depends_on = task1
}
task task1 {}
milestone beta {}`,
    );

    await main(['list', '-t']);

    expect(consoleLogSpy).toHaveBeenCalledWith('alpha');
    expect(consoleLogSpy).toHaveBeenCalledWith('\ttask1');
    expect(consoleLogSpy).toHaveBeenCalledWith('beta');
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });

  it('runs list --tasks command', async () => {
    // Setup: create siren dir with milestones and tasks
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(
      path.join(sirenDir, 'main.siren'),
      `milestone alpha {
  depends_on = task1
}
task task1 {}`,
    );

    await main(['list', '--tasks']);

    expect(consoleLogSpy).toHaveBeenCalledWith('alpha');
    expect(consoleLogSpy).toHaveBeenCalledWith('\ttask1');
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
  });
});

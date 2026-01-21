import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getLoadedContext, loadProject } from './project.js';

describe('project loading', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siren-project-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty context when no siren directory exists', async () => {
    const ctx = await loadProject(tempDir);

    expect(ctx.cwd).toBe(tempDir);
    expect(ctx.rootDir).toBe(tempDir);
    expect(ctx.sirenDir).toBe(path.join(tempDir, 'siren'));
    expect(ctx.files).toEqual([]);
    expect(ctx.milestones).toEqual([]);
    expect(ctx.warnings).toEqual([]);
    expect(ctx.errors).toEqual([]);
  });

  it('returns empty context when siren directory exists but no files', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);

    const ctx = await loadProject(tempDir);

    expect(ctx.files).toEqual([]);
    expect(ctx.milestones).toEqual([]);
    expect(ctx.warnings).toEqual([]);
    expect(ctx.errors).toEqual([]);
  });

  it('finds and loads milestones from .siren files', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(
      path.join(sirenDir, 'main.siren'),
      `milestone alpha {}
milestone beta {}
task gamma {}`,
    );

    const ctx = await loadProject(tempDir);

    expect(ctx.files).toHaveLength(1);
    expect(ctx.files[0]).toBe(path.join(sirenDir, 'main.siren'));
    expect(ctx.milestones).toEqual(['alpha', 'beta']);
    expect(ctx.warnings).toEqual([]);
    expect(ctx.errors).toEqual([]);
  });

  it('recursively finds .siren files in subdirectories', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    const subDir = path.join(sirenDir, 'subdir');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(sirenDir, 'root.siren'), 'milestone root {}');
    fs.writeFileSync(path.join(subDir, 'nested.siren'), 'milestone nested {}');

    const ctx = await loadProject(tempDir);

    expect(ctx.files).toHaveLength(2);
    expect(ctx.files).toContain(path.join(sirenDir, 'root.siren'));
    expect(ctx.files).toContain(path.join(subDir, 'nested.siren'));
    expect(ctx.milestones).toEqual(['root', 'nested']);
  });

  it('handles parse errors with warnings', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'valid.siren'), 'milestone valid {}');
    fs.writeFileSync(path.join(sirenDir, 'broken.siren'), '!!! invalid syntax');

    const ctx = await loadProject(tempDir);

    expect(ctx.files).toHaveLength(2);
    expect(ctx.milestones).toEqual(['valid']);
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0]).toBe('Warning: skipping siren/broken.siren (parse error)');
    expect(ctx.errors).toEqual([]);
  });

  it('handles quoted milestone identifiers', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(
      path.join(sirenDir, 'quoted.siren'),
      `milestone "Q1 Launch" {}
milestone "MVP Release" {}`,
    );

    const ctx = await loadProject(tempDir);

    expect(ctx.milestones).toEqual(['Q1 Launch', 'MVP Release']);
  });

  it('stores loaded context in global state', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'test.siren'), 'milestone test {}');

    await loadProject(tempDir);

    const loaded = getLoadedContext();
    expect(loaded).not.toBeNull();
    expect(loaded!.milestones).toEqual(['test']);
  });

  it('overwrites previous loaded context on new load', async () => {
    // First load
    const sirenDir1 = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir1);
    fs.writeFileSync(path.join(sirenDir1, 'first.siren'), 'milestone first {}');
    await loadProject(tempDir);

    expect(getLoadedContext()!.milestones).toEqual(['first']);

    // Second load - different directory
    const tempDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'siren-project-test2-'));
    const sirenDir2 = path.join(tempDir2, 'siren');
    fs.mkdirSync(sirenDir2);
    fs.writeFileSync(path.join(sirenDir2, 'second.siren'), 'milestone second {}');
    await loadProject(tempDir2);

    expect(getLoadedContext()!.milestones).toEqual(['second']);

    // Cleanup
    fs.rmSync(tempDir2, { recursive: true, force: true });
  });

  it('returns the same context object that is stored globally', async () => {
    const ctx = await loadProject(tempDir);
    const loaded = getLoadedContext();

    expect(loaded).toBe(ctx);
  });
});

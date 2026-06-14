import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runLifecycle } from './lifecycle';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
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
  const fixturePath = path.join(fixturesDir, fixtureName, 'siren');
  const targetSirenDir = path.join(targetDir, 'siren');
  fs.cpSync(fixturePath, targetSirenDir, { recursive: true });
}

describe('lifecycle', () => {
  let tempDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siren-project-test-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('returns empty context when no siren directory exists', async () => {
    const ctx = await runLifecycle(tempDir);

    expect(ctx.cwd).toBe(tempDir);
    expect(ctx.rootDir).toBe(tempDir);
    expect(ctx.sirenDir).toBe(path.join(tempDir, 'siren'));
    expect(ctx.files).toEqual([]);
    expect(ctx.ir?.getMilestoneIds() ?? []).toEqual([]);
    expect(ctx.warnings).toEqual([]);
    expect(ctx.errors).toEqual([]);
  });

  it('returns empty context when siren directory exists but no files', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);

    const ctx = await runLifecycle(tempDir);

    expect(ctx.files).toEqual([]);
    expect(ctx.ir?.getMilestoneIds() ?? []).toEqual([]);
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

    const ctx = await runLifecycle(tempDir);

    expect(ctx.files).toHaveLength(1);
    expect(ctx.files[0]).toBe(path.join(sirenDir, 'main.siren'));
    expect(ctx.ir?.getMilestoneIds() ?? []).toEqual(['alpha', 'beta']);
    expect(ctx.warnings).toEqual([]);
    expect(ctx.errors).toEqual([]);
  });

  it('recursively finds .siren files in subdirectories', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    const subDir = path.join(sirenDir, 'subdir');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(sirenDir, 'root.siren'), 'milestone root {}');
    fs.writeFileSync(path.join(subDir, 'nested.siren'), 'milestone nested {}');

    const ctx = await runLifecycle(tempDir);

    expect(ctx.files).toHaveLength(2);
    expect(ctx.files).toContain(path.join(sirenDir, 'root.siren'));
    expect(ctx.files).toContain(path.join(subDir, 'nested.siren'));
    expect(ctx.ir?.getMilestoneIds() ?? []).toEqual(['root', 'nested']);
  });

  it('handles parse errors with errors and skips broken documents', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'valid.siren'), 'milestone valid {}');
    fs.writeFileSync(path.join(sirenDir, 'broken.siren'), '!!! invalid syntax');

    const ctx = await runLifecycle(tempDir);

    expect(ctx.files).toHaveLength(2);
    // The valid file still decodes; broken resource(s) are excluded individually.
    expect(ctx.ir?.getMilestoneIds() ?? []).toEqual(['valid']);
    expect(ctx.warnings).toEqual([]);
    expect(ctx.errors).toHaveLength(1);
    expect(ctx.errors[0]).toContain('siren/broken.siren:1:1: EL003: unexpected token');
  });

  it('handles quoted milestone identifiers', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(
      path.join(sirenDir, 'quoted.siren'),
      `milestone "Q1 Launch" {}
milestone "MVP Release" {}`,
    );

    const ctx = await runLifecycle(tempDir);

    expect(ctx.ir?.getMilestoneIds() ?? []).toEqual(['Q1 Launch', 'MVP Release']);
  });

  it('collects decoding warnings from core', async () => {
    copyFixture('circular-depends', tempDir);

    const ctx = await runLifecycle(tempDir);

    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0]).toContain(
      'siren/main.siren:1:0: W001: Circular dependency detected: task1 -> task2 -> task3 -> task1',
    );
  });

  it('applies builder mutation before project build', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'main.siren'), 'milestone alpha {}');

    const ctx = await runLifecycle(tempDir, {
      mutate: (builder) =>
        builder.withEntry({ type: 'milestone', id: 'patched', attributes: [] }).builder,
    });

    expect(ctx.ir?.getMilestoneIds() ?? []).toEqual(['alpha', 'patched']);

    const phases = Array.from(ctx.phasesRun);
    expect(phases.indexOf('builder-construction')).toBeLessThan(phases.indexOf('builder-mutation'));
    expect(phases.indexOf('builder-mutation')).toBeLessThan(phases.indexOf('project-build'));
  });

  it('aborts write when errors are present (query still runs)', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    const validPath = path.join(sirenDir, 'valid.siren');
    const brokenPath = path.join(sirenDir, 'broken.siren');
    fs.writeFileSync(validPath, 'milestone valid {}');
    fs.writeFileSync(brokenPath, '!!! invalid');

    const validMtime = fs.statSync(validPath).mtimeMs;
    await new Promise((r) => setTimeout(r, 10));

    const queryFn = vi.fn(() => ({ stdout: 'ran' }));
    const ctx = await runLifecycle(tempDir, {
      mutate: (builder) =>
        builder.patchEntry('valid', (r) => ({
          ...r,
          attributes: [...r.attributes, { key: 'description', value: ['patched'] as const }],
        })).builder,
      query: queryFn,
    });

    expect(ctx.errors.length).toBeGreaterThan(0);
    expect(queryFn).toHaveBeenCalled();
    const phases = Array.from(ctx.phasesRun);
    expect(phases).toContain('query');
    expect(phases).not.toContain('write');
    expect(fs.readFileSync(validPath, 'utf-8')).not.toContain('patched');
    expect(fs.statSync(validPath).mtimeMs).toBe(validMtime);
  });

  it('write phase is a no-op when no mutate hook is supplied', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    const filePath = path.join(sirenDir, 'main.siren');
    const original = 'milestone alpha {}';
    fs.writeFileSync(filePath, original);

    await runLifecycle(tempDir);

    // No mutate hook => write phase must not touch any file.
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(original);
  });

  // TODO writeback on mutation is not yet implemented
  it.skip('write phase rewrites only files affected by mutation', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    const aPath = path.join(sirenDir, 'a.siren');
    const bPath = path.join(sirenDir, 'b.siren');
    fs.writeFileSync(aPath, 'task target {}\n');
    fs.writeFileSync(bPath, 'milestone untouched {}\n');

    const beforeB = fs.readFileSync(bPath, 'utf-8');
    const beforeBMtime = fs.statSync(bPath).mtimeMs;
    await new Promise((r) => setTimeout(r, 10));

    await runLifecycle(tempDir, {
      mutate: (builder) =>
        builder.patchEntry('target', (r) => ({
          ...r,
          attributes: [...r.attributes, { key: 'description', value: ['patched'] as const }],
        })).builder,
    });

    expect(fs.readFileSync(aPath, 'utf-8')).toContain('description');
    expect(fs.readFileSync(bPath, 'utf-8')).toBe(beforeB);
    expect(fs.statSync(bPath).mtimeMs).toBe(beforeBMtime);
  });
});

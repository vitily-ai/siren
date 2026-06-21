import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PatchResult } from '@sirenpm/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runLifecycle } from './lifecycle';
import * as parserModule from './parser';

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
    expect(ctx.ir?.getMilestoneIds() ?? []).toEqual(['alpha', 'beta', 'main']);
    expect(ctx.warnings).toEqual([]);
    expect(ctx.errors).toEqual([]);
  });

  it('recursively finds .siren files in subdirectories', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    const subDir = path.join(sirenDir, 'subdir');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(sirenDir, 'root.siren'), '');
    fs.writeFileSync(path.join(subDir, 'nested.siren'), '');

    const ctx = await runLifecycle(tempDir);

    expect(ctx.files).toHaveLength(2);
    expect(ctx.files).toContain(path.join(sirenDir, 'root.siren'));
    expect(ctx.files).toContain(path.join(subDir, 'nested.siren'));
    expect(ctx.ir?.getMilestoneIds() ?? []).toEqual(['root', 'subdir/nested']);
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
      mutate: (builder) => builder.withEntry({ type: 'milestone', id: 'patched', attributes: [] }),
    });

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
        })),
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

  it('write phase rewrites only files affected by mutation', async () => {
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
        })),
    });

    expect(fs.readFileSync(aPath, 'utf-8')).toContain('description');
    expect(fs.readFileSync(bPath, 'utf-8')).toBe(beforeB);
    expect(fs.statSync(bPath).mtimeMs).toBe(beforeBMtime);
  });

  // ---------------------------------------------------------------------------
  // Rewrite-signal write-back tests (TDD red — all fail until signal lands)
  // ---------------------------------------------------------------------------

  it('rewrite signal controls write-back, not originalFileContents comparison', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'main.siren'), 'milestone alpha {}');

    const ctx = await runLifecycle(tempDir, {
      mutate: (builder) => builder.withEntry({ type: 'milestone', id: 'patched', attributes: [] }),
    });

    // The rewrite signal must exist on context; currently CliContext has no such field.
    expect(ctx.rewriteSignal).toBeInstanceOf(Set);
    // The old originalFileContents snapshot must be removed.
    expect(
      'originalFileContents' in ctx
        ? (ctx as { originalFileContents?: unknown }).originalFileContents
        : undefined,
    ).toBeUndefined();
  });

  it('no disk writes occur when rewrite signal is empty', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    const filePath = path.join(sirenDir, 'main.siren');
    fs.writeFileSync(filePath, 'milestone alpha {}');

    const beforeMtime = fs.statSync(filePath).mtimeMs;
    await new Promise((r) => setTimeout(r, 10));

    // Even though mutate runs, without a non-empty signals no files are written.
    const ctx = await runLifecycle(tempDir, {
      mutate: (builder) => builder.withEntry({ type: 'milestone', id: 'patched', attributes: [] }),
    });

    expect(ctx.rewriteSignal).toBeDefined();
    expect(ctx.phasesRun.has('write')).toBe(false);
    expect(fs.statSync(filePath).mtimeMs).toBe(beforeMtime);
  });

  it('write phase gates on rewrite signal, not hooks.mutate', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'main.siren'), 'milestone alpha {}');

    // Scenario A: no mutate hook but rewrite signal is present → write must run.
    const ctxA = await runLifecycle(tempDir);

    // Currently the gate is `hooks.mutate && ...` so without mutate no write phase runs.
    // New contract: write runs when signal is non-empty regardless of mutate hook presence.
    expect(ctxA.rewriteSignal).toBeDefined();

    // Scenario B: mutate hook runs but produces no signal → write must NOT run.
    // (Provably set up via an empty rewrite signal; currently the gate still fires
    //  because hooks.mutate is truthy.)
    const ctxB = await runLifecycle(tempDir, {
      mutate: (builder) => builder.withEntry({ type: 'milestone', id: 'patched', attributes: [] }),
    });

    expect(ctxB.rewriteSignal).toBeDefined();
    expect(ctxB.phasesRun.has('write')).toBe(false);
  });

  it('accepts format, dryRun, and verbose in lifecycle options', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'main.siren'), 'milestone alpha {}');

    const ctx = await runLifecycle(tempDir, {
      mutate: (builder) => builder.withEntry({ type: 'milestone', id: 'patched', attributes: [] }),
      format: true,
      dryRun: true,
      verbose: true,
    });

    // The new option fields must be reflected on the returned context.
    expect(ctx.format).toBe(true);
    expect(ctx.dryRun).toBe(true);
    expect(ctx.verbose).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // IR-patch to source write-back bridge tests (TDD red — all fail until bridge lands)
  // ---------------------------------------------------------------------------

  it('mutate hook returns PatchResult with changes', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'main.siren'), 'task target {}');

    let capturedPatchResult: PatchResult | null = null;

    const ctx = await runLifecycle(tempDir, {
      mutate: (builder) => {
        const result = builder.patchEntry('target', (r) => ({
          ...r,
          attributes: [...r.attributes, { key: 'description', value: ['patched'] as const }],
        }));
        capturedPatchResult = result;
        return result;
      },
    });

    // Core API produces PatchResult with changes
    expect(capturedPatchResult).not.toBeNull();
    expect(capturedPatchResult!.changes).toHaveLength(1);
    expect(capturedPatchResult!.changes[0]!.entryId).toBe('target');
    expect(capturedPatchResult!.changes[0]!.mode).toBe('updated');

    // Bridge routes delta to parsedDoc and populates rewriteSignal
    expect(ctx.rewriteSignal).toBeInstanceOf(Set);
    expect(ctx.rewriteSignal.size).toBe(1);
  });

  it('bridge maps updated changes to parsedDoc.patchEntry and sets rewriteSignal', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    const filePath = path.join(sirenDir, 'main.siren');
    fs.writeFileSync(filePath, 'task target {}');

    const ctx = await runLifecycle(tempDir, {
      mutate: (builder) =>
        builder.patchEntry('target', (r) => ({
          ...r,
          attributes: [...r.attributes, { key: 'description', value: ['patched'] as const }],
        })),
    });

    // Bridge routes delta → source updated, rewriteSignal populated
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('description');

    expect(ctx.rewriteSignal).toBeInstanceOf(Set);
    expect(ctx.rewriteSignal.size).toBe(1);
  });

  it('non-updated documents are untouched after mutation', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    const aPath = path.join(sirenDir, 'a.siren');
    const bPath = path.join(sirenDir, 'b.siren');
    fs.writeFileSync(aPath, 'task target {}');
    fs.writeFileSync(bPath, 'milestone other {}');

    const beforeB = fs.readFileSync(bPath, 'utf-8');
    const beforeBMtime = fs.statSync(bPath).mtimeMs;
    await new Promise((r) => setTimeout(r, 10));

    const ctx = await runLifecycle(tempDir, {
      mutate: (builder) =>
        builder.patchEntry('target', (r) => ({
          ...r,
          attributes: [...r.attributes, { key: 'description', value: ['patched'] as const }],
        })),
    });

    // b.siren untouched
    expect(fs.readFileSync(bPath, 'utf-8')).toBe(beforeB);
    expect(fs.statSync(bPath).mtimeMs).toBe(beforeBMtime);

    // rewriteSignal does not contain b.siren
    expect(ctx.rewriteSignal.has(bPath)).toBe(false);

    // a.siren updated by bridge
    expect(fs.readFileSync(aPath, 'utf-8')).toContain('description');
  });

  it('deleted and created changes are logged and dropped', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    const filePath = path.join(sirenDir, 'main.siren');
    fs.writeFileSync(filePath, 'task existing {}');

    const ctx = await runLifecycle(tempDir, {
      mutate: (builder) =>
        builder.patch((entries) => [
          ...entries,
          { type: 'task', id: 'created-one', attributes: [] },
        ]),
    });

    // No source changes: created entries are logged and dropped by bridge
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('task existing {}');

    // Bridge logs the dropped created op
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('created'));

    // Signal empty — no updated changes to route
    expect(ctx.rewriteSignal.size).toBe(0);
  });

  it('multi-origin entry id refuses with an error', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'a.siren'), 'task shared {}');
    fs.writeFileSync(path.join(sirenDir, 'b.siren'), 'milestone shared {}');

    const ctx = await runLifecycle(tempDir, {
      mutate: (builder) =>
        builder.patchEntry('shared', (r) => ({
          ...r,
          attributes: [...r.attributes, { key: 'description', value: ['patched'] as const }],
        })),
    });

    // Bridge detects multi-origin and pushes an error
    expect(ctx.errors.length).toBeGreaterThan(0);
    expect(ctx.errors[0]).toContain('shared');

    // No files written (signal empty)
    expect(ctx.rewriteSignal.size).toBe(0);
    expect(fs.readFileSync(path.join(sirenDir, 'a.siren'), 'utf-8')).not.toContain('description');
    expect(fs.readFileSync(path.join(sirenDir, 'b.siren'), 'utf-8')).not.toContain('description');
  });

  // ---------------------------------------------------------------------------
  // Format lifecycle tests (TDD red — all fail until format phase lands)
  // ---------------------------------------------------------------------------

  it('format: true formats every parsed document and signals all docs for write', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    // Non-canonical formatting: extra whitespace that format() normalizes
    fs.writeFileSync(path.join(sirenDir, 'a.siren'), 'task  foo  { }');
    fs.writeFileSync(path.join(sirenDir, 'b.siren'), 'milestone  bar  { }');

    const ctx = await runLifecycle(tempDir, { format: true });

    // rewriteSignal must contain ALL discovered files
    expect(ctx.rewriteSignal).toBeInstanceOf(Set);
    expect(ctx.rewriteSignal.size).toBe(2);
    expect(ctx.rewriteSignal.has(path.join(sirenDir, 'a.siren'))).toBe(true);
    expect(ctx.rewriteSignal.has(path.join(sirenDir, 'b.siren'))).toBe(true);

    // write phase must have run
    expect(ctx.phasesRun.has('write')).toBe(true);

    // Files on disk must contain canonical formatting (via ParsedDocument.format())
    const aContent = fs.readFileSync(path.join(sirenDir, 'a.siren'), 'utf-8');
    const bContent = fs.readFileSync(path.join(sirenDir, 'b.siren'), 'utf-8');
    expect(aContent).toBe('task foo {}\n');
    expect(bContent).toBe('milestone bar {}\n');
  });

  it('format reuses ctx.parsedDocuments (no fresh parser)', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'main.siren'), 'task  foo  { }');

    const getParserSpy = vi.spyOn(parserModule, 'getParser');

    await runLifecycle(tempDir, { format: true });

    // getParser should only have been called once (by runParsing), not again for format
    expect(getParserSpy).toHaveBeenCalledTimes(1);

    // Files must be canonically formatted (format happened through lifecycle, not a fresh parse)
    const content = fs.readFileSync(path.join(sirenDir, 'main.siren'), 'utf-8');
    expect(content).toBe('task foo {}\n');

    getParserSpy.mockRestore();
  });

  it('parse error anywhere aborts entire format write', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    const validPath = path.join(sirenDir, 'valid.siren');
    const brokenPath = path.join(sirenDir, 'broken.siren');
    const validContent = 'task  foo  { }';
    fs.writeFileSync(validPath, validContent);
    fs.writeFileSync(brokenPath, '!!! invalid');

    const beforeMtime = fs.statSync(validPath).mtimeMs;
    await new Promise((r) => setTimeout(r, 10));

    const ctx = await runLifecycle(tempDir, { format: true });

    // Parse error accumulates from the broken file
    expect(ctx.errors.length).toBeGreaterThan(0);
    expect(ctx.errors[0]).toContain('broken.siren');

    // write phase blocked by errors gate
    expect(ctx.phasesRun.has('write')).toBe(false);

    // Valid file unchanged on disk (write blocked; no side-effects)
    expect(fs.readFileSync(validPath, 'utf-8')).toBe(validContent);
    expect(fs.statSync(validPath).mtimeMs).toBe(beforeMtime);

    // RED SIGNAL: rewriteSignal must contain the valid file path —
    // format signaled it even though the write gate blocked disk writes.
    // Currently fails because format:true does nothing: rewriteSignal is empty.
    expect(ctx.rewriteSignal.has(validPath)).toBe(true);
  });

  it('format mode does not use semanticKey round-trip check', async () => {
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'main.siren'), '  task  foo  { }');

    const ctx = await runLifecycle(tempDir, { format: true });

    // Format must work without any CLI-side semanticKey comparison
    const content = fs.readFileSync(path.join(sirenDir, 'main.siren'), 'utf-8');
    expect(content).toBe('task foo {}\n');

    // rewriteSignal must be populated
    expect(ctx.rewriteSignal.size).toBe(1);
  });
});

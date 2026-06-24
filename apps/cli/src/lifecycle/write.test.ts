import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliContext } from './context';

const mockWriteFileSync = vi.hoisted(() => vi.fn());

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof fs>('node:fs');
  return {
    ...actual,
    writeFileSync: mockWriteFileSync,
  };
});

import { runWrite } from './write';

/**
 * Build a minimal ParsedDocument-like object for testing.
 *
 * We only need `source.name` and `source.content` — the write phase does not
 * touch the AST, diagnostics, or any other property.
 */
function stubParsedDocument(
  name: string,
  content: string,
): Parameters<typeof runWrite>[0]['parsedDocuments'][number] {
  return {
    source: { name, content },
    ast: { resources: [] },
    diagnostics: [],
    toEntries: () => [],
    format: () => content,
    patchEntry: () => {},
    removeEntry: () => {},
  } as unknown as Parameters<typeof runWrite>[0]['parsedDocuments'][number];
}

/**
 * Build a minimal SourceDocument-like object.
 */
function stubSourceDocument(
  name: string,
  content: string,
): Parameters<typeof runWrite>[0]['sourceDocuments'][number] {
  return { name, content };
}

/**
 * Create a CliContext suitable for write-phase testing.
 */
function makeContext(overrides: Partial<CliContext> = {}): CliContext {
  return {
    cwd: '/tmp',
    rootDir: '/tmp',
    sirenDir: '/tmp/siren',
    files: [],
    sourceDocuments: [],
    parsedDocuments: [],
    languageDiagnostics: [],
    entries: [],
    warnings: [],
    errors: [],
    rewriteSignal: new Set(),
    aborted: false,
    warningsFlushed: 0,
    errorsFlushed: 0,
    phasesRun: new Set(),
    ...overrides,
  } as CliContext;
}

describe('runWrite', () => {
  let tempDir: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-test-'));
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockWriteFileSync.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
  });

  // ---------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------

  it('writes files listed in rewriteSignal to disk', () => {
    const filePath = path.join(tempDir, 'siren', 'tasks.siren');
    const content = 'task test {}';

    const ctx = makeContext({
      rootDir: tempDir,
      parsedDocuments: [stubParsedDocument('siren/tasks.siren', content)],
      rewriteSignal: new Set([filePath]),
    });

    runWrite(ctx);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    expect(mockWriteFileSync).toHaveBeenCalledWith(filePath, content, 'utf-8');
    expect(consoleLogSpy).toHaveBeenCalledWith('Updated 1 files out of 1');
  });

  it('writes multiple files from rewriteSignal', () => {
    const fileA = path.join(tempDir, 'siren', 'a.siren');
    const fileB = path.join(tempDir, 'siren', 'b.siren');
    const contentA = 'task a {}';
    const contentB = 'task b {}';

    const ctx = makeContext({
      rootDir: tempDir,
      parsedDocuments: [
        stubParsedDocument('siren/a.siren', contentA),
        stubParsedDocument('siren/b.siren', contentB),
      ],
      rewriteSignal: new Set([fileA, fileB]),
    });

    runWrite(ctx);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
    expect(mockWriteFileSync).toHaveBeenCalledWith(fileA, contentA, 'utf-8');
    expect(mockWriteFileSync).toHaveBeenCalledWith(fileB, contentB, 'utf-8');
    expect(consoleLogSpy).toHaveBeenCalledWith('Updated 2 files out of 2');
  });

  it('reports "Updated 0 files out of N" when rewriteSignal is empty', () => {
    const ctx = makeContext({
      rootDir: tempDir,
      parsedDocuments: [stubParsedDocument('siren/tasks.siren', 'task test {}')],
    });

    runWrite(ctx);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith('Updated 0 files out of 1');
  });

  it('skips signal entries with no matching parsed document', () => {
    const fileA = path.join(tempDir, 'siren', 'a.siren');
    const ctx = makeContext({
      rootDir: tempDir,
      parsedDocuments: [],
      rewriteSignal: new Set([fileA]),
    });

    runWrite(ctx);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith('Updated 0 files out of 0');
  });

  // ---------------------------------------------------------------
  // dryRun mode
  // ---------------------------------------------------------------

  it('dryRun skips actual writes but reports what would change', () => {
    const filePath = path.join(tempDir, 'siren', 'tasks.siren');
    const originalContent = 'task old {}';
    const newContent = 'task new {}';

    const ctx = makeContext({
      rootDir: tempDir,
      sourceDocuments: [stubSourceDocument('siren/tasks.siren', originalContent)],
      parsedDocuments: [stubParsedDocument('siren/tasks.siren', newContent)],
      rewriteSignal: new Set([filePath]),
      dryRun: true,
    });

    runWrite(ctx);

    // No real write should happen
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    // Dry-run output should mention the file (single console.log block)
    const dryRunMessage = consoleLogSpy.mock.calls
      .filter(([msg]: unknown[]) => typeof msg === 'string' && msg.includes('Dry run results'))
      .map(([msg]: unknown[]) => msg as string);
    expect(dryRunMessage).toHaveLength(1);
    expect(dryRunMessage[0]).toContain('Would update siren/tasks.siren');
    // Summary line
    expect(consoleLogSpy).toHaveBeenLastCalledWith('Updated 1 files out of 1');
  });

  it('dryRun with unchanged content produces no "Would update" lines', () => {
    const filePath = path.join(tempDir, 'siren', 'tasks.siren');
    const content = 'task test {}';

    const ctx = makeContext({
      rootDir: tempDir,
      sourceDocuments: [stubSourceDocument('siren/tasks.siren', content)],
      parsedDocuments: [stubParsedDocument('siren/tasks.siren', content)],
      rewriteSignal: new Set([filePath]),
      dryRun: true,
    });

    runWrite(ctx);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    // No "Would update" line when content matches source
    const dryRunMessages = consoleLogSpy.mock.calls
      .filter(([msg]: unknown[]) => typeof msg === 'string' && msg.includes('Dry run results'))
      .map(([msg]: unknown[]) => msg as string);
    expect(dryRunMessages).toHaveLength(0);
    // Summary still printed
    expect(consoleLogSpy).toHaveBeenLastCalledWith('Updated 0 files out of 1');
  });

  it('dryRun skips parsedDoc with no matching sourceDoc (no comparison possible)', () => {
    const filePath = path.join(tempDir, 'siren', 'tasks.siren');
    const content = 'task test {}';

    const ctx = makeContext({
      rootDir: tempDir,
      sourceDocuments: [],
      parsedDocuments: [stubParsedDocument('siren/tasks.siren', content)],
      rewriteSignal: new Set([filePath]),
      dryRun: true,
    });

    runWrite(ctx);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    // No "Would update" since srcDoc wasn't found
    const dryRunMessages = consoleLogSpy.mock.calls
      .filter(([msg]: unknown[]) => typeof msg === 'string' && msg.includes('Dry run results'))
      .map(([msg]: unknown[]) => msg as string);
    expect(dryRunMessages).toHaveLength(0);
    expect(consoleLogSpy).toHaveBeenLastCalledWith('Updated 0 files out of 1');
  });

  it('dryRun with multiple files reports each changed file', () => {
    const fileA = path.join(tempDir, 'siren', 'a.siren');
    const fileB = path.join(tempDir, 'siren', 'b.siren');

    const ctx = makeContext({
      rootDir: tempDir,
      sourceDocuments: [
        stubSourceDocument('siren/a.siren', 'old a'),
        stubSourceDocument('siren/b.siren', 'old b'),
      ],
      parsedDocuments: [
        stubParsedDocument('siren/a.siren', 'new a'),
        stubParsedDocument('siren/b.siren', 'new b'),
      ],
      rewriteSignal: new Set([fileA, fileB]),
      dryRun: true,
    });

    runWrite(ctx);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    // Dry-run output is a single console.log call with both lines
    const dryRunMessage = consoleLogSpy.mock.calls
      .filter(([msg]: unknown[]) => typeof msg === 'string' && msg.includes('Dry run results'))
      .map(([msg]: unknown[]) => msg as string);
    expect(dryRunMessage).toHaveLength(1);
    expect(dryRunMessage[0]).toContain('Would update siren/a.siren');
    expect(dryRunMessage[0]).toContain('Would update siren/b.siren');
    expect(consoleLogSpy).toHaveBeenLastCalledWith('Updated 2 files out of 2');
  });

  // ---------------------------------------------------------------
  // verbose mode
  // ---------------------------------------------------------------

  it('verbose mode logs relative paths as they are written', () => {
    const filePath = path.join(tempDir, 'siren', 'tasks.siren');
    const content = 'task test {}';

    const ctx = makeContext({
      rootDir: tempDir,
      parsedDocuments: [stubParsedDocument('siren/tasks.siren', content)],
      rewriteSignal: new Set([filePath]),
      verbose: true,
    });

    runWrite(ctx);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    // verbose logs relative path
    expect(consoleLogSpy).toHaveBeenCalledWith('siren/tasks.siren');
    // plus summary
    expect(consoleLogSpy).toHaveBeenLastCalledWith('Updated 1 files out of 1');
  });

  it('verbose mode logs each file path when multiple are written', () => {
    const fileA = path.join(tempDir, 'siren', 'a.siren');
    const fileB = path.join(tempDir, 'siren', 'b.siren');

    const ctx = makeContext({
      rootDir: tempDir,
      parsedDocuments: [
        stubParsedDocument('siren/a.siren', 'content a'),
        stubParsedDocument('siren/b.siren', 'content b'),
      ],
      rewriteSignal: new Set([fileA, fileB]),
      verbose: true,
    });

    runWrite(ctx);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
    expect(consoleLogSpy).toHaveBeenCalledWith('siren/a.siren');
    expect(consoleLogSpy).toHaveBeenCalledWith('siren/b.siren');
    expect(consoleLogSpy).toHaveBeenLastCalledWith('Updated 2 files out of 2');
  });

  // ---------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------

  it('handles parsedDoc with relative path that does not match signal', () => {
    const filePath = path.join(tempDir, 'other', 'file.siren');
    const content = 'task orphan {}';

    const ctx = makeContext({
      rootDir: tempDir,
      parsedDocuments: [stubParsedDocument('siren/tasks.siren', content)],
      rewriteSignal: new Set([filePath]),
    });

    runWrite(ctx);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith('Updated 0 files out of 1');
  });

  it('produces correct totalDocs count matching parsedDocuments length', () => {
    const fileA = path.join(tempDir, 'siren', 'a.siren');

    const ctx = makeContext({
      rootDir: tempDir,
      parsedDocuments: [
        stubParsedDocument('siren/a.siren', 'a'),
        stubParsedDocument('siren/b.siren', 'b'),
        stubParsedDocument('siren/c.siren', 'c'),
      ],
      rewriteSignal: new Set([fileA]),
    });

    runWrite(ctx);

    // Only one matched and was written
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    // Summary shows totalDocs=3
    expect(consoleLogSpy).toHaveBeenCalledWith('Updated 1 files out of 3');
  });

  it('is a no-op when rewriteSignal has a file matching no parsedDoc (orphan signal)', () => {
    const filePath = path.join(tempDir, 'siren', 'orphan.siren');

    const ctx = makeContext({
      rootDir: tempDir,
      parsedDocuments: [stubParsedDocument('siren/tasks.siren', 'task test {}')],
      rewriteSignal: new Set([filePath]),
    });

    runWrite(ctx);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith('Updated 0 files out of 1');
  });

  it('returns an empty artifact object', () => {
    const ctx = makeContext();
    const artifact = runWrite(ctx);
    expect(artifact).toEqual({});
  });
});

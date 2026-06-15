import { type EntryChange, type PatchResult, SirenBuilder, type SirenEntry } from '@sirenpm/core';
import type { SourcedEntry } from '@sirenpm/language';
import { describe, expect, it } from 'vitest';
import { mvMutate } from './mv';

/**
 * Minimal entry factory for test setup.
 */
function makeEntry(id: string, overrides: Partial<SirenEntry> = {}): SirenEntry {
  return {
    type: 'task',
    id,
    attributes: [],
    ...overrides,
  };
}

/**
 * Synthetic-origin entry factory for testing the synthesized-id guard.
 */
function makeSyntheticEntry(id: string, overrides: Partial<SirenEntry> = {}): SourcedEntry {
  return {
    type: 'milestone',
    id,
    attributes: [],
    origin: { kind: 'synthetic', document: 'main.siren' },
    ...overrides,
  };
}

describe('mvMutate', () => {
  it('patches status:complete on statusless task', () => {
    const builder = SirenBuilder.fromEntries([makeEntry('task-1')]);
    const result: PatchResult = mvMutate('task-1', 'complete')(builder);

    // Builder contains the updated entry
    const updatedEntry = result.builder.entries.find((e) => e.id === 'task-1');
    expect(updatedEntry).toBeDefined();
    expect(updatedEntry!.status).toBe('complete');

    // Change delta is reported
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      entryId: 'task-1',
      mode: 'updated',
    } satisfies Partial<EntryChange>);
  });

  it('patches status:draft on complete task', () => {
    const builder = SirenBuilder.fromEntries([makeEntry('task-1', { status: 'complete' })]);
    const result: PatchResult = mvMutate('task-1', 'draft')(builder);

    const updatedEntry = result.builder.entries.find((e) => e.id === 'task-1');
    expect(updatedEntry).toBeDefined();
    expect(updatedEntry!.status).toBe('draft');

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      entryId: 'task-1',
      mode: 'updated',
    } satisfies Partial<EntryChange>);
  });

  it('idempotent same-target returns PatchResult with empty changes', () => {
    const builder = SirenBuilder.fromEntries([makeEntry('task-1')]);
    // Entry has no status; setting to undefined is a no-op
    const result: PatchResult = mvMutate('task-1', undefined)(builder);

    // No changes should be reported because the target matches current state
    expect(result.changes).toHaveLength(0);

    // Builder should be unchanged
    const entry = result.builder.entries.find((e) => e.id === 'task-1');
    expect(entry).toBeDefined();
    expect(entry!.status).toBeUndefined();
  });

  it('throws on unknown entry id', () => {
    const builder = SirenBuilder.fromEntries([]);

    expect(() => mvMutate('nonexistent', 'complete')(builder)).toThrow(/nonexistent/);
  });

  it('throws on synthesized-only id', () => {
    const builder = SirenBuilder.fromEntries([makeSyntheticEntry('synthetic-milestone')]);

    expect(() => mvMutate('synthetic-milestone', 'complete')(builder)).toThrow(
      /synthetic|materializ/i,
    );
  });

  it('promotes implicit-complete to explicit complete', () => {
    // A task with no dependencies and no explicit status qualifies as implicitly complete
    const builder = SirenBuilder.fromEntries([makeEntry('task-1')]);
    const result: PatchResult = mvMutate('task-1', 'complete')(builder);

    const updatedEntry = result.builder.entries.find((e) => e.id === 'task-1');
    expect(updatedEntry).toBeDefined();
    expect(updatedEntry!.status).toBe('complete');

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      entryId: 'task-1',
      mode: 'updated',
    } satisfies Partial<EntryChange>);
  });
});

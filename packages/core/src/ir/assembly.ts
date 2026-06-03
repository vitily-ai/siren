import { deepFreeze } from 'deep-freeze-es6';
import { SirenProject } from './context';
import { IR_CONTEXT_FACTORY } from './context-internal';
import { computeDelta, type PatchResult } from './patch-result';
import { cloneEntries } from './snapshot';
import type { SirenEntry } from './types';

export class SirenBuilder {
  private constructor(private readonly entriesSnapshot: readonly SirenEntry[]) {
    Object.freeze(this);
  }

  static fromEntries(entries: readonly SirenEntry[]): SirenBuilder {
    return new SirenBuilder(cloneAndFreezeEntries(entries));
  }

  get entries(): readonly SirenEntry[] {
    return this.entriesSnapshot;
  }

  patch(fn: (entries: readonly SirenEntry[]) => readonly SirenEntry[]): PatchResult {
    const newBuilder = SirenBuilder.fromEntries(fn(this.entriesSnapshot));
    const changes = computeDelta(this.entriesSnapshot, newBuilder.entries);
    return { builder: newBuilder, changes };
  }

  withEntry(entry: SirenEntry): PatchResult {
    return this.patch((entries) => [...entries, entry]);
  }

  patchEntry(entryId: string, fn: (res: SirenEntry) => SirenEntry): PatchResult {
    return this.patch((entries) =>
      entries.map((entry) => (entry.id === entryId ? fn(entry) : entry)),
    );
  }

  build(): SirenProject {
    return SirenProject[IR_CONTEXT_FACTORY](this.entriesSnapshot);
  }
}

function cloneAndFreezeEntries(entries: readonly SirenEntry[]): readonly SirenEntry[] {
  const seenEphIds = new Set<string>();
  return deepFreeze(cloneEntries(entries, seenEphIds));
}

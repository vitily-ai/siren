import type { SirenEntry } from './types';

export function deduplicateEntries(rawEntries: readonly SirenEntry[]): readonly SirenEntry[] {
  const seen = new Set<string>();
  const entries: SirenEntry[] = [];

  for (const entry of rawEntries) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      entries.push(entry);
    }
  }

  return Object.freeze(entries);
}

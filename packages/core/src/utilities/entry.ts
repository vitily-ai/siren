import { isReference, type SirenEntry } from '../ir/types';

/**
 * Finds a entry by its ID from the given array of entries.
 * @param entries Array of Siren entries
 * @param id The ID of the entry to find
 * @returns The entry with the matching ID
 * @throws Error if no entry with the given ID is found
 */
export function findEntryById(entries: SirenEntry[], id: string): SirenEntry {
  const entry = entries.find((r) => r.id === id);
  if (!entry) {
    throw new Error(`Entry with ID '${id}' not found`);
  }
  return entry;
}

/**
 * Extracts dependency IDs from a entry's depends_on attribute.
 *
 * Reads the tuple-first shape: depends_on is a Tuple (readonly Atom[]) of
 * atoms. Only reference atoms contribute dependency ids; scalar atoms are
 * ignored. An absent attribute or an empty tuple both yield no dependencies.
 */
export function getDependsOn(entry: SirenEntry): string[] {
  const attr = entry.attributes.find((a) => a.key === 'depends_on');
  if (!attr) return [];
  const ids: string[] = [];
  for (const atom of attr.value) {
    if (isReference(atom)) ids.push(atom.id);
  }
  return ids;
}

/**
 * Helper to check for entry completion status. This does not guarantee explicit completion.
 */
export function isComplete(entry: SirenEntry): entry is SirenEntry & { status: 'complete' } {
  return entry.status === 'complete';
}

/**
 * Helper to check for entry draft status. This does not guarantee explicit draft status.
 */
export function isDraft(entry: SirenEntry): entry is SirenEntry & { status: 'draft' } {
  return entry.status === 'draft';
}

// TODO expose this as a method on an object oriented IR context

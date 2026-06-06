import { diagnoseDuplicateEntries } from '../../analysis';
import type { DuplicateIdDiagnostic } from '../../diagnostics';
import { deduplicateEntries } from '../../normalization';
import type { SirenEntry } from '../../types';
import { defineModule } from '../types';

/**
 * Dedup module: first-occurrence-wins deduplication and W003 emission.
 *
 * Reads:  { rawEntries }
 * Writes: { entries, duplicateDiagnostics }
 */
export const DedupModule = defineModule(
  'Dedup',
  (input: {
    readonly rawEntries: readonly SirenEntry[];
  }): {
    readonly entries: readonly SirenEntry[];
    readonly duplicateDiagnostics: readonly DuplicateIdDiagnostic[];
  } => {
    const entries = deduplicateEntries(input.rawEntries);
    const duplicateDiagnostics = diagnoseDuplicateEntries(input.rawEntries);
    return { entries, duplicateDiagnostics };
  },
);

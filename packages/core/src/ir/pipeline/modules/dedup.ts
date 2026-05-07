import { diagnoseDuplicateResources } from '../../analysis';
import type { DuplicateIdDiagnostic } from '../../diagnostics';
import { deduplicateResources } from '../../normalization';
import type { Resource } from '../../types';
import { defineModule } from '../types';

/**
 * Dedup module: first-occurrence-wins deduplication and W003 emission.
 *
 * Reads:  { rawResources }
 * Writes: { resources, duplicateDiagnostics }
 */
export const DedupModule = defineModule(
  'Dedup',
  (input: {
    readonly rawResources: readonly Resource[];
  }): {
    readonly resources: readonly Resource[];
    readonly duplicateDiagnostics: readonly DuplicateIdDiagnostic[];
  } => {
    const resources = deduplicateResources(input.rawResources);
    const duplicateDiagnostics = diagnoseDuplicateResources(input.rawResources);
    return { resources, duplicateDiagnostics };
  },
);

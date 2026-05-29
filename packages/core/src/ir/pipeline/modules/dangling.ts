import { diagnoseDanglingDependencies } from '../../analysis';
import type { DanglingDependencyDiagnostic } from '../../diagnostics';
import type { EntryGraph } from '../../entry-graph';
import { defineModule } from '../types';

/**
 * Dangling module: emit W002 diagnostics for dependencies that don't resolve.
 *
 * Reads:  { graph }
 * Writes: { danglingDiagnostics }
 */
export const DanglingModule = defineModule(
  'Dangling',
  (input: {
    readonly graph: EntryGraph;
  }): { readonly danglingDiagnostics: readonly DanglingDependencyDiagnostic[] } => {
    return {
      danglingDiagnostics: diagnoseDanglingDependencies(input.graph),
    };
  },
);

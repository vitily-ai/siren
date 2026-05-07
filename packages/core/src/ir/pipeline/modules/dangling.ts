import { diagnoseDanglingDependencies } from '../../analysis';
import type { DanglingDependencyDiagnostic } from '../../diagnostics';
import type { ResourceGraph } from '../../resource-graph';
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
    readonly graph: ResourceGraph;
  }): { readonly danglingDiagnostics: readonly DanglingDependencyDiagnostic[] } => {
    return {
      danglingDiagnostics: diagnoseDanglingDependencies(input.graph),
    };
  },
);

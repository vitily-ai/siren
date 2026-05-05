import { diagnoseDanglingDependencies } from '../../analysis';
import type { DanglingDependencyDiagnostic } from '../../diagnostics';
import type { Resource } from '../../types';
import { defineModule } from '../types';

/**
 * Dangling module: emit W002 diagnostics for dependencies that don't resolve.
 *
 * Reads:  { resources, resourcesById }
 * Writes: { danglingDiagnostics }
 */
export const DanglingModule = defineModule(
  'Dangling',
  (input: {
    readonly resources: readonly Resource[];
    readonly resourcesById: ReadonlyMap<string, Resource>;
  }): { readonly danglingDiagnostics: readonly DanglingDependencyDiagnostic[] } => {
    return {
      danglingDiagnostics: diagnoseDanglingDependencies(input.resources, input.resourcesById),
    };
  },
);

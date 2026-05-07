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
    const resources = input.graph.resources;
    const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));

    return {
      danglingDiagnostics: diagnoseDanglingDependencies(resources, resourcesById),
    };
  },
);

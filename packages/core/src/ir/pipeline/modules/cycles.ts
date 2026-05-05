import type { DirectedGraph } from '../../../utilities/graph';
import { detectDependencyCycles, diagnoseCycles } from '../../analysis';
import type { CircularDependencyDiagnostic, DependencyCycle } from '../../diagnostics';
import type { Resource } from '../../types';
import { defineModule } from '../types';

/**
 * Cycles module: detect dependency cycles and emit W001 diagnostics.
 *
 * Reads:  { graph, resourcesById }
 * Writes: { cycles, cycleDiagnostics }
 */
export const CyclesModule = defineModule(
  'Cycles',
  (input: {
    readonly graph: DirectedGraph;
    readonly resourcesById: ReadonlyMap<string, Resource>;
  }): {
    readonly cycles: readonly DependencyCycle[];
    readonly cycleDiagnostics: readonly CircularDependencyDiagnostic[];
  } => {
    const cycles = detectDependencyCycles(input.graph);
    const cycleDiagnostics = diagnoseCycles(cycles, input.resourcesById);
    return { cycles, cycleDiagnostics };
  },
);

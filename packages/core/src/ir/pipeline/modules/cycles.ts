import { diagnoseCycles } from '../../analysis';
import type { CircularDependencyDiagnostic, DependencyCycle } from '../../diagnostics';
import type { ResourceGraph } from '../../resource-graph';
import { defineModule } from '../types';

function detectDependencyCycles(graph: ResourceGraph): readonly DependencyCycle[] {
  return Object.freeze(
    graph
      .getCycles()
      .map((cycle): DependencyCycle => Object.freeze({ nodes: Object.freeze(cycle.slice()) })),
  );
}

/**
 * Cycles module: detect dependency cycles and emit W001 diagnostics.
 *
 * Reads:  { graph }
 * Writes: { cycles, cycleDiagnostics }
 */
export const CyclesModule = defineModule(
  'Cycles',
  (input: {
    readonly graph: ResourceGraph;
  }): {
    readonly cycles: readonly DependencyCycle[];
    readonly cycleDiagnostics: readonly CircularDependencyDiagnostic[];
  } => {
    const cycles = detectDependencyCycles(input.graph);
    const cycleDiagnostics = diagnoseCycles(cycles, input.graph);
    return { cycles, cycleDiagnostics };
  },
);

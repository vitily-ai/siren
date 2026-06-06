import { diagnoseCycles } from '../../analysis';
import type { CircularDependencyDiagnostic, DependencyCycle } from '../../diagnostics';
import type { EntryGraph } from '../../entry-graph';
import { defineModule } from '../types';

function detectDependencyCycles(graph: EntryGraph): readonly DependencyCycle[] {
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
    readonly graph: EntryGraph;
  }): {
    readonly cycles: readonly DependencyCycle[];
    readonly cycleDiagnostics: readonly CircularDependencyDiagnostic[];
  } => {
    const cycles = detectDependencyCycles(input.graph);
    const cycleDiagnostics = diagnoseCycles(cycles);
    return { cycles, cycleDiagnostics };
  },
);

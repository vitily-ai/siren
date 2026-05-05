import type { DirectedGraph } from '../../../utilities/graph';
import { buildDependencyGraph } from '../../../utilities/milestone';
import type { Resource } from '../../types';
import { defineModule } from '../types';

/**
 * Graph module: builds the dependency graph once for the entire pipeline.
 *
 * Reads:  { resources }
 * Writes: { graph }
 *
 * The graph stores ids and edges, both of which are unaffected by implicit
 * completion (which only flips `complete: true`). Downstream modules and
 * `IRContext` therefore reuse this single graph instance.
 */
export const GraphModule = defineModule(
  'Graph',
  (input: { readonly resources: readonly Resource[] }): { readonly graph: DirectedGraph } => {
    return { graph: buildDependencyGraph(input.resources) };
  },
);

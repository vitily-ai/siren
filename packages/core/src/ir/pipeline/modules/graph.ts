import { EntryGraph } from '../../entry-graph';
import type { SirenEntry } from '../../types';
import { defineModule } from '../types';

/**
 * Graph module: builds the dependency graph once for the entire pipeline.
 *
 * Reads:  { entries }
 * Writes: { graph }
 *
 * The graph stores ids and edges, both of which are unaffected by implicit
 * completion (which only writes `status: 'complete'`). Downstream modules and
 * `SirenProject` therefore reuse this single graph instance.
 */
export const GraphModule = defineModule(
  'Graph',
  (input: { readonly entries: readonly SirenEntry[] }): { readonly graph: EntryGraph } => {
    return { graph: EntryGraph.fromEntries(input.entries) };
  },
);

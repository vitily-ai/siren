import { indexResourcesById } from '../../normalization';
import type { Resource } from '../../types';
import { defineModule } from '../types';

/**
 * Index module: builds an id → Resource lookup map.
 *
 * Reads:  { resources }
 * Writes: { resourcesById }
 */
export const IndexModule = defineModule(
  'Index',
  (input: {
    readonly resources: readonly Resource[];
  }): {
    readonly resourcesById: ReadonlyMap<string, Resource>;
  } => {
    return { resourcesById: indexResourcesById(input.resources) };
  },
);

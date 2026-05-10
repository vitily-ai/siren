import type { Attribute, Resource } from '../../types';
import { defineModule } from '../types';

/**
 * Derives a synthetic milestone id from a source document path by basename.
 * Splits on both POSIX and Windows separators, then strips a trailing
 * literal `.siren` suffix when present.
 */
function deriveSyntheticMilestoneId(document: string): string {
  const basename = document.split(/[/\\]/).pop() ?? document;
  return basename.endsWith('.siren') ? basename.slice(0, -'.siren'.length) : basename;
}

/**
 * Builds a `depends_on` attribute with references in the provided id order.
 */
function asDependsOnAttribute(resourceIds: readonly string[]): Attribute {
  return {
    key: 'depends_on',
    value: {
      kind: 'array',
      elements: resourceIds.map((id) => ({ kind: 'reference', id })),
    },
  };
}

/**
 * Synthetic-milestone module.
 *
 * Reads:  { rawResources }
 * Writes: { rawResources }    // logical replacement
 */
export const SyntheticMilestonesModule = defineModule(
  'SyntheticMilestones',
  (input: {
    readonly rawResources: readonly Resource[];
  }): {
    readonly rawResources: readonly Resource[];
  } => {
    const resourcesByDocument = new Map<string, Resource[]>();

    for (const resource of input.rawResources) {
      const document = resource.origin?.document;
      if (document === undefined) continue;

      const bucket = resourcesByDocument.get(document);
      if (bucket === undefined) {
        resourcesByDocument.set(document, [resource]);
      } else {
        bucket.push(resource);
      }
    }

    const syntheticMilestones: Resource[] = [];

    for (const [document, bucket] of resourcesByDocument) {
      const derivedId = deriveSyntheticMilestoneId(document);
      const hasExplicitMilestoneCollision = bucket.some(
        (resource) => resource.type === 'milestone' && resource.id === derivedId && resource.synthetic !== true,
      );
      if (hasExplicitMilestoneCollision) continue;

      syntheticMilestones.push({
        type: 'milestone',
        id: derivedId,
        synthetic: true,
        status: 'draft',
        attributes: [asDependsOnAttribute(bucket.map((resource) => resource.id))],
        origin: {
          startByte: 0,
          endByte: 0,
          startRow: 0,
          endRow: 0,
          document,
        },
      });
    }

    return {
      rawResources: Object.freeze([...input.rawResources, ...syntheticMilestones]),
    };
  },
);

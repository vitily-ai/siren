import { getDependsOn } from '../../../utilities/entry';
import type { SirenDocument } from '../../document';
import type { Resource } from '../../types';
import { defineModule } from '../types';

type SynthesisInput = {
  readonly documents: readonly SirenDocument[];
};

type SynthesisOutput = {
  readonly rawResources: readonly Resource[];
};

function hasExplicitDocumentMilestone(document: SirenDocument): boolean {
  return document.resources.some(
    (resource) => resource.type === 'milestone' && resource.id === document.id,
  );
}

function collectDocumentRootIds(resources: readonly Resource[]): readonly string[] {
  const localResourceIds = new Set(resources.map((resource) => resource.id));
  const dependedOnLocalIds = new Set<string>();

  for (const resource of resources) {
    for (const dependencyId of getDependsOn(resource)) {
      if (localResourceIds.has(dependencyId)) {
        dependedOnLocalIds.add(dependencyId);
      }
    }
  }

  const rootIds: string[] = [];
  const seen = new Set<string>();

  for (const resource of resources) {
    if (!dependedOnLocalIds.has(resource.id) && !seen.has(resource.id)) {
      rootIds.push(resource.id);
      seen.add(resource.id);
    }
  }

  return rootIds;
}

function buildDependsOnAttributes(rootIds: readonly string[]): Resource['attributes'] {
  if (rootIds.length === 0) return [];

  return [
    {
      key: 'depends_on',
      value: rootIds.map((id) => ({ kind: 'reference' as const, id })),
    },
  ];
}

function shouldSynthesizeMilestone(document: SirenDocument): boolean {
  return document.directive?.implicitMilestone !== false;
}

/**
 * Synthesis module: flattens pre-build documents and synthesizes per-document
 * milestones for downstream dedup/graph/analysis modules.
 *
 * Reads:  { documents }
 * Writes: { rawResources }
 */
export const SynthesisModule = defineModule(
  'Synthesis',
  (input: SynthesisInput): SynthesisOutput => {
    const rawResources: Resource[] = [];

    for (const document of input.documents) {
      rawResources.push(...document.resources);
      if (!shouldSynthesizeMilestone(document)) {
        continue;
      }
      if (hasExplicitDocumentMilestone(document)) {
        continue;
      }

      const rootIds = collectDocumentRootIds(document.resources);
      rawResources.push({
        type: 'milestone',
        id: document.id,
        attributes: buildDependsOnAttributes(rootIds),
        origin: { kind: 'synthetic', document: document.id },
      });
    }

    return { rawResources };
  },
);

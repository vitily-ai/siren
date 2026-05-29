import { getDependsOn } from '../../../utilities/entry';
import type { SirenDocument } from '../../document';
import type { SirenEntry } from '../../types';
import { defineModule } from '../types';

type SynthesisInput = {
  readonly documents: readonly SirenDocument[];
};

type SynthesisOutput = {
  readonly rawEntries: readonly SirenEntry[];
};

function hasExplicitDocumentMilestone(document: SirenDocument): boolean {
  return document.entries.some((entry) => entry.type === 'milestone' && entry.id === document.id);
}

function collectDocumentRootIds(entries: readonly SirenEntry[]): readonly string[] {
  const localEntryIds = new Set(entries.map((entry) => entry.id));
  const dependedOnLocalIds = new Set<string>();

  for (const entry of entries) {
    for (const dependencyId of getDependsOn(entry)) {
      if (localEntryIds.has(dependencyId)) {
        dependedOnLocalIds.add(dependencyId);
      }
    }
  }

  const rootIds: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!dependedOnLocalIds.has(entry.id) && !seen.has(entry.id)) {
      rootIds.push(entry.id);
      seen.add(entry.id);
    }
  }

  return rootIds;
}

function buildDependsOnAttributes(rootIds: readonly string[]): SirenEntry['attributes'] {
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
 * Writes: { rawEntries }
 */
export const SynthesisModule = defineModule(
  'Synthesis',
  (input: SynthesisInput): SynthesisOutput => {
    const rawEntries: SirenEntry[] = [];

    for (const document of input.documents) {
      rawEntries.push(...document.entries);
      if (!shouldSynthesizeMilestone(document)) {
        continue;
      }
      if (hasExplicitDocumentMilestone(document)) {
        continue;
      }

      const rootIds = collectDocumentRootIds(document.entries);
      rawEntries.push({
        type: 'milestone',
        id: document.id,
        attributes: buildDependsOnAttributes(rootIds),
        origin: { kind: 'synthetic', document: document.id },
      });
    }

    return { rawEntries };
  },
);

import type { ResourceGraph } from './resource-graph';
import type { Resource } from './types';

export interface FileAttribution {
  readonly file?: string;
}

export interface PositionAttribution {
  readonly line?: number;
  readonly column?: number;
}

export interface FirstOccurrencePositionAttribution {
  readonly firstLine?: number;
  readonly firstColumn?: number;
}

export interface SecondOccurrenceAttribution {
  readonly file?: string;
  readonly secondLine?: number;
  readonly secondColumn?: number;
}

function rangeOriginForResource(resource: Resource | undefined) {
  const origin = resource?.origin;
  if (origin?.kind !== 'range') return undefined;
  return origin;
}

export function sourceFileForResource(resource: Resource | undefined): string | undefined {
  return resource?.origin?.document;
}

export function sourceFilesForResourceIds(
  resourceIds: readonly string[],
  graph: ResourceGraph,
): FileAttribution {
  if (resourceIds.length === 0) return {};

  const files = new Set<string>();
  for (const resourceId of resourceIds) {
    const file = sourceFileForResource(graph.getResource(resourceId));
    if (file !== undefined) {
      files.add(file);
    }
  }

  return files.size > 0 ? { file: Array.from(files).join(', ') } : {};
}

export function positionForResource(resource: Resource | undefined): PositionAttribution {
  const origin = rangeOriginForResource(resource);
  if (origin === undefined) return {};

  return {
    line: origin.startRow + 1,
    column: 0,
  };
}

export function firstOccurrencePositionForResource(
  resource: Resource | undefined,
): FirstOccurrencePositionAttribution {
  const origin = rangeOriginForResource(resource);
  if (origin === undefined) return {};

  return {
    firstLine: origin.startRow + 1,
    firstColumn: 0,
  };
}

export function secondOccurrenceAttributionForResource(
  resource: Resource | undefined,
): SecondOccurrenceAttribution {
  const origin = rangeOriginForResource(resource);
  if (origin === undefined) {
    return { file: sourceFileForResource(resource) };
  }

  return {
    file: sourceFileForResource(resource),
    secondLine: origin.startRow + 1,
    secondColumn: 0,
  };
}

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

export function sourceFileForResource(resource: Resource | undefined): string | undefined {
  return resource?.origin?.document;
}

export function sourceFilesForResourceIds(
  resourceIds: readonly string[],
  resourcesById: ReadonlyMap<string, Resource>,
): FileAttribution {
  if (resourceIds.length === 0) return {};

  const files = new Set<string>();
  for (const resourceId of resourceIds) {
    const file = sourceFileForResource(resourcesById.get(resourceId));
    if (file !== undefined) {
      files.add(file);
    }
  }

  return files.size > 0 ? { file: Array.from(files).join(', ') } : {};
}

export function positionForResource(resource: Resource | undefined): PositionAttribution {
  if (resource?.origin === undefined) return {};

  return {
    line: resource.origin.startRow + 1,
    column: 0,
  };
}

export function firstOccurrencePositionForResource(
  resource: Resource | undefined,
): FirstOccurrencePositionAttribution {
  if (resource?.origin === undefined) return {};

  return {
    firstLine: resource.origin.startRow + 1,
    firstColumn: 0,
  };
}

export function secondOccurrenceAttributionForResource(
  resource: Resource | undefined,
): SecondOccurrenceAttribution {
  if (resource?.origin === undefined) {
    return { file: sourceFileForResource(resource) };
  }

  return {
    file: sourceFileForResource(resource),
    secondLine: resource.origin.startRow + 1,
    secondColumn: 0,
  };
}

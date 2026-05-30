import type { EntryGraph } from './entry-graph';
import type { SirenEntry } from './types';

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

function rangeOriginForEntry(entry: SirenEntry | undefined) {
  const origin = entry?.origin;
  if (origin?.kind !== 'range') return undefined;
  return origin;
}

export function sourceFileForEntry(entry: SirenEntry | undefined): string | undefined {
  return entry?.origin?.document;
}

export function sourceFilesForEntryIds(
  entryIds: readonly string[],
  graph: EntryGraph,
): FileAttribution {
  if (entryIds.length === 0) return {};

  const files = new Set<string>();
  for (const entryId of entryIds) {
    const file = sourceFileForEntry(graph.getEntry(entryId));
    if (file !== undefined) {
      files.add(file);
    }
  }

  return files.size > 0 ? { file: Array.from(files).join(', ') } : {};
}

export function positionForEntry(entry: SirenEntry | undefined): PositionAttribution {
  const origin = rangeOriginForEntry(entry);
  if (origin === undefined) return {};

  return {
    line: origin.startRow + 1,
    column: 0,
  };
}

export function firstOccurrencePositionForEntry(
  entry: SirenEntry | undefined,
): FirstOccurrencePositionAttribution {
  const origin = rangeOriginForEntry(entry);
  if (origin === undefined) return {};

  return {
    firstLine: origin.startRow + 1,
    firstColumn: 0,
  };
}

export function secondOccurrenceAttributionForEntry(
  entry: SirenEntry | undefined,
): SecondOccurrenceAttribution {
  const origin = rangeOriginForEntry(entry);
  if (origin === undefined) {
    return { file: sourceFileForEntry(entry) };
  }

  return {
    file: sourceFileForEntry(entry),
    secondLine: origin.startRow + 1,
    secondColumn: 0,
  };
}

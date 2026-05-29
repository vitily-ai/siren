import { describe, expect, it } from 'vitest';
import { EntryGraph } from './entry-graph';
import {
  firstOccurrencePositionForEntry,
  positionForEntry,
  secondOccurrenceAttributionForEntry,
  sourceFileForEntry,
  sourceFilesForEntryIds,
} from './source-attribution';
import type { Origin, SirenEntry } from './types';

function origin(document: string | undefined, startRow: number): Origin {
  return {
    kind: 'range',
    startByte: startRow * 10,
    endByte: startRow * 10 + 9,
    startRow,
    endRow: startRow,
    ...(document !== undefined ? { document } : {}),
  };
}

function syntheticOrigin(document: string): Origin {
  return {
    kind: 'synthetic',
    document,
  };
}

function task(id: string, originValue?: Origin): SirenEntry {
  return {
    type: 'task',
    id,
    attributes: [],
    ...(originValue ? { origin: originValue } : {}),
  };
}

describe('sourceFileForEntry', () => {
  it('returns origin.document when present', () => {
    expect(sourceFileForEntry(task('a', origin('a.siren', 0)))).toBe('a.siren');
  });

  it('returns origin.document for synthetic origins', () => {
    expect(sourceFileForEntry(task('a', syntheticOrigin('synthetic.siren')))).toBe(
      'synthetic.siren',
    );
  });

  it('returns undefined when origin is missing', () => {
    expect(sourceFileForEntry(task('a'))).toBeUndefined();
  });

  it('returns undefined when origin.document is missing', () => {
    expect(sourceFileForEntry(task('a', origin(undefined, 0)))).toBeUndefined();
  });

  it('returns undefined when the entry itself is undefined', () => {
    expect(sourceFileForEntry(undefined)).toBeUndefined();
  });
});

describe('sourceFilesForEntryIds', () => {
  it('returns an empty attribution for an empty id list', () => {
    expect(sourceFilesForEntryIds([], EntryGraph.fromEntries([]))).toEqual({});
  });

  it('joins distinct files in iteration order', () => {
    const graph = EntryGraph.fromEntries([
      task('a', origin('one.siren', 0)),
      task('b', origin('two.siren', 0)),
    ]);
    expect(sourceFilesForEntryIds(['a', 'b'], graph)).toEqual({
      file: 'one.siren, two.siren',
    });
  });

  it('deduplicates files that appear multiple times across the id list', () => {
    const graph = EntryGraph.fromEntries([
      task('a', origin('shared.siren', 0)),
      task('b', origin('shared.siren', 1)),
    ]);
    expect(sourceFilesForEntryIds(['a', 'b', 'a'], graph)).toEqual({
      file: 'shared.siren',
    });
  });

  it('skips ids missing from the entry map', () => {
    const graph = EntryGraph.fromEntries([task('a', origin('a.siren', 0))]);
    expect(sourceFilesForEntryIds(['a', 'missing'], graph)).toEqual({
      file: 'a.siren',
    });
  });

  it('omits the file field when no id has an attributable file', () => {
    const graph = EntryGraph.fromEntries([task('a')]);
    expect(sourceFilesForEntryIds(['a', 'missing'], graph)).toEqual({});
  });
});

describe('positionForEntry', () => {
  it('returns 1-based line and column 0 when origin is present', () => {
    expect(positionForEntry(task('a', origin('a.siren', 4)))).toEqual({
      line: 5,
      column: 0,
    });
  });

  it('returns an empty attribution for synthetic origins', () => {
    expect(positionForEntry(task('a', syntheticOrigin('a.siren')))).toEqual({});
  });

  it('returns an empty attribution when origin is missing', () => {
    expect(positionForEntry(task('a'))).toEqual({});
  });

  it('returns an empty attribution when the entry is undefined', () => {
    expect(positionForEntry(undefined)).toEqual({});
  });
});

describe('firstOccurrencePositionForEntry', () => {
  it('returns 1-based firstLine and firstColumn 0 when origin is present', () => {
    expect(firstOccurrencePositionForEntry(task('a', origin('a.siren', 7)))).toEqual({
      firstLine: 8,
      firstColumn: 0,
    });
  });

  it('returns an empty attribution for synthetic origins', () => {
    expect(firstOccurrencePositionForEntry(task('a', syntheticOrigin('a.siren')))).toEqual({});
  });

  it('returns an empty attribution when origin is missing', () => {
    expect(firstOccurrencePositionForEntry(task('a'))).toEqual({});
    expect(firstOccurrencePositionForEntry(undefined)).toEqual({});
  });
});

describe('secondOccurrenceAttributionForEntry', () => {
  it('returns file plus 1-based secondLine and secondColumn 0 when origin is present', () => {
    expect(secondOccurrenceAttributionForEntry(task('a', origin('dup.siren', 11)))).toEqual({
      file: 'dup.siren',
      secondLine: 12,
      secondColumn: 0,
    });
  });

  it('returns only file for synthetic origins', () => {
    expect(secondOccurrenceAttributionForEntry(task('a', syntheticOrigin('dup.siren')))).toEqual({
      file: 'dup.siren',
    });
  });

  it('returns only the file (undefined) when origin is missing', () => {
    expect(secondOccurrenceAttributionForEntry(task('a'))).toEqual({
      file: undefined,
    });
  });

  it('returns file undefined for an undefined entry', () => {
    expect(secondOccurrenceAttributionForEntry(undefined)).toEqual({
      file: undefined,
    });
  });
});

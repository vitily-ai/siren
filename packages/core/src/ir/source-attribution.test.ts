import { describe, expect, it } from 'vitest';
import {
  firstOccurrencePositionForResource,
  positionForResource,
  secondOccurrenceAttributionForResource,
  sourceFileForResource,
  sourceFilesForResourceIds,
} from './source-attribution';
import type { Origin, Resource } from './types';

function origin(document: string | undefined, startRow: number): Origin {
  return {
    startByte: startRow * 10,
    endByte: startRow * 10 + 9,
    startRow,
    endRow: startRow,
    ...(document !== undefined ? { document } : {}),
  };
}

function task(id: string, originValue?: Origin): Resource {
  return {
    type: 'task',
    id,
    complete: false,
    attributes: [],
    ...(originValue ? { origin: originValue } : {}),
  };
}

describe('sourceFileForResource', () => {
  it('returns origin.document when present', () => {
    expect(sourceFileForResource(task('a', origin('a.siren', 0)))).toBe('a.siren');
  });

  it('returns undefined when origin is missing', () => {
    expect(sourceFileForResource(task('a'))).toBeUndefined();
  });

  it('returns undefined when origin.document is missing', () => {
    expect(sourceFileForResource(task('a', origin(undefined, 0)))).toBeUndefined();
  });

  it('returns undefined when the resource itself is undefined', () => {
    expect(sourceFileForResource(undefined)).toBeUndefined();
  });
});

describe('sourceFilesForResourceIds', () => {
  it('returns an empty attribution for an empty id list', () => {
    expect(sourceFilesForResourceIds([], new Map())).toEqual({});
  });

  it('joins distinct files in iteration order', () => {
    const resources = new Map<string, Resource>([
      ['a', task('a', origin('one.siren', 0))],
      ['b', task('b', origin('two.siren', 0))],
    ]);
    expect(sourceFilesForResourceIds(['a', 'b'], resources)).toEqual({
      file: 'one.siren, two.siren',
    });
  });

  it('deduplicates files that appear multiple times across the id list', () => {
    const resources = new Map<string, Resource>([
      ['a', task('a', origin('shared.siren', 0))],
      ['b', task('b', origin('shared.siren', 1))],
    ]);
    expect(sourceFilesForResourceIds(['a', 'b', 'a'], resources)).toEqual({
      file: 'shared.siren',
    });
  });

  it('skips ids missing from the resource map', () => {
    const resources = new Map<string, Resource>([['a', task('a', origin('a.siren', 0))]]);
    expect(sourceFilesForResourceIds(['a', 'missing'], resources)).toEqual({
      file: 'a.siren',
    });
  });

  it('omits the file field when no id has an attributable file', () => {
    const resources = new Map<string, Resource>([['a', task('a')]]);
    expect(sourceFilesForResourceIds(['a', 'missing'], resources)).toEqual({});
  });
});

describe('positionForResource', () => {
  it('returns 1-based line and column 0 when origin is present', () => {
    expect(positionForResource(task('a', origin('a.siren', 4)))).toEqual({
      line: 5,
      column: 0,
    });
  });

  it('returns an empty attribution when origin is missing', () => {
    expect(positionForResource(task('a'))).toEqual({});
  });

  it('returns an empty attribution when the resource is undefined', () => {
    expect(positionForResource(undefined)).toEqual({});
  });
});

describe('firstOccurrencePositionForResource', () => {
  it('returns 1-based firstLine and firstColumn 0 when origin is present', () => {
    expect(firstOccurrencePositionForResource(task('a', origin('a.siren', 7)))).toEqual({
      firstLine: 8,
      firstColumn: 0,
    });
  });

  it('returns an empty attribution when origin is missing', () => {
    expect(firstOccurrencePositionForResource(task('a'))).toEqual({});
    expect(firstOccurrencePositionForResource(undefined)).toEqual({});
  });
});

describe('secondOccurrenceAttributionForResource', () => {
  it('returns file plus 1-based secondLine and secondColumn 0 when origin is present', () => {
    expect(secondOccurrenceAttributionForResource(task('a', origin('dup.siren', 11)))).toEqual({
      file: 'dup.siren',
      secondLine: 12,
      secondColumn: 0,
    });
  });

  it('returns only the file (undefined) when origin is missing', () => {
    expect(secondOccurrenceAttributionForResource(task('a'))).toEqual({
      file: undefined,
    });
  });

  it('returns file undefined for an undefined resource', () => {
    expect(secondOccurrenceAttributionForResource(undefined)).toEqual({
      file: undefined,
    });
  });
});

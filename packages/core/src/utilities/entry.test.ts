import { describe, expect, it } from 'vitest';
import type { SirenEntry } from '../ir/types';
import { findEntryById, isComplete, isDraft } from './entry';

describe('findEntryById', () => {
  const mockEntries: SirenEntry[] = [
    {
      type: 'task',
      id: 'task1',
      status: 'draft',
      attributes: [],
    },
    {
      type: 'milestone',
      id: 'milestone1',
      status: 'complete',
      attributes: [],
    },
  ];

  it('should return the entry when ID matches', () => {
    const result = findEntryById(mockEntries, 'task1');
    expect(result).toEqual(mockEntries[0]);
  });

  it('should throw an error when ID does not match', () => {
    expect(() => findEntryById(mockEntries, 'nonexistent')).toThrow(
      "Entry with ID 'nonexistent' not found",
    );
  });
});

describe('status helpers', () => {
  const implicitStatus: SirenEntry = {
    type: 'task',
    id: 'implicit',
    attributes: [],
  };

  const draft: SirenEntry = {
    type: 'task',
    id: 'draft',
    status: 'draft',
    attributes: [],
  };

  const complete: SirenEntry = {
    type: 'task',
    id: 'complete',
    status: 'complete',
    attributes: [],
  };

  it('isComplete returns true only for explicit complete status', () => {
    expect(isComplete(implicitStatus)).toBe(false);
    expect(isComplete(draft)).toBe(false);
    expect(isComplete(complete)).toBe(true);
  });

  it('isDraft returns true only for explicit draft status', () => {
    expect(isDraft(implicitStatus)).toBe(false);
    expect(isDraft(draft)).toBe(true);
    expect(isDraft(complete)).toBe(false);
  });
});

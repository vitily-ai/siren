import { describe, expect, it } from 'vitest';
import type { Resource } from '../ir/types';
import { findResourceById, isComplete, isDraft } from './entry';

describe('findResourceById', () => {
  const mockResources: Resource[] = [
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

  it('should return the resource when ID matches', () => {
    const result = findResourceById(mockResources, 'task1');
    expect(result).toEqual(mockResources[0]);
  });

  it('should throw an error when ID does not match', () => {
    expect(() => findResourceById(mockResources, 'nonexistent')).toThrow(
      "Resource with ID 'nonexistent' not found",
    );
  });
});

describe('status helpers', () => {
  const implicitStatus: Resource = {
    type: 'task',
    id: 'implicit',
    attributes: [],
  };

  const draft: Resource = {
    type: 'task',
    id: 'draft',
    status: 'draft',
    attributes: [],
  };

  const complete: Resource = {
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

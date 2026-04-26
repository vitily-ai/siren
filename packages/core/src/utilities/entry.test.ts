import { describe, expect, it } from 'vitest';
import type { Resource } from '../ir/types';
import { findResourceById } from './entry';

describe('findResourceById', () => {
  const mockResources: Resource[] = [
    {
      type: 'task',
      id: 'task1',
      status: 'active',
      complete: false,
      draft: false,
      attributes: [],
    },
    {
      type: 'milestone',
      id: 'milestone1',
      status: 'complete',
      complete: true,
      draft: false,
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

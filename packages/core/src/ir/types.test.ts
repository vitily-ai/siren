/**
 * Tests for IR type guards and type safety
 */

import { describe, expect, it } from 'vitest';
import {
  type ArrayValue,
  type AttributeValue,
  isArray,
  isPrimitive,
  isReference,
  type ResourceReference,
} from './types.js';

describe('IR Type System', () => {
  describe('Type Guards', () => {
    it('should identify primitive values', () => {
      expect(isPrimitive('string')).toBe(true);
      expect(isPrimitive(42)).toBe(true);
      expect(isPrimitive(true)).toBe(true);
      expect(isPrimitive(null)).toBe(true);
    });

    it('should identify references', () => {
      const ref: ResourceReference = { kind: 'reference', id: 'taskA' };
      expect(isReference(ref)).toBe(true);
      expect(isPrimitive(ref)).toBe(false);
      expect(isArray(ref)).toBe(false);
    });

    it('should identify arrays', () => {
      const arr: ArrayValue = { kind: 'array', elements: ['a', 'b'] };
      expect(isArray(arr)).toBe(true);
      expect(isPrimitive(arr)).toBe(false);
      expect(isReference(arr)).toBe(false);
    });
  });

  describe('Type Discrimination', () => {
    it('should narrow types correctly', () => {
      const value: AttributeValue = { kind: 'reference', id: 'test' };

      if (isReference(value)) {
        // Type should be narrowed to ResourceReference
        expect(value.id).toBe('test');
      } else {
        throw new Error('Expected reference');
      }
    });

    it('should handle nested arrays', () => {
      const nested: ArrayValue = {
        kind: 'array',
        elements: [
          'string',
          { kind: 'reference', id: 'ref' },
          { kind: 'array', elements: [1, 2, 3] },
        ] as const,
      };

      expect(isArray(nested)).toBe(true);
      expect(nested.elements).toHaveLength(3);

      const str = nested.elements[0];
      const ref = nested.elements[1];
      const arr = nested.elements[2];

      if (str === undefined || ref === undefined || arr === undefined) {
        throw new Error('Expected three elements in nested array');
      }

      expect(isPrimitive(str)).toBe(true);
      expect(isReference(ref)).toBe(true);
      expect(isArray(arr)).toBe(true);
    });
  });
});

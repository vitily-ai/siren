/**
 * Tests for IR type guards and type safety
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { getTestAdapter } from '../../test/helpers/parser.js';
import { decode } from '../decoder/index.js';
import {
  type ArrayValue,
  type AttributeValue,
  isArray,
  isPrimitive,
  isReference,
  type ResourceReference,
} from '../ir/index.js';
import type { ParserAdapter } from '../parser/adapter.js';

describe('IR Type System', () => {
  let adapter: ParserAdapter;

  beforeAll(async () => {
    adapter = await getTestAdapter();
  });

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

describe('Task Readiness', () => {
  let adapter: ParserAdapter;

  beforeAll(async () => {
    adapter = await getTestAdapter();
  });

  it('resource without dependencies is ready', async () => {
    const source = `
task a {}
`;
    const parseResult = await adapter.parse(source);
    const decodeResult = decode(parseResult.tree!);
    expect(decodeResult.success).toBe(true);
    const resource = decodeResult.document!.resources.find((r) => r.id === 'a');
    expect(resource).toBeDefined();
    expect(resource!.ready).toBe(true);
  });

  it('resource with one complete dependency is ready', async () => {
    const source = `
task a complete {}
task b {
  depends_on = a
}
`;
    const parseResult = await adapter.parse(source);
    const decodeResult = decode(parseResult.tree!);
    expect(decodeResult.success).toBe(true);
    const resource = decodeResult.document!.resources.find((r) => r.id === 'b');
    expect(resource).toBeDefined();
    expect(resource!.ready).toBe(true);
  });

  it('resource with one incomplete dependency is not ready', async () => {
    const source = `
task a {}
task b {
  depends_on = a
}
`;
    const parseResult = await adapter.parse(source);
    const decodeResult = decode(parseResult.tree!);
    expect(decodeResult.success).toBe(true);
    const resource = decodeResult.document!.resources.find((r) => r.id === 'b');
    expect(resource).toBeDefined();
    expect(resource!.ready).toBe(false);
  });

  it('resource with missing dependency is not ready and emits warning', async () => {
    const source = `
task b {
  depends_on = missing
}
`;
    const parseResult = await adapter.parse(source);
    const decodeResult = decode(parseResult.tree!);
    expect(decodeResult.success).toBe(true);
    const resource = decodeResult.document!.resources.find((r) => r.id === 'b');
    expect(resource).toBeDefined();
    expect(resource!.ready).toBe(false);
    expect(decodeResult.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('missing'),
      }),
    );
  });

  it('milestone with complete dependencies is ready', async () => {
    const source = `
task a complete {}
milestone m {
  depends_on = a
}
`;
    const parseResult = await adapter.parse(source);
    const decodeResult = decode(parseResult.tree!);
    expect(decodeResult.success).toBe(true);
    const resource = decodeResult.document!.resources.find((r) => r.id === 'm');
    expect(resource).toBeDefined();
    expect(resource!.ready).toBe(true);
  });
});

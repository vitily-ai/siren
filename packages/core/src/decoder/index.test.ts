import { describe, expect, it } from 'vitest';
import type { Attribute } from '../ir/index.js';
import type {
  ArrayNode,
  AttributeNode,
  DocumentNode,
  ExpressionNode,
  IdentifierNode,
  LiteralNode,
  ReferenceNode,
  ResourceNode,
} from '../parser/cst.js';
import { type DecodeResult, decode } from './index.js';

/** Helper to create a minimal identifier node */
function makeIdentifier(value: string, quoted = false): IdentifierNode {
  return {
    type: 'identifier',
    text: quoted ? `"${value}"` : value,
    value,
    quoted,
  };
}

/** Helper to create a literal node */
function makeLiteral<T extends string | number | boolean | null>(
  value: T,
  literalType: 'string' | 'number' | 'boolean' | 'null',
): LiteralNode {
  const text =
    literalType === 'string' ? `"${value}"` : literalType === 'null' ? 'null' : String(value);
  return {
    type: 'literal',
    text,
    literalType,
    value,
  };
}

/** Helper to create a reference node */
function makeReference(targetId: string, quoted = false): ReferenceNode {
  return {
    type: 'reference',
    identifier: makeIdentifier(targetId, quoted),
  };
}

/** Helper to create an array node */
function makeArray(elements: ExpressionNode[]): ArrayNode {
  return {
    type: 'array',
    elements,
  };
}

/** Helper to create an attribute node */
function makeAttribute(key: string, value: ExpressionNode): AttributeNode {
  return {
    type: 'attribute',
    key: makeIdentifier(key),
    value,
  };
}

/** Helper to create a resource node with attributes */
function makeResource(
  resourceType: 'task' | 'milestone',
  id: string,
  body: AttributeNode[] = [],
): ResourceNode {
  return {
    type: 'resource',
    resourceType,
    identifier: makeIdentifier(id),
    body,
  };
}

/** Helper to get attributes from first resource in result */
function getFirstResourceAttrs(result: DecodeResult): readonly Attribute[] {
  const resource = result.document?.resources[0];
  if (!resource) throw new Error('No resource found in document');
  return resource.attributes;
}

describe('decode', () => {
  it('returns success with empty document for empty CST', () => {
    const emptyCst: DocumentNode = { type: 'document', resources: [] };
    const result = decode(emptyCst);

    expect(result.success).toBe(true);
    expect(result.document).not.toBeNull();
    expect(result.document?.resources).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  describe('primitive attribute decoding', () => {
    it('decodes string attribute to string value', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource('task', 'test', [
            makeAttribute('description', makeLiteral('hello world', 'string')),
          ]),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs).toHaveLength(1);
      expect(attrs[0]!.key).toBe('description');
      expect(attrs[0]!.value).toBe('hello world');
      expect(typeof attrs[0]!.value).toBe('string');
    });

    it('decodes number attribute to number value', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource('task', 'test', [makeAttribute('points', makeLiteral(42, 'number'))]),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs).toHaveLength(1);
      expect(attrs[0]!.key).toBe('points');
      expect(attrs[0]!.value).toBe(42);
      expect(typeof attrs[0]!.value).toBe('number');
    });

    it('decodes boolean true attribute to boolean value', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource('task', 'test', [makeAttribute('blocking', makeLiteral(true, 'boolean'))]),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs).toHaveLength(1);
      expect(attrs[0]!.key).toBe('blocking');
      expect(attrs[0]!.value).toBe(true);
      expect(typeof attrs[0]!.value).toBe('boolean');
    });

    it('decodes boolean false attribute to boolean value', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource('task', 'test', [makeAttribute('optional', makeLiteral(false, 'boolean'))]),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs).toHaveLength(1);
      expect(attrs[0]!.key).toBe('optional');
      expect(attrs[0]!.value).toBe(false);
      expect(typeof attrs[0]!.value).toBe('boolean');
    });

    it('decodes null attribute to null value', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource('task', 'test', [makeAttribute('assignee', makeLiteral(null, 'null'))]),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs).toHaveLength(1);
      expect(attrs[0]!.key).toBe('assignee');
      expect(attrs[0]!.value).toBeNull();
    });

    it('decodes multiple attributes preserving order', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource('task', 'test', [
            makeAttribute('title', makeLiteral('Test Task', 'string')),
            makeAttribute('priority', makeLiteral(1, 'number')),
            makeAttribute('active', makeLiteral(true, 'boolean')),
          ]),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs).toHaveLength(3);
      expect(attrs[0]).toEqual({ key: 'title', value: 'Test Task' });
      expect(attrs[1]).toEqual({ key: 'priority', value: 1 });
      expect(attrs[2]).toEqual({ key: 'active', value: true });
    });

    it('decodes floating point numbers', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource('task', 'test', [makeAttribute('hours', makeLiteral(3.5, 'number'))]),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs[0]!.value).toBe(3.5);
      expect(typeof attrs[0]!.value).toBe('number');
    });

    it('decodes negative numbers', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource('task', 'test', [makeAttribute('offset', makeLiteral(-10, 'number'))]),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs[0]!.value).toBe(-10);
    });

    it('decodes empty string', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource('task', 'test', [makeAttribute('notes', makeLiteral('', 'string'))]),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs[0]!.value).toBe('');
      expect(typeof attrs[0]!.value).toBe('string');
    });
  });

  describe('reference attribute decoding', () => {
    it('decodes bare reference to ResourceReference', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource('task', 'test', [makeAttribute('depends_on', makeReference('other_task'))]),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs).toHaveLength(1);
      expect(attrs[0]!.key).toBe('depends_on');
      expect(attrs[0]!.value).toEqual({ kind: 'reference', id: 'other_task' });
    });

    it('decodes quoted reference to ResourceReference (quotes stripped)', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource('task', 'test', [
            makeAttribute('depends_on', makeReference('setup environment', true)),
          ]),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs).toHaveLength(1);
      expect(attrs[0]!.key).toBe('depends_on');
      expect(attrs[0]!.value).toEqual({ kind: 'reference', id: 'setup environment' });
    });

    it('reference value has kind discriminator', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource('task', 'test', [makeAttribute('depends_on', makeReference('target'))]),
        ],
      };

      const result = decode(cst);
      const value = getFirstResourceAttrs(result)[0]!.value as { kind: string };

      expect(value.kind).toBe('reference');
    });

    it('decodes mixed attributes (primitive and reference)', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource('task', 'test', [
            makeAttribute('description', makeLiteral('Some work', 'string')),
            makeAttribute('depends_on', makeReference('other')),
            makeAttribute('priority', makeLiteral(1, 'number')),
          ]),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs).toHaveLength(3);
      expect(attrs[0]).toEqual({ key: 'description', value: 'Some work' });
      expect(attrs[1]).toEqual({ key: 'depends_on', value: { kind: 'reference', id: 'other' } });
      expect(attrs[2]).toEqual({ key: 'priority', value: 1 });
    });
  });

  describe('array attribute decoding (skipped for now)', () => {
    it('skips array attributes without error', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource('task', 'test', [
            makeAttribute('description', makeLiteral('Some work', 'string')),
            makeAttribute('depends_on', makeArray([makeReference('A'), makeReference('B')])),
            makeAttribute('priority', makeLiteral(1, 'number')),
          ]),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      // Array attribute is filtered out
      expect(attrs).toHaveLength(2);
      expect(attrs[0]).toEqual({ key: 'description', value: 'Some work' });
      expect(attrs[1]).toEqual({ key: 'priority', value: 1 });
    });

    it('resource with only array attribute has empty attributes', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource('task', 'test', [
            makeAttribute('depends_on', makeArray([makeReference('A')])),
          ]),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs).toHaveLength(0);
    });
  });
});

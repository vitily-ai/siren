import { describe, expect, it } from 'vitest';
import type {
  ArrayNode,
  AttributeNode,
  CSTNode,
  DocumentNode,
  IdentifierNode,
  LiteralNode,
  Origin,
  ReferenceNode,
  ResourceNode,
} from './cst.js';

describe('CST types', () => {
  describe('Origin interface', () => {
    it('has correct shape', () => {
      const origin: Origin = {
        startByte: 0,
        endByte: 10,
        startRow: 0,
        endRow: 0,
      };
      expect(origin.startByte).toBe(0);
      expect(origin.endByte).toBe(10);
      expect(origin.startRow).toBe(0);
      expect(origin.endRow).toBe(0);
    });

    it('values are immutable at compile time', () => {
      const origin: Origin = {
        startByte: 0,
        endByte: 10,
        startRow: 0,
        endRow: 0,
      };
      // TypeScript enforces readonly at compile time via type checking.
      // At runtime, JavaScript allows mutation, but TypeScript prevents it.
      expect(origin.startByte).toBe(0);
      // The following would be a TypeScript compilation error:
      // origin.startByte = 5;  // ✗ Cannot assign to readonly property
    });
  });

  describe('CSTNode interface', () => {
    it('accepts basic node without origin', () => {
      const node: CSTNode = {
        type: 'test',
      };
      expect(node.type).toBe('test');
      expect(node.origin).toBeUndefined();
    });

    it('accepts node with origin', () => {
      const node: CSTNode = {
        type: 'test',
        origin: {
          startByte: 0,
          endByte: 5,
          startRow: 0,
          endRow: 0,
        },
      };
      expect(node.type).toBe('test');
      expect(node.origin).toBeDefined();
      expect(node.origin?.startByte).toBe(0);
    });
  });

  describe('CST node types with origin support', () => {
    it('DocumentNode includes origin support', () => {
      const doc: DocumentNode = {
        type: 'document',
        resources: [],
        origin: {
          startByte: 0,
          endByte: 100,
          startRow: 0,
          endRow: 5,
        },
      };
      expect(doc.type).toBe('document');
      expect(doc.resources).toEqual([]);
      expect(doc.origin?.endByte).toBe(100);
    });

    it('DocumentNode works without origin (backward compatible)', () => {
      const doc: DocumentNode = {
        type: 'document',
        resources: [],
      };
      expect(doc.type).toBe('document');
      expect(doc.origin).toBeUndefined();
    });

    it('ResourceNode includes origin support', () => {
      const resource: ResourceNode = {
        type: 'resource',
        resourceType: 'task',
        identifier: {
          type: 'identifier',
          text: 'my_task',
          value: 'my_task',
          quoted: false,
        },
        body: [],
        origin: {
          startByte: 0,
          endByte: 50,
          startRow: 0,
          endRow: 2,
        },
      };
      expect(resource.resourceType).toBe('task');
      expect(resource.origin?.startRow).toBe(0);
    });

    it('AttributeNode includes origin support', () => {
      const attr: AttributeNode = {
        type: 'attribute',
        key: {
          type: 'identifier',
          text: 'description',
          value: 'description',
          quoted: false,
        },
        value: {
          type: 'literal',
          text: '"test"',
          literalType: 'string',
          value: 'test',
        },
        origin: {
          startByte: 10,
          endByte: 35,
          startRow: 1,
          endRow: 1,
        },
      };
      expect(attr.key.text).toBe('description');
      expect(attr.origin?.endByte).toBe(35);
    });

    it('IdentifierNode includes origin support', () => {
      const ident: IdentifierNode = {
        type: 'identifier',
        text: 'my_task',
        value: 'my_task',
        quoted: false,
        origin: {
          startByte: 5,
          endByte: 12,
          startRow: 0,
          endRow: 0,
        },
      };
      expect(ident.text).toBe('my_task');
      expect(ident.origin?.startByte).toBe(5);
    });

    it('LiteralNode includes origin support', () => {
      const literal: LiteralNode = {
        type: 'literal',
        text: '"hello"',
        literalType: 'string',
        value: 'hello',
        origin: {
          startByte: 20,
          endByte: 27,
          startRow: 1,
          endRow: 1,
        },
      };
      expect(literal.literalType).toBe('string');
      expect(literal.origin?.endRow).toBe(1);
    });

    it('ReferenceNode includes origin support', () => {
      const ref: ReferenceNode = {
        type: 'reference',
        identifier: {
          type: 'identifier',
          text: 'other_task',
          value: 'other_task',
          quoted: false,
        },
        origin: {
          startByte: 30,
          endByte: 40,
          startRow: 2,
          endRow: 2,
        },
      };
      expect(ref.identifier.text).toBe('other_task');
      expect(ref.origin?.startByte).toBe(30);
    });

    it('ArrayNode includes origin support', () => {
      const arr: ArrayNode = {
        type: 'array',
        elements: [],
        origin: {
          startByte: 45,
          endByte: 50,
          startRow: 3,
          endRow: 3,
        },
      };
      expect(arr.elements).toEqual([]);
      expect(arr.origin?.startRow).toBe(3);
    });
  });

  describe('Backward compatibility', () => {
    it('existing code using nodes without origin still compiles', () => {
      // This test verifies that origin being optional doesn't break
      // existing code that doesn't use it
      const nodes: CSTNode[] = [{ type: 'document' }, { type: 'resource' }, { type: 'attribute' }];
      expect(nodes.length).toBe(3);
      expect(nodes.every((n) => n.origin === undefined)).toBe(true);
    });

    it('can mix nodes with and without origin in arrays', () => {
      const nodes: CSTNode[] = [
        { type: 'node1' },
        {
          type: 'node2',
          origin: { startByte: 0, endByte: 5, startRow: 0, endRow: 0 },
        },
        { type: 'node3' },
      ];
      expect(nodes.length).toBe(3);
      expect(nodes[0].origin).toBeUndefined();
      expect(nodes[1].origin).toBeDefined();
      expect(nodes[2].origin).toBeUndefined();
    });
  });
});

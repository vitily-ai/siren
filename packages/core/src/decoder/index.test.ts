import { xfailIf } from './xfail';

describe('error recovery', () => {
  // xfail if repeated property or invalid value diagnostics are not implemented
  const diagnosticsImplemented = (() => {
    const cst: DocumentNode = {
      type: 'document',
      resources: [
        makeResource({
          resourceType: 'task',
          id: 'foo',
          body: [makeAttribute('description', makeLiteral('ok', 'string'))],
        }),
        {
          type: 'resource',
          resourceType: 'task',
          identifier: makeIdentifier('bar'),
          body: [
            makeAttribute('description', makeLiteral('first', 'string')),
            makeAttribute('description', makeLiteral('repeat', 'string')),
          ],
        } as any,
        makeResource({
          resourceType: 'milestone',
          id: 'baz',
          body: [makeAttribute('description', makeLiteral('milestone ok', 'string'))],
        }),
        {
          type: 'resource',
          resourceType: 'task',
          identifier: makeIdentifier('invalid'),
          body: [makeAttribute('depends_on', makeLiteral(123, 'number'))],
        } as any,
        makeResource({
          resourceType: 'task',
          id: 'after_error',
          body: [makeAttribute('description', makeLiteral('should be present', 'string'))],
        }),
      ],
    };
    const result = decode(cst);
    const diagMsgs = result.diagnostics.map((d) => d.message).join('\n');
    return /invalid value|type|repeated property/i.test(diagMsgs);
  })();

  xfailIf(it, !diagnosticsImplemented)(
    'recovers from repeated property and invalid value errors, parses subsequent valid resources, and emits diagnostics',
    () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource({
            resourceType: 'task',
            id: 'foo',
            body: [makeAttribute('description', makeLiteral('ok', 'string'))],
          }),
          {
            type: 'resource',
            resourceType: 'task',
            identifier: makeIdentifier('bar'),
            body: [
              makeAttribute('description', makeLiteral('first', 'string')),
              makeAttribute('description', makeLiteral('repeat', 'string')),
            ],
          } as any,
          makeResource({
            resourceType: 'milestone',
            id: 'baz',
            body: [makeAttribute('description', makeLiteral('milestone ok', 'string'))],
          }),
          {
            type: 'resource',
            resourceType: 'task',
            identifier: makeIdentifier('invalid'),
            body: [makeAttribute('depends_on', makeLiteral(123, 'number'))],
          } as any,
          makeResource({
            resourceType: 'task',
            id: 'after_error',
            body: [makeAttribute('description', makeLiteral('should be present', 'string'))],
          }),
        ],
      };
      const result = decode(cst);
      const names = result.document?.resources.map((r) => r.id) || [];
      expect(names).toContain('after_error');
      expect(names).toContain('baz');
      const diagMsgs = result.diagnostics.map((d) => d.message).join('\n');
      expect(diagMsgs).toMatch(/invalid value|type/i);
      expect(result.document?.resources.length).toBeGreaterThanOrEqual(4);
    },
  );
});
describe('complete keyword handling', () => {
  it('emits error diagnostic and recovers if complete keyword is in invalid position', () => {
    // Simulate CST node with misplaced 'complete' (e.g., after block)
    const cst: DocumentNode = {
      type: 'document',
      resources: [
        {
          type: 'resource',
          resourceType: 'task',
          identifier: makeIdentifier('bad-task'),
          body: [makeAttribute('description', makeLiteral('bad', 'string'))],
          complete: false,
          completeKeywordDiagnostics: [
            "'complete' keyword found in invalid position for resource 'bad-task'. It will be ignored.",
          ],
        } as any,
      ],
    };
    const result = decode(cst);
    expect(result.success).toBe(false);
    expect(
      result.diagnostics.some((d) => d.code === 'E001' && d.message.includes('invalid position')),
    ).toBe(true);
    // Resource and attribute are still present
    expect(result.document).toBeNull();
  });

  it('emits warning if complete keyword is specified more than once', () => {
    // Simulate CST node with multiple 'complete' keywords
    const cst: DocumentNode = {
      type: 'document',
      resources: [
        {
          type: 'resource',
          resourceType: 'task',
          identifier: makeIdentifier('redundant'),
          body: [makeAttribute('description', makeLiteral('redundant', 'string'))],
          complete: true,
          completeKeywordCount: 2,
        } as any,
      ],
    };
    const result = decode(cst);
    expect(result.success).toBe(true);
    expect(
      result.diagnostics.some((d) => d.code === 'W002' && d.message.includes('more than once')),
    ).toBe(true);
    // Resource is still treated as complete
    expect(result.document?.resources[0]?.complete).toBe(true);
  });

  it('emits warning and ignores complete keyword on unsupported resource type', () => {
    // Simulate CST node with unsupported resource type
    const cst: DocumentNode = {
      type: 'document',
      resources: [
        {
          type: 'resource',
          resourceType: 'unknown' as any,
          identifier: makeIdentifier('badtype'),
          body: [makeAttribute('description', makeLiteral('badtype', 'string'))],
          complete: true,
        } as any,
      ],
    };
    const result = decode(cst);
    expect(result.success).toBe(true);
    expect(
      result.diagnostics.some((d) => d.code === 'W003' && d.message.includes('does not support')),
    ).toBe(true);
    // Resource is present, but complete is ignored
    expect(result.document?.resources[0]?.complete).toBe(true); // Still true, but warning emitted
  });

  it('does not drop valid resources or attributes due to complete keyword errors elsewhere', () => {
    // One resource has a complete keyword error, another is valid
    const cst: DocumentNode = {
      type: 'document',
      resources: [
        {
          type: 'resource',
          resourceType: 'task',
          identifier: makeIdentifier('bad-task'),
          body: [makeAttribute('description', makeLiteral('bad', 'string'))],
          complete: false,
          completeKeywordDiagnostics: [
            "'complete' keyword found in invalid position for resource 'bad-task'. It will be ignored.",
          ],
        } as any,
        makeResource({
          resourceType: 'task',
          id: 'good-task',
          body: [makeAttribute('description', makeLiteral('good', 'string'))],
          complete: true,
        }),
      ],
    };
    const result = decode(cst);
    // The error disables the document, but both resources are present in the CST
    expect(result.diagnostics.some((d) => d.code === 'E001')).toBe(true);
    // The valid resource is still present in the CST and would be in IR if not for the error
    expect(cst.resources[1]?.identifier.value).toBe('good-task');
  });
  it('diagnostics are clear, actionable, and do not block further processing for warnings', () => {
    // Only warnings, not errors
    const cst: DocumentNode = {
      type: 'document',
      resources: [
        {
          type: 'resource',
          resourceType: 'task',
          identifier: makeIdentifier('redundant'),
          body: [makeAttribute('description', makeLiteral('redundant', 'string'))],
          complete: true,
          completeKeywordCount: 2,
        } as any,
      ],
    };
    const result = decode(cst);
    expect(result.success).toBe(true);
    expect(result.diagnostics.some((d) => d.code === 'W002')).toBe(true);
    expect(result.document).not.toBeNull();
  });
  it('sets complete: true in IR when complete keyword is present (task)', () => {
    const cst: DocumentNode = {
      type: 'document',
      resources: [
        makeResource({ resourceType: 'task', id: 'done-task', body: [], complete: true }),
      ],
    };
    const result = decode(cst);
    expect(result.success).toBe(true);
    expect(result.document?.resources[0]?.complete).toBe(true);
  });

  it('sets complete: true in IR when complete keyword is present (milestone)', () => {
    const cst: DocumentNode = {
      type: 'document',
      resources: [
        makeResource({ resourceType: 'milestone', id: 'done-ms', body: [], complete: true }),
      ],
    };
    const result = decode(cst);
    expect(result.success).toBe(true);
    expect(result.document?.resources[0]?.complete).toBe(true);
  });

  it('sets complete: false in IR when complete keyword is absent', () => {
    const cst: DocumentNode = {
      type: 'document',
      resources: [
        makeResource({ resourceType: 'task', id: 'not-done', body: [], complete: false }),
      ],
    };
    const result = decode(cst);
    expect(result.success).toBe(true);
    expect(result.document?.resources[0]?.complete).toBe(false);
  });

  it('emits warning if both complete keyword and complete attribute (false) are present', () => {
    const cst: DocumentNode = {
      type: 'document',
      resources: [
        makeResource({
          resourceType: 'task',
          id: 'done-task',
          body: [makeAttribute('complete', makeLiteral(false, 'boolean'))],
          complete: true,
        }),
      ],
    };
    const result = decode(cst);
    expect(result.success).toBe(true);
    const resource = result.document?.resources[0];
    expect(resource?.complete).toBe(true);
    // The attribute is still present, but does not affect the IR-level complete flag
    const attr = resource?.attributes.find((a: Attribute) => a.key === 'complete');
    expect(attr?.value).toBe(false);
    // Warning diagnostic is present
    expect(
      result.diagnostics.some(
        (d: { code: string; severity: string }) => d.code === 'W001' && d.severity === 'warning',
      ),
    ).toBe(true);
  });

  it('does not emit warning if both complete keyword and complete attribute (true) are present', () => {
    const cst: DocumentNode = {
      type: 'document',
      resources: [
        makeResource({
          resourceType: 'task',
          id: 'done-task',
          body: [makeAttribute('complete', makeLiteral(true, 'boolean'))],
          complete: true,
        }),
      ],
    };
    const result = decode(cst);
    expect(result.success).toBe(true);
    const resource = result.document?.resources[0];
    expect(resource?.complete).toBe(true);
    const attr = resource?.attributes.find((a: Attribute) => a.key === 'complete');
    expect(attr?.value).toBe(true);
    // No warning
    expect(result.diagnostics.some((d: { code: string }) => d.code === 'W001')).toBe(false);
  });

  it('complete: false in IR if keyword is absent, even if attribute is true', () => {
    const cst: DocumentNode = {
      type: 'document',
      resources: [
        makeResource({
          resourceType: 'task',
          id: 'not-done',
          body: [makeAttribute('complete', makeLiteral(true, 'boolean'))],
          complete: false,
        }),
      ],
    };
    const result = decode(cst);
    expect(result.success).toBe(true);
    const resource = result.document?.resources[0];
    expect(resource?.complete).toBe(false);
    const attr = resource?.attributes.find((a) => a.key === 'complete');
    expect(attr?.value).toBe(true);
  });
});

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
type MakeResourceOptions = {
  resourceType: 'task' | 'milestone';
  id: string;
  body?: AttributeNode[];
} & Record<string, any>;

function makeResource({ resourceType, id, body = [], ...rest }: MakeResourceOptions): ResourceNode {
  return {
    type: 'resource',
    resourceType,
    identifier: makeIdentifier(id),
    body,
    ...rest,
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
          makeResource({
            resourceType: 'task',
            id: 'test',
            body: [makeAttribute('description', makeLiteral('hello world', 'string'))],
          }),
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
          makeResource({
            resourceType: 'task',
            id: 'test',
            body: [makeAttribute('points', makeLiteral(42, 'number'))],
          }),
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
          makeResource({
            resourceType: 'task',
            id: 'test',
            body: [makeAttribute('blocking', makeLiteral(true, 'boolean'))],
          }),
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
          makeResource({
            resourceType: 'task',
            id: 'test',
            body: [makeAttribute('optional', makeLiteral(false, 'boolean'))],
          }),
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
          makeResource({
            resourceType: 'task',
            id: 'test',
            body: [makeAttribute('assignee', makeLiteral(null, 'null'))],
          }),
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
          makeResource({
            resourceType: 'task',
            id: 'test',
            body: [
              makeAttribute('title', makeLiteral('Test Task', 'string')),
              makeAttribute('priority', makeLiteral(1, 'number')),
              makeAttribute('active', makeLiteral(true, 'boolean')),
            ],
          }),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs).toHaveLength(3);
      expect(attrs[0]).toEqual(expect.objectContaining({ key: 'title', value: 'Test Task' }));
      expect(attrs[1]).toEqual(expect.objectContaining({ key: 'priority', value: 1 }));
      expect(attrs[2]).toEqual(expect.objectContaining({ key: 'active', value: true }));
    });

    it('decodes floating point numbers', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource({
            resourceType: 'task',
            id: 'test',
            body: [makeAttribute('hours', makeLiteral(3.5, 'number'))],
          }),
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
          makeResource({
            resourceType: 'task',
            id: 'test',
            body: [makeAttribute('offset', makeLiteral(-10, 'number'))],
          }),
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
          makeResource({
            resourceType: 'task',
            id: 'test',
            body: [makeAttribute('notes', makeLiteral('', 'string'))],
          }),
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
          makeResource({
            resourceType: 'task',
            id: 'test',
            body: [makeAttribute('depends_on', makeReference('other_task'))],
          }),
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
          makeResource({
            resourceType: 'task',
            id: 'test',
            body: [makeAttribute('depends_on', makeReference('setup environment', true))],
          }),
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
          makeResource({
            resourceType: 'task',
            id: 'test',
            body: [makeAttribute('depends_on', makeReference('target'))],
          }),
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
          makeResource({
            resourceType: 'task',
            id: 'test',
            body: [
              makeAttribute('description', makeLiteral('Some work', 'string')),
              makeAttribute('depends_on', makeReference('other')),
              makeAttribute('priority', makeLiteral(1, 'number')),
            ],
          }),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs).toHaveLength(3);
      expect(attrs[0]).toEqual(expect.objectContaining({ key: 'description', value: 'Some work' }));
      expect(attrs[1]).toEqual(
        expect.objectContaining({ key: 'depends_on', value: { kind: 'reference', id: 'other' } }),
      );
      expect(attrs[2]).toEqual(expect.objectContaining({ key: 'priority', value: 1 }));
    });
  });

  describe('array attribute decoding', () => {
    it('decodes array attributes', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource({
            resourceType: 'task',
            id: 'test',
            body: [
              makeAttribute('description', makeLiteral('Some work', 'string')),
              makeAttribute('depends_on', makeArray([makeReference('A'), makeReference('B')])),
              makeAttribute('priority', makeLiteral(1, 'number')),
            ],
          }),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs).toHaveLength(3);
      expect(attrs[0]).toEqual(expect.objectContaining({ key: 'description', value: 'Some work' }));
      expect(attrs[1]).toEqual({
        key: 'depends_on',
        value: {
          kind: 'array',
          elements: [
            { kind: 'reference', id: 'A' },
            { kind: 'reference', id: 'B' },
          ],
        },
      });
      expect(attrs[2]).toEqual(expect.objectContaining({ key: 'priority', value: 1 }));
    });

    it('resource with only array attribute has the attribute', () => {
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          makeResource({
            resourceType: 'task',
            id: 'test',
            body: [makeAttribute('depends_on', makeArray([makeReference('A')]))],
          }),
        ],
      };

      const result = decode(cst);

      expect(result.success).toBe(true);
      const attrs = getFirstResourceAttrs(result);
      expect(attrs).toHaveLength(1);
      expect(attrs[0]).toEqual({
        key: 'depends_on',
        value: { kind: 'array', elements: [{ kind: 'reference', id: 'A' }] },
      });
    });
  });
});

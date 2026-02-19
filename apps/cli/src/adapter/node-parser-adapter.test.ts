/**
 * Tests for NodeParserAdapter
 *
 * Covers:
 * - Origin population in CST nodes
 * - Comment extraction from parse trees
 * - ParseResult structure and accuracy
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { doc } from '../../test/helpers/test-utils.js';
import { NodeParserAdapter } from './node-parser-adapter.js';

let adapter: NodeParserAdapter;

beforeAll(async () => {
  adapter = await NodeParserAdapter.create();
});

describe('NodeParserAdapter - Phase 2: Origin & Comments', () => {
  describe('Origin population', () => {
    it('populates origin on DocumentNode', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(doc(source));

      expect(result.tree).toBeDefined();
      expect(result.tree?.origin).toBeDefined();
      expect(result.tree?.origin?.startByte).toBe(0);
      expect(result.tree?.origin?.endByte).toBe(source.length);
      expect(result.tree?.origin?.startRow).toBe(0);
    });

    it('populates origin on ResourceNode', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(doc(source));

      const resource = result.tree?.resources[0];
      expect(resource).toBeDefined();
      expect(resource?.origin).toBeDefined();
      expect(resource?.origin?.startByte).toBeGreaterThanOrEqual(0);
      expect(resource?.origin?.endByte).toBeLessThanOrEqual(source.length);
    });

    it('populates origin on IdentifierNode', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(doc(source));

      const resource = result.tree?.resources[0];
      expect(resource?.identifier).toBeDefined();
      expect(resource?.identifier.origin).toBeDefined();
      expect(resource?.identifier.origin?.startByte).toBeGreaterThanOrEqual(0);
    });

    it('populates origin on AttributeNode', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(doc(source));

      const resource = result.tree?.resources[0];
      const attr = resource?.body[0];
      expect(attr).toBeDefined();
      expect(attr?.origin).toBeDefined();
      expect(attr?.origin?.startByte).toBeGreaterThanOrEqual(0);
    });

    it('populates origin.document from SourceDocument name', async () => {
      const source = 'task foo { description = "test" }';
      const documents = doc(source, 'my-project/main.siren');
      const result = await adapter.parse(documents);

      const resource = result.tree?.resources[0];
      expect(resource).toBeDefined();
      expect(resource?.origin).toBeDefined();
      expect(resource?.origin?.document).toBe('my-project/main.siren');
    });

    it('preserves origin.document through IRContext.fromCst', async () => {
      const { IRContext } = await import('@siren/core');
      const source = 'task foo { description = "test" }';
      const documents = doc(source, 'my-project/main.siren');
      const result = await adapter.parse(documents);

      const ir = IRContext.fromCst(result.tree!);
      const resource = ir.resources[0];
      expect(resource).toBeDefined();
      expect(resource?.origin).toBeDefined();
      expect(resource?.origin?.document).toBe('my-project/main.siren');
    });

    it('preserves origin.document for diagnostics in IRContext', async () => {
      const { IRContext } = await import('@siren/core');
      // Create a circular dependency to trigger W004
      const source = `
task a { depends_on = b }
task b { depends_on = a }
`;
      const documents = doc(source, 'test-file.siren');
      const result = await adapter.parse(documents);

      // Verify CST has origin.document
      for (const r of result.tree!.resources) {
        expect(r.origin?.document).toBe('test-file.siren');
      }

      // Verify CST attribute structure
      const firstResource = result.tree!.resources[0];
      expect(firstResource.body).toHaveLength(1);
      const firstAttr = firstResource.body[0];
      expect(firstAttr.key.type).toBe('identifier');
      expect(firstAttr.key.value).toBe('depends_on');
      expect(firstAttr.value.type).toBe('reference');

      const ir = IRContext.fromCst(result.tree!);

      // Verify IR resources have origin.document (2 explicit + 1 synthetic milestone)
      expect(ir.resources.length).toBe(3);
      for (const r of ir.resources) {
        expect(r.origin?.document, `resource ${r.id} should have origin.document`).toBe(
          'test-file.siren',
        );
      }

      // Verify depends_on attribute was decoded correctly
      const resourceA = ir.resources.find((r) => r.id === 'a');
      expect(resourceA).toBeDefined();
      const dependsOnAttr = resourceA!.attributes.find((a) => a.key === 'depends_on');
      expect(dependsOnAttr, 'depends_on attribute should exist').toBeDefined();
      expect(dependsOnAttr!.value, 'depends_on value should be a reference').toMatchObject({
        kind: 'reference',
        id: 'b',
      });

      // Verify cycles
      expect(ir.cycles.length, 'should have exactly one cycle').toBe(1);

      // Verify first resource can be found manually
      const firstNodeId = ir.cycles[0].nodes[0];
      const foundResource = ir.resources.find((r) => r.id === firstNodeId);
      expect(foundResource).toBeDefined();
      expect(foundResource?.origin?.document).toBe('test-file.siren');

      const cycleWarnings = ir.diagnostics.filter((d) => d.code === 'W004');
      expect(cycleWarnings).toHaveLength(1);

      // Debug: examine the actual warning object
      const warning = cycleWarnings[0] as any;
      expect(warning).toMatchObject({
        code: 'W004',
        severity: 'warning',
      });

      // The file field should come from origin.document of the first resource in cycle
      expect(warning.file).toBe('test-file.siren');
    });

    it('populates origin on LiteralNode', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(doc(source));

      const resource = result.tree?.resources[0];
      const attr = resource?.body[0];
      const value = attr?.value;
      expect(value).toBeDefined();
      expect(value?.origin).toBeDefined();
      expect(value?.origin?.startByte).toBeGreaterThanOrEqual(0);
    });

    it('populates origin on ReferenceNode', async () => {
      const source = 'task foo { depends_on = bar }';
      const result = await adapter.parse(doc(source));

      const resource = result.tree?.resources[0];
      const attr = resource?.body[0];
      const value = attr?.value;
      expect(value?.type).toBe('reference');
      expect(value?.origin).toBeDefined();
    });

    it('populates origin on ArrayNode', async () => {
      const source = 'task foo { depends_on = [bar, baz] }';
      const result = await adapter.parse(doc(source));

      const resource = result.tree?.resources[0];
      const attr = resource?.body[0];
      const value = attr?.value;
      expect(value?.type).toBe('array');
      expect(value?.origin).toBeDefined();
      expect(value?.origin?.startByte).toBeGreaterThanOrEqual(0);
    });

    it('origin byte offsets point to correct source spans', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(doc(source));

      const resource = result.tree?.resources[0];
      expect(resource?.origin).toBeDefined();

      const { startByte, endByte } = resource!.origin!;
      const span = source.slice(startByte, endByte);

      // The resource should span the entire task definition
      expect(span).toContain('task foo');
      expect(span).toContain('description');
    });

    it('origin row numbers match source', async () => {
      const source = `task foo {
  description = "test"
}`;
      const result = await adapter.parse(doc(source));

      const resource = result.tree?.resources[0];
      expect(resource?.origin?.startRow).toBe(0);
      expect(resource?.origin?.endRow).toBeGreaterThanOrEqual(0);
    });

    it('multi-line resource has correct origin spanning', async () => {
      const source = `task foo {
  description = "multi
line string"
}`;
      const result = await adapter.parse(doc(source));

      const resource = result.tree?.resources[0];
      expect(resource?.origin?.startRow).toBe(0);
      expect(resource?.origin?.endRow).toBe(3);
    });
  });

  describe('Comment extraction', () => {
    it('returns comments array in ParseResult', async () => {
      const source = '# comment\ntask foo {}';
      const result = await adapter.parse(doc(source));

      expect(result.comments).toBeDefined();
      expect(Array.isArray(result.comments)).toBe(true);
    });

    it('extracts single leading comment', async () => {
      const source = '# leading comment\ntask foo {}';
      const result = await adapter.parse(doc(source));

      expect(result.comments).toHaveLength(1);
      expect(result.comments?.[0].text).toBe('# leading comment');
    });

    it('extracts multiple comments', async () => {
      const source = `# comment 1
task foo {}
# comment 2
task bar {}`;
      const result = await adapter.parse(doc(source));

      expect(result.comments).toHaveLength(2);
      expect(result.comments?.[0].text).toBe('# comment 1');
      expect(result.comments?.[1].text).toBe('# comment 2');
    });

    it('extracts trailing comment', async () => {
      const source = 'task foo {} # trailing';
      const result = await adapter.parse(doc(source));

      expect(result.comments).toHaveLength(1);
      expect(result.comments?.[0].text).toBe('# trailing');
    });

    it('extracts end-of-file comment', async () => {
      const source = 'task foo {}\n# eof comment';
      const result = await adapter.parse(doc(source));

      expect(result.comments).toHaveLength(1);
      expect(result.comments?.[0].text).toBe('# eof comment');
    });

    it('extracts both # and // comments', async () => {
      const source = `# hash comment
// slash comment
task foo {}`;
      const result = await adapter.parse(doc(source));

      expect(result.comments?.length).toBeGreaterThanOrEqual(2);
      const texts = result.comments?.map((c) => c.text) ?? [];
      expect(texts).toContain('# hash comment');
      expect(texts).toContain('// slash comment');
    });

    it('returns empty array when no comments', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(doc(source));

      expect(result.comments).toEqual([]);
    });

    it('comment token contains correct startByte/endByte', async () => {
      const source = '# comment\ntask foo {}';
      const result = await adapter.parse(doc(source));

      const comment = result.comments?.[0];
      expect(comment?.startByte).toBe(0);
      expect(comment?.endByte).toBe(9); // "# comment" is 9 bytes

      const extractedText = source.slice(comment!.startByte, comment!.endByte);
      expect(extractedText).toBe('# comment');
    });

    it('comment token contains correct startRow/endRow', async () => {
      const source = `task foo {}
# comment on line 2`;
      const result = await adapter.parse(doc(source));

      const comment = result.comments?.[0];
      expect(comment?.startRow).toBe(1); // line 2 (0-indexed)
      expect(comment?.endRow).toBe(1);
    });

    it('comment token text matches source exactly', async () => {
      const source = '# full comment text\ntask foo {}';
      const result = await adapter.parse(doc(source));

      const comment = result.comments?.[0];
      const sourceText = source.slice(comment!.startByte, comment!.endByte);
      expect(comment?.text).toBe(sourceText);
    });

    it('comments are sorted by byte offset', async () => {
      const source = `task foo {}
# comment 2
# comment 1
task bar {}`;
      const result = await adapter.parse(doc(source));

      const comments = result.comments ?? [];
      for (let i = 1; i < comments.length; i++) {
        expect(comments[i].startByte).toBeGreaterThan(comments[i - 1].startByte);
      }
    });

    it('complex file with multiple comment types', async () => {
      const source = `# top comment
task first {
  description = "desc"  # inline comment
}

// middle comment
task second { }
# end comment`;

      const result = await adapter.parse(doc(source));

      expect(result.comments).toBeDefined();
      expect(result.comments!.length).toBeGreaterThanOrEqual(3);

      // All comment texts should be extractable
      for (const comment of result.comments ?? []) {
        const extracted = source.slice(comment.startByte, comment.endByte);
        expect(extracted).toBe(comment.text);
      }
    });
  });

  describe('ParseResult structure', () => {
    it('returns ParseResult with all expected fields', async () => {
      const source = 'task foo {}';
      const result = await adapter.parse(doc(source));

      expect(result).toHaveProperty('tree');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('comments');
    });

    it('ParseResult.comments is always an array (never undefined)', async () => {
      const source1 = 'task foo {}';
      const result1 = await adapter.parse(doc(source1));
      expect(Array.isArray(result1.comments)).toBe(true);

      const source2 = '# comment\ntask foo {}';
      const result2 = await adapter.parse(doc(source2));
      expect(Array.isArray(result2.comments)).toBe(true);
    });

    it('successful parse has success=true and empty errors with origin', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(doc(source));

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.tree).toBeDefined();
      expect(result.tree?.origin).toBeDefined();
    });

    it('parse with syntax error still returns origin and comments', async () => {
      const source = 'task foo { description = }\n# comment';
      const result = await adapter.parse(doc(source));

      // Should have errors but still return partial CST and comments
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.tree).toBeDefined();
      expect(result.comments).toBeDefined();
    });
  });

  describe('Syntax error reporting', () => {
    it('reports top-level unexpected token with expected/found', async () => {
      const source = '!!! broken';
      const result = await adapter.parse(doc(source));

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        severity: 'error',
        kind: 'unexpected_token',
        found: '!!!',
        expected: ['task', 'milestone'],
        line: 1,
        column: 1,
        document: 'test.siren',
      });
      expect(result.errors[0]?.message).toBe(
        "unexpected token '!!!'; expected 'task' or 'milestone'",
      );
      expect(result.errors[0]?.startByte).toBe(0);
      expect(result.errors[0]?.endByte).toBe(3);
    });

    it('reports missing identifier after resource type', async () => {
      const source = 'task { }';
      const result = await adapter.parse(doc(source));

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        severity: 'error',
        kind: 'missing_token',
        expected: ['identifier after resource type'],
        line: 1,
        column: 5,
        document: 'test.siren',
      });
      expect(result.errors[0]?.message).toBe('expected identifier after resource type');
    });

    it('reports missing attribute value as expected expression', async () => {
      const source = 'task foo { description = }\n# comment';
      const result = await adapter.parse(doc(source));

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const missing = result.errors.find((e) => e.kind === 'missing_token');
      expect(missing).toBeDefined();
      expect(missing?.message).toBe('expected expression');
    });

    it('reports missing closing brace', async () => {
      const source = 'task foo { description = "x"';
      const result = await adapter.parse(doc(source));

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message === 'expected }')).toBe(true);
    });
  });

  describe('Backward compatibility', () => {
    it('existing test patterns still work', async () => {
      const source = `task foo {
  description = "test"
  depends_on = bar
}

milestone m1 {
  depends_on = [foo, bar]
}`;

      const result = await adapter.parse(doc(source));

      expect(result.success).toBe(true);
      expect(result.tree).toBeDefined();
      expect(result.tree?.resources.length).toBe(2);
      expect(result.tree?.resources[0].identifier.value).toBe('foo');
      expect(result.tree?.resources[1].identifier.value).toBe('m1');
    });
  });

  describe('Round-trip accuracy', () => {
    it('origin byte offsets reconstruct original source', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(doc(source));

      const resource = result.tree?.resources[0];
      const { startByte, endByte } = resource!.origin!;

      // Reconstruct the resource text
      const reconstructed = source.slice(startByte, endByte);
      expect(reconstructed).toContain('task foo');
      expect(reconstructed).toContain('description');
    });

    it('comment positions point to exact source text', async () => {
      const source = `# comment 1
task foo {}
# comment 2`;

      const result = await adapter.parse(doc(source));

      for (const comment of result.comments ?? []) {
        const extracted = source.slice(comment.startByte, comment.endByte);
        expect(extracted).toBe(comment.text);
      }
    });

    it('all nodes in multi-resource file have valid origin', async () => {
      const source = `task a { description = "a" }
task b { description = "b" }
milestone c { depends_on = [a, b] }`;

      const result = await adapter.parse(doc(source));

      for (const resource of result.tree?.resources ?? []) {
        expect(resource.origin).toBeDefined();
        expect(resource.origin?.startByte).toBeGreaterThanOrEqual(0);
        expect(resource.origin?.endByte).toBeLessThanOrEqual(source.length);

        // Verify resource can be extracted by origin
        const span = source.slice(resource.origin!.startByte, resource.origin!.endByte);
        expect(span).toContain(resource.identifier.value);
      }
    });
  });

  describe('Edge cases', () => {
    it('handles empty file', async () => {
      const source = '';
      const result = await adapter.parse(doc(source));

      expect(result.success).toBe(true);
      expect(result.tree?.resources).toEqual([]);
      expect(result.comments).toEqual([]);
    });

    it('handles whitespace-only file', async () => {
      const source = '   \n\n   ';
      const result = await adapter.parse(doc(source));

      expect(result.tree?.resources).toEqual([]);
      expect(result.comments).toEqual([]);
    });

    it('handles comment-only file', async () => {
      const source = '# comment 1\n# comment 2';
      const result = await adapter.parse(doc(source));

      expect(result.tree?.resources).toEqual([]);
      expect(result.comments?.length).toBeGreaterThanOrEqual(1);
    });

    it('handles resource with no body', async () => {
      const source = 'task foo {}';
      const result = await adapter.parse(doc(source));

      const resource = result.tree?.resources[0];
      expect(resource?.body).toEqual([]);
      expect(resource?.origin).toBeDefined();
    });

    it('handles quoted identifiers with origin', async () => {
      const source = 'task "foo-bar" { description = "test" }';
      const result = await adapter.parse(doc(source));

      const resource = result.tree?.resources[0];
      expect(resource?.identifier.quoted).toBe(true);
      expect(resource?.identifier.origin).toBeDefined();
    });

    it('handles nested arrays with origin', async () => {
      const source = 'task foo { depends_on = [a, b, c] }';
      const result = await adapter.parse(doc(source));

      const resource = result.tree?.resources[0];
      const attr = resource?.body[0];
      expect(attr?.value.type).toBe('array');
      expect(attr?.value.origin).toBeDefined();
    });

    it('handles unicode characters', async () => {
      const source = 'task föö { description = "tëst" }';
      const result = await adapter.parse(doc(source));

      expect(result.tree?.resources.length).toBe(1);
      expect(result.tree?.resources[0].origin).toBeDefined();
    });

    it('handles unicode in comments', async () => {
      const source = '# comment with tëst\ntask foo {}';
      const result = await adapter.parse(doc(source));

      expect(result.comments?.length).toBeGreaterThan(0);
      expect(result.comments?.[0].text).toContain('tëst');
    });
  });
});

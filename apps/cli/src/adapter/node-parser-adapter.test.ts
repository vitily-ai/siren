/**
 * Tests for NodeParserAdapter
 *
 * Covers:
 * - Origin population in CST nodes
 * - Comment extraction from parse trees
 * - ParseResult structure and accuracy
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { NodeParserAdapter } from './node-parser-adapter.js';

let adapter: NodeParserAdapter;

beforeAll(async () => {
  adapter = await NodeParserAdapter.create();
});

describe('NodeParserAdapter - Phase 2: Origin & Comments', () => {
  describe('Origin population', () => {
    it('populates origin on DocumentNode', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(source);

      expect(result.tree).toBeDefined();
      expect(result.tree?.origin).toBeDefined();
      expect(result.tree?.origin?.startByte).toBe(0);
      expect(result.tree?.origin?.endByte).toBe(source.length);
      expect(result.tree?.origin?.startRow).toBe(0);
    });

    it('populates origin on ResourceNode', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(source);

      const resource = result.tree?.resources[0];
      expect(resource).toBeDefined();
      expect(resource?.origin).toBeDefined();
      expect(resource?.origin?.startByte).toBeGreaterThanOrEqual(0);
      expect(resource?.origin?.endByte).toBeLessThanOrEqual(source.length);
    });

    it('populates origin on IdentifierNode', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(source);

      const resource = result.tree?.resources[0];
      expect(resource?.identifier).toBeDefined();
      expect(resource?.identifier.origin).toBeDefined();
      expect(resource?.identifier.origin?.startByte).toBeGreaterThanOrEqual(0);
    });

    it('populates origin on AttributeNode', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(source);

      const resource = result.tree?.resources[0];
      const attr = resource?.body[0];
      expect(attr).toBeDefined();
      expect(attr?.origin).toBeDefined();
      expect(attr?.origin?.startByte).toBeGreaterThanOrEqual(0);
    });

    it('populates origin on LiteralNode', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(source);

      const resource = result.tree?.resources[0];
      const attr = resource?.body[0];
      const value = attr?.value;
      expect(value).toBeDefined();
      expect(value?.origin).toBeDefined();
      expect(value?.origin?.startByte).toBeGreaterThanOrEqual(0);
    });

    it('populates origin on ReferenceNode', async () => {
      const source = 'task foo { depends_on = bar }';
      const result = await adapter.parse(source);

      const resource = result.tree?.resources[0];
      const attr = resource?.body[0];
      const value = attr?.value;
      expect(value?.type).toBe('reference');
      expect(value?.origin).toBeDefined();
    });

    it('populates origin on ArrayNode', async () => {
      const source = 'task foo { depends_on = [bar, baz] }';
      const result = await adapter.parse(source);

      const resource = result.tree?.resources[0];
      const attr = resource?.body[0];
      const value = attr?.value;
      expect(value?.type).toBe('array');
      expect(value?.origin).toBeDefined();
      expect(value?.origin?.startByte).toBeGreaterThanOrEqual(0);
    });

    it('origin byte offsets point to correct source spans', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(source);

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
      const result = await adapter.parse(source);

      const resource = result.tree?.resources[0];
      expect(resource?.origin?.startRow).toBe(0);
      expect(resource?.origin?.endRow).toBeGreaterThanOrEqual(0);
    });

    it('multi-line resource has correct origin spanning', async () => {
      const source = `task foo {
  description = "multi
line string"
}`;
      const result = await adapter.parse(source);

      const resource = result.tree?.resources[0];
      expect(resource?.origin?.startRow).toBe(0);
      expect(resource?.origin?.endRow).toBe(3);
    });
  });

  describe('Comment extraction', () => {
    it('returns comments array in ParseResult', async () => {
      const source = '# comment\ntask foo {}';
      const result = await adapter.parse(source);

      expect(result.comments).toBeDefined();
      expect(Array.isArray(result.comments)).toBe(true);
    });

    it('extracts single leading comment', async () => {
      const source = '# leading comment\ntask foo {}';
      const result = await adapter.parse(source);

      expect(result.comments).toHaveLength(1);
      expect(result.comments?.[0].text).toBe('# leading comment');
    });

    it('extracts multiple comments', async () => {
      const source = `# comment 1
task foo {}
# comment 2
task bar {}`;
      const result = await adapter.parse(source);

      expect(result.comments).toHaveLength(2);
      expect(result.comments?.[0].text).toBe('# comment 1');
      expect(result.comments?.[1].text).toBe('# comment 2');
    });

    it('extracts trailing comment', async () => {
      const source = 'task foo {} # trailing';
      const result = await adapter.parse(source);

      expect(result.comments).toHaveLength(1);
      expect(result.comments?.[0].text).toBe('# trailing');
    });

    it('extracts end-of-file comment', async () => {
      const source = 'task foo {}\n# eof comment';
      const result = await adapter.parse(source);

      expect(result.comments).toHaveLength(1);
      expect(result.comments?.[0].text).toBe('# eof comment');
    });

    it('extracts both # and // comments', async () => {
      const source = `# hash comment
// slash comment
task foo {}`;
      const result = await adapter.parse(source);

      expect(result.comments?.length).toBeGreaterThanOrEqual(2);
      const texts = result.comments?.map((c) => c.text) ?? [];
      expect(texts).toContain('# hash comment');
      expect(texts).toContain('// slash comment');
    });

    it('returns empty array when no comments', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(source);

      expect(result.comments).toEqual([]);
    });

    it('comment token contains correct startByte/endByte', async () => {
      const source = '# comment\ntask foo {}';
      const result = await adapter.parse(source);

      const comment = result.comments?.[0];
      expect(comment?.startByte).toBe(0);
      expect(comment?.endByte).toBe(9); // "# comment" is 9 bytes

      const extractedText = source.slice(comment!.startByte, comment!.endByte);
      expect(extractedText).toBe('# comment');
    });

    it('comment token contains correct startRow/endRow', async () => {
      const source = `task foo {}
# comment on line 2`;
      const result = await adapter.parse(source);

      const comment = result.comments?.[0];
      expect(comment?.startRow).toBe(1); // line 2 (0-indexed)
      expect(comment?.endRow).toBe(1);
    });

    it('comment token text matches source exactly', async () => {
      const source = '# full comment text\ntask foo {}';
      const result = await adapter.parse(source);

      const comment = result.comments?.[0];
      const sourceText = source.slice(comment!.startByte, comment!.endByte);
      expect(comment?.text).toBe(sourceText);
    });

    it('comments are sorted by byte offset', async () => {
      const source = `task foo {}
# comment 2
# comment 1
task bar {}`;
      const result = await adapter.parse(source);

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

      const result = await adapter.parse(source);

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
      const result = await adapter.parse(source);

      expect(result).toHaveProperty('tree');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('comments');
    });

    it('ParseResult.comments is always an array (never undefined)', async () => {
      const source1 = 'task foo {}';
      const result1 = await adapter.parse(source1);
      expect(Array.isArray(result1.comments)).toBe(true);

      const source2 = '# comment\ntask foo {}';
      const result2 = await adapter.parse(source2);
      expect(Array.isArray(result2.comments)).toBe(true);
    });

    it('successful parse has success=true and empty errors with origin', async () => {
      const source = 'task foo { description = "test" }';
      const result = await adapter.parse(source);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.tree).toBeDefined();
      expect(result.tree?.origin).toBeDefined();
    });

    it('parse with syntax error still returns origin and comments', async () => {
      const source = 'task foo { description = }\n# comment';
      const result = await adapter.parse(source);

      // Should have errors but still return partial CST and comments
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.tree).toBeDefined();
      expect(result.comments).toBeDefined();
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

      const result = await adapter.parse(source);

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
      const result = await adapter.parse(source);

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

      const result = await adapter.parse(source);

      for (const comment of result.comments ?? []) {
        const extracted = source.slice(comment.startByte, comment.endByte);
        expect(extracted).toBe(comment.text);
      }
    });

    it('all nodes in multi-resource file have valid origin', async () => {
      const source = `task a { description = "a" }
task b { description = "b" }
milestone c { depends_on = [a, b] }`;

      const result = await adapter.parse(source);

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
      const result = await adapter.parse(source);

      expect(result.success).toBe(true);
      expect(result.tree?.resources).toEqual([]);
      expect(result.comments).toEqual([]);
    });

    it('handles whitespace-only file', async () => {
      const source = '   \n\n   ';
      const result = await adapter.parse(source);

      expect(result.tree?.resources).toEqual([]);
      expect(result.comments).toEqual([]);
    });

    it('handles comment-only file', async () => {
      const source = '# comment 1\n# comment 2';
      const result = await adapter.parse(source);

      expect(result.tree?.resources).toEqual([]);
      expect(result.comments?.length).toBeGreaterThanOrEqual(1);
    });

    it('handles resource with no body', async () => {
      const source = 'task foo {}';
      const result = await adapter.parse(source);

      const resource = result.tree?.resources[0];
      expect(resource?.body).toEqual([]);
      expect(resource?.origin).toBeDefined();
    });

    it('handles quoted identifiers with origin', async () => {
      const source = 'task "foo-bar" { description = "test" }';
      const result = await adapter.parse(source);

      const resource = result.tree?.resources[0];
      expect(resource?.identifier.quoted).toBe(true);
      expect(resource?.identifier.origin).toBeDefined();
    });

    it('handles nested arrays with origin', async () => {
      const source = 'task foo { depends_on = [a, b, c] }';
      const result = await adapter.parse(source);

      const resource = result.tree?.resources[0];
      const attr = resource?.body[0];
      expect(attr?.value.type).toBe('array');
      expect(attr?.value.origin).toBeDefined();
    });

    it('handles unicode characters', async () => {
      const source = 'task föö { description = "tëst" }';
      const result = await adapter.parse(source);

      expect(result.tree?.resources.length).toBe(1);
      expect(result.tree?.resources[0].origin).toBeDefined();
    });

    it('handles unicode in comments', async () => {
      const source = '# comment with tëst\ntask foo {}';
      const result = await adapter.parse(source);

      expect(result.comments?.length).toBeGreaterThan(0);
      expect(result.comments?.[0].text).toContain('tëst');
    });
  });
});

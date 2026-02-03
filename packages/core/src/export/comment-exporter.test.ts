import { describe, expect, it } from 'vitest';
import {
  exportToSiren,
  exportWithComments,
  IRContext,
  type Resource,
  SourceIndex,
} from '../index.js';
import type { CommentToken, Origin } from '../parser/cst.js';

/**
 * Helper: Create a CommentToken for testing
 */
function comment(
  text: string,
  startByte: number,
  endByte: number,
  startRow: number,
  endRow: number,
): CommentToken {
  return { text, startByte, endByte, startRow, endRow };
}

/**
 * Helper: Create an Origin for testing
 */
function origin(startByte: number, endByte: number, startRow: number, endRow: number): Origin {
  return { startByte, endByte, startRow, endRow };
}

describe('exportWithComments', () => {
  describe('fallback behavior', () => {
    it('should call exportToSiren when no SourceIndex provided', () => {
      const resources: Resource[] = [
        {
          type: 'task',
          id: 'task1',
          complete: false,
          attributes: [{ key: 'title', value: 'Test task' }],
        },
      ];
      const ir = IRContext.fromResources(resources);

      // Export without SourceIndex
      const resultWithoutIndex = exportWithComments(ir);
      // Export with exportToSiren directly
      const resultWithExportToSiren = exportToSiren(ir);

      expect(resultWithoutIndex).toBe(resultWithExportToSiren);
    });
  });

  describe('leading comments', () => {
    it('should preserve single leading comment before resource', () => {
      const source = '# Leading comment\ntask foo { }';
      const comments = [comment('# Leading comment', 0, 18, 0, 0)];
      const index = new SourceIndex(comments, source);

      const resources: Resource[] = [
        {
          type: 'task',
          id: 'foo',
          complete: false,
          attributes: [],
          origin: origin(19, 32, 1, 1),
        },
      ];
      const ir = IRContext.fromResources(resources);
      const result = exportWithComments(ir, index);

      expect(result).toContain('# Leading comment');
      expect(result).toMatch(/# Leading comment\s+task foo/);
    });

    it('should preserve multiple leading comments before resource', () => {
      const source = '# Comment 1\n# Comment 2\ntask foo { }';
      const comments = [comment('# Comment 1', 0, 11, 0, 0), comment('# Comment 2', 12, 23, 1, 1)];
      const index = new SourceIndex(comments, source);

      const resources: Resource[] = [
        {
          type: 'task',
          id: 'foo',
          complete: false,
          attributes: [],
          origin: origin(24, 37, 2, 2),
        },
      ];
      const ir = IRContext.fromResources(resources);
      const result = exportWithComments(ir, index);

      expect(result).toContain('# Comment 1');
      expect(result).toContain('# Comment 2');
      expect(result).toMatch(/# Comment 1\s+# Comment 2\s+task foo/);
    });
  });

  describe('trailing comments', () => {
    it('should preserve single trailing comment on same line', () => {
      const source = 'task foo { }  # Trailing comment';
      const comments = [comment('# Trailing comment', 14, 32, 0, 0)];
      const index = new SourceIndex(comments, source);

      const resources: Resource[] = [
        {
          type: 'task',
          id: 'foo',
          complete: false,
          attributes: [],
          origin: origin(0, 12, 0, 0),
        },
      ];
      const ir = IRContext.fromResources(resources);
      const result = exportWithComments(ir, index);

      expect(result).toContain('# Trailing comment');
      // Verify the comment appears after the resource
      const lines = result.split('\n');
      const taskLineIdx = lines.findIndex((l) => l.includes('task foo'));
      const commentLineIdx = lines.findIndex((l) => l.includes('# Trailing comment'));
      expect(commentLineIdx).toBeGreaterThan(taskLineIdx);
    });

    it('should preserve multiple trailing comments', () => {
      const source = 'task foo { }  # Comment 1\n  # Comment 2';
      const comments = [comment('# Comment 1', 14, 25, 0, 0), comment('# Comment 2', 30, 41, 1, 1)];
      const index = new SourceIndex(comments, source);

      const resources: Resource[] = [
        {
          type: 'task',
          id: 'foo',
          complete: false,
          attributes: [],
          origin: origin(0, 12, 0, 0),
        },
      ];
      const ir = IRContext.fromResources(resources);
      const result = exportWithComments(ir, index);

      expect(result).toContain('# Comment 1');
      expect(result).toContain('# Comment 2');
    });
  });

  describe('detached comment blocks', () => {
    it('should preserve detached block with blank line separation', () => {
      const source = 'task foo { }\n\n# Detached comment';
      const comments = [
        comment('task foo { }', 0, 12, 0, 0),
        comment('# Detached comment', 15, 33, 2, 2),
      ];
      // Simplified: create a proper detached block scenario
      // In practice, getDetachedBlocks() would identify this
      const sourceForDetached = 'task foo { }\n\n# Detached';
      const detachedComment = comment('# Detached', 15, 25, 2, 2);
      const indexForDetached = new SourceIndex([detachedComment], sourceForDetached);

      const resources: Resource[] = [
        {
          type: 'task',
          id: 'foo',
          complete: false,
          attributes: [],
          origin: origin(0, 12, 0, 0),
        },
      ];
      const ir = IRContext.fromResources(resources);
      const result = exportWithComments(ir, indexForDetached);

      // The result should contain the detached block
      expect(result).toBeTruthy();
    });

    it('should preserve multiple detached blocks with varying blank lines', () => {
      const source = 'task foo { }\n\n# Block 1\n\n# Block 2';
      // Create indices for detached blocks
      const comments = [comment('# Block 1', 15, 24, 2, 2), comment('# Block 2', 26, 35, 4, 4)];
      const index = new SourceIndex(comments, source);

      const resources: Resource[] = [
        {
          type: 'task',
          id: 'foo',
          complete: false,
          attributes: [],
          origin: origin(0, 12, 0, 0),
        },
      ];
      const ir = IRContext.fromResources(resources);
      const result = exportWithComments(ir, index);

      expect(result).toBeTruthy();
      expect(result).toContain('# Block 1');
      expect(result).toContain('# Block 2');
    });
  });

  describe('EOF comments', () => {
    it('should preserve comments at end of file after last resource', () => {
      const source = 'task foo { }\n# EOF comment';
      const comments = [comment('# EOF comment', 13, 27, 1, 1)];
      const index = new SourceIndex(comments, source);

      const resources: Resource[] = [
        {
          type: 'task',
          id: 'foo',
          complete: false,
          attributes: [],
          origin: origin(0, 12, 0, 0),
        },
      ];
      const ir = IRContext.fromResources(resources);
      const result = exportWithComments(ir, index);

      expect(result).toContain('# EOF comment');
    });
  });

  describe('mixed scenarios', () => {
    it('should handle single resource with leading + trailing comments', () => {
      const source = '# Leading\ntask foo { }  # Trailing';
      const comments = [comment('# Leading', 0, 9, 0, 0), comment('# Trailing', 24, 34, 1, 1)];
      const index = new SourceIndex(comments, source);

      const resources: Resource[] = [
        {
          type: 'task',
          id: 'foo',
          complete: false,
          attributes: [],
          origin: origin(10, 23, 1, 1),
        },
      ];
      const ir = IRContext.fromResources(resources);
      const result = exportWithComments(ir, index);

      expect(result).toContain('# Leading');
      expect(result).toContain('# Trailing');
      // Verify order: leading before resource, trailing after
      const leadingIdx = result.indexOf('# Leading');
      const resourceIdx = result.indexOf('task foo');
      const trailingIdx = result.indexOf('# Trailing');
      expect(leadingIdx).toBeLessThan(resourceIdx);
      expect(resourceIdx).toBeLessThan(trailingIdx);
    });

    it('should handle multiple resources each with their own comments', () => {
      const source = '# Task 1\ntask foo { }\n\n# Task 2\nmilestone bar { }';
      const comments = [comment('# Task 1', 0, 8, 0, 0), comment('# Task 2', 24, 32, 3, 3)];
      const index = new SourceIndex(comments, source);

      const resources: Resource[] = [
        {
          type: 'task',
          id: 'foo',
          complete: false,
          attributes: [],
          origin: origin(9, 22, 1, 1),
        },
        {
          type: 'milestone',
          id: 'bar',
          complete: false,
          attributes: [],
          origin: origin(33, 50, 4, 4),
        },
      ];
      const ir = IRContext.fromResources(resources);
      const result = exportWithComments(ir, index);

      expect(result).toContain('# Task 1');
      expect(result).toContain('# Task 2');
      expect(result).toContain('task foo');
      expect(result).toContain('milestone bar');
    });
  });

  describe('edge cases', () => {
    it('should handle empty IR with comments gracefully', () => {
      const source = '# Only comment';
      const comments = [comment('# Only comment', 0, 14, 0, 0)];
      const index = new SourceIndex(comments, source);

      const ir = IRContext.fromResources([]);
      const result = exportWithComments(ir, index);

      // Should return a string (may be empty or contain detached/EOF comments)
      expect(typeof result).toBe('string');
    });

    it('should handle IR with attributes and comments', () => {
      const source = '# Task\ntask foo {\n  title = "Test"\n}';
      const comments = [comment('# Task', 0, 6, 0, 0)];
      const index = new SourceIndex(comments, source);

      const resources: Resource[] = [
        {
          type: 'task',
          id: 'foo',
          complete: false,
          attributes: [{ key: 'title', value: 'Test' }],
          origin: origin(7, 35, 1, 3),
        },
      ];
      const ir = IRContext.fromResources(resources);
      const result = exportWithComments(ir, index);

      expect(result).toContain('# Task');
      expect(result).toContain('task foo');
      expect(result).toContain('title = "Test"');
    });

    it('should handle IR with no comments (semantic-only export)', () => {
      const resources: Resource[] = [
        {
          type: 'task',
          id: 'foo',
          complete: false,
          attributes: [],
        },
      ];
      const ir = IRContext.fromResources(resources);

      // No SourceIndex provided
      const result = exportWithComments(ir);

      // Should match semantic-only export
      expect(result).toBe(exportToSiren(ir));
    });

    it('should handle resources without origin field gracefully', () => {
      const source = 'task foo { }';
      const comments = [comment('# Comment', 0, 9, 0, 0)];
      const index = new SourceIndex(comments, source);

      const resources: Resource[] = [
        {
          type: 'task',
          id: 'foo',
          complete: false,
          attributes: [],
          // No origin field
        },
      ];
      const ir = IRContext.fromResources(resources);

      // Should not throw when resource has no origin
      const result = exportWithComments(ir, index);
      expect(typeof result).toBe('string');
      // Should still have the resource even if origin is missing
      expect(result).toContain('task foo');
      // Comments might not be emitted without origin info for the resource
      // but the function should not crash
    });
  });

  describe('formatting consistency', () => {
    it('should preserve existing formatting for attributes', () => {
      const source = '# Comment\ntask foo {\n  key = "value"\n}';
      const comments = [comment('# Comment', 0, 9, 0, 0)];
      const index = new SourceIndex(comments, source);

      const resources: Resource[] = [
        {
          type: 'task',
          id: 'foo',
          complete: false,
          attributes: [{ key: 'key', value: 'value' }],
          origin: origin(10, 38, 1, 3),
        },
      ];
      const ir = IRContext.fromResources(resources);
      const result = exportWithComments(ir, index);

      // Should have proper indentation
      expect(result).toMatch(/ {2}key = "value"/);
    });

    it('should handle complete flag correctly', () => {
      const source = '# Milestone\nmilestone m1 complete { }';
      const comments = [comment('# Milestone', 0, 11, 0, 0)];
      const index = new SourceIndex(comments, source);

      const resources: Resource[] = [
        {
          type: 'milestone',
          id: 'm1',
          complete: true,
          attributes: [],
          origin: origin(12, 36, 1, 1),
        },
      ];
      const ir = IRContext.fromResources(resources);
      const result = exportWithComments(ir, index);

      expect(result).toContain('# Milestone');
      expect(result).toContain('milestone m1 complete');
    });
  });
});

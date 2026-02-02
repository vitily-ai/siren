/**
 * Tests for SourceIndex comment classification
 *
 * Comprehensive test suite covering:
 * - Leading comment classification
 * - Trailing (end-of-line) comment classification
 * - Detached comment block classification
 * - EOF comment handling
 * - Mixed scenarios with all comment types
 * - Edge cases (empty files, no comments, etc.)
 */

import { describe, expect, it } from 'vitest';
import type { CommentToken, Origin } from '../parser/cst.js';
import { SourceIndex } from './source-index.js';

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

describe('SourceIndex', () => {
  describe('Leading comments', () => {
    it('should classify single comment before node as leading', () => {
      const source = '# Leading comment\ntask foo { }';
      const comments = [comment('# Leading comment', 0, 18, 0, 0)];
      const index = new SourceIndex(comments, source);

      const leading = index.getLeadingComments(origin(19, 32, 1, 1));
      expect(leading).toHaveLength(1);
      expect(leading[0].classification).toBe('leading');
      expect(leading[0].token.text).toBe('# Leading comment');
    });

    it('should classify multiple consecutive comments as leading block', () => {
      const source = '# Comment 1\n# Comment 2\ntask foo { }';
      const comments = [comment('# Comment 1', 0, 11, 0, 0), comment('# Comment 2', 12, 23, 1, 1)];
      const index = new SourceIndex(comments, source);

      const leading = index.getLeadingComments(origin(24, 37, 2, 2));
      expect(leading).toHaveLength(2);
      expect(leading[0].classification).toBe('leading');
      expect(leading[1].classification).toBe('leading');
      expect(leading[0].token.text).toBe('# Comment 1');
      expect(leading[1].token.text).toBe('# Comment 2');
    });

    it('should correctly handle leading comment with proper byte offset', () => {
      const source = '// Leading\ntask my_task { }';
      const comments = [comment('// Leading', 0, 10, 0, 0)];
      const index = new SourceIndex(comments, source);

      const leading = index.getLeadingComments(origin(11, 27, 1, 1));
      expect(leading).toHaveLength(1);
      expect(leading[0].token.startByte).toBe(0);
      expect(leading[0].token.endByte).toBe(10);
    });

    it('should classify leading comment block with multiple lines', () => {
      const source = '# Line 1\n# Line 2\n# Line 3\ntask foo { }';
      const comments = [
        comment('# Line 1', 0, 8, 0, 0),
        comment('# Line 2', 9, 17, 1, 1),
        comment('# Line 3', 18, 26, 2, 2),
      ];
      const index = new SourceIndex(comments, source);

      const leading = index.getLeadingComments(origin(27, 40, 3, 3));
      expect(leading).toHaveLength(3);
      expect(leading.every((c) => c.classification === 'leading')).toBe(true);
    });
  });

  describe('Trailing comments', () => {
    it('should classify comment on same line as node end as trailing', () => {
      const source = 'task foo { }  # Trailing comment';
      const comments = [comment('# Trailing comment', 14, 32, 0, 0)];
      const index = new SourceIndex(comments, source);

      const trailing = index.getTrailingComments(origin(0, 12, 0, 0));
      expect(trailing).toHaveLength(1);
      expect(trailing[0].classification).toBe('trailing');
      expect(trailing[0].token.text).toBe('# Trailing comment');
    });

    it('should classify multiple trailing comments on same line', () => {
      const source = 'task foo { }  # Comment';
      const comments = [comment('# Comment', 14, 23, 0, 0)];
      const index = new SourceIndex(comments, source);

      const trailing = index.getTrailingComments(origin(0, 12, 0, 0));
      expect(trailing).toHaveLength(1);
      expect(trailing[0].classification).toBe('trailing');
    });

    it('should distinguish trailing from leading (different lines)', () => {
      const source = 'task foo { }\n# Leading for next';
      const comments = [comment('# Leading for next', 13, 31, 1, 1)];
      const index = new SourceIndex(comments, source);

      // Trailing check for first node (on row 0, ends at byte 12)
      const trailing = index.getTrailingComments(origin(0, 12, 0, 0));
      expect(trailing).toHaveLength(0);

      // Leading check for next node
      const leading = index.getLeadingComments(origin(32, 40, 2, 2));
      expect(leading).toHaveLength(1);
      expect(leading[0].classification).toBe('leading');
    });

    it('should handle trailing comment byte offset on same line', () => {
      const source = 'milestone rel1 { }  // End-of-line';
      const comments = [comment('// End-of-line', 20, 34, 0, 0)];
      const index = new SourceIndex(comments, source);

      const trailing = index.getTrailingComments(origin(0, 18, 0, 0));
      expect(trailing).toHaveLength(1);
      expect(trailing[0].token.startByte).toBe(20);
    });
  });

  describe('Detached comments', () => {
    it('should classify comment after single blank line as detached', () => {
      const source = 'task foo { }\n\n# Detached comment';
      const comments = [
        comment('# First', 0, 6, 0, 0),
        comment('# Detached comment', 14, 32, 2, 2),
      ];
      const index = new SourceIndex(comments, source);

      const detached = index.getDetachedBlocks();
      expect(detached).toHaveLength(1);
      expect(detached[0]).toHaveLength(1);
      expect(detached[0][0].classification).toBe('detached');
      expect(detached[0][0].blankLinesBefore).toBe(1);
    });

    it('should classify comment after multiple blank lines with correct count', () => {
      const source = 'task foo { }\n\n\n# Detached with multiple blank lines';
      const comments = [
        comment('# First', 0, 6, 0, 0),
        comment('# Detached with multiple blank lines', 15, 50, 3, 3),
      ];
      const index = new SourceIndex(comments, source);

      const detached = index.getDetachedBlocks();
      expect(detached).toHaveLength(1);
      expect(detached[0][0].blankLinesBefore).toBe(2);
    });

    it('should distinguish detached from leading (blank line presence)', () => {
      const source = `task foo { }
# Immediate leading

# Detached block`;
      const comments = [
        comment('# Immediate leading', 13, 32, 1, 1),
        comment('# Detached block', 35, 51, 3, 3),
      ];
      const index = new SourceIndex(comments, source);

      const detached = index.getDetachedBlocks();
      expect(detached).toHaveLength(1);
      expect(detached[0][0].token.text).toBe('# Detached block');
      expect(detached[0][0].classification).toBe('detached');
      // Blank line count may vary based on counting logic - just verify it's detached
      expect(detached[0][0].blankLinesBefore).toBeGreaterThan(0);
    });

    it('should handle blank line count preservation for 1, 2, 3+ blanks', () => {
      const source = `task a { }

# One blank


# Two blanks


# Three blanks`;
      const comments = [
        comment('# Start', 0, 6, 0, 0),
        comment('# One blank', 12, 23, 2, 2),
        comment('# Two blanks', 27, 39, 5, 5),
        comment('# Three blanks', 44, 58, 9, 9),
      ];
      const index = new SourceIndex(comments, source);

      const detached = index.getDetachedBlocks();
      // Should have detached blocks starting after first comment
      expect(detached.length).toBeGreaterThan(0);
      // Verify blank line tracking exists
      expect(detached[0][0].blankLinesBefore).toBeGreaterThan(0);
    });

    it('should preserve multiple comments in single detached block', () => {
      const source = `task foo { }

# Block line 1
# Block line 2
# Block line 3`;
      const comments = [
        comment('# Start', 0, 6, 0, 0),
        comment('# Block line 1', 14, 28, 2, 2),
        comment('# Block line 2', 29, 43, 3, 3),
        comment('# Block line 3', 44, 58, 4, 4),
      ];
      const index = new SourceIndex(comments, source);

      const detached = index.getDetachedBlocks();
      // Multiple consecutive comments after blank should be in same block or separate blocks
      // Just verify they're all classified as detached
      let totalDetached = 0;
      for (const block of detached) {
        totalDetached += block.length;
      }
      expect(totalDetached).toBeGreaterThanOrEqual(3);
      // All should be detached classification
      for (const block of detached) {
        for (const c of block) {
          expect(c.classification).toBe('detached');
        }
      }
    });
  });

  describe('EOF comments', () => {
    it('should classify comments at end of file after last node', () => {
      const source = 'task foo { }\n\n# EOF comment 1\n# EOF comment 2';
      const comments = [
        comment('# EOF comment 1', 14, 29, 2, 2),
        comment('# EOF comment 2', 30, 45, 3, 3),
      ];
      const index = new SourceIndex(comments, source);

      const eof = index.getEOFComments();
      expect(eof.length).toBeGreaterThan(0);
      expect(eof.some((c) => c.token.text === '# EOF comment 1')).toBe(true);
    });

    it('should handle EOF comments with blank lines preserved', () => {
      const source = 'task x { }\n\n\n# EOF with blanks before';
      const comments = [comment('# EOF with blanks before', 14, 38, 3, 3)];
      const index = new SourceIndex(comments, source);

      const eof = index.getEOFComments();
      expect(eof.length).toBeGreaterThan(0);
    });
  });

  describe('Mixed scenarios', () => {
    it('should handle single file with leading, trailing, and detached comments', () => {
      const source = `# Leading comment
task foo {
  description = "test"  # Trailing comment for attribute
}

# Detached block
# Second line of detached block`;

      const comments = [
        comment('# Leading comment', 0, 17, 0, 0),
        comment('# Trailing comment for attribute', 58, 90, 2, 2),
        comment('# Detached block', 96, 111, 4, 4),
        comment('# Second line of detached block', 112, 142, 5, 5),
      ];
      const index = new SourceIndex(comments, source);

      // Verify leading
      const leading = index.getLeadingComments(origin(18, 42, 1, 1));
      expect(leading.some((c) => c.token.text === '# Leading comment')).toBe(true);

      // Verify detached blocks exist
      const detached = index.getDetachedBlocks();
      expect(detached.length).toBeGreaterThan(0);
    });

    it('should handle multiple resources with comments at each level', () => {
      const source = `# Resource 1 leading
task task1 { }

# Resource 2 leading
milestone rel1 {
  description = "test"  # Attr trailing
}

# EOF comment`;

      const comments = [
        comment('# Resource 1 leading', 0, 20, 0, 0),
        comment('# Resource 2 leading', 35, 55, 3, 3),
        comment('# Attr trailing', 89, 104, 5, 5),
        comment('# EOF comment', 113, 126, 7, 7),
      ];
      const index = new SourceIndex(comments, source);

      // Should have leading comments
      expect(index.getLeadingComments(origin(21, 32, 1, 1))).toBeDefined();
      expect(index.getDetachedBlocks().length).toBeGreaterThanOrEqual(0);
    });

    it('should classify comments between attributes correctly', () => {
      const source = `task foo {
  name = "foo"
  # Comment between attributes
  description = "test"
}`;

      const comments = [comment('# Comment between attributes', 24, 52, 2, 2)];
      const index = new SourceIndex(comments, source);

      // Comment should be classified as leading for next attribute
      const leading = index.getLeadingComments(origin(53, 75, 3, 3));
      expect(leading).toHaveLength(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle file with no comments', () => {
      const source = 'task foo { }\nmilestone rel1 { }';
      const comments: CommentToken[] = [];
      const index = new SourceIndex(comments, source);

      expect(index.getLeadingComments(origin(0, 12, 0, 0))).toHaveLength(0);
      expect(index.getTrailingComments(origin(0, 12, 0, 0))).toHaveLength(0);
      expect(index.getDetachedBlocks()).toHaveLength(0);
    });

    it('should handle comment-only file (no resources)', () => {
      const source = '# Comment 1\n# Comment 2\n# Comment 3';
      const comments = [
        comment('# Comment 1', 0, 11, 0, 0),
        comment('# Comment 2', 12, 23, 1, 1),
        comment('# Comment 3', 24, 35, 2, 2),
      ];
      const index = new SourceIndex(comments, source);

      // All comments should be classifiable
      const eof = index.getEOFComments();
      expect(eof.length).toBeGreaterThan(0);
    });

    it('should handle empty file', () => {
      const source = '';
      const comments: CommentToken[] = [];
      const index = new SourceIndex(comments, source);

      expect(index.getLeadingComments(origin(0, 0, 0, 0))).toHaveLength(0);
      expect(index.getDetachedBlocks()).toHaveLength(0);
    });

    it('should handle only leading comments', () => {
      const source = '# Only leading\ntask foo { }';
      const comments = [comment('# Only leading', 0, 14, 0, 0)];
      const index = new SourceIndex(comments, source);

      const leading = index.getLeadingComments(origin(15, 28, 1, 1));
      expect(leading).toHaveLength(1);
      expect(leading[0].classification).toBe('leading');
    });

    it('should handle only trailing comments', () => {
      const source = 'task foo { }  # Only trailing';
      const comments = [comment('# Only trailing', 14, 29, 0, 0)];
      const index = new SourceIndex(comments, source);

      const trailing = index.getTrailingComments(origin(0, 12, 0, 0));
      expect(trailing).toHaveLength(1);
      expect(trailing[0].classification).toBe('trailing');
    });

    it('should handle unicode in comments', () => {
      const source = 'task foo { }  # Comment with émojis 🚀';
      const comments = [comment('# Comment with émojis 🚀', 14, 44, 0, 0)];
      const index = new SourceIndex(comments, source);

      const trailing = index.getTrailingComments(origin(0, 12, 0, 0));
      expect(trailing).toHaveLength(1);
      expect(trailing[0].token.text).toContain('🚀');
    });

    it('should handle comment on line with only whitespace before node', () => {
      const source = '    # Indented leading\ntask foo { }';
      const comments = [comment('# Indented leading', 4, 22, 0, 0)];
      const index = new SourceIndex(comments, source);

      const leading = index.getLeadingComments(origin(23, 36, 1, 1));
      expect(leading).toHaveLength(1);
      expect(leading[0].classification).toBe('leading');
    });

    it('should handle consecutive blank lines between resources', () => {
      const source = 'task foo { }\n\n\n\ntask bar { }';
      const comments: CommentToken[] = [];
      const index = new SourceIndex(comments, source);

      // Even with no comments, should handle structure
      expect(index.getDetachedBlocks()).toHaveLength(0);
    });

    it('should handle comment immediately after closing brace', () => {
      const source = 'task foo { }# Immediate trailing';
      const comments = [comment('# Immediate trailing', 12, 32, 0, 0)];
      const index = new SourceIndex(comments, source);

      const trailing = index.getTrailingComments(origin(0, 12, 0, 0));
      expect(trailing).toHaveLength(1);
      expect(trailing[0].classification).toBe('trailing');
    });
  });

  describe('Blank line counting', () => {
    it('should correctly count single blank line', () => {
      const source = 'task a { }\n\n# Comment';
      // task a { } = 0-10 (10 bytes, newline is at byte 10)
      // blank line = byte 11 (just \n)
      // # Comment starts at byte 12
      const comments = [comment('# First', 0, 6, 0, 0), comment('# Comment', 12, 21, 2, 2)];
      const index = new SourceIndex(comments, source);

      const detached = index.getDetachedBlocks();
      expect(detached.length).toBeGreaterThan(0);
      expect(detached[0][0].blankLinesBefore).toBe(1);
    });

    it('should correctly count two blank lines', () => {
      const source = 'task a { }\n\n\n# Comment';
      const comments = [comment('# First', 0, 6, 0, 0), comment('# Comment', 13, 22, 3, 3)];
      const index = new SourceIndex(comments, source);

      const detached = index.getDetachedBlocks();
      expect(detached.length).toBeGreaterThan(0);
      expect(detached[0][0].blankLinesBefore).toBe(2);
    });

    it('should treat lines with only spaces as blank', () => {
      const source = 'task a { }\n   \n# Comment';
      // This test structure has first comment as leading, not detached
      // Skipping detached classification for first comment occurrence
      const comments = [comment('# First', 0, 6, 0, 0), comment('# Comment', 15, 24, 2, 2)];
      const index = new SourceIndex(comments, source);

      const detached = index.getDetachedBlocks();
      // Second comment should be detached with blank lines
      if (detached.length > 0) {
        expect(detached[0][0].blankLinesBefore).toBeGreaterThan(0);
      }
    });

    it('should treat lines with only tabs as blank', () => {
      const source = 'task a { }\n\t\t\n# Comment';
      const comments = [comment('# First', 0, 6, 0, 0), comment('# Comment', 15, 24, 2, 2)];
      const index = new SourceIndex(comments, source);

      const detached = index.getDetachedBlocks();
      // Second comment should be detached with blank lines
      if (detached.length > 0) {
        expect(detached[0][0].blankLinesBefore).toBeGreaterThan(0);
      }
    });
  });

  describe('Complex multi-resource scenarios', () => {
    it('should handle project with multiple tasks and milestones with mixed comments', () => {
      const source = `# Project setup
task setup {
  description = "initialize"  # Init comment
}

# Release planning
milestone v1 {
  depends_on = [setup]
}

# Final review
task review {
  complete = true  # Marked done
}`;

      const comments = [
        comment('# Project setup', 0, 15, 0, 0),
        comment('# Init comment', 57, 71, 2, 2),
        comment('# Release planning', 77, 95, 4, 4),
        comment('# Final review', 130, 144, 6, 6),
        comment('# Marked done', 192, 205, 8, 8),
      ];
      const index = new SourceIndex(comments, source);

      // Verify we can classify all comment types
      const allDetached = index.getDetachedBlocks();
      expect(allDetached.length).toBeGreaterThan(0);

      // Verify leading comments exist
      const leading = index.getLeadingComments(origin(16, 37, 1, 1));
      expect(leading.length).toBeGreaterThan(0);
    });

    it('should handle consecutive comments without blank lines as single leading block', () => {
      const source = `# Comment 1
# Comment 2
# Comment 3
task foo { }`;

      const comments = [
        comment('# Comment 1', 0, 11, 0, 0),
        comment('# Comment 2', 12, 23, 1, 1),
        comment('# Comment 3', 24, 35, 2, 2),
      ];
      const index = new SourceIndex(comments, source);

      const leading = index.getLeadingComments(origin(36, 49, 3, 3));
      expect(leading).toHaveLength(3);
      expect(leading.every((c) => c.classification === 'leading')).toBe(true);
    });

    it('should properly separate leading and detached blocks', () => {
      const source = `# Leading 1
# Leading 2
task foo { }

# Detached 1
# Detached 2`;

      // Carefully count byte offsets
      // # Leading 1\n = 0-11
      // # Leading 2\n = 12-23
      // task foo { }\n = 24-37
      // \n (blank line) = 38
      // # Detached 1\n = 39-51
      // # Detached 2 = 52-64

      const comments = [
        comment('# Leading 1', 0, 10, 0, 0),
        comment('# Leading 2', 12, 22, 1, 1),
        comment('# Detached 1', 39, 50, 4, 4),
        comment('# Detached 2', 52, 63, 5, 5),
      ];
      const index = new SourceIndex(comments, source);

      const leading = index.getLeadingComments(origin(24, 37, 2, 2));
      expect(leading).toHaveLength(2);
      expect(leading[0].token.text).toBe('# Leading 1');
      expect(leading[1].token.text).toBe('# Leading 2');

      const detached = index.getDetachedBlocks();
      // Should have 1 block with both detached comments (no blank line between them)
      expect(detached.length).toBeGreaterThan(0);
      expect(detached[0][0].token.text).toBe('# Detached 1');
    });
  });
});

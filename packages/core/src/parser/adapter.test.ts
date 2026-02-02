import { describe, expect, it } from 'vitest';
import type { CommentToken, ParseError, ParseResult } from './adapter.js';

describe('Adapter types', () => {
  describe('CommentToken interface', () => {
    it('has correct shape', () => {
      const token: CommentToken = {
        startByte: 0,
        endByte: 20,
        startRow: 0,
        endRow: 0,
        text: '# This is a comment',
      };
      expect(token.startByte).toBe(0);
      expect(token.endByte).toBe(20);
      expect(token.startRow).toBe(0);
      expect(token.endRow).toBe(0);
      expect(token.text).toBe('# This is a comment');
    });

    it('values are immutable at compile time', () => {
      const token: CommentToken = {
        startByte: 0,
        endByte: 20,
        startRow: 0,
        endRow: 0,
        text: '# comment',
      };
      // TypeScript enforces readonly at compile time via type checking.
      // At runtime, JavaScript allows mutation, but TypeScript prevents it.
      expect(token.startByte).toBe(0);
      // The following would be a TypeScript compilation error:
      // token.startByte = 5;  // ✗ Cannot assign to readonly property
    });

    it('supports multi-line comments', () => {
      const token: CommentToken = {
        startByte: 100,
        endByte: 150,
        startRow: 5,
        endRow: 7,
        text: `// Multi-line comment
// Line 2
// Line 3`,
      };
      expect(token.startRow).toBe(5);
      expect(token.endRow).toBe(7);
    });
  });

  describe('ParseResult interface', () => {
    it('can be created with tree and no errors', () => {
      const result: ParseResult = {
        tree: {
          type: 'document',
          resources: [],
        },
        errors: [],
        success: true,
      };
      expect(result.tree).not.toBeNull();
      expect(result.errors.length).toBe(0);
      expect(result.success).toBe(true);
      expect(result.comments).toBeUndefined();
    });

    it('can be created with comments (new field)', () => {
      const result: ParseResult = {
        tree: {
          type: 'document',
          resources: [],
        },
        errors: [],
        success: true,
        comments: [
          {
            startByte: 0,
            endByte: 10,
            startRow: 0,
            endRow: 0,
            text: '# comment',
          },
        ],
      };
      expect(result.comments).toBeDefined();
      expect(result.comments?.length).toBe(1);
      expect(result.comments?.[0].text).toBe('# comment');
    });

    it('can be created with empty comments array', () => {
      const result: ParseResult = {
        tree: {
          type: 'document',
          resources: [],
        },
        errors: [],
        success: true,
        comments: [],
      };
      expect(result.comments).toBeDefined();
      expect(result.comments?.length).toBe(0);
    });

    it('supports failure case without comments', () => {
      const error: ParseError = {
        message: 'Unexpected token',
        line: 1,
        column: 5,
      };
      const result: ParseResult = {
        tree: null,
        errors: [error],
        success: false,
      };
      expect(result.tree).toBeNull();
      expect(result.success).toBe(false);
      expect(result.comments).toBeUndefined();
    });

    it('supports failure case with comments', () => {
      const error: ParseError = {
        message: 'Unexpected token',
        line: 1,
        column: 5,
      };
      const result: ParseResult = {
        tree: null,
        errors: [error],
        success: false,
        comments: [
          {
            startByte: 0,
            endByte: 15,
            startRow: 0,
            endRow: 0,
            text: '# Leading comment',
          },
        ],
      };
      expect(result.tree).toBeNull();
      expect(result.comments?.length).toBe(1);
    });

    it('is backward compatible - old code works without comments field', () => {
      // Simulates existing code that doesn't know about comments field
      const oldStyleResult: ParseResult = {
        tree: {
          type: 'document',
          resources: [],
        },
        errors: [],
        success: true,
      };
      expect(oldStyleResult.tree).not.toBeNull();
      expect(oldStyleResult.success).toBe(true);
      // comments field is optional, so this is valid
      expect(oldStyleResult.comments).toBeUndefined();
    });
  });

  describe('ParseError interface', () => {
    it('has correct shape', () => {
      const error: ParseError = {
        message: 'Unexpected token',
        line: 5,
        column: 10,
      };
      expect(error.message).toBe('Unexpected token');
      expect(error.line).toBe(5);
      expect(error.column).toBe(10);
    });
  });

  describe('Backward compatibility', () => {
    it('existing code creating ParseResult without comments still works', () => {
      const results: ParseResult[] = [
        {
          tree: { type: 'document', resources: [] },
          errors: [],
          success: true,
        },
        {
          tree: null,
          errors: [{ message: 'Error', line: 1, column: 0 }],
          success: false,
        },
      ];
      expect(results.length).toBe(2);
      expect(results[0].comments).toBeUndefined();
      expect(results[1].comments).toBeUndefined();
    });

    it('can mix results with and without comments', () => {
      const results: ParseResult[] = [
        {
          tree: { type: 'document', resources: [] },
          errors: [],
          success: true,
        },
        {
          tree: { type: 'document', resources: [] },
          errors: [],
          success: true,
          comments: [
            {
              startByte: 0,
              endByte: 10,
              startRow: 0,
              endRow: 0,
              text: '# comment',
            },
          ],
        },
      ];
      expect(results[0].comments).toBeUndefined();
      expect(results[1].comments).toBeDefined();
    });
  });
});

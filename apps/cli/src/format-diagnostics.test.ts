import type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  DuplicateIdDiagnostic,
} from '@siren/core';
import { describe, expect, it } from 'vitest';
import { formatDiagnostic } from './format-diagnostics.js';

/**
 * Mock ParseDiagnostic for testing (mimics core structure)
 */
interface ParseDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

describe('formatDiagnostic', () => {
  describe('W004: Circular dependency', () => {
    it('formats cycle with file position and node chain', () => {
      const diagnostic: CircularDependencyDiagnostic = {
        code: 'W004',
        severity: 'warning',
        nodes: ['a', 'b', 'c', 'a'],
        file: 'siren/main.siren',
        line: 12,
        column: 5,
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe(
        'siren/main.siren:12:5: W004: Circular dependency detected: a -> b -> c -> a',
      );
    });

    it('formats two-node cycle', () => {
      const diagnostic: CircularDependencyDiagnostic = {
        code: 'W004',
        severity: 'warning',
        nodes: ['task1', 'task2', 'task1'],
        file: 'deps.siren',
        line: 8,
        column: 0,
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe(
        'deps.siren:8:0: W004: Circular dependency detected: task1 -> task2 -> task1',
      );
    });

    it('formats self-referential cycle', () => {
      const diagnostic: CircularDependencyDiagnostic = {
        code: 'W004',
        severity: 'warning',
        nodes: ['self', 'self'],
        file: 'broken.siren',
        line: 1,
        column: 10,
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe('broken.siren:1:10: W004: Circular dependency detected: self -> self');
    });
  });

  describe('W005: Dangling dependency', () => {
    it('formats dangling dependency for task', () => {
      const diagnostic: DanglingDependencyDiagnostic = {
        code: 'W005',
        severity: 'warning',
        resourceId: 'my-task',
        resourceType: 'task',
        dependencyId: 'missing-dep',
        file: 'siren/tasks.siren',
        line: 15,
        column: 12,
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe(
        "siren/tasks.siren:15:12: W005: Dangling dependency: task 'my-task' depends on 'missing-dep'",
      );
    });

    it('formats dangling dependency for milestone', () => {
      const diagnostic: DanglingDependencyDiagnostic = {
        code: 'W005',
        severity: 'warning',
        resourceId: 'release-v1',
        resourceType: 'milestone',
        dependencyId: 'unfinished-task',
        file: 'milestones.siren',
        line: 3,
        column: 2,
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe(
        "milestones.siren:3:2: W005: Dangling dependency: milestone 'release-v1' depends on 'unfinished-task'",
      );
    });
  });

  describe('W006: Duplicate resource ID', () => {
    it('formats duplicate ID with second occurrence position', () => {
      const diagnostic: DuplicateIdDiagnostic = {
        code: 'W006',
        severity: 'warning',
        resourceId: 'duplicate-id',
        resourceType: 'task',
        file: 'siren/dupes.siren',
        firstLine: 2,
        firstColumn: 0,
        secondLine: 10,
        secondColumn: 0,
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe(
        "siren/dupes.siren:10:0: W006: Duplicate resource ID detected: task 'duplicate-id' first defined at 2:0",
      );
    });
  });

  describe('W001: Complete keyword and attribute conflict', () => {
    it('formats complete conflict warning', () => {
      const diagnostic: ParseDiagnostic = {
        code: 'W001',
        message:
          "Resource has both 'complete' keyword and a 'complete' attribute whose value is not true. The resource will be treated as complete.",
        severity: 'warning',
        file: 'siren/config.siren',
        line: 20,
        column: 3,
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe(
        "siren/config.siren:20:3: W001: Resource has both 'complete' keyword and a 'complete' attribute whose value is not true. The resource will be treated as complete.",
      );
    });
  });

  describe('W002: Multiple complete keywords', () => {
    it('formats multiple complete keywords warning', () => {
      const diagnostic: ParseDiagnostic = {
        code: 'W002',
        message:
          "Resource 'deploy' has 'complete' keyword specified more than once. Only one is allowed; resource will be treated as complete: true.",
        severity: 'warning',
        file: 'tasks.siren',
        line: 7,
        column: 0,
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe(
        "tasks.siren:7:0: W002: Resource 'deploy' has 'complete' keyword specified more than once. Only one is allowed; resource will be treated as complete: true.",
      );
    });
  });

  describe('W003: Complete on unsupported type', () => {
    it('formats complete on wrong resource type', () => {
      const diagnostic: ParseDiagnostic = {
        code: 'W003',
        message:
          "Resource type 'feature' does not support the 'complete' keyword. It will be ignored.",
        severity: 'warning',
        file: 'custom.siren',
        line: 5,
        column: 8,
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe(
        "custom.siren:5:8: W003: Resource type 'feature' does not support the 'complete' keyword. It will be ignored.",
      );
    });
  });

  describe('E001: Parse error', () => {
    it('formats parse error', () => {
      const diagnostic: ParseDiagnostic = {
        code: 'E001',
        message: 'Invalid syntax: unexpected token',
        severity: 'error',
        file: 'broken.siren',
        line: 42,
        column: 15,
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe('broken.siren:42:15: E001: Invalid syntax: unexpected token');
    });
  });

  describe('Edge cases', () => {
    it('handles diagnostic with zero column', () => {
      const diagnostic: CircularDependencyDiagnostic = {
        code: 'W004',
        severity: 'warning',
        nodes: ['a', 'b', 'a'],
        file: 'test.siren',
        line: 1,
        column: 0,
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe('test.siren:1:0: W004: Circular dependency detected: a -> b -> a');
    });

    it('handles long file paths', () => {
      const diagnostic: DanglingDependencyDiagnostic = {
        code: 'W005',
        severity: 'warning',
        resourceId: 'task',
        resourceType: 'task',
        dependencyId: 'missing',
        file: 'very/deeply/nested/path/to/file.siren',
        line: 100,
        column: 50,
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe(
        "very/deeply/nested/path/to/file.siren:100:50: W005: Dangling dependency: task 'task' depends on 'missing'",
      );
    });

    it('handles resource IDs with special characters', () => {
      const diagnostic: DanglingDependencyDiagnostic = {
        code: 'W005',
        severity: 'warning',
        resourceId: 'my-complex_task.v2',
        resourceType: 'task',
        dependencyId: 'other-dep_final',
        file: 'tasks.siren',
        line: 5,
        column: 3,
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe(
        "tasks.siren:5:3: W005: Dangling dependency: task 'my-complex_task.v2' depends on 'other-dep_final'",
      );
    });
  });
});

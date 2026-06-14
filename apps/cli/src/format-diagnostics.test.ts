import type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  DuplicateIdDiagnostic,
} from '@sirenpm/core';
import type {
  EL001FallbackDiagnostic,
  EL002MissingTokenDiagnostic,
  EL003UnexpectedTokenDiagnostic,
  WL001UnrecognizedModifierDiagnostic,
  WL002CollapsedModifiersDiagnostic,
} from '@sirenpm/language';
import { describe, expect, it } from 'vitest';
import { formatDiagnostic, type OriginResolver } from './format-diagnostics';

/** An origin resolver that maps entry IDs to origins with predictable positions. */
function testResolver(): OriginResolver {
  const origins: Record<string, { doc: string; row: number }> = {
    a: { doc: 'siren/main.siren', row: 11 },
    b: { doc: 'siren/main.siren', row: 12 },
    c: { doc: 'siren/main.siren', row: 13 },
    'my-task': { doc: 'siren/tasks.siren', row: 14 },
    'release-v1': { doc: 'milestones.siren', row: 2 },
    'duplicate-id': { doc: 'siren/dupes.siren', row: 9 },
    task: { doc: 'very/deeply/nested/path/to/file.siren', row: 99 },
    'my-complex_task.v2': { doc: 'tasks.siren', row: 4 },
  };
  return (id) => {
    const entry = origins[id];
    if (!entry) return undefined;
    return {
      kind: 'range',
      startByte: 0,
      endByte: 1,
      startRow: entry.row,
      endRow: entry.row,
      document: entry.doc,
    };
  };
}

describe('formatDiagnostic', () => {
  describe('W001: Circular dependency', () => {
    it('formats cycle with file position and node chain', () => {
      const diagnostic: CircularDependencyDiagnostic = {
        code: 'W001',
        severity: 'warning',
        nodes: ['a', 'b', 'c', 'a'],
      };

      const result = formatDiagnostic(diagnostic, testResolver());

      expect(result).toBe(
        'siren/main.siren:12:0: W001: Circular dependency detected: a -> b -> c -> a',
      );
    });

    it('formats two-node cycle', () => {
      const diagnostic: CircularDependencyDiagnostic = {
        code: 'W001',
        severity: 'warning',
        nodes: ['task1', 'task2', 'task1'],
      };

      const result = formatDiagnostic(diagnostic, testResolver());

      // No resolver for task1 — falls back to unknown:0:0
      expect(result).toBe(
        // FIXME: If this is intentionally demonstrating a synthetic fallback, it needs
        // to be its own test case
        'unknown:0:0: W001: Circular dependency detected: task1 -> task2 -> task1',
      );
    });

    it('formats self-referential cycle with origin', () => {
      const diagnostic: CircularDependencyDiagnostic = {
        code: 'W001',
        severity: 'warning',
        nodes: ['a', 'a'],
      };

      const result = formatDiagnostic(diagnostic, testResolver());

      expect(result).toBe('siren/main.siren:12:0: W001: Circular dependency detected: a -> a');
    });
  });

  describe('W002: Dangling dependency', () => {
    it('formats dangling dependency for task', () => {
      const diagnostic: DanglingDependencyDiagnostic = {
        code: 'W002',
        severity: 'warning',
        entryId: 'my-task',
        entryType: 'task',
        dependencyId: 'missing-dep',
      };

      const result = formatDiagnostic(diagnostic, testResolver());

      expect(result).toBe(
        "siren/tasks.siren:15:0: W002: Dangling dependency: task 'my-task' depends on 'missing-dep'",
      );
    });

    it('formats dangling dependency for milestone', () => {
      const diagnostic: DanglingDependencyDiagnostic = {
        code: 'W002',
        severity: 'warning',
        entryId: 'release-v1',
        entryType: 'milestone',
        dependencyId: 'unfinished-task',
      };

      const result = formatDiagnostic(diagnostic, testResolver());

      expect(result).toBe(
        "milestones.siren:3:0: W002: Dangling dependency: milestone 'release-v1' depends on 'unfinished-task'",
      );
    });
  });

  describe('W003: Duplicate entry ID', () => {
    it('formats duplicate ID with entry identity', () => {
      const diagnostic: DuplicateIdDiagnostic = {
        code: 'W003',
        severity: 'warning',
        entryId: 'duplicate-id',
        entryType: 'task',
      };

      const result = formatDiagnostic(diagnostic, testResolver());

      expect(result).toBe(
        "siren/dupes.siren:10:0: W003: Duplicate entry ID detected: task 'duplicate-id'",
      );
    });
  });

  describe('WL001: Unrecognized status modifier', () => {
    it('formats unrecognized modifier warning', () => {
      const diagnostic: WL001UnrecognizedModifierDiagnostic = {
        code: 'WL001',
        severity: 'warning',
        resourceId: 'config',
        modifier: 'invalid_status',
        documentName: 'siren/config.siren',
        origin: {
          kind: 'range',
          startByte: 20,
          endByte: 34,
          startRow: 19,
          endRow: 19,
          document: 'siren/config.siren',
        },
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe(
        "siren/config.siren:20:0: WL001: Unrecognized status modifier 'invalid_status' on 'config' was ignored",
      );
    });
  });

  describe('WL002: Multiple recognized status modifiers', () => {
    it('formats collapsed status warning', () => {
      const diagnostic: WL002CollapsedModifiersDiagnostic = {
        code: 'WL002',
        severity: 'warning',
        resourceId: 'deploy',
        recognizedModifiers: ['complete', 'complete'],
        resolvedStatus: 'complete',
        documentName: 'tasks.siren',
        origin: {
          kind: 'range',
          startByte: 5,
          endByte: 15,
          startRow: 6,
          endRow: 6,
          document: 'tasks.siren',
        },
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe(
        "tasks.siren:7:0: WL002: Resource 'deploy' has multiple status modifiers (complete, complete); resolved to 'complete'",
      );
    });
  });

  describe('EL001: Parse error fallback', () => {
    it('formats syntax exclusion', () => {
      const diagnostic: EL001FallbackDiagnostic = {
        code: 'EL001',
        severity: 'error',
        nodeType: 'ERROR',
        documentName: 'broken.siren',
        origin: {
          kind: 'range',
          startByte: 0,
          endByte: 33,
          startRow: 41,
          endRow: 41,
          document: 'broken.siren',
        },
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe('broken.siren:42:0: EL001: could not parse ERROR');
    });

    it('formats syntax exclusion with resource id', () => {
      const diagnostic: EL001FallbackDiagnostic = {
        code: 'EL001',
        severity: 'error',
        nodeType: 'resource',
        resourceId: 'my-task',
        documentName: 'tasks.siren',
        origin: {
          kind: 'range',
          startByte: 0,
          endByte: 5,
          startRow: 3,
          endRow: 3,
          document: 'tasks.siren',
        },
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe("tasks.siren:4:0: EL001: could not parse resource 'my-task'");
    });
  });

  describe('EL002: Missing token', () => {
    it('formats missing token error', () => {
      const diagnostic: EL002MissingTokenDiagnostic = {
        code: 'EL002',
        severity: 'error',
        missingToken: '}',
        documentName: 'test.siren',
        origin: {
          kind: 'range',
          startByte: 42,
          endByte: 43,
          startRow: 9,
          endRow: 9,
          document: 'test.siren',
        },
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe("test.siren:10:0: EL002: missing '}'");
    });
  });

  describe('EL003: Unexpected token with expected alternatives', () => {
    it('formats unexpected token error with expected set', () => {
      const diagnostic: EL003UnexpectedTokenDiagnostic = {
        code: 'EL003',
        severity: 'error',
        expected: ['block_open', 'bare_identifier'],
        documentName: 'test.siren',
        origin: {
          kind: 'range',
          startByte: 15,
          endByte: 21,
          startRow: 4,
          endRow: 4,
          document: 'test.siren',
        },
      };

      const result = formatDiagnostic(diagnostic);

      expect(result).toBe(
        "test.siren:5:0: EL003: unexpected token; expected 'block_open', 'bare_identifier'",
      );
    });
  });

  describe('Edge cases', () => {
    it('handles missing origin resolver for core diagnostic', () => {
      const diagnostic: CircularDependencyDiagnostic = {
        code: 'W001',
        severity: 'warning',
        nodes: ['orphan'],
      };

      const result = formatDiagnostic(diagnostic); // no resolver

      expect(result).toBe('unknown:0:0: W001: Circular dependency detected: orphan');
    });

    it('handles diagnostic with zero column via origin', () => {
      const diagnostic: CircularDependencyDiagnostic = {
        code: 'W001',
        severity: 'warning',
        nodes: ['a', 'b', 'a'],
      };

      const resolver: OriginResolver = () => ({
        kind: 'range',
        startByte: 0,
        endByte: 5,
        startRow: 0,
        endRow: 0,
        document: 'test.siren',
      });

      const result = formatDiagnostic(diagnostic, resolver);

      expect(result).toBe('test.siren:1:0: W001: Circular dependency detected: a -> b -> a');
    });

    it('handles long file paths via resolver', () => {
      const diagnostic: DanglingDependencyDiagnostic = {
        code: 'W002',
        severity: 'warning',
        entryId: 'task',
        entryType: 'task',
        dependencyId: 'missing',
      };

      const result = formatDiagnostic(diagnostic, testResolver());

      expect(result).toBe(
        "very/deeply/nested/path/to/file.siren:100:0: W002: Dangling dependency: task 'task' depends on 'missing'",
      );
    });

    it('handles resource IDs with special characters', () => {
      const diagnostic: DanglingDependencyDiagnostic = {
        code: 'W002',
        severity: 'warning',
        entryId: 'my-complex_task.v2',
        entryType: 'task',
        dependencyId: 'other-dep_final',
      };

      const result = formatDiagnostic(diagnostic, testResolver());

      expect(result).toBe(
        "tasks.siren:5:0: W002: Dangling dependency: task 'my-complex_task.v2' depends on 'other-dep_final'",
      );
    });
  });

  describe('Caret snippet rendering (formatDiagnostic with source)', () => {
    it('renders caret snippet for EL002 with source', () => {
      const diagnostic: EL002MissingTokenDiagnostic = {
        code: 'EL002',
        severity: 'error',
        missingToken: 'task',
        documentName: 'broken.siren',
        origin: {
          kind: 'range',
          startByte: 0,
          endByte: 1,
          startRow: 0,
          endRow: 0,
          document: 'broken.siren',
        },
      };

      const result = formatDiagnostic(diagnostic, undefined, 'this is not valid siren syntax!!!');

      expect(result).toBe(
        [
          "broken.siren:1:1: EL002: missing 'task'",
          '  |',
          '1 | this is not valid siren syntax!!!',
          '  | ^',
        ].join('\n'),
      );
    });

    it('renders caret snippet for EL003 with source', () => {
      const diagnostic: EL003UnexpectedTokenDiagnostic = {
        code: 'EL003',
        severity: 'error',
        expected: ['task', 'milestone'],
        documentName: 'broken.siren',
        origin: {
          kind: 'range',
          startByte: 0,
          endByte: 3,
          startRow: 0,
          endRow: 0,
          document: 'broken.siren',
        },
      };

      const result = formatDiagnostic(diagnostic, undefined, '!!! syntax error');

      expect(result).toBe(
        [
          "broken.siren:1:1: EL003: unexpected token; expected 'task', 'milestone'",
          '  |',
          '1 | !!! syntax error',
          '  | ^^^',
        ].join('\n'),
      );
    });

    it('does NOT append caret snippet for non-parse-error diagnostics', () => {
      const diagnostic: DanglingDependencyDiagnostic = {
        code: 'W002',
        severity: 'warning',
        entryId: 'my-task',
        entryType: 'task',
        dependencyId: 'missing-dep',
      };

      const resolver: OriginResolver = () => ({
        kind: 'range',
        startByte: 0,
        endByte: 5,
        startRow: 0,
        endRow: 0,
        document: 'test.siren',
      });

      // Source is provided but diagnostic is not a parse error — no caret.
      const result = formatDiagnostic(diagnostic, resolver, 'some source text');

      expect(result).toBe(
        "test.siren:1:1: W002: Dangling dependency: task 'my-task' depends on 'missing-dep'",
      );
    });
  });
});

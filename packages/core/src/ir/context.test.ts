/**
 * Unit tests for IRContext
 * Tests diagnostic generation with and without source attribution
 */

import { describe, expect, it } from 'vitest';
import { CoreDiagnosticCode } from '../diagnostics/codes.js';
import { IRContext } from './context.js';
import type { Resource } from './types.js';

describe('IRContext', () => {
  describe('factories and accumulators', () => {
    it('empty() creates context with no resources', () => {
      const ir = IRContext.empty();
      expect(ir.resources).toHaveLength(0);
      expect(ir.diagnostics).toHaveLength(0);
    });

    it('fromResources creates context from flat list', () => {
      const resources: Resource[] = [{ type: 'task', id: 'a', complete: false, attributes: [] }];
      const ir = IRContext.fromResources(resources);
      expect(ir.resources).toHaveLength(1);
      expect(ir.resources[0].id).toBe('a');
    });

    it('withResource appends a resource and returns new instance', () => {
      const ir1 = IRContext.empty();
      const ir2 = ir1.withResource({ type: 'task', id: 'a', complete: false, attributes: [] });
      expect(ir1.resources).toHaveLength(0);
      expect(ir2.resources).toHaveLength(1);
      expect(ir2.resources[0].id).toBe('a');
    });

    it('withResources appends multiple resources', () => {
      const ir1 = IRContext.fromResources([
        { type: 'task', id: 'a', complete: false, attributes: [] },
      ]);
      const ir2 = ir1.withResources([
        { type: 'task', id: 'b', complete: false, attributes: [] },
        { type: 'task', id: 'c', complete: false, attributes: [] },
      ]);
      expect(ir1.resources).toHaveLength(1);
      expect(ir2.resources).toHaveLength(3);
    });
  });

  describe('fromResources without source attribution', () => {
    it('generates dangling dependency diagnostics without source', () => {
      const resources: Resource[] = [
        {
          type: 'milestone',
          id: 'has-dangling',
          complete: false,
          attributes: [
            {
              key: 'depends_on',
              value: { kind: 'reference', id: 'missing-dep' },
            },
          ],
        },
      ];

      const ir = IRContext.fromResources(resources);

      const danglingDiags = ir.diagnostics.filter(
        (d) => d.code === CoreDiagnosticCode.DANGLING_DEPENDENCY,
      );
      expect(danglingDiags).toHaveLength(1);

      const diag: any = danglingDiags[0];
      expect(diag.code).toBe('WC-002');
      expect(diag.severity).toBe('warning');
      expect(diag.resourceId).toBe('has-dangling');
      expect(diag.resourceType).toBe('milestone');
      expect(diag.dependencyId).toBe('missing-dep');
      expect(diag.source).toBeUndefined();
    });

    it('generates circular dependency diagnostics without source', () => {
      const resources: Resource[] = [
        {
          type: 'task',
          id: 'a',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'b' } }],
        },
        {
          type: 'task',
          id: 'b',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'a' } }],
        },
      ];

      const ir = IRContext.fromResources(resources);

      const cycleDiags = ir.diagnostics.filter(
        (d) => d.code === CoreDiagnosticCode.CIRCULAR_DEPENDENCY,
      );
      expect(cycleDiags).toHaveLength(1);

      const diag: any = cycleDiags[0];
      expect(diag.code).toBe('WC-001');
      expect(diag.severity).toBe('warning');
      expect(diag.nodes).toEqual(['a', 'b', 'a']);
      expect(diag.source).toBeUndefined();
    });

    it('generates multiple dangling dependency diagnostics for multiple missing deps', () => {
      const resources: Resource[] = [
        {
          type: 'milestone',
          id: 'multi-dangling',
          complete: false,
          attributes: [
            {
              key: 'depends_on',
              value: {
                kind: 'array',
                elements: [
                  { kind: 'reference', id: 'missing1' },
                  { kind: 'reference', id: 'missing2' },
                  { kind: 'reference', id: 'present' },
                ],
              },
            },
          ],
        },
        {
          type: 'task',
          id: 'present',
          complete: false,
          attributes: [],
        },
      ];

      const ir = IRContext.fromResources(resources);

      const danglingDiags = ir.diagnostics.filter(
        (d) => d.code === CoreDiagnosticCode.DANGLING_DEPENDENCY,
      );
      expect(danglingDiags).toHaveLength(2);

      const missing1Diag: any = danglingDiags.find((d: any) => d.dependencyId === 'missing1');
      expect(missing1Diag).toBeDefined();
      expect(missing1Diag.resourceId).toBe('multi-dangling');
      expect(missing1Diag.dependencyId).toBe('missing1');

      const missing2Diag: any = danglingDiags.find((d: any) => d.dependencyId === 'missing2');
      expect(missing2Diag).toBeDefined();
      expect(missing2Diag.resourceId).toBe('multi-dangling');
      expect(missing2Diag.dependencyId).toBe('missing2');
    });
  });

  describe('fromResources with source attribution', () => {
    it('includes source in dangling dependency diagnostics', () => {
      const resources: Resource[] = [
        {
          type: 'task',
          id: 'has-dangling',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'missing' } }],
          source: 'project/tasks.siren:1:0',
        },
      ];

      const ir = IRContext.fromResources(resources);

      const danglingDiags = ir.diagnostics.filter(
        (d) => d.code === CoreDiagnosticCode.DANGLING_DEPENDENCY,
      );
      expect(danglingDiags).toHaveLength(1);

      const diag: any = danglingDiags[0];
      expect(diag.source).toBe('project/tasks.siren:1:0');
    });

    it('includes source in circular dependency diagnostics', () => {
      const resources: Resource[] = [
        {
          type: 'task',
          id: 'x',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'y' } }],
          source: 'project/main.siren:1:0',
        },
        {
          type: 'task',
          id: 'y',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'z' } }],
          source: 'project/main.siren:2:0',
        },
        {
          type: 'task',
          id: 'z',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'x' } }],
          source: 'project/main.siren:3:0',
        },
      ];

      const ir = IRContext.fromResources(resources);

      const cycleDiags = ir.diagnostics.filter(
        (d) => d.code === CoreDiagnosticCode.CIRCULAR_DEPENDENCY,
      );
      expect(cycleDiags).toHaveLength(1);

      const diag: any = cycleDiags[0];
      expect(diag.nodes).toEqual(['x', 'y', 'z', 'x']);
      expect(diag.source).toBe('project/main.siren:1:0');
    });

    it('uses first node source for cycles spanning multiple files', () => {
      const resources: Resource[] = [
        {
          type: 'task',
          id: 'a',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'b' } }],
          source: 'project/file1.siren:1:0',
        },
        {
          type: 'task',
          id: 'b',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'a' } }],
          source: 'project/file2.siren:1:0',
        },
      ];

      const ir = IRContext.fromResources(resources);

      const cycleDiags = ir.diagnostics.filter(
        (d) => d.code === CoreDiagnosticCode.CIRCULAR_DEPENDENCY,
      );
      expect(cycleDiags).toHaveLength(1);

      const diag: any = cycleDiags[0];
      expect(diag.nodes).toEqual(['a', 'b', 'a']);
      expect(diag.source).toBeDefined();
    });
  });

  describe('duplicate ID diagnostics', () => {
    it('detects duplicate resource IDs', () => {
      const resources: Resource[] = [
        { type: 'task', id: 'dup', complete: false, attributes: [], source: 'file.siren:1:0' },
        { type: 'task', id: 'dup', complete: false, attributes: [], source: 'file.siren:5:0' },
      ];

      const ir = IRContext.fromResources(resources);

      const dupDiags = ir.diagnostics.filter((d) => d.code === CoreDiagnosticCode.DUPLICATE_ID);
      expect(dupDiags).toHaveLength(1);

      const diag: any = dupDiags[0];
      expect(diag.code).toBe('WC-003');
      expect(diag.resourceId).toBe('dup');
      expect(diag.source).toBe('file.siren:5:0');
      expect(diag.firstSource).toBe('file.siren:1:0');
    });

    it('deduplicates resources (first occurrence wins)', () => {
      const resources: Resource[] = [
        { type: 'task', id: 'dup', complete: false, attributes: [{ key: 'x', value: 1 }] },
        { type: 'task', id: 'dup', complete: true, attributes: [{ key: 'x', value: 2 }] },
      ];

      const ir = IRContext.fromResources(resources);
      expect(ir.resources).toHaveLength(1);
      expect(ir.resources[0].complete).toBe(false);
      expect(ir.resources[0].attributes[0].value).toBe(1);
    });
  });

  describe('no diagnostics when graph is valid', () => {
    it('generates no diagnostics for valid dependency graph', () => {
      const resources: Resource[] = [
        {
          type: 'task',
          id: 'leaf',
          complete: false,
          attributes: [],
        },
        {
          type: 'task',
          id: 'parent',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'leaf' } }],
        },
      ];

      const ir = IRContext.fromResources(resources);
      expect(ir.diagnostics).toHaveLength(0);
    });

    it('generates no diagnostics for empty project', () => {
      const ir = IRContext.fromResources([]);
      expect(ir.diagnostics).toHaveLength(0);
    });

    it('generates no diagnostics for empty() context', () => {
      const ir = IRContext.empty();
      expect(ir.diagnostics).toHaveLength(0);
    });
  });
});

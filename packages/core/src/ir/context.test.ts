/**
 * Unit tests for IRContext
 * Tests diagnostic generation with and without file attribution
 */

import { describe, expect, it } from 'vitest';
import { IRContext } from './context';
import type { Resource } from './types';

describe('IRContext', () => {
  describe('fromResources without file attribution', () => {
    it('generates dangling dependency diagnostics without file info', () => {
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

      // PRESCRIPTIVE: W002 diagnostics must have structured fields
      const danglingDiags = ir.diagnostics.filter((d) => d.code === 'W002');
      expect(danglingDiags).toHaveLength(1);

      const diag: any = danglingDiags[0];
      expect(diag.code).toBe('W002');
      expect(diag.severity).toBe('warning');
      expect(diag.resourceId).toBe('has-dangling');
      expect(diag.resourceType).toBe('milestone');
      expect(diag.dependencyId).toBe('missing-dep');
      expect(diag.file).toBeUndefined(); // No file attribution without resourceSources
    });

    it('generates circular dependency diagnostics without file info', () => {
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

      // PRESCRIPTIVE: W001 diagnostics must have structured fields
      const cycleDiags = ir.diagnostics.filter((d) => d.code === 'W001');
      expect(cycleDiags).toHaveLength(1);

      const diag: any = cycleDiags[0];
      expect(diag.code).toBe('W001');
      expect(diag.severity).toBe('warning');
      expect(diag.nodes).toEqual(['a', 'b', 'a']);
      expect(diag.file).toBeUndefined(); // No file attribution without resourceSources
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

      const danglingDiags = ir.diagnostics.filter((d) => d.code === 'W002');
      expect(danglingDiags).toHaveLength(2);

      // Find specific diagnostics
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

  describe('fromResources with file attribution', () => {
    it('includes file info in dangling dependency diagnostics when origin.document set', () => {
      const resources: Resource[] = [
        {
          type: 'task',
          id: 'has-dangling',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'missing' } }],
          origin: {
            startByte: 0,
            endByte: 10,
            startRow: 0,
            endRow: 0,
            document: 'project/tasks.siren',
          },
        },
      ];

      const ir = IRContext.fromResources(resources);

      const danglingDiags = ir.diagnostics.filter((d) => d.code === 'W002');
      expect(danglingDiags).toHaveLength(1);

      const diag: any = danglingDiags[0];
      expect(diag.file).toBe('project/tasks.siren');
      expect(diag.line).toBe(1);
      expect(diag.column).toBe(0);
    });

    it('includes file info in circular dependency diagnostics when origin.document set', () => {
      const resources: Resource[] = [
        {
          type: 'task',
          id: 'x',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'y' } }],
          origin: {
            startByte: 0,
            endByte: 10,
            startRow: 0,
            endRow: 0,
            document: 'project/main.siren',
          },
        },
        {
          type: 'task',
          id: 'y',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'z' } }],
          origin: {
            startByte: 20,
            endByte: 30,
            startRow: 1,
            endRow: 1,
            document: 'project/main.siren',
          },
        },
        {
          type: 'task',
          id: 'z',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'x' } }],
          origin: {
            startByte: 40,
            endByte: 50,
            startRow: 2,
            endRow: 2,
            document: 'project/main.siren',
          },
        },
      ];

      const ir = IRContext.fromResources(resources);

      const cycleDiags = ir.diagnostics.filter((d) => d.code === 'W001');
      expect(cycleDiags).toHaveLength(1);

      const diag: any = cycleDiags[0];
      expect(diag.nodes).toEqual(['x', 'y', 'z', 'x']);
      expect(diag.file).toBe('project/main.siren');
    });

    it('handles cycle spanning multiple files', () => {
      const resources: Resource[] = [
        {
          type: 'task',
          id: 'a',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'b' } }],
          origin: {
            startByte: 0,
            endByte: 10,
            startRow: 0,
            endRow: 0,
            document: 'project/file1.siren',
          },
        },
        {
          type: 'task',
          id: 'b',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'a' } }],
          origin: {
            startByte: 0,
            endByte: 10,
            startRow: 0,
            endRow: 0,
            document: 'project/file2.siren',
          },
        },
      ];

      const ir = IRContext.fromResources(resources);

      const cycleDiags = ir.diagnostics.filter((d) => d.code === 'W001');
      expect(cycleDiags).toHaveLength(1);

      const diag: any = cycleDiags[0];
      expect(diag).toEqual({
        code: 'W001',
        severity: 'warning',
        nodes: ['a', 'b', 'a'],
        file: 'project/file1.siren, project/file2.siren',
        line: 1,
        column: 0,
      });
    });
  });

  describe('fromResources with origin.document', () => {
    it('preserves origin.document and populates diagnostic file', () => {
      const resources: Resource[] = [
        {
          type: 'task',
          id: 'a',
          complete: false,
          attributes: [
            {
              key: 'depends_on',
              value: { kind: 'reference', id: 'b' },
            },
          ],
          origin: {
            startByte: 0,
            endByte: 30,
            startRow: 0,
            endRow: 0,
            document: 'test-file.siren',
          },
        },
        {
          type: 'task',
          id: 'b',
          complete: false,
          attributes: [
            {
              key: 'depends_on',
              value: { kind: 'reference', id: 'a' },
            },
          ],
          origin: {
            startByte: 31,
            endByte: 60,
            startRow: 1,
            endRow: 1,
            document: 'test-file.siren',
          },
        },
      ];

      const ir = IRContext.fromResources(resources);

      // Verify IR resources have origin.document
      expect(ir.resources).toHaveLength(2);
      for (const r of ir.resources) {
        expect(r.origin?.document).toBe('test-file.siren');
      }

      // Verify depends_on attribute is present
      const resourceA = ir.resources.find((r) => r.id === 'a');
      expect(resourceA).toBeDefined();
      const dependsOnAttr = resourceA!.attributes.find((a) => a.key === 'depends_on');
      expect(dependsOnAttr).toBeDefined();
      expect(dependsOnAttr!.value).toMatchObject({ kind: 'reference', id: 'b' });

      // Verify cycle diagnostic has file
      const cycleDiags = ir.diagnostics.filter((d) => d.code === 'W001');
      expect(cycleDiags).toHaveLength(1);

      const diag: any = cycleDiags[0];
      expect(diag.file).toBe('test-file.siren');
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
  });

  describe('normalization and semantic analysis passes', () => {
    it('deduplicates resources before resolving implicit milestone completion', () => {
      const resources: Resource[] = [
        {
          type: 'task',
          id: 'shared-task',
          complete: false,
          attributes: [],
          origin: {
            startByte: 0,
            endByte: 20,
            startRow: 4,
            endRow: 4,
            document: 'first.siren',
          },
        },
        {
          type: 'task',
          id: 'shared-task',
          complete: true,
          attributes: [],
          origin: {
            startByte: 21,
            endByte: 40,
            startRow: 11,
            endRow: 11,
            document: 'second.siren',
          },
        },
        {
          type: 'milestone',
          id: 'release',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'shared-task' } }],
        },
      ];

      const ir = IRContext.fromResources(resources);

      expect(ir.resources.map((resource) => resource.id)).toEqual(['shared-task', 'release']);
      expect(ir.resources.find((resource) => resource.id === 'shared-task')?.complete).toBe(false);
      expect(ir.resources.find((resource) => resource.id === 'release')?.complete).toBe(false);
      expect(ir.duplicateDiagnostics).toEqual([
        {
          code: 'W003',
          severity: 'warning',
          resourceId: 'shared-task',
          resourceType: 'task',
          file: 'second.siren',
          firstFile: 'first.siren',
          firstLine: 5,
          firstColumn: 0,
          secondLine: 12,
          secondColumn: 0,
        },
      ]);
    });

    it('resolves implicit milestone completion after first-occurrence deduplication', () => {
      const resources: Resource[] = [
        { type: 'task', id: 'finished-task', complete: true, attributes: [] },
        { type: 'task', id: 'finished-task', complete: false, attributes: [] },
        {
          type: 'milestone',
          id: 'release',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'finished-task' } }],
        },
      ];

      const ir = IRContext.fromResources(resources);

      expect(ir.resources.find((resource) => resource.id === 'finished-task')?.complete).toBe(true);
      expect(ir.resources.find((resource) => resource.id === 'release')?.complete).toBe(true);
      expect(ir.duplicateDiagnostics).toHaveLength(1);
    });

    it('orders semantic diagnostics as cycles, dangling dependencies, then duplicates', () => {
      const resources: Resource[] = [
        {
          type: 'task',
          id: 'cycle-a',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'cycle-b' } }],
        },
        {
          type: 'task',
          id: 'cycle-b',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'cycle-a' } }],
        },
        {
          type: 'task',
          id: 'has-dangling',
          complete: false,
          attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'missing' } }],
        },
        { type: 'task', id: 'duplicate', complete: false, attributes: [] },
        { type: 'task', id: 'duplicate', complete: false, attributes: [] },
      ];

      const ir = IRContext.fromResources(resources);

      expect(ir.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['W001', 'W002', 'W003']);
    });

    it('preserves the legacy constructor and readable source metadata', () => {
      const ir = new IRContext({ resources: [], source: 'legacy.siren' });

      expect(ir.source).toBe('legacy.siren');
      expect(ir.resources).toEqual([]);
      expect(ir.diagnostics).toEqual([]);
    });

    it('preserves deprecated fromResources source metadata without using it for diagnostic attribution', () => {
      const ir = IRContext.fromResources(
        [
          {
            type: 'task',
            id: 'has-dangling',
            complete: false,
            attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'missing' } }],
          },
        ],
        'legacy-source.siren',
      );

      expect(ir.source).toBe('legacy-source.siren');
      expect(ir.diagnostics).toEqual([
        {
          code: 'W002',
          severity: 'warning',
          resourceId: 'has-dangling',
          resourceType: 'task',
          dependencyId: 'missing',
        },
      ]);
    });
  });

  describe('snapshot freezing', () => {
    it('freezes context resources, cycles, and diagnostics', () => {
      const ir = IRContext.fromResources([
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
      ]);

      const resource = ir.resources[0];
      const cycle = ir.cycles[0];
      const diagnostic = ir.diagnostics[0];

      expect(resource).toBeDefined();
      expect(cycle).toBeDefined();
      expect(diagnostic).toBeDefined();
      if (!resource || !cycle || !diagnostic) throw new Error('expected IR snapshot data');

      expect(Object.isFrozen(ir)).toBe(true);
      expect(Object.isFrozen(ir.resources)).toBe(true);
      expect(Object.isFrozen(resource)).toBe(true);
      expect(Object.isFrozen(resource.attributes)).toBe(true);
      expect(Object.isFrozen(resource.attributes[0])).toBe(true);
      expect(Object.isFrozen(ir.cycles)).toBe(true);
      expect(Object.isFrozen(cycle)).toBe(true);
      expect(Object.isFrozen(cycle.nodes)).toBe(true);
      expect(Object.isFrozen(ir.diagnostics)).toBe(true);
      expect(Object.isFrozen(diagnostic)).toBe(true);
    });
  });
});

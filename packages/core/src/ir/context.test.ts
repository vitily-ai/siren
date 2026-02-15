/**
 * Unit tests for IRContext
 * Tests diagnostic generation with and without file attribution
 */

import { describe, expect, it } from 'vitest';
import { IRContext } from './context.js';
import type { Resource } from './types.js';

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

      // PRESCRIPTIVE: W005 diagnostics must have structured fields
      const danglingDiags = ir.diagnostics.filter((d) => d.code === 'W005');
      expect(danglingDiags).toHaveLength(1);

      const diag: any = danglingDiags[0];
      expect(diag.code).toBe('W005');
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

      // PRESCRIPTIVE: W004 diagnostics must have structured fields
      const cycleDiags = ir.diagnostics.filter((d) => d.code === 'W004');
      expect(cycleDiags).toHaveLength(1);

      const diag: any = cycleDiags[0];
      expect(diag.code).toBe('W004');
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

      const danglingDiags = ir.diagnostics.filter((d) => d.code === 'W005');
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

      const danglingDiags = ir.diagnostics.filter((d) => d.code === 'W005');
      expect(danglingDiags).toHaveLength(1);

      const diag: any = danglingDiags[0];
      expect(diag.file).toBe('project/tasks.siren');
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

      const cycleDiags = ir.diagnostics.filter((d) => d.code === 'W004');
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

      const cycleDiags = ir.diagnostics.filter((d) => d.code === 'W004');
      expect(cycleDiags).toHaveLength(1);

      const diag: any = cycleDiags[0];
      expect(diag.nodes).toEqual(['a', 'b', 'a']);
      // PRESCRIPTIVE: For cycles spanning multiple files, file should contain all involved files
      expect(diag.file).toBeDefined();
      // Could be comma-separated or array - implementation decides
      // For now, just assert it exists
    });
  });

  describe('fromCst with origin.document', () => {
    it('preserves origin.document through decoding and populates diagnostic file', async () => {
      // This test verifies that origin.document flows from CST through decoding
      // to the final diagnostic generation
      const { DocumentNode, ResourceNode } = await import('../parser/cst.js');

      // Create a minimal CST with origin.document set
      const cst: DocumentNode = {
        type: 'document',
        resources: [
          {
            type: 'resource',
            resourceType: 'task',
            identifier: { type: 'identifier', value: 'a', quoted: false },
            complete: false,
            body: [
              {
                type: 'attribute',
                key: { type: 'identifier', value: 'depends_on', quoted: false },
                value: {
                  type: 'reference',
                  identifier: { type: 'identifier', value: 'b', quoted: false },
                },
              },
            ],
            origin: {
              startByte: 0,
              endByte: 30,
              startRow: 0,
              endRow: 0,
              document: 'test-file.siren',
            },
          } as ResourceNode,
          {
            type: 'resource',
            resourceType: 'task',
            identifier: { type: 'identifier', value: 'b', quoted: false },
            complete: false,
            body: [
              {
                type: 'attribute',
                key: { type: 'identifier', value: 'depends_on', quoted: false },
                value: {
                  type: 'reference',
                  identifier: { type: 'identifier', value: 'a', quoted: false },
                },
              },
            ],
            origin: {
              startByte: 31,
              endByte: 60,
              startRow: 1,
              endRow: 1,
              document: 'test-file.siren',
            },
          } as ResourceNode,
        ],
      };

      const ir = IRContext.fromCst(cst);

      // Verify IR resources have origin.document
      expect(ir.resources).toHaveLength(2);
      for (const r of ir.resources) {
        expect(r.origin?.document).toBe('test-file.siren');
      }

      // Verify depends_on attribute was decoded
      const resourceA = ir.resources.find((r) => r.id === 'a');
      expect(resourceA).toBeDefined();
      const dependsOnAttr = resourceA!.attributes.find((a) => a.key === 'depends_on');
      expect(dependsOnAttr).toBeDefined();
      expect(dependsOnAttr!.value).toMatchObject({ kind: 'reference', id: 'b' });

      // Verify cycle diagnostic has file
      const cycleDiags = ir.diagnostics.filter((d) => d.code === 'W004');
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
});

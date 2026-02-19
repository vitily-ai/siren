/**
 * Decode Integration Tests
 *
 * End-to-end tests: source file → parse → decode → assert on IR
 * Validates that fixtures decode to correct resource structure.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { IRContext } from '../../src/ir/context.js';
import { isReference } from '../../src/ir/types.js';
import type { ParserAdapter, SourceDocument } from '../../src/parser/adapter.js';
import { getTestAdapter } from '../helpers/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures');

// TODO move to helper - this is duplicated a lot
/** Helper to wrap a source string as a SourceDocument array */
function doc(content: string, name = 'test.siren'): SourceDocument[] {
  return [{ name, content }];
}

describe('Decode Integration: Fixtures', () => {
  let adapter: ParserAdapter;

  beforeAll(async () => {
    adapter = await getTestAdapter();
  });

  describe('01-minimal.siren', () => {
    const fixturePath = join(fixturesDir, 'snippets', '01-minimal.siren');

    it('decodes successfully with no errors', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      expect(ir.diagnostics.filter((d) => d.severity === 'error').length === 0).toBe(true);
      expect(ir.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    });

    it('decodes correct number of resources (5 including synthetic file milestone)', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      expect(ir).not.toBeNull();
      expect(ir.resources).toHaveLength(5);
    });

    it('decodes resource types correctly (3 tasks, 2 milestones)', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const resources = ir.resources;
      const tasks = resources.filter((r) => r.type === 'task');
      const milestones = resources.filter((r) => r.type === 'milestone');

      expect(tasks).toHaveLength(3);
      expect(milestones).toHaveLength(2);
    });

    it('decodes resource IDs correctly (quotes stripped)', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const ids = ir.resources.map((r) => r.id);

      expect(ids).toContain('example');
      expect(ids).toContain('initial setup'); // stripped quotes
      expect(ids).toContain('setup-environment');
      expect(ids).toContain('example 2: with special chars!'); // stripped quotes
      expect(ids).toContain('test');
    });

    it('preserves resource order from source', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const resources = ir.resources;

      expect(resources).toMatchObject([
        { type: 'task', id: 'example' },
        { type: 'milestone', id: 'initial setup' },
        { type: 'task', id: 'setup-environment' },
        { type: 'task', id: 'example 2: with special chars!' },
        { type: 'milestone', id: 'test' },
      ]);
    });
  });

  describe('02-simple.siren', () => {
    const fixturePath = join(fixturesDir, 'snippets', '02-simple.siren');

    it('decodes successfully with no errors', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      expect(ir.diagnostics.filter((d) => d.severity === 'error').length === 0).toBe(true);
      expect(ir.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    });

    it('decodes correct number of resources (4 including synthetic file milestone)', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      expect(ir).not.toBeNull();
      expect(ir.resources).toHaveLength(4);
    });

    it('decodes resource types correctly (2 tasks, 2 milestones)', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const resources = ir.resources;
      const tasks = resources.filter((r) => r.type === 'task');
      const milestones = resources.filter((r) => r.type === 'milestone');

      expect(tasks).toHaveLength(2);
      expect(milestones).toHaveLength(2);
    });

    it('decodes resource IDs correctly (quotes stripped)', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const ids = ir.resources.map((r) => r.id);

      expect(ids).toContain('with_attributes');
      expect(ids).toContain('Q1 Launch'); // stripped quotes
      expect(ids).toContain('complex_example');
      expect(ids).toContain('test');
    });

    it('preserves resource order from source', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const resources = ir.resources;

      expect(resources).toMatchObject([
        { type: 'task', id: 'with_attributes' },
        { type: 'milestone', id: 'Q1 Launch' },
        { type: 'task', id: 'complex_example' },
        { type: 'milestone', id: 'test' },
      ]);
    });

    it('decodes string attributes to string values (quotes stripped)', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const withAttributes = ir.resources.find((r) => r.id === 'with_attributes')!;
      const description = withAttributes.attributes.find((a) => a.key === 'description');

      expect(description).toBeDefined();
      expect(description!.value).toBe('some description');
      expect(typeof description!.value).toBe('string');
      // Ensure quotes are stripped (not "some description")
      expect(description!.value).not.toContain('"');
    });

    it('decodes number attributes to number values (not strings)', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const withAttributes = ir.resources.find((r) => r.id === 'with_attributes')!;
      const points = withAttributes.attributes.find((a) => a.key === 'points');

      expect(points).toBeDefined();
      expect(points!.value).toBe(3);
      expect(typeof points!.value).toBe('number');
    });

    it('decodes boolean attributes to boolean values', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const milestone = ir.resources.find((r) => r.id === 'Q1 Launch')!;
      const critical = milestone.attributes.find((a) => a.key === 'critical');

      expect(critical).toBeDefined();
      expect(critical!.value).toBe(true);
      expect(typeof critical!.value).toBe('boolean');
    });

    it('decodes complex_example with mixed attribute types', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const complex = ir.resources.find((r) => r.id === 'complex_example')!;
      const attrs = complex.attributes;

      // String attributes
      expect(attrs.find((a) => a.key === 'title')!.value).toBe('Implement authentication');
      expect(attrs.find((a) => a.key === 'owner')!.value).toBe('security-team');

      // Number attributes
      expect(attrs.find((a) => a.key === 'priority')!.value).toBe(1);
      expect(attrs.find((a) => a.key === 'estimate_hours')!.value).toBe(40);

      // Boolean attributes
      expect(attrs.find((a) => a.key === 'blocking')!.value).toBe(true);
      expect(attrs.find((a) => a.key === 'optional')!.value).toBe(false);
    });

    it('decodes milestone Q1 Launch with year as number', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const milestone = ir.resources.find((r) => r.id === 'Q1 Launch')!;
      const year = milestone.attributes.find((a) => a.key === 'year');

      expect(year).toBeDefined();
      expect(year!.value).toBe(2026);
      expect(typeof year!.value).toBe('number');
    });
  });

  describe('03-dependencies.siren', () => {
    const fixturePath = join(fixturesDir, 'snippets', '03-dependencies.siren');

    it('decodes successfully with no errors', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      expect(ir.diagnostics.filter((d) => d.severity === 'error').length === 0).toBe(true);
      expect(ir.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    });

    it('decodes correct number of resources (9 including synthetic file milestone)', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      expect(ir).not.toBeNull();
      expect(ir.resources).toHaveLength(9);
    });

    it('decodes resource types correctly (6 tasks, 3 milestones)', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const resources = ir.resources;
      const tasks = resources.filter((r) => r.type === 'task');
      const milestones = resources.filter((r) => r.type === 'milestone');

      expect(tasks).toHaveLength(6);
      expect(milestones).toHaveLength(3);
    });

    it('decodes resource IDs correctly (quotes stripped)', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const ids = ir.resources.map((r) => r.id);

      // Bare identifiers
      expect(ids).toContain('A');
      expect(ids).toContain('B');
      expect(ids).toContain('C');
      expect(ids).toContain('deploy');
      expect(ids).toContain('early');
      expect(ids).toContain('late');
      // Quoted identifiers (quotes stripped)
      expect(ids).toContain('setup environment');
      expect(ids).toContain('v1.0');
      expect(ids).toContain('test');
    });

    it('preserves resource order from source', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const resources = ir.resources;

      expect(resources[0]).toMatchObject({ type: 'task', id: 'A' });
      expect(resources[1]).toMatchObject({ type: 'milestone', id: 'B' });
      expect(resources[2]).toMatchObject({ type: 'task', id: 'C' });
      expect(resources[3]).toMatchObject({ type: 'task', id: 'setup environment' });
      expect(resources[4]).toMatchObject({ type: 'task', id: 'deploy' });
      expect(resources[5]).toMatchObject({ type: 'milestone', id: 'v1.0' });
      expect(resources[6]).toMatchObject({ type: 'task', id: 'early' });
      expect(resources[7]).toMatchObject({ type: 'task', id: 'late' });
      expect(resources[8]).toMatchObject({ type: 'milestone', id: 'test' });
    });

    it('decodes single reference attribute (B.depends_on = A)', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const resourceB = ir.resources.find((r) => r.id === 'B')!;
      const dependsOn = resourceB.attributes.find((a) => a.key === 'depends_on');

      expect(dependsOn).toBeDefined();
      expect(isReference(dependsOn!.value)).toBe(true);
      expect(dependsOn!.value).toEqual({ kind: 'reference', id: 'A' });
    });

    it('decodes string literal attribute that looks like reference (deploy.depends_on)', async () => {
      // Note: In Siren grammar, `depends_on = "setup environment"` is a STRING LITERAL,
      // not a reference. References are bare identifiers or quoted identifiers used
      // as reference expressions, but a quoted string in value position is a literal.
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const deploy = ir.resources.find((r) => r.id === 'deploy')!;
      const dependsOn = deploy.attributes.find((a) => a.key === 'depends_on');

      expect(dependsOn).toBeDefined();
      // This is a string literal, not a reference
      expect(isReference(dependsOn!.value)).toBe(false);
      expect(dependsOn!.value).toBe('setup environment');
    });

    it('decodes forward reference (early.depends_on = late)', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const early = ir.resources.find((r) => r.id === 'early')!;
      const dependsOn = early.attributes.find((a) => a.key === 'depends_on');

      expect(dependsOn).toBeDefined();
      expect(dependsOn!.value).toEqual({ kind: 'reference', id: 'late' });
    });

    it('decodes array references (C.depends_on = [A, B])', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      // Decode should succeed
      expect(ir.diagnostics.filter((d) => d.severity === 'error').length === 0).toBe(true);

      // Resource C should exist and its array depends_on should be decoded
      const resourceC = ir.resources.find((r) => r.id === 'C')!;
      const dependsOn = resourceC.attributes.find((a) => a.key === 'depends_on');

      // Array attribute is decoded
      expect(dependsOn).toBeDefined();
      expect(dependsOn!.value).toEqual({
        kind: 'array',
        elements: [
          { kind: 'reference', id: 'A' },
          { kind: 'reference', id: 'B' },
        ],
      });
    });

    it('identifies which resources have single vs array references', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const resources = ir.resources;

      // Resources with single references (should have depends_on decoded as ResourceReference)
      const singleRefResources = ['B', 'early'];
      for (const id of singleRefResources) {
        const resource = resources.find((r) => r.id === id)!;
        const dependsOn = resource.attributes.find((a) => a.key === 'depends_on');
        expect(dependsOn, `${id} should have depends_on attribute`).toBeDefined();
        expect(isReference(dependsOn!.value), `${id}.depends_on should be a reference`).toBe(true);
      }

      // deploy.depends_on is a string literal (not a reference)
      const deploy = resources.find((r) => r.id === 'deploy')!;
      const deployDep = deploy.attributes.find((a) => a.key === 'depends_on');
      expect(deployDep).toBeDefined();
      expect(isReference(deployDep!.value)).toBe(false);
      expect(typeof deployDep!.value).toBe('string');

      // Resources with array references (should have depends_on decoded as ArrayValue)
      const arrayRefResources = ['C', 'v1.0'];
      for (const id of arrayRefResources) {
        const resource = resources.find((r) => r.id === id)!;
        const dependsOn = resource.attributes.find((a) => a.key === 'depends_on');
        expect(dependsOn, `${id} should have depends_on attribute`).toBeDefined();
        if (id === 'C') {
          expect(dependsOn!.value).toEqual({
            kind: 'array',
            elements: [
              { kind: 'reference', id: 'A' },
              { kind: 'reference', id: 'B' },
            ],
          });
        } else if (id === 'v1.0') {
          expect(dependsOn!.value).toEqual({
            kind: 'array',
            elements: [
              { kind: 'reference', id: 'A' },
              { kind: 'reference', id: 'C' },
              { kind: 'reference', id: 'deploy' },
            ],
          });
        }
      }

      // Resource A has no depends_on
      const resourceA = resources.find((r) => r.id === 'A')!;
      expect(resourceA.attributes.find((a) => a.key === 'depends_on')).toBeUndefined();
    });
  });

  describe('Attribute initialization behavior', () => {
    it('01-minimal resources have empty attributes (no attributes in source)', async () => {
      const source = readFileSync(join(fixturesDir, 'snippets', '01-minimal.siren'), 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const synthetic = ir.resources.find((r) => r.id === 'test');
      const originals = ir.resources.filter((r) => r.id !== 'test');

      for (const resource of originals) {
        expect(resource.attributes).toEqual([]);
      }
      expect(synthetic?.attributes.find((a) => a.key === 'depends_on')).toBeDefined();
    });

    it('02-simple resources have decoded attributes', async () => {
      const source = readFileSync(join(fixturesDir, 'snippets', '02-simple.siren'), 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      // All resources in 02-simple have attributes
      for (const resource of ir.resources) {
        expect(resource.attributes.length).toBeGreaterThan(0);
      }
    });
  });

  describe('04-complete.siren', () => {
    const fixturePath = join(fixturesDir, 'snippets', '04-complete.siren');

    it('decodes successfully with no errors', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      expect(ir.diagnostics.filter((d) => d.severity === 'error').length === 0).toBe(true);
      expect(ir.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    });

    it('decodes correct number of resources (4 including synthetic file milestone)', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      expect(ir).not.toBeNull();
      expect(ir.resources).toHaveLength(4);
    });

    it('decodes complete status correctly', async () => {
      const source = readFileSync(fixturePath, 'utf-8');
      const parseResult = await adapter.parse(doc(source));
      const ir = IRContext.fromCst(parseResult.tree!);

      const resources = ir.resources;
      expect(resources[0].complete).toBe(true); // task done complete
      expect(resources[1].complete).toBe(true); // milestone shipped complete
      expect(resources[2].complete).toBe(false); // task incomplete
    });
  });
});

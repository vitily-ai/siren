/**
 * Fixture Integration Tests
 *
 * Validates that all fixture files parse correctly using the real tree-sitter grammar.
 * These tests ensure fixtures stay valid as the grammar evolves.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type Parser from 'web-tree-sitter';
import { parseFixture } from '../helpers/parser';

describe('Fixture Integration Tests', () => {
  describe('01-minimal.siren', () => {
    let tree: Parser.Tree;

    beforeAll(async () => {
      tree = await parseFixture('snippets/01-minimal');
    });

    it('should parse successfully without errors', () => {
      expect(tree.rootNode.hasError).toBe(false);
    });

    it('should contain exactly 4 resources', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      expect(resources).toHaveLength(4);
    });

    it('should parse 3 tasks and 1 milestone', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');

      const tasks = resources.filter((r) => r.childForFieldName('type')?.text === 'task');
      const milestones = resources.filter((r) => r.childForFieldName('type')?.text === 'milestone');

      expect(tasks).toHaveLength(3);
      expect(milestones).toHaveLength(1);
    });

    it('should parse bare identifier "example"', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      const firstTask = resources[0];
      const identifier = firstTask?.childForFieldName('id');

      expect(identifier?.type).toBe('identifier');
      expect(identifier?.text).toBe('example');
    });

    it('should parse quoted identifier "initial setup"', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      const firstMilestone = resources.find(
        (r) => r.childForFieldName('type')?.text === 'milestone',
      );
      const identifier = firstMilestone?.childForFieldName('id');

      expect(identifier?.text).toBe('"initial setup"');
    });

    it('should parse identifier with hyphens "setup-environment"', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      const hyphenTask = resources.find(
        (r) => r.childForFieldName('id')?.text === 'setup-environment',
      );

      expect(hyphenTask).toBeDefined();
    });

    it('should parse quoted identifier with special characters', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      const specialTask = resources.find((r) =>
        r.childForFieldName('id')?.text?.includes('special chars'),
      );

      expect(specialTask).toBeDefined();
      expect(specialTask?.childForFieldName('id')?.text).toBe('"example 2: with special chars!"');
    });

    it('should have empty bodies for all resources', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');

      resources.forEach((resource) => {
        const attributes = resource.childrenForFieldName('body');
        expect(attributes).toHaveLength(0);
      });
    });
  });

  describe('02-simple.siren', () => {
    let tree: Parser.Tree;

    beforeAll(async () => {
      tree = await parseFixture('snippets/02-simple');
    });

    it('should parse successfully without errors', () => {
      expect(tree.rootNode.hasError).toBe(false);
    });

    it('should contain exactly 3 resources', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      expect(resources).toHaveLength(3);
    });

    it('should parse task "with_attributes" with 3 attributes', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      const task = resources.find((r) => r.childForFieldName('id')?.text === 'with_attributes');

      const attributes = task?.childrenForFieldName('body') ?? [];

      expect(attributes).toHaveLength(3);

      // Verify attribute keys
      const keys = attributes.map((attr) => attr.childForFieldName('key')?.text);
      expect(keys).toContain('description');
      expect(keys).toContain('assignee');
      expect(keys).toContain('points');
    });

    it('should parse string, number, and identifier values in with_attributes', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      const task = resources.find((r) => r.childForFieldName('id')?.text === 'with_attributes');

      const attributes = task?.childrenForFieldName('body') ?? [];

      // description = "some description" (string)
      const description = attributes.find(
        (attr) => attr.childForFieldName('key')?.text === 'description',
      );
      const descExpr = description?.childForFieldName('value');
      const descValue = descExpr?.child(0); // literal > string_literal
      expect(descValue?.type).toMatch(/string_literal|literal/);

      // points = 3 (number)
      const points = attributes.find((attr) => attr.childForFieldName('key')?.text === 'points');
      const pointsExpr = points?.childForFieldName('value');
      const pointsValue = pointsExpr?.child(0); // literal > number_literal
      expect(pointsValue?.type).toMatch(/number_literal|literal/);
      expect(pointsExpr?.text).toBe('3');
    });

    it('should parse milestone "Q1 Launch" with 4 attributes', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      const milestone = resources.find((r) => r.childForFieldName('id')?.text === '"Q1 Launch"');

      const attributes = milestone?.childrenForFieldName('body') ?? [];

      expect(attributes).toHaveLength(4);

      const keys = attributes.map((attr) => attr.childForFieldName('key')?.text);
      expect(keys).toContain('description');
      expect(keys).toContain('quarter');
      expect(keys).toContain('year');
      expect(keys).toContain('critical');
    });

    it('should parse boolean value "true"', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      const milestone = resources.find((r) => r.childForFieldName('id')?.text === '"Q1 Launch"');

      const attributes = milestone?.childrenForFieldName('body') ?? [];

      const critical = attributes.find(
        (attr) => attr.childForFieldName('key')?.text === 'critical',
      );
      const criticalExpr = critical?.childForFieldName('value');
      const criticalLiteral = criticalExpr?.child(0); // literal > boolean_literal

      expect(criticalLiteral?.type).toMatch(/boolean_literal|literal/);
      expect(criticalExpr?.text).toBe('true');
    });

    it('should parse task "complex_example" with 6 attributes', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      const task = resources.find((r) => r.childForFieldName('id')?.text === 'complex_example');

      const attributes = task?.childrenForFieldName('body') ?? [];

      expect(attributes).toHaveLength(6);

      const keys = attributes.map((attr) => attr.childForFieldName('key')?.text);
      expect(keys).toContain('title');
      expect(keys).toContain('owner');
      expect(keys).toContain('priority');
      expect(keys).toContain('estimate_hours');
      expect(keys).toContain('blocking');
      expect(keys).toContain('optional');
    });
  });

  describe('03-dependencies.siren', () => {
    let tree: Parser.Tree;

    beforeAll(async () => {
      tree = await parseFixture('snippets/03-dependencies');
    });

    it('should parse successfully without errors', () => {
      expect(tree.rootNode.hasError).toBe(false);
    });

    it('should contain exactly 8 resources', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      expect(resources).toHaveLength(8);
    });

    it('should parse single reference: depends_on = A', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      const milestoneB = resources.find((r) => r.childForFieldName('id')?.text === 'B');

      const attributes = milestoneB?.childrenForFieldName('body') ?? [];

      const dependsOn = attributes.find(
        (attr) => attr.childForFieldName('key')?.text === 'depends_on',
      );
      const valueExpr = dependsOn?.childForFieldName('value');
      const reference = valueExpr?.child(0); // expression > reference

      expect(reference?.type).toBe('reference');
      expect(valueExpr?.text).toBe('A');
    });

    it('should parse array reference: depends_on = [A, B]', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      const taskC = resources.find((r) => r.childForFieldName('id')?.text === 'C');

      const attributes = taskC?.childrenForFieldName('body') ?? [];

      const dependsOn = attributes.find(
        (attr) => attr.childForFieldName('key')?.text === 'depends_on',
      );
      const valueExpr = dependsOn?.childForFieldName('value');
      const arrayNode = valueExpr?.child(0); // expression > array

      expect(arrayNode?.type).toBe('array');

      // Array contains expression nodes wrapping references
      const expressions = arrayNode?.children.filter((child) => child.type === 'expression') ?? [];
      expect(expressions).toHaveLength(2);
      expect(expressions[0]?.text).toBe('A');
      expect(expressions[1]?.text).toBe('B');
    });

    it('should parse quoted reference: depends_on = "setup environment"', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      const deploy = resources.find((r) => r.childForFieldName('id')?.text === 'deploy');

      const attributes = deploy?.childrenForFieldName('body') ?? [];

      const dependsOn = attributes.find(
        (attr) => attr.childForFieldName('key')?.text === 'depends_on',
      );
      const valueExpr = dependsOn?.childForFieldName('value');
      const literal = valueExpr?.child(0); // expression > literal

      expect(literal?.type).toBe('literal');
      expect(valueExpr?.text).toBe('"setup environment"');
    });

    it('should parse array with 3 elements: [A, C, deploy]', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      const milestone = resources.find((r) => r.childForFieldName('id')?.text === '"v1.0"');

      const attributes = milestone?.childrenForFieldName('body') ?? [];

      const dependsOn = attributes.find(
        (attr) => attr.childForFieldName('key')?.text === 'depends_on',
      );
      const valueExpr = dependsOn?.childForFieldName('value');
      const arrayNode = valueExpr?.child(0); // expression > array

      expect(arrayNode?.type).toBe('array');

      const expressions = arrayNode?.children.filter((child) => child.type === 'expression') ?? [];
      expect(expressions).toHaveLength(3);
      expect(expressions[0]?.text).toBe('A');
      expect(expressions[1]?.text).toBe('C');
      expect(expressions[2]?.text).toBe('deploy');
    });

    it('should parse forward reference syntactically', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');

      // Find task "early" (references "late" before it's defined)
      const early = resources.find((r) => r.childForFieldName('id')?.text === 'early');

      const attributes = early?.childrenForFieldName('body') ?? [];

      const dependsOn = attributes.find(
        (attr) => attr.childForFieldName('key')?.text === 'depends_on',
      );
      const valueExpr = dependsOn?.childForFieldName('value');
      const reference = valueExpr?.child(0); // expression > reference

      // Forward reference is syntactically valid
      expect(reference?.type).toBe('reference');
      expect(valueExpr?.text).toBe('late');

      // Verify "late" is defined after "early"
      const late = resources.find((r) => r.childForFieldName('id')?.text === 'late');
      expect(late).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------
  // Draft / open status-modifier grammar (TDD-red).
  //
  // These fixtures exercise the not-yet-built grammar behavior described
  // in `siren/draft-symbol-support.md` (the `draft-symbol-grammar-red` /
  // `draft-symbol-grammar-green` task pair). They are expected to FAIL
  // against the current grammar — which only accepts the single
  // `complete` token in the modifier slot — and to pass once the modifier
  // slot is widened to `repeat(field('status_modifier', $.bare_identifier))`.
  //
  // Assertions intentionally read the `status_modifier` field name from
  // the future grammar so the failure mode clearly points at the grammar
  // (either `hasError === true` or missing `status_modifier` field).
  // ---------------------------------------------------------------------

  describe('05-draft.siren', () => {
    let tree: Parser.Tree;

    beforeAll(async () => {
      tree = await parseFixture('snippets/05-draft');
    });

    it('should parse successfully without errors', () => {
      expect(tree.rootNode.hasError).toBe(false);
    });

    it('should contain exactly 2 resources', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      expect(resources).toHaveLength(2);
    });

    it('should expose `draft` as a status_modifier on each resource', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');

      for (const resource of resources) {
        const modifiers = resource.childrenForFieldName('status_modifier');
        expect(modifiers).toHaveLength(1);
        expect(modifiers[0]?.text).toBe('draft');
      }
    });
  });

  describe('06-status-multi.siren', () => {
    let tree: Parser.Tree;

    beforeAll(async () => {
      tree = await parseFixture('snippets/06-status-multi');
    });

    it('should parse successfully without errors', () => {
      expect(tree.rootNode.hasError).toBe(false);
    });

    it('should capture both `draft` and `complete` as status_modifier tokens', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      expect(resources).toHaveLength(1);

      const modifiers = resources[0].childrenForFieldName('status_modifier');
      expect(modifiers).toHaveLength(2);
      expect(modifiers[0]?.text).toBe('draft');
      expect(modifiers[1]?.text).toBe('complete');
    });
  });

  describe('07-status-unknown.siren', () => {
    let tree: Parser.Tree;

    beforeAll(async () => {
      tree = await parseFixture('snippets/07-status-unknown');
    });

    it('should parse successfully without errors', () => {
      // Grammar must be permissive — unknown tokens are a lint-pass concern,
      // not a parse-time error.
      expect(tree.rootNode.hasError).toBe(false);
    });

    it('should capture the unknown identifier in the status_modifier slot', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      expect(resources).toHaveLength(1);

      const modifiers = resources[0].childrenForFieldName('status_modifier');
      expect(modifiers).toHaveLength(1);
      expect(modifiers[0]?.text).toBe('amogus');
    });
  });

  describe('08-status-precedence.siren', () => {
    let tree: Parser.Tree;

    beforeAll(async () => {
      tree = await parseFixture('snippets/08-status-precedence');
    });

    it('should parse successfully without errors', () => {
      expect(tree.rootNode.hasError).toBe(false);
    });

    it('should produce six distinct resources (task/milestone keywords not swallowed)', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');
      expect(resources).toHaveLength(6);

      const ids = resources.map((r) => r.childForFieldName('id')?.text);
      expect(ids).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);

      const types = resources.map((r) => r.childForFieldName('type')?.text);
      expect(types).toEqual(['task', 'task', 'task', 'milestone', 'milestone', 'task']);
    });

    it('should record status_modifier tokens only on the resources that declared them', () => {
      const resources = tree.rootNode.children.filter((node) => node.type === 'resource');

      const modifierTextsById = new Map(
        resources.map((r) => [
          r.childForFieldName('id')?.text,
          r.childrenForFieldName('status_modifier').map((m) => m.text),
        ]),
      );

      // `task a draft {}` — single modifier on the leader.
      expect(modifierTextsById.get('a')).toEqual(['draft']);
      // `task b {}` — follower must NOT inherit `a`'s slot.
      expect(modifierTextsById.get('b')).toEqual([]);
      // `task c {}` — leader with no modifier.
      expect(modifierTextsById.get('c')).toEqual([]);
      // `milestone d complete {}` — modifier belongs to the follower.
      expect(modifierTextsById.get('d')).toEqual(['complete']);
      // `milestone e draft complete {}` — multi-token modifier list.
      expect(modifierTextsById.get('e')).toEqual(['draft', 'complete']);
      // `task f {}` — `task` keyword must not be eaten as a 3rd modifier on `e`.
      expect(modifierTextsById.get('f')).toEqual([]);
    });
  });
});

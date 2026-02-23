/**
 * Node adapter smoke tests
 *
 * Verifies the real tree-sitter adapter correctly converts CST nodes
 */

import { describe, expect, it } from 'vitest';
import { doc, getTestAdapter } from '../helpers/parser.js';

describe('NodeParserAdapter', () => {
  it('should parse an empty document', async () => {
    const adapter = await getTestAdapter();
    const result = await adapter.parse(doc(''));

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.tree).not.toBeNull();
    expect(result.tree?.type).toBe('document');
    expect(result.tree?.resources).toHaveLength(0);
  });

  it('should parse a simple task', async () => {
    const adapter = await getTestAdapter();
    const source = `task example {}`;
    const result = await adapter.parse(doc(source));

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.tree?.resources).toHaveLength(1);

    const task = result.tree?.resources[0];
    expect(task?.type).toBe('resource');
    expect(task?.resourceType).toBe('task');
    expect(task?.identifier.value).toBe('example');
    expect(task?.identifier.quoted).toBe(false);
    expect(task?.body).toHaveLength(0);
  });

  it('should parse quoted identifiers', async () => {
    const adapter = await getTestAdapter();
    const source = `milestone "setup phase" {}`;
    const result = await adapter.parse(doc(source));

    expect(result.success).toBe(true);
    const milestone = result.tree?.resources[0];
    expect(milestone?.resourceType).toBe('milestone');
    expect(milestone?.identifier.value).toBe('setup phase');
    expect(milestone?.identifier.quoted).toBe(true);
  });

  it('should parse attributes with string literals', async () => {
    const adapter = await getTestAdapter();
    const source = `task test {
  description = "Hello, world!"
}`;
    const result = await adapter.parse(doc(source));

    expect(result.success).toBe(true);
    const task = result.tree?.resources[0];
    expect(task?.body).toHaveLength(1);

    const attr = task?.body[0];
    expect(attr?.type).toBe('attribute');
    expect(attr?.key.value).toBe('description');
    expect(attr?.value.type).toBe('literal');

    const literal = attr?.value as any;
    expect(literal.literalType).toBe('string');
    expect(literal.value).toBe('Hello, world!');
  });

  it('should parse attributes with number literals', async () => {
    const adapter = await getTestAdapter();
    const source = `task test {
  priority = 42
  effort = 3.14
}`;
    const result = await adapter.parse(doc(source));

    expect(result.success).toBe(true);
    const task = result.tree?.resources[0];
    expect(task?.body).toHaveLength(2);

    const priority = task?.body[0]?.value as any;
    expect(priority.literalType).toBe('number');
    expect(priority.value).toBe(42);

    const effort = task?.body[1]?.value as any;
    expect(effort.literalType).toBe('number');
    expect(effort.value).toBe(3.14);
  });

  it('should parse attributes with boolean literals', async () => {
    const adapter = await getTestAdapter();
    const source = `task test {
  active = true
  archived = false
}`;
    const result = await adapter.parse(doc(source));

    expect(result.success).toBe(true);
    const task = result.tree?.resources[0];

    const active = task?.body[0]?.value as any;
    expect(active.literalType).toBe('boolean');
    expect(active.value).toBe(true);

    const archived = task?.body[1]?.value as any;
    expect(archived.literalType).toBe('boolean');
    expect(archived.value).toBe(false);
  });

  it('should parse attributes with null literal', async () => {
    const adapter = await getTestAdapter();
    const source = `task test {
  owner = null
}`;
    const result = await adapter.parse(doc(source));

    expect(result.success).toBe(true);
    const task = result.tree?.resources[0];

    const owner = task?.body[0]?.value as any;
    expect(owner.literalType).toBe('null');
    expect(owner.value).toBeNull();
  });

  it('should parse attributes with references', async () => {
    const adapter = await getTestAdapter();
    const source = `task test {
  depends_on = other_task
}`;
    const result = await adapter.parse(doc(source));

    expect(result.success).toBe(true);
    const task = result.tree?.resources[0];

    const ref = task?.body[0]?.value as any;
    expect(ref.type).toBe('reference');
    expect(ref.identifier.value).toBe('other_task');
  });

  it('should parse attributes with arrays', async () => {
    const adapter = await getTestAdapter();
    const source = `task test {
  tags = ["urgent", "backend"]
  numbers = [1, 2, 3]
}`;
    const result = await adapter.parse(doc(source));

    expect(result.success).toBe(true);
    const task = result.tree?.resources[0];

    const tags = task?.body[0]?.value as any;
    expect(tags.type).toBe('array');
    expect(tags.elements).toHaveLength(2);
    expect(tags.elements[0].value).toBe('urgent');
    expect(tags.elements[1].value).toBe('backend');

    const numbers = task?.body[1]?.value as any;
    expect(numbers.type).toBe('array');
    expect(numbers.elements).toHaveLength(3);
    expect(numbers.elements[0].value).toBe(1);
    expect(numbers.elements[1].value).toBe(2);
    expect(numbers.elements[2].value).toBe(3);
  });

  it('should detect parse errors', async () => {
    const adapter = await getTestAdapter();
    const source = `task {}`; // Missing identifier
    const result = await adapter.parse(doc(source));

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Verify error structure exists (message content is frontend concern)
    expect(result.errors[0]).toBeDefined();
    expect(result.errors[0]?.line).toBeGreaterThan(0);
    expect(result.errors[0]?.column).toBeGreaterThan(0);
  });

  it('should parse multiple resources', async () => {
    const adapter = await getTestAdapter();
    const source = `
task first {}
milestone second {}
task third {}
`;
    const result = await adapter.parse(doc(source));

    expect(result.success).toBe(true);
    expect(result.tree?.resources).toHaveLength(3);
    expect(result.tree?.resources[0]?.resourceType).toBe('task');
    expect(result.tree?.resources[1]?.resourceType).toBe('milestone');
    expect(result.tree?.resources[2]?.resourceType).toBe('task');
  });

  it('should parse complete modifier', async () => {
    const adapter = await getTestAdapter();
    const source = `task done complete { description = "finished" }`;
    const result = await adapter.parse(doc(source));

    expect(result.success).toBe(true);
    expect(result.tree?.resources).toHaveLength(1);
    const task = result.tree?.resources[0];
    expect(task?.complete).toBe(true);
    expect(task?.body).toHaveLength(1);
  });
});

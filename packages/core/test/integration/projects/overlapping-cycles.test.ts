import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { IRContext } from '../../../src/ir/context.js';
import { getTestAdapter } from '../../helpers/parser.js';
import { getAdapter, parseAndDecodeAll } from './helper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectsDir = join(__dirname, '..', '..', 'fixtures', 'projects');

describe('project:overlapping-cycles', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('detects overlapping circular dependencies and emits warnings', async () => {
    const { diagnostics } = await parseAndDecodeAll(adapter, 'overlapping-cycles');
    const cycleWarnings = diagnostics.filter((d) => d.code === 'W004' && d.severity === 'warning');
    expect(cycleWarnings).toHaveLength(2);

    // PRESCRIPTIVE: Core MUST provide structured diagnostic data
    // W004 diagnostics must have: code, severity, nodes (cycle chain), file
    const cycles: any[] = cycleWarnings;

    // Find the a -> b -> c -> a cycle
    const longCycle = cycles.find((c) => c.nodes?.length === 4);
    expect(longCycle).toBeDefined();
    expect(longCycle.code).toBe('W004');
    expect(longCycle.severity).toBe('warning');
    expect(longCycle.nodes).toEqual(['a', 'b', 'c', 'a']);
    expect(longCycle.file).toBe('siren/main.siren');

    // Find the a -> c -> a cycle
    const shortCycle = cycles.find((c) => c.nodes?.length === 3);
    expect(shortCycle).toBeDefined();
    expect(shortCycle.code).toBe('W004');
    expect(shortCycle.severity).toBe('warning');
    expect(shortCycle.nodes).toEqual(['a', 'c', 'a']);
    expect(shortCycle.file).toBe('siren/main.siren');
  });

  it('includes cycles in the IR', async () => {
    const adapterLocal = await getTestAdapter();
    const projectDir = join(projectsDir, 'overlapping-cycles', 'siren');
    const src = readFileSync(join(projectDir, 'main.siren'), 'utf-8');
    const parseResult = await adapterLocal.parse(src);
    expect(parseResult.success).toBe(true);
    const ir = IRContext.fromCst(parseResult.tree!);
    expect(ir.cycles).toHaveLength(2);
    const cycleNodes = ir.cycles.map((c) => c.nodes);
    expect(cycleNodes).toContainEqual(['a', 'b', 'c', 'a']);
    expect(cycleNodes).toContainEqual(['a', 'c', 'a']);
  });
});

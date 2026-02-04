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
    // The warnings should contain the cycle paths
    const messages = cycleWarnings.map((w) => w.message);
    expect(messages.some((m) => m.includes('a -> b -> c -> a'))).toBe(true);
    expect(messages.some((m) => m.includes('a -> c -> a'))).toBe(true);
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
